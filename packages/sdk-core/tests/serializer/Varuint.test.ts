import { ABIDecoder } from "@wireio/sdk-core/serializer/Decoder"
import { ABIEncoder } from "@wireio/sdk-core/serializer/Encoder"
import { Serializer } from "@wireio/sdk-core/serializer"
import { arrayToHex, hexToArray } from "@wireio/sdk-core/Utils"

const PAGE_SIZE_WITH_FOUR_TRAILING_BYTES = 5
const FIVE_BYTE_VARUINT32_VALUE = 0x10000000
const MAX_VARUINT32_VALUE = 0xffffffff
const FIVE_BYTE_VALUE_HEX = "8080808001"
const MAX_VALUE_HEX = "ffffffff0f"
const OVERLONG_ZERO_BYTES = Uint8Array.from([
  0x80, 0x80, 0x80, 0x80, 0x80, 0x01
])
const NON_CANONICAL_VARUINT32_MESSAGE =
  /varuint32 is not in its shortest encoding/
const TOO_LONG_VARUINT32_MESSAGE = /varuint32 is longer than five bytes/
const MAX_VALUE_WITH_HIGH_BITS_HEX = "ffffffff7f"
const PADDED_ZERO_HEX = "8000"
const LENGTH_PREFIXED_TYPES = ["bytes", "string", "uint8[]"]

/** Values at every varuint32 byte-length boundary, with their shortest encodings. */
const CANONICAL_VARUINT32_ENCODINGS: [number, string][] = [
  [0, "00"],
  [1, "01"],
  [0x7f, "7f"],
  [0x80, "8001"],
  [0x3fff, "ff7f"],
  [0x4000, "808001"],
  [0x1fffff, "ffff7f"],
  [0x200000, "80808001"],
  [0xfffffff, "ffffff7f"],
  [FIVE_BYTE_VARUINT32_VALUE, FIVE_BYTE_VALUE_HEX],
  [MAX_VARUINT32_VALUE, MAX_VALUE_HEX]
]

/** Encodings longer than the shortest form, labelled by how they are padded. */
const NON_CANONICAL_VARUINT32_ENCODINGS: [string, string][] = [
  ["zero padded to two bytes", PADDED_ZERO_HEX],
  ["zero padded to five bytes", "8080808000"],
  ["one padded to two bytes", "8100"],
  ["0x7f padded to three bytes", "ff8000"],
  ["0x80 padded to three bytes", "808100"],
  ["a fifth byte with bit 32 set", "8080808010"],
  ["a fifth byte with every bit above 31 set", MAX_VALUE_WITH_HIGH_BITS_HEX]
]

/** Padded encodings, with the value the default decoder reads from them. */
const PADDED_VARUINT32_ENCODINGS: [string, number][] = [
  [PADDED_ZERO_HEX, 0],
  ["8080808000", 0],
  ["8100", 1],
  ["ff8000", 0x7f],
  ["808100", 0x80]
]

/** Encodings whose fifth byte still has its continuation bit, labelled for the test name. */
const TOO_LONG_VARUINT32_ENCODINGS: [string, string][] = [
  ["six bytes", arrayToHex(OVERLONG_ZERO_BYTES)],
  ["a fifth byte of 0x80", "8080808080"],
  ["a fifth byte of 0x81", "8080808081"]
]

/** Create a decoder that accepts only shortest varuint32 encodings. */
function createCanonicalDecoder(hex: string): ABIDecoder {
  return new ABIDecoder(hexToArray(hex), null, {
    canonicalVaruint32: true
  })
}

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

  it("decodes a five-byte value whose fifth byte has its top bit clear", () => {
    const decoder = new ABIDecoder(hexToArray(FIVE_BYTE_VALUE_HEX))

    expect(decoder.readVaruint32()).toBe(FIVE_BYTE_VARUINT32_VALUE)
    expect(decoder.getPosition()).toBe(FIVE_BYTE_VALUE_HEX.length / 2)
  })

  it("drops fifth-byte bits above bit 31 by default", () => {
    const decoder = new ABIDecoder(hexToArray(MAX_VALUE_WITH_HIGH_BITS_HEX))

    expect(decoder.readVaruint32()).toBe(MAX_VARUINT32_VALUE)
    expect(decoder.getPosition()).toBe(MAX_VALUE_WITH_HIGH_BITS_HEX.length / 2)
  })

  it.each(TOO_LONG_VARUINT32_ENCODINGS)(
    "rejects %s (%s) by default",
    (_, hex) => {
      expect(() => new ABIDecoder(hexToArray(hex)).readVaruint32()).toThrow(
        TOO_LONG_VARUINT32_MESSAGE
      )
    }
  )

  it.each(PADDED_VARUINT32_ENCODINGS)(
    "reads padded %s as %i by default",
    (hex, value) => {
      const decoder = new ABIDecoder(hexToArray(hex))

      expect(decoder.readVaruint32()).toBe(value)
      expect(decoder.getPosition()).toBe(hex.length / 2)
    }
  )

  describe("canonical-only decoder", () => {
    it.each(CANONICAL_VARUINT32_ENCODINGS)(
      "round-trips %i through its shortest encoding %s",
      (value, hex) => {
        const encoder = new ABIEncoder()
        encoder.writeVaruint32(value)
        const decoder = createCanonicalDecoder(hex)

        expect(arrayToHex(encoder.getData())).toBe(hex)
        expect(decoder.readVaruint32()).toBe(value)
        expect(decoder.getPosition()).toBe(hex.length / 2)
      }
    )

    it.each(NON_CANONICAL_VARUINT32_ENCODINGS)("rejects %s (%s)", (_, hex) => {
      expect(() => createCanonicalDecoder(hex).readVaruint32()).toThrow(
        NON_CANONICAL_VARUINT32_MESSAGE
      )
    })

    it.each(TOO_LONG_VARUINT32_ENCODINGS)("rejects %s (%s)", (_, hex) => {
      expect(() => createCanonicalDecoder(hex).readVaruint32()).toThrow(
        TOO_LONG_VARUINT32_MESSAGE
      )
    })

    it.each(LENGTH_PREFIXED_TYPES)(
      "rejects a padded length prefix on %s",
      type => {
        expect(() =>
          Serializer.decode({
            data: createCanonicalDecoder(PADDED_ZERO_HEX),
            type
          })
        ).toThrow(NON_CANONICAL_VARUINT32_MESSAGE)
      }
    )
  })
})
