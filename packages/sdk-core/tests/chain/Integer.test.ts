import {
  Int32,
  Int64,
  UInt8,
  UInt16,
  UInt32,
  UInt64,
  UInt128,
  UInt256,
  VarUInt,
  VarInt
} from "@wireio/sdk-core/chain/Integer"
import { Serializer } from "@wireio/sdk-core/serializer"

const ABI_INTEGER_TYPES = ["uint64", "int64", "varuint32"] as const
const MAX_PRECISION_UINT256_STRING = "1.123456789012345678"
const MALFORMED_INTEGER_STRINGS = [
  "1.23",
  "0x10",
  "abc123",
  "+1000",
  " 100",
  "42\n"
]
const INVALID_NUMBER_VALUES = [
  1.23,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1
]
const MALFORMED_UINT256_STRINGS = [
  "0x10",
  "+1",
  "abc123",
  "1.2.3",
  "",
  ".",
  " 1"
]
const OVERPRECISION_UINT256_STRINGS = [
  "1.1234567890123456789",
  ".1234567890123456789",
  "1.0000000000000000000"
]

type AbiIntegerType = (typeof ABI_INTEGER_TYPES)[number]
type IntegerAbiValue = string | String | number | bigint

/** Encode one ABI integer field with a caller-provided runtime value. */
function encodeIntegerValue(value: IntegerAbiValue, abiType: AbiIntegerType) {
  return Serializer.encode({
    object: { value },
    type: "row",
    abi: {
      structs: [
        {
          name: "row",
          base: "",
          fields: [{ name: "value", type: abiType }]
        }
      ]
    }
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
      ABI_INTEGER_TYPES.forEach(abiType => {
        MALFORMED_INTEGER_STRINGS.forEach(value => {
          expect(() => encodeIntegerValue(value, abiType)).toThrow(
            "Invalid number"
          )
        })
      })
    })

    test("rejects boxed string values", () => {
      const value = new String("abc123")

      expect(() => UInt64.from(value as string)).toThrow("Invalid number")
      expect(() => Int64.from(value as string)).toThrow("Invalid number")
      expect(() => encodeIntegerValue(value, "uint64")).toThrow(
        "Invalid number"
      )
    })

    test("rejects unsafe or fractional numbers", () => {
      INVALID_NUMBER_VALUES.forEach(value => {
        expect(() => UInt64.from(value)).toThrow("Invalid number")
        expect(() => encodeIntegerValue(value, "uint64")).toThrow(
          "Invalid number"
        )
      })
    })

    test("accepts bigint integer values", () => {
      expect(UInt64.from(123n).toNumber()).toBe(123)
      expect(UInt64.from(9007199254740992n).toString()).toBe("9007199254740992")
      expect(() => encodeIntegerValue(123n, "uint64")).not.toThrow()
    })

    test("equals follows strict string parsing and bigint support", () => {
      expect(UInt64.from(100).equals(100n)).toBe(true)
      expect(UInt64.from(100).equals(" 100")).toBe(false)
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

  describe("UInt256", () => {
    test("accepts strict fixed-point strings", () => {
      expect(UInt256.from("1.5").toString()).toBe("1.5")
      expect(UInt256.from(".5").toString()).toBe("0.5")
      expect(UInt256.from("1.").toString()).toBe("1")
      expect(UInt256.from(MAX_PRECISION_UINT256_STRING).toString()).toBe(
        MAX_PRECISION_UINT256_STRING
      )
    })

    test("rejects malformed fixed-point strings", () => {
      MALFORMED_UINT256_STRINGS.forEach(value => {
        expect(() => UInt256.from(value)).toThrow("Invalid number")
      })
    })

    test("rejects over-precision fixed-point strings", () => {
      OVERPRECISION_UINT256_STRINGS.forEach(value => {
        expect(() => UInt256.from(value)).toThrow("Invalid number")
      })
    })

    test("rejects unsupported runtime values", () => {
      const unsupportedValue = {} as { low: UInt128; high: UInt128 }

      expect(() => UInt256.from(unsupportedValue)).toThrow("Invalid number")
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
