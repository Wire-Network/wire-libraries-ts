import { ABIDecoder, Serializer } from "@wireio/sdk-core/serializer"

const EMPTY_ARRAY_LENGTH_PREFIX = Uint8Array.from([0xa0, 0x8d, 0x06])
const UINT8_ARRAY_BYTES = Uint8Array.from([0x03, 0x01, 0x02, 0x03])
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
})
