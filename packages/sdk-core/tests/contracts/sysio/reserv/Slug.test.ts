import { contracts, UInt64 } from "@wireio/sdk-core"

const { ReservSlugName } = contracts.sysio.reserv

describe("sysio.reserv slug struct", () => {
  test("ReservSlugName renders its canonical spelling and refuses an unsafe value", () => {
    expect(ReservSlugName.from("PRIMARY").toString()).toBe("PRIMARY")
    expect(ReservSlugName.abiDefault().toString()).toBe("")
    // Past 53 bits the packed value cannot be a canonical slug; converting it
    // throws instead of silently rounding to a different code.
    expect(() => ReservSlugName.from(UInt64.from("18446744073709551615")).toString()).toThrow()
  })
})
