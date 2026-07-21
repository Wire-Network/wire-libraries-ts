import type { Action } from "../../../chain/Action.js"
import { Checksum256 } from "../../../chain/Checksum.js"
import { Name, type NameType } from "../../../chain/Name.js"
import {
  PermissionLevel,
  type PermissionLevelType
} from "../../../chain/PermissionLevel.js"
import { Transaction } from "../../../chain/Transaction.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import { SysioContractName } from "../../../types/SysioContractTypes.js"
import { assertEncodedAction, getSysioContract } from "../Client.js"

import { DEFAULT_MSIG_CONTRACT } from "./Constants.js"
import { MsigPropose } from "./Structs.js"
import type {
  BuildApproveActionOptions,
  BuildCancelActionOptions,
  BuildExecActionOptions,
  BuildInvalidateActionOptions,
  BuildProposeActionOptions,
  BuildUnapproveActionOptions,
  MsigPermissionLevel,
  SysioMsigProposeActionData
} from "./Types.js"

function permissionLevel(value: MsigPermissionLevel): PermissionLevel {
  return PermissionLevel.from(value as PermissionLevelType | string)
}

/** Builds an unsigned `sysio.msig::propose` action. */
export function buildProposeAction(options: BuildProposeActionOptions): Action {
  const proposer = Name.from(options.proposer)

  // The generated propose interface currently omits inherited transaction
  // header fields. Keep the complete runtime struct until generation includes
  // those fields, then let the proxy's msig codec encode it synchronously.
  const data = MsigPropose.from({
    proposer,
    proposal_name: options.proposalName,
    requested: options.requested.map(permissionLevel),
    trx: Transaction.from(options.transaction)
  }) as unknown as SysioMsigProposeActionData

  return assertEncodedAction(
    getSysioContract(SysioContractName.msig, {
      contract: options.contract || DEFAULT_MSIG_CONTRACT
    }).actions.propose.prepare(data, {
      authorization: [
        PermissionLevel.from({
          actor: proposer,
          permission: options.proposerPermission || "active"
        })
      ]
    })
  )
}

/** Builds an unsigned `sysio.msig::approve` action. */
export function buildApproveAction(options: BuildApproveActionOptions): Action {
  const level = permissionLevel(options.level),
    data: SysioContracts.SysioMsigApproveAction = {
      proposer: Name.from(options.proposer).toString(),
      proposal_name: Name.from(options.proposalName).toString(),
      level: {
        actor: level.actor.toString(),
        permission: level.permission.toString()
      },
      proposal_hash: options.proposalHash
        ? Checksum256.from(options.proposalHash).toString()
        : null
    }

  return assertEncodedAction(
    getSysioContract(SysioContractName.msig, {
      contract: options.contract || DEFAULT_MSIG_CONTRACT
    }).actions.approve.prepare(data, { authorization: [level] })
  )
}

/** Builds an unsigned `sysio.msig::unapprove` action. */
export function buildUnapproveAction(
  options: BuildUnapproveActionOptions
): Action {
  const level = permissionLevel(options.level),
    data: SysioContracts.SysioMsigUnapproveAction = {
      proposer: Name.from(options.proposer).toString(),
      proposal_name: Name.from(options.proposalName).toString(),
      level: {
        actor: level.actor.toString(),
        permission: level.permission.toString()
      }
    }

  return assertEncodedAction(
    getSysioContract(SysioContractName.msig, {
      contract: options.contract || DEFAULT_MSIG_CONTRACT
    }).actions.unapprove.prepare(data, { authorization: [level] })
  )
}

/** Builds an unsigned `sysio.msig::cancel` action. */
export function buildCancelAction(options: BuildCancelActionOptions): Action {
  const data: SysioContracts.SysioMsigCancelAction = {
    proposer: Name.from(options.proposer).toString(),
    proposal_name: Name.from(options.proposalName).toString(),
    canceler: Name.from(options.canceler).toString()
  }

  return assertEncodedAction(
    getSysioContract(SysioContractName.msig, {
      contract: options.contract || DEFAULT_MSIG_CONTRACT
    }).actions.cancel.prepare(data, {
      authorization: [
        PermissionLevel.from({
          actor: options.canceler,
          permission: options.cancelerPermission || "active"
        })
      ]
    })
  )
}

/** Builds an unsigned `sysio.msig::exec` action. */
export function buildExecAction(options: BuildExecActionOptions): Action {
  const data: SysioContracts.SysioMsigExecAction = {
    proposer: Name.from(options.proposer).toString(),
    proposal_name: Name.from(options.proposalName).toString(),
    executer: Name.from(options.executer).toString()
  }

  return assertEncodedAction(
    getSysioContract(SysioContractName.msig, {
      contract: options.contract || DEFAULT_MSIG_CONTRACT
    }).actions.exec.prepare(data, {
      authorization: [
        PermissionLevel.from({
          actor: options.executer,
          permission: options.executerPermission || "active"
        })
      ]
    })
  )
}

/** Builds an unsigned `sysio.msig::invalidate` action. */
export function buildInvalidateAction(
  options: BuildInvalidateActionOptions
): Action {
  const data: SysioContracts.SysioMsigInvalidateAction = {
    account: Name.from(options.account).toString()
  }

  return assertEncodedAction(
    getSysioContract(SysioContractName.msig, {
      contract: options.contract || DEFAULT_MSIG_CONTRACT
    }).actions.invalidate.prepare(data, {
      authorization: [
        PermissionLevel.from({
          actor: options.account,
          permission: options.permission || "active"
        })
      ]
    })
  )
}

/** Builds an unsigned read-only `sysio.msig::getproposal` action. */
export function buildGetProposalAction(
  proposer: NameType,
  proposalName: NameType,
  contract: NameType = DEFAULT_MSIG_CONTRACT
): Action {
  const data: SysioContracts.SysioMsigGetproposalAction = {
    proposer: Name.from(proposer).toString(),
    proposal_name: Name.from(proposalName).toString()
  }

  return assertEncodedAction(
    getSysioContract(SysioContractName.msig, {
      contract
    }).actions.getproposal.prepare(data)
  )
}
