import { contracts } from "@wireio/sdk-core"

const { ReservMatchReserve, buildMatchReserveAction } = contracts.sysio.reserv

describe("reserve actions", () => {
  test("builds a typed matchreserve action from friendly slugs", () => {
    const action = buildMatchReserveAction({
        chainCode: "ETHEREUM",
        tokenCode: "ETH",
        reserveCode: "PRIMARY",
        matcher: "alice",
        wireAmount: 2500000000n
      }),
      decoded = action.decodeData(ReservMatchReserve)

    expect(action.account.toString()).toBe("sysio.reserv")
    expect(action.name.toString()).toBe("matchreserve")
    expect(action.authorization.map(String)).toEqual(["alice@active"])
    expect(decoded.matcher.toString()).toBe("alice")
    expect(decoded.wire_amount.toString()).toBe("2500000000")
  })
})
