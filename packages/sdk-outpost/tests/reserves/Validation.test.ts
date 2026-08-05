import {
  assertReserveSwapRequest,
  assertReserveUnsigned64,
  type ReserveSwapRequest
} from "@wireio/sdk-outpost"

const request: ReserveSwapRequest = {
  sourceTokenCode: 1,
  sourceReserveCode: 2,
  sourceAmount: 3,
  targetChainCode: 4,
  targetTokenCode: 5,
  targetReserveCode: 6,
  targetRecipient: Uint8Array.from([7]),
  targetAmount: 8,
  targetToleranceBps: 500
}

describe("reserve swap validation", () => {
  it("accepts a portable positive request", () => {
    expect(() => assertReserveSwapRequest(request)).not.toThrow()
    expect(assertReserveUnsigned64(8, "value").toNumber()).toBe(8)
  })

  it("rejects an empty recipient and values outside uint64", () => {
    expect(() =>
      assertReserveSwapRequest({
        ...request,
        targetRecipient: new Uint8Array()
      })
    ).toThrow("targetRecipient is required")
    expect(() => assertReserveUnsigned64(0, "value")).toThrow(
      "between 1 and uint64 max"
    )
  })
})
