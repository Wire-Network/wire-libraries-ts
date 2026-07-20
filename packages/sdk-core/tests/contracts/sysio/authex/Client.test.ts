import { arrayify, joinSignature } from "@ethersproject/bytes"
import { hashMessage } from "@ethersproject/hash"
import { SigningKey } from "@ethersproject/signing-key"

import { KeyType } from "@wireio/sdk-core/chain/KeyType"
import { PublicKey } from "@wireio/sdk-core/chain/PublicKey"
import { contracts } from "@wireio/sdk-core"
import { SysioAuthexChainkind } from "@wireio/sdk-core/types/SysioContractTypes"

const { AuthexClient } = contracts.sysio.authex

const EVM = SysioAuthexChainkind.CHAIN_KIND_EVM,
  COMPRESSED_PUBLIC_KEY =
    "PUB_EM_02b575daefdb5a3c1e3444ca791f091554e6736af32b19cf88f8575d0665a88502",
  UNCOMPRESSED_PUBLIC_KEY =
    "PUB_EM_04b575daefdb5a3c1e3444ca791f091554e6736af32b19cf88f8575d0665a8850219d9d0512711a75fdfa75e4b2b28a32339d0fb1fe8c253f9f4ca1ac866cdc054"

/** Creates a client backed by a programmable table reader. */
function clientFixture(rows: Array<Record<string, unknown>> = []) {
  const getTableRows = jest.fn(async () => ({ rows, more: false })),
    pushTransaction = jest.fn(async (_action: any) => ({
      transaction_id: "trx-id"
    })),
    client = new AuthexClient({
      client: {
        v1: { chain: { get_table_rows: getTableRows } },
        pushTransaction
      } as any
    })

  return { client, getTableRows, pushTransaction }
}

describe("AuthexClient", () => {
  test("queries the deployed named KV index with a numeric Wire-name bound", async () => {
    const row = {
        key: 0,
        username: "wireno",
        chain_kind: "CHAIN_KIND_EVM",
        pub_key: UNCOMPRESSED_PUBLIC_KEY
      },
      { client, getTableRows } = clientFixture([row]),
      links = await client.getLinks("wireno")

    expect(links).toEqual([row])
    expect(getTableRows).toHaveBeenCalledWith({
      code: "sysio.authex",
      table: "links",
      scope: "sysio.authex",
      json: true,
      index_name: "byname",
      lower_bound: '{"byname":"16406237203375587328"}',
      limit: 100
    })
  })

  test("normalizes generated enum names when selecting one account link", async () => {
    const row = {
        key: 0,
        username: "wireno",
        chain_kind: "CHAIN_KIND_EVM",
        pub_key: UNCOMPRESSED_PUBLIC_KEY
      },
      { client } = clientFixture([row])

    await expect(client.getLink("wireno", EVM)).resolves.toEqual(row)
  })

  test("matches an uncompressed live EM row through the compressed bypubkey index", async () => {
    const row = {
        key: 0,
        username: "wireno",
        chain_kind: "CHAIN_KIND_EVM",
        pub_key: UNCOMPRESSED_PUBLIC_KEY
      },
      { client, getTableRows } = clientFixture([row]),
      link = await client.getLinkByPublicKey(COMPRESSED_PUBLIC_KEY)

    expect(link).toEqual(row)
    expect(getTableRows).toHaveBeenCalledWith({
      code: "sysio.authex",
      table: "links",
      scope: "sysio.authex",
      json: true,
      index_name: "bypubkey",
      lower_bound:
        '{"bypubkey":"5a5abc059055ee67077b7703dd3bec864f7d55f22aa780e1385d04f2c41b307e"}',
      limit: 5
    })
  })

  test("signs, builds, and pushes a create-link action", async () => {
    const signingKey = new SigningKey(`0x${"01".repeat(32)}`),
      publicKey = new PublicKey(
        KeyType.EM,
        arrayify(signingKey.compressedPublicKey)
      ),
      signer = {
        pubKey: publicKey,
        sign: jest.fn(async (payload: Uint8Array) =>
          arrayify(joinSignature(signingKey.signDigest(hashMessage(payload))))
        )
      },
      { client, pushTransaction } = clientFixture()

    const result = await client.pushCreateLink({
      account: "alice",
      chainKind: EVM,
      signer,
      nonce: 1_720_000_000_000
    })

    expect(result).toEqual({ transaction_id: "trx-id" })
    expect(pushTransaction).toHaveBeenCalledTimes(1)
    const action = pushTransaction.mock.calls[0][0]
    expect(action.account.toString()).toBe("sysio.authex")
    expect(action.name.toString()).toBe("createlink")
  })
})
