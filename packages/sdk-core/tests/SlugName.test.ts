import { SlugName, slugValue } from "@wireio/sdk-core/SlugName"

describe("SlugName", () => {
  describe("from", () => {
    // char[0] occupies the HIGH slot — bits [42..47] — mirroring
    // slug_name.hpp's most-significant-symbol-first packing.
    const SLOT0 = Math.pow(2, 42)
    const SLOT1 = Math.pow(2, 36)

    it("encodes single-letter strings (left-aligned: char[0] at bits 42..47)", () => {
      // 'A' is slot 1; first position
      expect(SlugName.from("A")).toBe(1 * SLOT0)
      // 'Z' is slot 26
      expect(SlugName.from("Z")).toBe(26 * SLOT0)
    })

    it("encodes digit '0' to slot 27, behind a leading letter", () => {
      expect(SlugName.from("A0")).toBe(1 * SLOT0 + 27 * SLOT1)
    })

    it("encodes '_' to slot 37, behind a leading letter", () => {
      expect(SlugName.from("A_")).toBe(1 * SLOT0 + 37 * SLOT1)
    })

    it("encodes a multi-char string with 6-bit MSB-first packing", () => {
      // "AB" → slot 1 at bits [42..47] + slot 2 at bits [36..41]
      expect(SlugName.from("AB")).toBe(1 * SLOT0 + 2 * SLOT1)
    })

    it("matches the contract-side slug_name literals (KATs vs slug_name.hpp)", () => {
      // Known-answer values cross-checked against the depot's `"X"_s`
      // literals — `SlugName.from(s)` and the chain's packing are designed
      // to be byte-identical (user-confirmed 2026-06-12); these pins make
      // any future drift fail fast on both sides of the boundary.
      expect(SlugName.from("WIRE")).toBe(101792956284928)
      expect(SlugName.from("ETH")).toBe(23373212024832)
      expect(SlugName.from("ETHEREUM")).toBe(23373300651341)
      expect(SlugName.from("SOLANA")).toBe(84606581215232)
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

    it("rejects a code that does not start with a letter", () => {
      // The rule that makes the chain's string carrier unambiguous: no legal
      // code can be spelled like a number. Mirrors
      // `fc::slug_name_traits::leading_alphabet`.
      const leadingLetter = /must start with a letter/
      expect(() => SlugName.from("0")).toThrow(leadingLetter)
      expect(() => SlugName.from("7")).toThrow(leadingLetter)
      expect(() => SlugName.from("101")).toThrow(leadingLetter)
      expect(() => SlugName.from("1E3")).toThrow(leadingLetter)
      expect(() => SlugName.from("0X10")).toThrow(leadingLetter)
      expect(() => SlugName.from("12345678")).toThrow(leadingLetter)
      expect(() => SlugName.from("_")).toThrow(leadingLetter)
      expect(() => SlugName.from("_LEAD")).toThrow(leadingLetter)
    })

    it("keeps digits and '_' legal after the first character", () => {
      expect(SlugName.toString(SlugName.from("V1"))).toBe("V1")
      expect(SlugName.toString(SlugName.from("TRAIL_"))).toBe("TRAIL_")
      expect(SlugName.toString(SlugName.from("Z1234567"))).toBe("Z1234567")
      expect(SlugName.toString(SlugName.from("Z_______"))).toBe("Z_______")
    })
  })

  describe("toString", () => {
    const SLOT0 = Math.pow(2, 42)

    it("decodes 0 to empty string", () => {
      expect(SlugName.toString(0)).toBe("")
    })

    it("decodes single-letter codes", () => {
      expect(SlugName.toString(1 * SLOT0)).toBe("A")
      expect(SlugName.toString(26 * SLOT0)).toBe("Z")
    })

    // `toString` stays TOTAL on purpose: it is a READER. A throwing renderer in
    // a scan loop is what stalls a consumer (wire-sysio #619 thread 3), so the
    // leading rule is enforced on the WRITE path (`from`) only.
    it("decodes digit slots even though such a value is not a writable code", () => {
      expect(SlugName.toString(27 * SLOT0)).toBe("0")
      expect(SlugName.toString(36 * SLOT0)).toBe("9")
    })

    it("decodes underscore slot", () => {
      expect(SlugName.toString(37 * SLOT0)).toBe("_")
    })

    it("decodes the contract-side literal values", () => {
      expect(SlugName.toString(101792956284928)).toBe("WIRE")
      expect(SlugName.toString(23373212024832)).toBe("ETH")
    })
  })

  describe("round-trip", () => {
    const inputs = ["ETH", "WIRE", "SOL", "USDC", "LIQETH", "LIQSOL", "PRIMARY", "ETHEREUM", "SOLANA", "A0", "A_", "A", "Z9_"]
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

  describe("slugValue", () => {
    const packedEthereum = SlugName.from("ETHEREUM")

    it("parses a bare string as a SPELLING, never a decimal", () => {
      expect(slugValue("ETHEREUM", "Chain")).toBe(packedEthereum)
    })

    it("passes an already-packed number through", () => {
      expect(slugValue(packedEthereum, "Chain")).toBe(packedEthereum)
    })

    it("accepts a bigint, since a generated field may carry one", () => {
      expect(slugValue(BigInt(packedEthereum), "Chain")).toBe(packedEthereum)
    })

    it("accepts the transitional { value } object carrier", () => {
      // The shape a pre-builtin depot emits: FC_REFLECT_TEMPLATE makes the
      // reflected struct object-only, so a reader must take both carriers.
      expect(slugValue({ value: packedEthereum }, "Chain")).toBe(packedEthereum)
    })

    it("accepts the object carrier quoted, as fc::json emits it above 0xffffffff", () => {
      expect(slugValue({ value: String(packedEthereum) }, "Chain")).toBe(
        packedEthereum
      )
    })

    it("rejects a spelling that does not lead with a letter", () => {
      expect(() => slugValue("7", "Chain")).toThrow(/must start with a letter/)
    })

    it("names the slug in the failure, so the caller knows which one", () => {
      expect(() => slugValue(0, "Reserve")).toThrow(/^Reserve slug must be/)
      expect(() => slugValue(0, "Chain")).toThrow(/^Chain slug must be/)
    })

    it("rejects an object carrying a non-numeric value", () => {
      expect(() => slugValue({ value: "not-a-number" }, "Chain")).toThrow(
        /must be a non-zero safe integer/
      )
    })
  })
})
