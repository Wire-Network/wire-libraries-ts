import { SystemContracts } from "@wireio/sdk-core"
import type { OperatorCollateralRequest } from "./Types.js"

/** Depot asset magnitude bounds every collateral bucket, including raw wei. */
export const OperatorCollateralMaximum = (1n << 62n) - 1n
const Unsigned64Maximum = (1n << 64n) - 1n,
  OperatorRoles = [
    SystemContracts.SysioOpregOperatortype.OPERATOR_TYPE_PRODUCER,
    SystemContracts.SysioOpregOperatortype.OPERATOR_TYPE_BATCH,
    SystemContracts.SysioOpregOperatortype.OPERATOR_TYPE_UNDERWRITER
  ]

/** Reject unsupported roles, unsafe integers and unavailable depot headroom. */
export function assertOperatorCollateralRequest(
  request: OperatorCollateralRequest,
  deposit = true
): void {
  if (!OperatorRoles.includes(request.operatorType)) {
    throw new Error("Choose a producer, batch operator or underwriter role.")
  }
  if (
    typeof request.tokenCode !== "bigint" ||
    request.tokenCode <= 0n ||
    request.tokenCode > Unsigned64Maximum
  ) {
    throw new Error("Collateral token code must be a positive u64 bigint.")
  }
  if (
    typeof request.amount !== "bigint" ||
    request.amount <= 0n ||
    request.amount > OperatorCollateralMaximum
  ) {
    throw new Error("Collateral amount exceeds the positive depot asset range.")
  }
  if (
    typeof request.depotBalance !== "bigint" ||
    request.depotBalance < 0n ||
    request.depotBalance > OperatorCollateralMaximum
  ) {
    throw new Error("A valid current depot collateral balance is required.")
  }
  if (
    deposit &&
    request.amount > OperatorCollateralMaximum - request.depotBalance
  ) {
    throw new Error("Deposit exceeds the remaining depot collateral capacity.")
  }
  if (!deposit && request.amount > request.depotBalance) {
    throw new Error("Withdrawal exceeds the depot collateral balance.")
  }
}
