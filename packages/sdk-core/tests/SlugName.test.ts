import { SlugName } from "@wireio/sdk-core/SlugName"

describe("SlugName", () => {
  describe("from", () => {
    it("encodes single-letter strings", () => {
      // 'A' is slot 1; first position
      expect(SlugName.from("A")).toBe(1)
      // 'Z' is slot 26
      expect(SlugName.from("Z")).toBe(26)
    })

    it("encodes digit '0' to slot 27", () => {
      expect(SlugName.from("0")).toBe(27)
    })

    it("encodes '_' to slot 37", () => {
      expect(SlugName.from("_")).toBe(37)
    })

    it("encodes a multi-char string with 6-bit packing", () => {
      // "AB" → slot 1 (i=0) | slot 2 (i=1) << 6 = 1 | 128 = 129
      expect(SlugName.from("AB")).toBe(1 | (2 << 6))
    })

    it("rejects empty input", () => {
      expect(() => SlugName.from("")).toThrow(/empty/)
    })

    it("rejects strings longer than 8 chars", () => {
      expect(() => SlugName.from("ABCDEFGHI")).toThrow(/longer than 8/)
    })

    it("rejects lowercase input", () => {
      expect(() => SlugName.from("eth")).toThrow(/outside/)
    })

    it("rejects characters outside the alphabet", () => {
      expect(() => SlugName.from("ETH!")).toThrow(/outside/)
      expect(() => SlugName.from("E-T")).toThrow(/outside/)
    })
  })

  describe("toString", () => {
    it("decodes 0 to empty string", () => {
      expect(SlugName.toString(0)).toBe("")
    })

    it("decodes single-letter codes", () => {
      expect(SlugName.toString(1)).toBe("A")
      expect(SlugName.toString(26)).toBe("Z")
    })

    it("decodes digit slots", () => {
      expect(SlugName.toString(27)).toBe("0")
      expect(SlugName.toString(36)).toBe("9")
    })

    it("decodes underscore slot", () => {
      expect(SlugName.toString(37)).toBe("_")
    })
  })

  describe("round-trip", () => {
    const inputs = ["ETH", "WIRE", "SOL", "USDC", "LIQETH", "LIQSOL", "PRIMARY", "ETHEREUM", "SOLANA", "0", "_", "A", "Z9_"]
    inputs.forEach(s => {
      it(`round-trips '${s}'`, () => {
        const encoded = SlugName.from(s)
        expect(SlugName.toString(encoded)).toBe(s)
      })
    })

    it("round-trips a max-length (8 char) code", () => {
      // 8 chars exactly — uses all 48 bits
      expect(SlugName.toString(SlugName.from("ABCDEFGH"))).toBe("ABCDEFGH")
    })

    it("encodes 'WIRE' and 'ETH' as distinct values", () => {
      expect(SlugName.from("WIRE")).not.toBe(SlugName.from("ETH"))
    })
  })
})
