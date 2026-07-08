import {
  Int32,
  Int64,
  UInt8,
  UInt16,
  UInt32,
  UInt64,
  UInt128,
  VarUInt,
  VarInt
} from "@wireio/sdk-core/chain/Integer"
import { Serializer } from "@wireio/sdk-core/serializer"

const MALFORMED_INTEGER_STRINGS = ["1.23", "0x10", "abc123", "+1000"]
const INTEGER_STRING_ABI = {
  structs: [
    {
      name: "row",
      base: "",
      fields: [
        { name: "u", type: "uint64" },
        { name: "i", type: "int64" },
        { name: "v", type: "varuint32" }
      ]
    }
  ]
}

/** Encode a row whose integer fields all receive the same runtime value. */
function encodeIntegerStringRow(value: string | String) {
  return Serializer.encode({
    object: { u: value, i: value, v: value },
    type: "row",
    abi: INTEGER_STRING_ABI
  })
}

describe("Integer", () => {
  describe("string parsing", () => {
    test("accepts strict decimal integer strings", () => {
      expect(UInt64.from("100").toNumber()).toBe(100)
      expect(Int64.from("-100").toNumber()).toBe(-100)
    })

    test("rejects malformed numeric strings", () => {
      MALFORMED_INTEGER_STRINGS.forEach(value => {
        expect(() => UInt64.from(value)).toThrow("Invalid number")
        expect(() => Int64.from(value)).toThrow("Invalid number")
      })
    })

    test("rejects malformed numeric strings through ABI serialization", () => {
      MALFORMED_INTEGER_STRINGS.forEach(value => {
        expect(() => encodeIntegerStringRow(value)).toThrow("Invalid number")
      })
    })

    test("rejects boxed string values", () => {
      const value = new String("abc123")

      expect(() => UInt64.from(value as string)).toThrow("Invalid number")
      expect(() => Int64.from(value as string)).toThrow("Invalid number")
      expect(() => encodeIntegerStringRow(value)).toThrow("Invalid number")
    })
  })

  describe("UInt64", () => {
    test("from(0) creates zero value", () => {
      const val = UInt64.from(0)
      expect(val.toNumber()).toBe(0)
    })

    test("from(100).toNumber() returns 100", () => {
      expect(UInt64.from(100).toNumber()).toBe(100)
    })

    test("from(100).equals(100) returns true", () => {
      expect(UInt64.from(100).equals(100)).toBe(true)
    })

    test("from string creates correct value", () => {
      expect(UInt64.from("100").toNumber()).toBe(100)
    })
  })

  describe("Int32", () => {
    test("from(-1).toNumber() returns -1", () => {
      expect(Int32.from(-1).toNumber()).toBe(-1)
    })

    test("from max int32 value", () => {
      expect(Int32.from(2147483647).toNumber()).toBe(2147483647)
    })
  })

  describe("UInt8", () => {
    test("from(255).toNumber() returns 255", () => {
      expect(UInt8.from(255).toNumber()).toBe(255)
    })

    test("from(256) with truncate overflow wraps to 0", () => {
      const val = UInt8.from(256, "truncate")
      expect(val.toNumber()).toBe(0)
    })
  })

  describe("UInt16", () => {
    test("from(65535).toNumber() returns max uint16", () => {
      expect(UInt16.from(65535).toNumber()).toBe(65535)
    })
  })

  describe("UInt128", () => {
    test("from(0) creates zero value", () => {
      expect(UInt128.from(0).toNumber()).toBe(0)
    })
  })

  describe("arithmetic", () => {
    test("adding returns correct sum", () => {
      expect(UInt64.from(10).adding(UInt64.from(5)).toNumber()).toBe(15)
    })

    test("subtracting returns correct difference", () => {
      expect(UInt64.from(10).subtracting(UInt64.from(3)).toNumber()).toBe(7)
    })

    test("multiplying returns correct product", () => {
      expect(UInt64.from(6).multiplying(UInt64.from(7)).toNumber()).toBe(42)
    })

    test("dividing returns correct quotient", () => {
      expect(UInt64.from(20).dividing(UInt64.from(4)).toNumber()).toBe(5)
    })
  })

  describe("comparison", () => {
    test("gt returns true when greater", () => {
      expect(UInt64.from(10).gt(UInt64.from(5))).toBe(true)
    })

    test("gt returns false when less", () => {
      expect(UInt64.from(5).gt(UInt64.from(10))).toBe(false)
    })

    test("lt returns true when less", () => {
      expect(UInt64.from(5).lt(UInt64.from(10))).toBe(true)
    })

    test("lt returns false when greater", () => {
      expect(UInt64.from(10).lt(UInt64.from(5))).toBe(false)
    })

    test("gte returns true when equal", () => {
      expect(UInt64.from(10).gte(UInt64.from(10))).toBe(true)
    })

    test("lte returns true when equal", () => {
      expect(UInt64.from(10).lte(UInt64.from(10))).toBe(true)
    })
  })

  describe("random", () => {
    test("UInt32.random() returns a valid UInt32", () => {
      const val = UInt32.random()
      expect(val).toBeInstanceOf(UInt32)
      expect(val.toNumber()).toBeGreaterThanOrEqual(0)
    })
  })

  describe("VarUInt", () => {
    test("from(127) creates a valid value", () => {
      const val = VarUInt.from(127)
      expect(val.toNumber()).toBe(127)
    })
  })

  describe("VarInt", () => {
    test("from(-1) creates a valid value", () => {
      const val = VarInt.from(-1)
      expect(val.toNumber()).toBe(-1)
    })
  })

  describe("Int64", () => {
    test("from negative value", () => {
      expect(Int64.from(-100).toNumber()).toBe(-100)
    })
  })
})
