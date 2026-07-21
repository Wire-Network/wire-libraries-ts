import type { Action } from "../../../chain/Action.js"
import { Name } from "../../../chain/Name.js"
import { PermissionLevel } from "../../../chain/PermissionLevel.js"
import { PublicKey } from "../../../chain/PublicKey.js"
import { Signature } from "../../../chain/Signature.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import { SysioContractName } from "../../../types/SysioContractTypes.js"
import { assertEncodedAction, getSysioContract } from "../Client.js"

import { DEFAULT_AUTHEX_CONTRACT } from "./Constants.js"
import type { BuildCreateLinkActionOptions } from "./Types.js"
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
