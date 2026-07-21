import { buildContractAction } from "../../Contract.js"
import type { Action } from "../../../chain/Action.js"
import { Name } from "../../../chain/Name.js"
import { PermissionLevel } from "../../../chain/PermissionLevel.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"

import { DEFAULT_RESERV_CONTRACT } from "./Constants.js"
import { descriptor as reservDescriptor } from "./Descriptor.js"
import { reserveSlugData } from "./Slug.js"
import type { MatchReserveOptions, ReserveQuoteOptions } from "./Types.js"

/** Any value with a string form — an amount as a number, string, bigint, or a BN/Decimal-like object. */
interface Stringifiable {
  toString(): string
}

function amountString(
  value: number | string | bigint | Stringifiable
): string {
  return value.toString()
}

/** Builds generated action data for `sysio.reserv::matchreserve`. */
export function matchReserveActionData(
  options: MatchReserveOptions
): SysioContracts.SysioReservMatchreserveAction {
  return {
    chain_code: reserveSlugData(options.chainCode),
    token_code: reserveSlugData(options.tokenCode),
    reserve_code: reserveSlugData(options.reserveCode),
    matcher: Name.from(options.matcher).toString(),
    wire_amount: amountString(options.wireAmount)
  }
}

/** Builds an unsigned `sysio.reserv::matchreserve` action. */
export function buildMatchReserveAction(options: MatchReserveOptions): Action {
  const matcher = Name.from(options.matcher)

  return buildContractAction({
    contract: options.contract || DEFAULT_RESERV_CONTRACT,
    descriptor: reservDescriptor.actions.matchreserve,
    authorization: [
      PermissionLevel.from({
        actor: matcher,
        permission: options.permission || "active"
      })
    ],
    data: matchReserveActionData(options)
  })
}

/** Builds generated action data for read-only `sysio.reserv::swapquote`. */
export function swapQuoteActionData(
  options: ReserveQuoteOptions
): SysioContracts.SysioReservSwapquoteAction {
  return {
    from_chain_code: reserveSlugData(options.from.chainCode),
    from_token_code: reserveSlugData(options.from.tokenCode),
    from_reserve_code: reserveSlugData(options.from.reserveCode),
    from_amount: amountString(options.fromAmount),
    to_chain_code: reserveSlugData(options.to.chainCode),
    to_token_code: reserveSlugData(options.to.tokenCode),
    to_reserve_code: reserveSlugData(options.to.reserveCode)
  }
}

/** Builds an unsigned read-only `sysio.reserv::swapquote` action. */
export function buildSwapQuoteAction(options: ReserveQuoteOptions): Action {
  return buildContractAction({
    contract: options.contract || DEFAULT_RESERV_CONTRACT,
    descriptor: reservDescriptor.actions.swapquote,
    authorization: [],
    data: swapQuoteActionData(options)
  })
}
