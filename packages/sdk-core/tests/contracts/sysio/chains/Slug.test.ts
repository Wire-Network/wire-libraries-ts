import { contracts, SlugName } from "@wireio/sdk-core"

const { chainSlugData, chainSlugString, chainSlugValue } =
  contracts.sysio.chains

describe("sysio.chains slug helpers", () => {
  test("round-trips friendly and packed chain codes", () => {
    const packed = SlugName.from("ETHEREUM")

    expect(chainSlugValue("ETHEREUM")).toBe(packed)
    expect(chainSlugValue(String(packed))).toBe(packed)
    expect(chainSlugData("ETHEREUM")).toEqual({ value: packed })
    expect(chainSlugString(packed)).toBe("ETHEREUM")
  })

  test("rejects empty, invalid, and unsafe values", () => {
    expect(() => chainSlugValue(0)).toThrow("non-zero safe integer")
    expect(() => chainSlugValue("ethereum")).toThrow("outside [A-Z0-9_]")
    expect(() => chainSlugValue(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "non-zero safe integer"
    )
  })
})
