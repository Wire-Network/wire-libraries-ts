import { ABIDecoder, ABIEncoder, Serializer } from "@wireio/sdk-core/serializer"
import { Float128, Float32, Float64 } from "@wireio/sdk-core/chain/Float"

const EMPTY_ARRAY_LENGTH_PREFIX = Uint8Array.from([0xa0, 0x8d, 0x06])
const UINT8_ARRAY_BYTES = Uint8Array.from([0x03, 0x01, 0x02, 0x03])
const FLOAT_VALUE = 1.5
const INVALID_FLOAT_SIZE_MESSAGE = /Invalid float size/
const ZERO_FIELD_STRUCT_ABI = {
  version: "sysio::abi/1.1",
  structs: [{ name: "empty", base: "", fields: [] }]
}

describe("ABI decoder", () => {
  describe("binary arrays", () => {
    it("rejects elements that decode without consuming input", () => {
      const decoder = new ABIDecoder(EMPTY_ARRAY_LENGTH_PREFIX)

      expect(() =>
        Serializer.decode({
          data: decoder,
          type: "empty[]",
          abi: ZERO_FIELD_STRUCT_ABI
        })
      ).toThrow(/without consuming input/)
      expect(decoder.getPosition()).toBe(EMPTY_ARRAY_LENGTH_PREFIX.length)
    })

    it("decodes elements that consume input", () => {
      const decoded = Serializer.decode({
        data: UINT8_ARRAY_BYTES,
        type: "uint8[]"
      })

      expect(decoded.map(value => value.toJSON())).toEqual([1, 2, 3])
    })
  })

  describe("floats", () => {
    it.each([Float32.byteWidth, Float64.byteWidth])(
      "reads a %i-byte float",
      byteWidth => {
        const encoder = new ABIEncoder()
        encoder.writeFloat(FLOAT_VALUE, byteWidth)
        const decoder = new ABIDecoder(encoder.getData())

        expect(decoder.readFloat(byteWidth)).toBe(FLOAT_VALUE)
        expect(decoder.getPosition()).toBe(byteWidth)
      }
    )

    it("rejects any other width without advancing", () => {
      const decoder = new ABIDecoder(new Uint8Array(Float128.byteWidth))

      expect(() => decoder.readFloat(Float128.byteWidth)).toThrow(
        INVALID_FLOAT_SIZE_MESSAGE
      )
      expect(decoder.getPosition()).toBe(0)
    })
  })
})
