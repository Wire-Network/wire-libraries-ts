import type { Action } from "../../../chain/Action.js"
import { Name } from "../../../chain/Name.js"
import { PermissionLevel } from "../../../chain/PermissionLevel.js"
import { PublicKey } from "../../../chain/PublicKey.js"
import { Signature } from "../../../chain/Signature.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import { SysioContractName } from "../../../types/SysioContractTypes.js"
import { assertEncodedAction, getSysioContract } from "../Client.js"

import { DEFAULT_AUTHEX_CONTRACT } from "./Constants.js"
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
import { assertSupportedCreateLinkChainKind } from "./Signing.js"

/** Builds generated action data for `sysio.authex::createlink`. */
export function createLinkActionData(
  options: BuildCreateLinkActionOptions
): SysioContracts.SysioAuthexCreatelinkAction {
  const chainKind = assertSupportedCreateLinkChainKind(options.chainKind)

  return {
    chain_kind: chainKind,
    account: Name.from(options.account).toString(),
    sig: Signature.from(options.signature).toString(),
    pub_key: PublicKey.from(options.publicKey).toString(),
    nonce: options.nonce || Date.now()
  }
}

/** Builds an unsigned `sysio.authex::createlink` action. */
export function buildCreateLinkAction(
  options: BuildCreateLinkActionOptions
): Action {
  const account = Name.from(options.account)

  return assertEncodedAction(
    getSysioContract(SysioContractName.authex, {
      contract: options.contract || DEFAULT_AUTHEX_CONTRACT
    }).actions.createlink.prepare(createLinkActionData(options), {
      authorization: [
        PermissionLevel.from({
          actor: account,
          permission: options.permission || "active"
        })
      ]
    })
  )
}

/** Builds generated action data for `sysio.authex::recordlink`. */
export function recordLinkActionData(
  options: BuildRecordLinkActionOptions
): SysioContracts.SysioAuthexRecordlinkAction {
  return {
    account: Name.from(options.account).toString(),
    chain_kind: assertSupportedCreateLinkChainKind(options.chainKind),
    pub_key: PublicKey.from(options.publicKey).toString()
  }
}

/** Builds an unsigned trusted `sysio.authex::recordlink` action. */
export function buildRecordLinkAction(
  options: BuildRecordLinkActionOptions
): Action {
  const contract = options.contract || DEFAULT_AUTHEX_CONTRACT
  return assertEncodedAction(
    getSysioContract(SysioContractName.authex, {
      contract
    }).actions.recordlink.prepare(recordLinkActionData(options), {
      authorization: [
        PermissionLevel.from({
          actor: contract,
          permission: "active"
        })
      ]
    })
  )
}

/** Builds an unsigned testing-only `sysio.authex::clearlinks` action. */
export function buildClearLinksAction(
  options: BuildClearLinksActionOptions = {}
): Action {
  const contract = options.contract || DEFAULT_AUTHEX_CONTRACT

  return assertEncodedAction(
    getSysioContract(SysioContractName.authex, {
      contract
    }).actions.clearlinks.prepare(
      {},
      {
        authorization: [
          PermissionLevel.from({
            actor: contract,
            permission: "active"
          })
        ]
      }
    )
  )
}

/** Runtime action data serializers keyed by `sysio.authex` action name. */
export const authexActionDataTypes = {
  createlink: AuthexCreateLink,
  recordlink: AuthexRecordLink,
  clearlinks: AuthexClearLinks
}
