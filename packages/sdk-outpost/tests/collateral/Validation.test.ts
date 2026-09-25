import { SystemContracts } from "@wireio/sdk-core"
import {
  assertOperatorCollateralRequest,
  OperatorCollateralMaximum
} from "@wireio/sdk-outpost"

const request = {
  operatorType: SystemContracts.SysioOpregOperatortype.OPERATOR_TYPE_BATCH,
  tokenCode: 1n,
  amount: 1n,
  depotBalance: 0n
}

describe("operator collateral bounds", () => {
  it("accepts the final raw unit of depot capacity and rejects the next", () => {
    expect(() =>
      assertOperatorCollateralRequest({
        ...request,
        depotBalance: OperatorCollateralMaximum - 1n
      })
    ).not.toThrow()
    expect(() =>
      assertOperatorCollateralRequest({
        ...request,
        depotBalance: OperatorCollateralMaximum
      })
    ).toThrow("remaining")
  })
  it.each([0n, -1n, OperatorCollateralMaximum + 1n, 1 as unknown as bigint])(
    "rejects unsafe amounts %s",
    amount => {
      expect(() =>
        assertOperatorCollateralRequest({ ...request, amount })
      ).toThrow("amount")
    }
  )
  it("rejects unknown roles and invalid token ids", () => {
    expect(() =>
      assertOperatorCollateralRequest({ ...request, operatorType: 0 })
    ).toThrow("role")
    expect(() =>
      assertOperatorCollateralRequest({ ...request, tokenCode: 1n << 64n })
    ).toThrow("u64")
  })
})
