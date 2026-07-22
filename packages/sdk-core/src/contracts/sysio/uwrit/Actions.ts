import { Name } from "../../../chain/Name.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import { reserveSlugData } from "../reserv/Slug.js"

import type { SwapFromWireOptions } from "./Types.js"

/** Builds generated action data for `sysio.uwrit::swapfromwire`. */
export function swapFromWireActionData(
  options: SwapFromWireOptions
): SysioContracts.SysioUwritSwapfromwireAction {
  return {
    user: Name.from(options.user).toString(),
    wire_amount: options.wireAmount.toString(),
    dst_chain_code: reserveSlugData(options.destination.chainCode),
    dst_token_code: reserveSlugData(options.destination.tokenCode),
    dst_reserve_code: reserveSlugData(options.destination.reserveCode),
    target_amount: options.targetAmount.toString(),
    target_tolerance_bps: options.targetToleranceBps,
    recipient_kind: options.recipientKind,
    recipient_addr: options.recipientAddress
  }
}
