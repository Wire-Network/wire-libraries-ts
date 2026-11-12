import nacl from "tweetnacl"
import {
  APIClient,
  Base58,
  KeyType,
  PrivateKey,
  PublicKey,
  contracts
} from "@wireio/sdk-core"

const { externalWalletIdentity, readUnlinkedFunds } = contracts.sysio.authex
const EM = PrivateKey.regenerate(
  KeyType.EM,
  new Uint8Array(32).fill(7)
).toPublic()
const ED = new PublicKey(
  KeyType.ED,
  nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(8)).publicKey
)
const IncompleteCredit = {
  chain_kind: externalWalletIdentity(EM).chainKind,
  balance: "0"
}

/** Mock only the transport; exercise the deployed full-key matching and KV cursors. */
function fixture(key: PublicKey, balance = "1234567890") {
  const identity = externalWalletIdentity(key)
  const native =
    key.type === KeyType.EM
      ? identity.address.slice(2).toLowerCase()
      : key.data.hexString
  const unmapped = {
    chain_kind: identity.chainKind,
    native_pubkey: native,
    balance: "2.000000000 WIRE"
  }
  const parked = {
    token_code: key.type === KeyType.EM ? "LIQETH" : "LIQSOL",
    chain_kind: identity.chainKind,
    pubkey: key.data.hexString,
    balance,
    position: { owed_wire: "999999999999" }
  }
  const call = jest.fn(async ({ params }) => ({
    rows: [
      { value: (params.table === "unmapped" ? unmapped : parked) as unknown }
    ],
    more: false
  }))
  return {
    client: { call } as unknown as APIClient,
    call,
    identity,
    unmapped,
    parked
  }
}

describe("unlinked external funds", () => {
  test.each([EM, ED])(
    "reads imported WIRE and released LIQ with exact native identity: %s",
    async key => {
      const { client, identity, call } = fixture(key)
      const funds = await readUnlinkedFunds(client, key)
      expect(funds.address).toBe(identity.address)
      expect(funds.wire.toString()).toBe("2.000000000 WIRE")
      expect(funds.liq.toString()).toBe(
        key.type === KeyType.EM ? "1.234567890 LIQETH" : "1.234567890 LIQSOL"
      )
      expect(call).toHaveBeenCalledTimes(2)
      expect(call.mock.calls[0][0].params.upper_bound).toBeDefined()
      expect(call.mock.calls[1][0].params.lower_bound).toMatch(
        /^0x[0-9a-f]+0000$/
      )
    }
  )
  test("derives the native SOL address and canonicalizes uncompressed EM", () => {
    expect(externalWalletIdentity(ED).address).toBe(Base58.encode(ED.data))
    const input =
      "PUB_EM_04b575daefdb5a3c1e3444ca791f091554e6736af32b19cf88f8575d0665a8850219d9d0512711a75fdfa75e4b2b28a32339d0fb1fe8c253f9f4ca1ac866cdc054"
    expect(externalWalletIdentity(input).publicKey).toBe(
      "PUB_EM_02b575daefdb5a3c1e3444ca791f091554e6736af32b19cf88f8575d0665a88502"
    )
    expect(() =>
      externalWalletIdentity(
        PrivateKey.regenerate(KeyType.K1, new Uint8Array(32).fill(3)).toPublic()
      )
    ).toThrow("EM or ED")
  })
  test("rejects prefix collisions and neighboring parked keys", async () => {
    const { client, unmapped, parked } = fixture(EM)
    unmapped.native_pubkey = unmapped.native_pubkey.slice(0, -2) + "ff"
    parked.pubkey = ED.data.hexString
    const funds = await readUnlinkedFunds(client, EM)
    expect(funds.wire).toBeUndefined()
    expect(funds.liq).toBeUndefined()
  })
  test("zero principal and accrued yield alone are not credit", async () => {
    const { client, unmapped } = fixture(ED, "0")
    unmapped.balance = "0.000000000 WIRE"
    expect(await readUnlinkedFunds(client, ED)).toMatchObject({
      wire: undefined,
      liq: undefined
    })
  })
  test("preserves amounts above JS integer precision", async () => {
    const { client } = fixture(EM, "9007199254740993")
    expect((await readUnlinkedFunds(client, EM)).liq.toString()).toBe(
      "9007199.254740993 LIQETH"
    )
  })
  test("does not silently accept unsafe numeric rows", async () => {
    const { client, parked } = fixture(EM)
    Object.assign(parked, { balance: 9007199254740992 })
    await expect(readUnlinkedFunds(client, EM)).rejects.toThrow("Unsafe")
  })
  test.each([
    ["unmapped", "deadbeef"],
    ["parked", "deadbeef"],
    ["unmapped", IncompleteCredit],
    ["parked", IncompleteCredit]
  ] as const)("rejects invalid %s credit rows (%p)", async (table, value) => {
    const { client, call, unmapped, parked } = fixture(EM)
    call.mockImplementation(async ({ params }) => {
      const decoded = params.table === "unmapped" ? unmapped : parked
      return {
        rows: [{ value: params.table === table ? value : decoded }],
        more: false
      }
    })
    await expect(readUnlinkedFunds(client, EM)).rejects.toThrow(
      `Invalid decoded ${table} credit row`
    )
  })
  test("uses a binary cursor unchanged within the collision range", async () => {
    const { client, call, unmapped, parked } = fixture(EM)
    call.mockImplementation(async ({ params }) =>
      params.table === "parked"
        ? { rows: [{ value: parked }], more: false }
        : params.lower_bound === "0xff000001"
          ? { rows: [{ value: unmapped }], more: false }
          : { rows: [], more: true, next_key: "0xff000001" }
    )
    expect((await readUnlinkedFunds(client, EM)).wire.toString()).toBe(
      "2.000000000 WIRE"
    )
    expect(call.mock.calls[2][0].params.lower_bound).toBe("0xff000001")
  })
  test("fails closed on stalled cursors and RPC failure", async () => {
    const { client, call } = fixture(ED)
    call.mockImplementation(async ({ params }) => ({
      rows: [],
      more: true,
      next_key: params.lower_bound
    }))
    await expect(readUnlinkedFunds(client, ED)).rejects.toThrow(
      "did not advance"
    )
    call.mockRejectedValue(new Error("RPC unavailable"))
    await expect(readUnlinkedFunds(client, ED)).rejects.toThrow(
      "RPC unavailable"
    )
  })
})
