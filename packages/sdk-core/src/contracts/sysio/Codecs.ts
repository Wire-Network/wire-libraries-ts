import type { SysioContractMapping } from "../../types/SysioContractTypes.js"
import { SysioContractName } from "../../types/SysioContractTypes.js"

import { AuthexCreateLink } from "./authex/Structs.js"
import {
  MsigApprove,
  MsigCancel,
  MsigExec,
  MsigGetProposal,
  MsigInvalidate,
  MsigPropose,
  MsigUnapprove
} from "./msig/Structs.js"
import { ReservMatchReserve, ReservSwapQuote } from "./reserv/Structs.js"

/** Generated action names for one system contract. */
type ActionName<Name extends SysioContractName> = Extract<
  keyof SysioContractMapping[Name]["actions"],
  string
>

/** Optional synchronous serializer for generated action data. */
export interface SysioActionCodec<Data> {
  /** Converts generated JSON data to an ABI-serializable runtime value. */
  serialize(data: Data): unknown
}

/** Optional runtime codecs keyed by generated action name. */
export type SysioActionCodecs<Name extends SysioContractName> = Partial<{
  readonly [Action in ActionName<Name>]: SysioActionCodec<
    SysioContractMapping[Name]["actions"][Action]
  >
}>

/** Optional runtime codecs keyed by generated system-contract name. */
type SysioActionCodecMapping = Partial<{
  readonly [Name in SysioContractName]: SysioActionCodecs<Name>
}>

const ActionCodecs: SysioActionCodecMapping = {
  [SysioContractName.authex]: {
    createlink: { serialize: data => AuthexCreateLink.from(data) }
  },
  [SysioContractName.msig]: {
    approve: { serialize: data => MsigApprove.from(data) },
    cancel: { serialize: data => MsigCancel.from(data) },
    exec: { serialize: data => MsigExec.from(data) },
    getproposal: { serialize: data => MsigGetProposal.from(data) },
    invalidate: { serialize: data => MsigInvalidate.from(data) },
    propose: { serialize: data => MsigPropose.from(data) },
    unapprove: { serialize: data => MsigUnapprove.from(data) }
  },
  [SysioContractName.reserv]: {
    matchreserve: { serialize: data => ReservMatchReserve.from(data) },
    swapquote: { serialize: data => ReservSwapQuote.from(data) }
  }
}

/** Returns the optional local codec for a generated system-contract action. */
export function getSysioActionCodec<
  Name extends SysioContractName,
  Action extends ActionName<Name>
>(
  name: Name,
  action: Action
): SysioActionCodec<SysioContractMapping[Name]["actions"][Action]> | undefined {
  return ActionCodecs[name]?.[action] as
    | SysioActionCodec<SysioContractMapping[Name]["actions"][Action]>
    | undefined
}
