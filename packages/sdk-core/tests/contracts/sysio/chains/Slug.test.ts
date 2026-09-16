import { contracts, SlugName } from "@wireio/sdk-core"

const { chainSlugString, chainSlugValue } = contracts.sysio.chains

describe("sysio.chains slug helpers", () => {
  test("round-trips friendly and packed chain codes", () => {
    const packed = SlugName.from("ETHEREUM")

    expect(chainSlugValue("ETHEREUM")).toBe(packed)
    expect(chainSlugValue(packed)).toBe(packed)
    expect(chainSlugString("ETHEREUM")).toBe("ETHEREUM")
    expect(chainSlugString(packed)).toBe("ETHEREUM")
  })

  test("reads a digit-only code as a slug, never as its own decimal", () => {
    // The slug alphabet contains digits, so "12345678" is a legitimate code
    // whose packed value is nothing like 12345678. A decimal string is
    // therefore not a second spelling of a packed value — it is a slug, or it
    // is invalid. The packed form is passed as a number.
    expect(chainSlugValue("12345678")).toBe(SlugName.from("12345678"))
    expect(chainSlugValue("12345678")).not.toBe(12345678)
    expect(() => chainSlugValue(String(SlugName.from("ETHEREUM")))).toThrow(
      "longer than 8"
    )
  })

  test("rejects empty, invalid, and unsafe values", () => {
    expect(() => chainSlugValue(0)).toThrow("non-zero safe integer")
    expect(() => chainSlugValue("ethereum")).toThrow("outside [A-Z0-9_]")
    expect(() => chainSlugValue(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "non-zero safe integer"
    )
  })
})
