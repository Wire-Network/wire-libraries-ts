import { contracts, SlugName, UInt64 } from "@wireio/sdk-core"

const { ChainsSlugName, chainSlugString, chainSlugValue } = contracts.sysio.chains

describe("sysio.chains slug helpers", () => {
  test("round-trips friendly and packed chain codes", () => {
    const packed = SlugName.from("ETHEREUM")

    expect(chainSlugValue("ETHEREUM")).toBe(packed)
    expect(chainSlugValue(packed)).toBe(packed)
    expect(chainSlugString("ETHEREUM")).toBe("ETHEREUM")
    expect(chainSlugString(packed)).toBe("ETHEREUM")
  })

  test("refuses a digit-leading string, so a decimal is never read as a slug", () => {
    // A code must start with a letter, which is what makes the string carrier
    // unambiguous: a decimal spelling can never also be a code. The packed form
    // is passed as a number, never as its decimal string.
    expect(() => chainSlugValue("12345678")).toThrow("must start with a letter")
    expect(() => chainSlugValue("7")).toThrow("must start with a letter")
    expect(() => chainSlugValue(String(SlugName.from("ETHEREUM")))).toThrow(
      "longer than 8"
    )
    // Digits after the leading letter are ordinary.
    expect(chainSlugValue("Z1234567")).toBe(SlugName.from("Z1234567"))
  })

  test("rejects empty, invalid, and unsafe values", () => {
    expect(() => chainSlugValue(0)).toThrow("non-zero safe integer")
    expect(() => chainSlugValue("ethereum")).toThrow("outside [A-Z0-9_]")
    expect(() => chainSlugValue(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "non-zero safe integer"
    )
  })

  test("ChainsSlugName renders its canonical spelling and refuses an unsafe value", () => {
    expect(ChainsSlugName.from("ETHEREUM").toString()).toBe("ETHEREUM")
    expect(ChainsSlugName.abiDefault().toString()).toBe("")
    // Past 53 bits the packed value cannot be a canonical slug; converting it
    // throws instead of silently rounding to a different code.
    expect(() => ChainsSlugName.from(UInt64.from("18446744073709551615")).toString()).toThrow()
  })
})
