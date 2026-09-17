import type { Action } from "../../../chain/Action.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import { buildContractAction } from "../../Contract.js"

import { DEFAULT_CHAINS_CONTRACT, MAX_EXTERNAL_CHAIN_ID } from "./Constants.js"
import { descriptor } from "./Descriptor.js"
import { chainSlugData } from "./Slug.js"
import type {
  ChainOutpostAddresses,
  ChainRegistration,
  CreateActivateChainActionOptions,
  CreateRegisterChainActionOptions,
  CreateSetOutpostActionOptions
} from "./Types.js"

function assertExternalChainId(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_EXTERNAL_CHAIN_ID) {
    throw new Error("External chain ID must be an unsigned 32-bit integer.")
  }

  return value
}

/**
 * Fills the generated `outpost_addrs` struct, defaulting every omitted role to
 * an empty string. The protocol treats empty as "not configured yet" and both
 * operator daemons skip such a chain, so an omitted field is a deferral rather
 * than a silent wrong value.
 */
function outpostAddressData(
  outpost: Partial<ChainOutpostAddresses> | undefined
): SysioContracts.SysioChainsOutpostAddrsType {
  return {
    opp_addr: outpost?.oppAddress ?? "",
    opp_inbound_addr: outpost?.oppInboundAddress ?? "",
    operator_registry_addr: outpost?.operatorRegistryAddress ?? "",
    source_deposit_addr: outpost?.sourceDepositAddress ?? ""
  }
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
    description: registration.description,
    outpost: outpostAddressData(registration.outpost)
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

/** Creates generated action data for `sysio.chains::setoutpost`. */
export function createSetOutpostActionData(
  code: CreateSetOutpostActionOptions["code"],
  outpost: CreateSetOutpostActionOptions["outpost"]
): SysioContracts.SysioChainsSetoutpostAction {
  return { code: chainSlugData(code), outpost: outpostAddressData(outpost) }
}

/** Creates an unsigned privileged `sysio.chains::setoutpost` action. */
export function createSetOutpostAction(
  options: CreateSetOutpostActionOptions
): Action {
  return buildContractAction({
    contract: options.contract || DEFAULT_CHAINS_CONTRACT,
    descriptor: descriptor.actions.setoutpost,
    authorization: options.authorization,
    data: createSetOutpostActionData(options.code, options.outpost)
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
