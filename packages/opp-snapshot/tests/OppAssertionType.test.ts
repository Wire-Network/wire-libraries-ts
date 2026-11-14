import { OppAssertionSchemas, OppAssertionType, isOppAssertionType } from "@wireio/opp-snapshot"

describe("OppAssertionType", () => {
  it("carries a payload layout for every assertion type", () => {
    const types = Object.values(OppAssertionType).filter(value => typeof value === "number")
    expect(Object.keys(OppAssertionSchemas).map(Number).sort()).toEqual([...types].sort())
  })

  it("recognizes the known tags only", () => {
    expect(isOppAssertionType(OppAssertionType.Stake)).toBe(true)
    expect(isOppAssertionType(3003)).toBe(false)
    expect(isOppAssertionType(0)).toBe(false)
  })
})
