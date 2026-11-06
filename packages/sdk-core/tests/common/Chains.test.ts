import { ChainDefinition } from "@wireio/sdk-core/common/Chains"

describe("Chains", () => {
  describe("ChainDefinition.from", () => {
    it("creates from args object", () => {
      const chain = ChainDefinition.from({
        id: "0000000000000000000000000000000000000000000000000000000000000001",
        name: "Test Chain",
        endpoint: "https://example.com",
        namespace: "test",
        coreSymbol: "TST"
      })
      expect(chain).toBeInstanceOf(ChainDefinition)
      expect(chain.name).toBe("Test Chain")
      expect(chain.endpoint).toBe("https://example.com")
      expect(chain.namespace).toBe("test")
      expect(chain.coreSymbol).toBe("TST")
    })
  })

  describe("equals", () => {
    it("returns true for same chain definitions", () => {
      const a = ChainDefinition.from({
        id: "0000000000000000000000000000000000000000000000000000000000000001",
        name: "Test",
        endpoint: "https://example.com",
        namespace: "test",
        coreSymbol: "TST"
      })
      const b = ChainDefinition.from({
        id: "0000000000000000000000000000000000000000000000000000000000000001",
        name: "Test",
        endpoint: "https://example.com",
        namespace: "test",
        coreSymbol: "TST"
      })
      expect(a.equals(b)).toBe(true)
    })

    it("returns false for different endpoints", () => {
      const a = ChainDefinition.from({
        id: "0000000000000000000000000000000000000000000000000000000000000001",
        name: "Test",
        endpoint: "https://example.com",
        namespace: "test",
        coreSymbol: "TST"
      })
      const b = ChainDefinition.from({
        id: "0000000000000000000000000000000000000000000000000000000000000001",
        name: "Test",
        endpoint: "https://other.com",
        namespace: "test",
        coreSymbol: "TST"
      })
      expect(a.equals(b)).toBe(false)
    })
  })
})
