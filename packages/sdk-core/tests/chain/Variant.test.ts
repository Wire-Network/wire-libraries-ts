import { Variant } from "@wireio/sdk-core/chain/Variant"
import { Name } from "@wireio/sdk-core/chain/Name"
import { UInt8, UInt64 } from "@wireio/sdk-core/chain/Integer"
import { ABIDecoder, Serializer } from "@wireio/sdk-core/serializer"

const EXTENDED_VARIANT_ARM_COUNT = 129
const EXTENDED_VARIANT_ARM_INDEX = 128
const EXTENDED_VARIANT_PAYLOAD = 7
const EXTENDED_VARIANT_HEX = "800107"

@Variant.type("my_variant", [Name, UInt64])
class MyVariant extends Variant {
  declare value: Name | UInt64
}

const createExtendedVariantAbi = () => {
  const aliases = Array.from(
    { length: EXTENDED_VARIANT_ARM_COUNT },
    (_, index) => ({
      new_type_name: `t${index}`,
      type: "uint8"
    })
  )

  return {
    version: "sysio::abi/1.1",
    types: aliases,
    variants: [
      {
        name: "vtype",
        types: aliases.map(alias => alias.new_type_name)
      }
    ],
    structs: [],
    actions: [],
    tables: [],
    ricardian_clauses: [],
    action_results: [],
    enums: []
  }
}

describe("Variant", () => {
  describe("from", () => {
    it("creates a variant with a Name value", () => {
      const v = MyVariant.from(["name", "alice"])
      expect(v).toBeInstanceOf(MyVariant)
      expect(v.variantIdx).toBe(0)
      expect(v.value).toBeInstanceOf(Name)
      expect(String(v.value)).toBe("alice")
    })

    it("creates a variant with a UInt64 value", () => {
      const v = MyVariant.from(["uint64", 42])
      expect(v).toBeInstanceOf(MyVariant)
      expect(v.variantIdx).toBe(1)
    })
  })

  describe("equals", () => {
    it("returns true for equal variants", () => {
      const a = MyVariant.from(["name", "alice"])
      const b = MyVariant.from(["name", "alice"])
      expect(a.equals(b)).toBe(true)
    })

    it("returns false for different variant types", () => {
      const a = MyVariant.from(["name", "alice"])
      const b = MyVariant.from(["uint64", 42])
      expect(a.equals(b)).toBe(false)
    })
  })

  describe("variantName", () => {
    it("returns the name of the active variant type", () => {
      const v = MyVariant.from(["name", "alice"])
      expect(v.variantName).toBe("name")
    })
  })

  describe("decorator", () => {
    it("registers ABI name via Variant.type", () => {
      expect((MyVariant as any).abiName).toBe("my_variant")
    })

    it("registers variant types", () => {
      expect((MyVariant as any).abiVariant).toBeDefined()
      expect((MyVariant as any).abiVariant.length).toBe(2)
    })
  })

  describe("ABI serialization", () => {
    it("decodes variant indexes as varuint32", () => {
      const abi = createExtendedVariantAbi()
      const encoded = Serializer.encode({
        object: [`t${EXTENDED_VARIANT_ARM_INDEX}`, EXTENDED_VARIANT_PAYLOAD],
        type: "vtype",
        abi
      })
      const decoder = new ABIDecoder(encoded.array)
      const decoded = Serializer.decode({
        data: decoder,
        type: "vtype",
        abi
      })

      expect(Array.isArray(decoded)).toBe(true)

      const [decodedName, decodedPayload] = decoded as [string, UInt8]

      expect(encoded.hexString).toBe(EXTENDED_VARIANT_HEX)
      expect(decodedName).toBe(`t${EXTENDED_VARIANT_ARM_INDEX}`)
      expect(decodedPayload).toBeInstanceOf(UInt8)
      expect(Number(decodedPayload)).toBe(EXTENDED_VARIANT_PAYLOAD)
      expect(decoder.getPosition()).toBe(encoded.length)
    })
  })
})
