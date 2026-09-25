import { ABIDef } from "@wireio/sdk-core/chain/Abi"
import { Serializer } from "@wireio/sdk-core/serializer"
import { SlugName } from "@wireio/sdk-core/SlugName"
import { contracts } from "@wireio/sdk-core"

const ACTION_TYPE = "regchain"
const CODE_FIELD_NAME = "code"
const CODES_FIELD_NAME = "codes"
const SLUG_TYPE_NAME = "slug_name"
const ETHEREUM = "ETHEREUM"
const SOLANA = "SOLANA"
const UINT64_BYTES = 8

/**
 * A deployed-contract ABI as wire-sysio emits it: `slug_name` is a builtin, so
 * the ABI names it with no struct definition of its own.
 */
const SLUG_ABI: ABIDef = {
  structs: [
    {
      name: ACTION_TYPE,
      base: "",
      fields: [
        { name: CODE_FIELD_NAME, type: SLUG_TYPE_NAME },
        { name: CODES_FIELD_NAME, type: `${SLUG_TYPE_NAME}[]` }
      ]
    }
  ]
}

/** The little-endian packed uint64 the chain stores for a spelling. */
function packedBytes(spelling: string): Uint8Array {
  const bytes = new Uint8Array(UINT64_BYTES)
  new DataView(bytes.buffer).setBigUint64(
    0,
    BigInt(SlugName.from(spelling)),
    true
  )
  return bytes
}

/** Encode one regchain payload through the generic, ABI-driven path. */
function encode(code: unknown, codes: unknown[] = []) {
  return Serializer.encode({
    object: { [CODE_FIELD_NAME]: code, [CODES_FIELD_NAME]: codes },
    abi: SLUG_ABI,
    type: ACTION_TYPE
  }).array
}

describe("slug_name ABI builtin", () => {
  it("encodes the canonical spelling as the packed uint64", () => {
    expect(Array.from(encode(ETHEREUM).slice(0, UINT64_BYTES))).toEqual(
      Array.from(packedBytes(ETHEREUM))
    )
  })

  it("round-trips through the generic decoder as the canonical string", () => {
    const decoded = Serializer.decode({
      data: encode(ETHEREUM, [SOLANA, ETHEREUM]),
      abi: SLUG_ABI,
      type: ACTION_TYPE
    })
    expect(Serializer.objectify(decoded)).toEqual({
      [CODE_FIELD_NAME]: ETHEREUM,
      [CODES_FIELD_NAME]: [SOLANA, ETHEREUM]
    })
  })

  it("accepts every carrier a slug can arrive in, all encoding identically", () => {
    const canonical = Array.from(encode(ETHEREUM))
    const packed = SlugName.from(ETHEREUM)
    expect(Array.from(encode(packed))).toEqual(canonical)
    expect(Array.from(encode(BigInt(packed)))).toEqual(canonical)
    expect(Array.from(encode({ value: packed }))).toEqual(canonical)
    expect(
      Array.from(encode(contracts.sysio.chains.ChainsSlugName.from(ETHEREUM)))
    ).toEqual(canonical)
  })

  it("encodes the empty spelling as the zero value", () => {
    expect(Array.from(encode("").slice(0, UINT64_BYTES))).toEqual(
      new Array(UINT64_BYTES).fill(0)
    )
  })

  it("refuses a spelling the chain would refuse", () => {
    expect(() => encode("7ETH")).toThrow(/must start with a letter/)
    expect(() => encode("ethereum")).toThrow(/outside \[A-Z0-9_\]/)
  })
})
