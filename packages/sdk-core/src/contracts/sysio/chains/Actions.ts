import type { Action } from "../../../chain/Action.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import { buildContractAction } from "../../Contract.js"

import { DEFAULT_CHAINS_CONTRACT, MAX_EXTERNAL_CHAIN_ID } from "./Constants.js"
import { descriptor } from "./Descriptor.js"
import { chainSlugData } from "./Slug.js"
import type {
  ChainRegistration,
  CreateActivateChainActionOptions,
  CreateRegisterChainActionOptions
} from "./Types.js"

function assertExternalChainId(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_EXTERNAL_CHAIN_ID) {
    throw new Error("External chain ID must be an unsigned 32-bit integer.")
  }

  return value
}

/** Creates generated action data for `sysio.chains::regchain`. */
export function createRegisterChainActionData(
  registration: ChainRegistration
): SysioContracts.SysioChainsRegchainAction {
  return {
    kind: registration.kind,
    code: chainSlugData(registration.code),
    external_chain_id: assertExternalChainId(registration.externalChainId),
    name: registration.name,
    description: registration.description
  }
}

/** Creates an unsigned privileged `sysio.chains::regchain` action. */
export function createRegisterChainAction(
  options: CreateRegisterChainActionOptions
): Action {
  return buildContractAction({
    contract: options.contract || DEFAULT_CHAINS_CONTRACT,
    descriptor: descriptor.actions.regchain,
    authorization: options.authorization,
    data: createRegisterChainActionData(options.registration)
  })
}

/** Creates generated action data for `sysio.chains::activchain`. */
export function createActivateChainActionData(
  code: CreateActivateChainActionOptions["code"]
): SysioContracts.SysioChainsActivchainAction {
  return { code: chainSlugData(code) }
}

/** Creates an unsigned privileged `sysio.chains::activchain` action. */
export function createActivateChainAction(
  options: CreateActivateChainActionOptions
): Action {
  return buildContractAction({
    contract: options.contract || DEFAULT_CHAINS_CONTRACT,
    descriptor: descriptor.actions.activchain,
    authorization: options.authorization,
    data: createActivateChainActionData(options.code)
  })
}
