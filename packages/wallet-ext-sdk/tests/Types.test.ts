import { KeyType, ChainKind } from "@wireio/wallet-ext-sdk"

describe("KeyType enum", () => {
  test("has K1 value", () => {
    expect(KeyType.K1).toBe("K1")
  })

  test("has R1 value", () => {
    expect(KeyType.R1).toBe("R1")
  })

  test("has EM value", () => {
    expect(KeyType.EM).toBe("EM")
  })

  test("has ED value", () => {
    expect(KeyType.ED).toBe("ED")
  })

  test("has exactly 4 members", () => {
    const values = Object.values(KeyType)
    expect(values).toHaveLength(4)
  })
})

describe("ChainKind enum", () => {
  test("has WIRE value", () => {
    expect(ChainKind.WIRE).toBe("WIRE")
  })

  test("has ETHEREUM value", () => {
    expect(ChainKind.ETHEREUM).toBe("ETHEREUM")
  })

  test("has SOLANA value", () => {
    expect(ChainKind.SOLANA).toBe("SOLANA")
  })

  test("has SUI value", () => {
    expect(ChainKind.SUI).toBe("SUI")
  })

  test("has exactly 4 members", () => {
    const values = Object.values(ChainKind)
    expect(values).toHaveLength(4)
  })
})
