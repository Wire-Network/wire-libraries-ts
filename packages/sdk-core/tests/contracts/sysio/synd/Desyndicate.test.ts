import { ChainKind, DesyndicateLIQ } from "@wireio/opp-typescript-models"
import { Bytes, contracts, SlugName, SysioContracts } from "@wireio/sdk-core"

const { decodeDesyndicateLIQ } = contracts.sysio.synd
const RequestId = 9007199254740993n
const MaximumRequestId = 18446744073709551615n
const EthereumCode = "ETHEREUM"
const SolanaCode = "SOLANA"
const RecipientKey = Uint8Array.from([2, ...Array(32).fill(1)])

/** Producer-shaped request with an ID and quantity above JS safe integer range. */
function request(): DesyndicateLIQ {
  return DesyndicateLIQ.create({
    chainCode: BigInt(SlugName.from(EthereumCode)),
    user: { kind: ChainKind.EVM, address: RecipientKey },
    amount: { tokenCode: BigInt(SlugName.from("LIQETH")), amount: RequestId },
    requestId: RequestId,
    totalSyndicated: MaximumRequestId
  })
}

/** Hex bytes are the ABI representation of queueout.data. */
function action(value = request()): SysioContracts.SysioMsgchQueueoutAction {
  return {
    chain_code: EthereumCode,
    attest_type:
      SysioContracts.SysioMsgchAttestationtype.ATTESTATION_TYPE_DESYNDICATE_LIQ,
    data: Bytes.from(DesyndicateLIQ.toBinary(value)).hexString
  }
}

describe("desyndication request decoding", () => {
  test("preserves producer fields, native recipient bytes and uint64 precision", () => {
    const value = request(),
      decoded = decodeDesyndicateLIQ(action(value))
    expect(decoded).toEqual(value)
    expect(decoded.requestId).toBe(RequestId)
    expect(decoded.amount?.amount).toBe(RequestId)
    expect(decoded.totalSyndicated).toBe(MaximumRequestId)
    expect(decoded.user?.address).toEqual(RecipientKey)
  })

  test("accepts ABI enum names and packed destination codes for Solana", () => {
    const value = request()
    value.chainCode = BigInt(SlugName.from(SolanaCode))
    value.user = { kind: ChainKind.SVM, address: new Uint8Array(32).fill(1) }
    value.amount!.tokenCode = BigInt(SlugName.from("LIQSOL"))
    const queued = action(value)
    queued.chain_code = SlugName.from(SolanaCode)
    queued.attest_type = "ATTESTATION_TYPE_DESYNDICATE_LIQ"
    expect(decodeDesyndicateLIQ(queued)).toEqual(value)
  })

  test("keeps identical amounts from separate request IDs distinct", () => {
    const first = request(),
      second = { ...first, requestId: MaximumRequestId }
    expect(decodeDesyndicateLIQ(action(first)).requestId).toBe(RequestId)
    expect(decodeDesyndicateLIQ(action(second)).requestId).toBe(
      MaximumRequestId
    )
  })

  test("rejects a different attestation even when its bytes decode", () => {
    const queued = action()
    queued.attest_type =
      SysioContracts.SysioMsgchAttestationtype.ATTESTATION_TYPE_SYNDICATE_LIQ
    expect(() => decodeDesyndicateLIQ(queued)).toThrow(
      "Expected a DESYNDICATE_LIQ"
    )
  })

  test("rejects a mismatched or unsafe outer destination", () => {
    expect(() =>
      decodeDesyndicateLIQ({ ...action(), chain_code: SolanaCode })
    ).toThrow("does not match")
    expect(() =>
      decodeDesyndicateLIQ({
        ...action(),
        chain_code: Number.MAX_SAFE_INTEGER + 1
      })
    ).toThrow()
  })

  test.each(["", "0", "zz", "08", "120501", "00"])(
    "rejects malformed or incomplete hex payload %s",
    data => {
      expect(() => decodeDesyndicateLIQ({ ...action(), data })).toThrow()
    }
  )

  test.each([
    DesyndicateLIQ.create(),
    { ...request(), user: undefined },
    { ...request(), user: { kind: ChainKind.EVM, address: new Uint8Array() } },
    { ...request(), amount: undefined },
    { ...request(), amount: { tokenCode: 0n, amount: 1n } },
    { ...request(), amount: { tokenCode: 1n, amount: 0n } },
    { ...request(), amount: { tokenCode: 1n, amount: -1n } },
    { ...request(), requestId: 0n }
  ])("rejects missing or invalid correlation fields", value => {
    expect(() => decodeDesyndicateLIQ(action(value))).toThrow()
  })

  test("allows unknown protobuf fields for forward-compatible producer additions", () => {
    // Field 6, varint 1; protobuf owns handling of future fields.
    const queued = action()
    const decoded = decodeDesyndicateLIQ({
      ...queued,
      data: queued.data + "3001"
    })
    expect(decoded.requestId).toBe(RequestId)
    expect(decoded.user?.address).toEqual(RecipientKey)
  })
})
