import { buildContractAction } from "../../Contract.js"
import type { Action } from "../../../chain/Action.js"
import { Name } from "../../../chain/Name.js"
import { PermissionLevel } from "../../../chain/PermissionLevel.js"
import { PublicKey } from "../../../chain/PublicKey.js"
import { Signature } from "../../../chain/Signature.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"

import { DEFAULT_AUTHEX_CONTRACT } from "./Constants.js"
import { descriptor as authexDescriptor } from "./Descriptor.js"
import {
  AuthexClearLinks,
  AuthexCreateLink,
  AuthexRecordLink
} from "./Structs.js"
import type {
  BuildClearLinksActionOptions,
  BuildCreateLinkActionOptions,
  BuildRecordLinkActionOptions
} from "./Types.js"
import { requireSupportedCreateLinkChainKind } from "./Signing.js"

/** Builds generated action data for `sysio.authex::createlink`. */
export function createLinkActionData(
  options: BuildCreateLinkActionOptions
): SysioContracts.SysioAuthexCreatelinkAction {
  const chainKind = requireSupportedCreateLinkChainKind(options.chainKind)

  return {
    chain_kind: chainKind,
    account: Name.from(options.account).toString(),
    sig: Signature.from(options.signature).toString(),
    pub_key: PublicKey.from(options.publicKey).toString(),
    nonce: options.nonce || Date.now()
  }
}

/** Builds an unsigned `sysio.authex::createlink` action. */
export function buildCreateLinkAction(options: BuildCreateLinkActionOptions): Action {
  const account = Name.from(options.account)

  return buildContractAction({
    contract: options.contract || DEFAULT_AUTHEX_CONTRACT,
    descriptor: authexDescriptor.actions.createlink,
    authorization: [
      PermissionLevel.from({
        actor: account,
        permission: options.permission || "active"
      })
    ],
    data: createLinkActionData(options)
  })
}

/** Builds generated action data for `sysio.authex::recordlink`. */
export function recordLinkActionData(
  options: BuildRecordLinkActionOptions
): SysioContracts.SysioAuthexRecordlinkAction {
  return {
    account: Name.from(options.account).toString(),
    chain_kind: requireSupportedCreateLinkChainKind(options.chainKind),
    pub_key: PublicKey.from(options.publicKey).toString()
  }
}

/** Builds an unsigned trusted `sysio.authex::recordlink` action. */
export function buildRecordLinkAction(options: BuildRecordLinkActionOptions): Action {
  return buildContractAction({
    contract: options.contract || DEFAULT_AUTHEX_CONTRACT,
    descriptor: authexDescriptor.actions.recordlink,
    authorization: [
      PermissionLevel.from({
        actor: options.contract || DEFAULT_AUTHEX_CONTRACT,
        permission: "active"
      })
    ],
    data: recordLinkActionData(options)
  })
}

/** Builds an unsigned testing-only `sysio.authex::clearlinks` action. */
export function buildClearLinksAction(options: BuildClearLinksActionOptions = {}): Action {
  const contract = options.contract || DEFAULT_AUTHEX_CONTRACT

  return buildContractAction({
    contract,
    descriptor: authexDescriptor.actions.clearlinks,
    authorization: [
      PermissionLevel.from({
        actor: contract,
        permission: "active"
      })
    ],
    data: {}
  })
}

/** Runtime action data serializers keyed by `sysio.authex` action name. */
export const authexActionDataTypes = {
  createlink: AuthexCreateLink,
  recordlink: AuthexRecordLink,
  clearlinks: AuthexClearLinks
}
