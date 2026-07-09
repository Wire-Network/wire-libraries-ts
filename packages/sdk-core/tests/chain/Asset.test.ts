import { Asset, ExtendedAsset } from "@wireio/sdk-core/chain/Asset"
import { UInt64 } from "@wireio/sdk-core/chain/Integer"
import { Name } from "@wireio/sdk-core/chain/Name"
import { Serializer } from "@wireio/sdk-core/serializer"

const ABI_FIELD_NAME = "value"
const ABI_ROW_NAME = "row"
const SDK_ABI_TYPES = {
  asset: "asset",
  symbol: "symbol",
  symbolCode: "symbol_code"
} as const

type SdkAbiType = (typeof SDK_ABI_TYPES)[keyof typeof SDK_ABI_TYPES]

const OVERLONG_SYMBOL_CODE = "ABCDEFGH"
const OVERLONG_ASSET = `1.0000 ${OVERLONG_SYMBOL_CODE}`
const INVALID_SYMBOL_CODE_CHARACTER = "!"
const INVALID_SYMBOL_CODE_NUMBER = INVALID_SYMBOL_CODE_CHARACTER.charCodeAt(0)
const OVERLONG_RAW_SYMBOL_CODE = UInt64.from(
  new Uint8Array(
    Array.from(OVERLONG_SYMBOL_CODE).map(char => char.charCodeAt(0))
  )
)
const MALFORMED_SYMBOL_STRINGS = [
  "abc,SYS",
  "4x,SYS",
  "4,sys",
  "4,SYS!",
  " 4,SYS"
]

/** Encode one ABI builtin field with a caller-provided runtime value. */
function encodeBuiltinValue(value: string | number | UInt64, type: SdkAbiType) {
  return Serializer.encode({
    object: { [ABI_FIELD_NAME]: value },
    type: ABI_ROW_NAME,
    abi: {
      structs: [
        {
          name: ABI_ROW_NAME,
          base: "",
          fields: [{ name: ABI_FIELD_NAME, type }]
        }
      ]
    }
  })
}

describe("Asset", () => {
  test("from string parses correctly", () => {
    const asset = Asset.from("1.0000 SYS")
    expect(asset).toBeInstanceOf(Asset)
  })

  test("toString returns correct string", () => {
    expect(Asset.from("1.0000 SYS").toString()).toBe("1.0000 SYS")
  })

  test("symbol.name returns symbol name", () => {
    expect(Asset.from("1.0000 SYS").symbol.name).toBe("SYS")
  })

  test("symbol.precision returns correct precision", () => {
    expect(Asset.from("1.0000 SYS").symbol.precision).toBe(4)
  })

  test("value returns numeric value", () => {
    expect(Asset.from("1.0000 SYS").value).toBe(1)
  })

  test("value returns fractional value", () => {
    expect(Asset.from("0.5000 SYS").value).toBe(0.5)
  })

  test("from numeric value with symbol", () => {
    const asset = Asset.from(10, "4,SYS")
    expect(asset.toString()).toBe("10.0000 SYS")
  })

  test("fromUnits creates correct asset", () => {
    const asset = Asset.fromUnits(10000, "4,SYS")
    expect(asset.value).toBe(1)
  })

  test("equals returns true for matching assets", () => {
    expect(Asset.from("1.0000 SYS").equals("1.0000 SYS")).toBe(true)
  })

  test("equals returns false for different assets", () => {
    expect(Asset.from("1.0000 SYS").equals("2.0000 SYS")).toBe(false)
  })

  test("rejects overlong symbol names", () => {
    expect(() => Asset.from(OVERLONG_ASSET)).toThrow("Invalid asset symbol")
  })

  test("rejects overlong symbol names through ABI serialization", () => {
    expect(() =>
      encodeBuiltinValue(OVERLONG_ASSET, SDK_ABI_TYPES.asset)
    ).toThrow("Invalid asset symbol")
  })
})

describe("Asset.Symbol", () => {
  test("from string creates symbol", () => {
    const sym = Asset.Symbol.from("4,SYS")
    expect(sym).toBeInstanceOf(Asset.Symbol)
  })

  test("name returns symbol name", () => {
    expect(Asset.Symbol.from("4,SYS").name).toBe("SYS")
  })

  test("precision returns correct precision", () => {
    expect(Asset.Symbol.from("4,SYS").precision).toBe(4)
  })

  test("toString returns precision,name format", () => {
    expect(Asset.Symbol.from("4,SYS").toString()).toBe("4,SYS")
  })

  test("rejects malformed symbol strings", () => {
    MALFORMED_SYMBOL_STRINGS.forEach(value => {
      expect(() => Asset.Symbol.from(value)).toThrow("Invalid symbol string")
    })
  })

  test("rejects malformed symbol strings through ABI serialization", () => {
    MALFORMED_SYMBOL_STRINGS.forEach(value => {
      expect(() => encodeBuiltinValue(value, SDK_ABI_TYPES.symbol)).toThrow(
        "Invalid symbol string"
      )
    })
  })
})

describe("Asset.SymbolCode", () => {
  test("from string creates symbol code", () => {
    const code = Asset.SymbolCode.from("SYS")
    expect(code).toBeInstanceOf(Asset.SymbolCode)
  })

  test("toString returns name", () => {
    expect(Asset.SymbolCode.from("SYS").toString()).toBe("SYS")
  })

  test("rejects overlong symbol codes", () => {
    expect(() => Asset.SymbolCode.from(OVERLONG_SYMBOL_CODE)).toThrow(
      "Invalid asset symbol"
    )
  })

  test("rejects malformed numeric symbol codes", () => {
    expect(() => Asset.SymbolCode.from(INVALID_SYMBOL_CODE_NUMBER)).toThrow(
      "Invalid asset symbol"
    )
  })

  test("rejects overlong raw symbol codes", () => {
    expect(() => Asset.SymbolCode.from(OVERLONG_RAW_SYMBOL_CODE)).toThrow(
      "Invalid asset symbol"
    )
  })

  test("rejects overlong symbol codes through ABI serialization", () => {
    expect(() =>
      encodeBuiltinValue(OVERLONG_SYMBOL_CODE, SDK_ABI_TYPES.symbolCode)
    ).toThrow("Invalid asset symbol")
  })

  test("rejects malformed numeric symbol codes through ABI serialization", () => {
    expect(() =>
      encodeBuiltinValue(INVALID_SYMBOL_CODE_NUMBER, SDK_ABI_TYPES.symbolCode)
    ).toThrow("Invalid asset symbol")
  })

  test("rejects overlong raw symbol codes through ABI serialization", () => {
    expect(() =>
      encodeBuiltinValue(OVERLONG_RAW_SYMBOL_CODE, SDK_ABI_TYPES.symbolCode)
    ).toThrow("Invalid asset symbol")
  })
})

describe("ExtendedAsset", () => {
  test("from object creates extended asset", () => {
    const ea = ExtendedAsset.from({
      quantity: "1.0000 SYS",
      contract: "sysio.token"
    })
    expect(ea).toBeInstanceOf(ExtendedAsset)
    expect(ea.quantity.toString()).toBe("1.0000 SYS")
    expect(ea.contract.toString()).toBe("sysio.token")
  })

  test("equals returns true for matching extended assets", () => {
    const ea1 = ExtendedAsset.from({
      quantity: "1.0000 SYS",
      contract: "sysio.token"
    })
    const ea2 = ExtendedAsset.from({
      quantity: "1.0000 SYS",
      contract: "sysio.token"
    })
    expect(ea1.equals(ea2)).toBe(true)
  })
})
