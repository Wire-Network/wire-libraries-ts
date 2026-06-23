import { Action } from "../../../chain/Action.js"
import { Checksum256 } from "../../../chain/Checksum.js"
import { Name, NameType } from "../../../chain/Name.js"
import { PermissionLevel, PermissionLevelType } from "../../../chain/PermissionLevel.js"
import { Transaction } from "../../../chain/Transaction.js"
import type * as SystemContracts from "../../../types/SystemContractTypes.js"

import { DEFAULT_MSIG_CONTRACT } from "./Constants.js"
import {
  MsigApprove,
  MsigCancel,
  MsigExec,
  MsigGetProposal,
  MsigInvalidate,
  MsigPropose,
  MsigUnapprove
} from "./Structs.js"
import type {
  BuildApproveActionOptions,
  BuildCancelActionOptions,
  BuildExecActionOptions,
  BuildInvalidateActionOptions,
  BuildProposeActionOptions,
  BuildUnapproveActionOptions,
  MsigPermissionLevel
} from "./Types.js"

function permissionLevel(value: MsigPermissionLevel): PermissionLevel {
  return PermissionLevel.from(value as PermissionLevelType | string)
}

function buildAction(args: {
  contract?: NameType
  name: NameType
  authorization: PermissionLevel[]
  data: unknown
}): Action {
  return Action.from({
    account: args.contract || DEFAULT_MSIG_CONTRACT,
    name: args.name,
    authorization: args.authorization,
    data: args.data
  })
}

/** Builds an unsigned `sysio.msig::propose` action. */
export function buildProposeAction(options: BuildProposeActionOptions): Action {
  const proposer = Name.from(options.proposer)

  return buildAction({
    contract: options.contract,
    name: "propose",
    authorization: [
      PermissionLevel.from({
        actor: proposer,
        permission: options.proposerPermission || "active"
      })
    ],
    data: MsigPropose.from({
      proposer,
      proposal_name: options.proposalName,
      requested: options.requested.map(permissionLevel),
      trx: Transaction.from(options.transaction)
    })
  })
}

/** Builds an unsigned `sysio.msig::approve` action. */
export function buildApproveAction(options: BuildApproveActionOptions): Action {
  const level = permissionLevel(options.level),
    data: SystemContracts.SysioMsigApproveAction = {
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

  return buildAction({
    contract: options.contract,
    name: "approve",
    authorization: [level],
    data: MsigApprove.from(data)
  })
}

/** Builds an unsigned `sysio.msig::unapprove` action. */
export function buildUnapproveAction(options: BuildUnapproveActionOptions): Action {
  const level = permissionLevel(options.level),
    data: SystemContracts.SysioMsigUnapproveAction = {
      proposer: Name.from(options.proposer).toString(),
      proposal_name: Name.from(options.proposalName).toString(),
      level: {
        actor: level.actor.toString(),
        permission: level.permission.toString()
      }
    }

  return buildAction({
    contract: options.contract,
    name: "unapprove",
    authorization: [level],
    data: MsigUnapprove.from(data)
  })
}

/** Builds an unsigned `sysio.msig::cancel` action. */
export function buildCancelAction(options: BuildCancelActionOptions): Action {
  const data: SystemContracts.SysioMsigCancelAction = {
    proposer: Name.from(options.proposer).toString(),
    proposal_name: Name.from(options.proposalName).toString(),
    canceler: Name.from(options.canceler).toString()
  }

  return buildAction({
    contract: options.contract,
    name: "cancel",
    authorization: [
      PermissionLevel.from({
        actor: options.canceler,
        permission: options.cancelerPermission || "active"
      })
    ],
    data: MsigCancel.from(data)
  })
}

/** Builds an unsigned `sysio.msig::exec` action. */
export function buildExecAction(options: BuildExecActionOptions): Action {
  const data: SystemContracts.SysioMsigExecAction = {
    proposer: Name.from(options.proposer).toString(),
    proposal_name: Name.from(options.proposalName).toString(),
    executer: Name.from(options.executer).toString()
  }

  return buildAction({
    contract: options.contract,
    name: "exec",
    authorization: [
      PermissionLevel.from({
        actor: options.executer,
        permission: options.executerPermission || "active"
      })
    ],
    data: MsigExec.from(data)
  })
}

/** Builds an unsigned `sysio.msig::invalidate` action. */
export function buildInvalidateAction(options: BuildInvalidateActionOptions): Action {
  const data: SystemContracts.SysioMsigInvalidateAction = {
    account: Name.from(options.account).toString()
  }

  return buildAction({
    contract: options.contract,
    name: "invalidate",
    authorization: [
      PermissionLevel.from({
        actor: options.account,
        permission: options.permission || "active"
      })
    ],
    data: MsigInvalidate.from(data)
  })
}

/** Builds an unsigned read-only `sysio.msig::getproposal` action. */
export function buildGetProposalAction(
  proposer: NameType,
  proposalName: NameType,
  contract: NameType = DEFAULT_MSIG_CONTRACT
): Action {
  const data: SystemContracts.SysioMsigGetproposalAction = {
    proposer: Name.from(proposer).toString(),
    proposal_name: Name.from(proposalName).toString()
  }

  return buildAction({
    contract,
    name: "getproposal",
    authorization: [],
    data: MsigGetProposal.from(data)
  })
}

/** Runtime action data serializers keyed by `sysio.msig` action name. */
export const msigActionDataTypes = {
  propose: MsigPropose,
  approve: MsigApprove,
  unapprove: MsigUnapprove,
  cancel: MsigCancel,
  exec: MsigExec,
  invalidate: MsigInvalidate,
  getproposal: MsigGetProposal
}
