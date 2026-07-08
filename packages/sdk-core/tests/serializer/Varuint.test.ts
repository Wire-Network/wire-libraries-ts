import { ABIDecoder } from "@wireio/sdk-core/serializer/Decoder"
import { ABIEncoder } from "@wireio/sdk-core/serializer/Encoder"
import { arrayToHex } from "@wireio/sdk-core/Utils"

const PAGE_SIZE_WITH_FOUR_TRAILING_BYTES = 5
const FIVE_BYTE_VARUINT32_VALUE = 0x10000000
const MAX_VARUINT32_VALUE = 0xffffffff
const FIVE_BYTE_VALUE_HEX = "8080808001"
const MAX_VALUE_HEX = "ffffffff0f"
const OVERLONG_ZERO_BYTES = Uint8Array.from([
  0x80, 0x80, 0x80, 0x80, 0x80, 0x01
])

describe("varuint32 serialization", () => {
  it("encodes five-byte values when exactly four bytes remain", () => {
    const encoder = new ABIEncoder(PAGE_SIZE_WITH_FOUR_TRAILING_BYTES)

    encoder.writeByte(0xff)
    encoder.writeVaruint32(FIVE_BYTE_VARUINT32_VALUE)

    expect(arrayToHex(encoder.getData())).toBe(`ff${FIVE_BYTE_VALUE_HEX}`)
  })

  it("decodes the maximum canonical five-byte value", () => {
    const decoder = new ABIDecoder(
      Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0x0f])
    )

    expect(decoder.readVaruint32()).toBe(MAX_VARUINT32_VALUE)
    expect(decoder.getPosition()).toBe(MAX_VALUE_HEX.length / 2)
  })

  it("stops malformed varuint32 tags after five bytes", () => {
    const decoder = new ABIDecoder(OVERLONG_ZERO_BYTES)

    expect(decoder.readVaruint32()).toBe(0)
    expect(decoder.getPosition()).toBe(FIVE_BYTE_VALUE_HEX.length / 2)
    expect(decoder.readByte()).toBe(0x01)
  })
})
