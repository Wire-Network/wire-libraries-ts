import type { ContractDescriptor } from "../../Contract.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"

import { DEFAULT_RESERV_CONTRACT } from "./Constants.js"
import {
  ReservMatchReserve,
  ReservRewardBalance,
  ReservSwapQuote
} from "./Structs.js"

/** User-facing `sysio.reserv` action data keyed by ABI action name. */
export interface SysioReservActionData {
  /** `sysio.reserv::matchreserve` action data. */
  matchreserve: SysioContracts.SysioReservMatchreserveAction
  /** Read-only `sysio.reserv::swapquote` action data. */
  swapquote: SysioContracts.SysioReservSwapquoteAction
  /** Read-only `sysio.reserv::rewardbal` action data. */
  rewardbal: SysioContracts.SysioReservRewardbalAction
}

/** User-facing `sysio.reserv` table rows keyed by ABI table name. */
export interface SysioReservTableRows {
  /** `sysio.reserv::reserves` registry row. */
  reserves: SysioContracts.SysioReservReserveRowType
  /** `sysio.reserv::rewardbkt` singleton row. */
  rewardbkt: SysioContracts.SysioReservRewardsBucketType
}

/**
 * Runtime descriptor for the public `sysio.reserv` integration surface.
 *
 * Internal OPP dispatch and accounting actions remain available through
 * generated types without being promoted as normal user operations.
 */
export const descriptor: ContractDescriptor<
  SysioReservActionData,
  SysioReservTableRows
> = {
  account: DEFAULT_RESERV_CONTRACT,
  actions: {
    matchreserve: {
      name: "matchreserve",
      serialize: data => ReservMatchReserve.from(data)
    },
    swapquote: {
      name: "swapquote",
      serialize: data => ReservSwapQuote.from(data)
    },
    rewardbal: {
      name: "rewardbal",
      serialize: data => ReservRewardBalance.from(data)
    }
  },
  tables: {
    reserves: {
      name: "reserves",
      rowType: null
    },
    rewardbkt: {
      name: "rewardbkt",
      rowType: null
    }
  }
}
