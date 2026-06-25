import type { ContractDescriptor } from "../../Contract.js"
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

/** Generated `sysio.msig` transaction body plus inherited transaction header. */
export interface SysioMsigTransactionData
  extends SystemContracts.SysioMsigTransactionHeaderType,
    SystemContracts.SysioMsigTransactionType {}

/** Generated `sysio.msig::propose` data with complete transaction fields. */
export interface SysioMsigProposeActionData
  extends Omit<SystemContracts.SysioMsigProposeAction, "trx"> {
  /** Proposed transaction including header and action arrays. */
  trx: SysioMsigTransactionData
}

/** Generated `sysio.msig` action data keyed by ABI action name. */
export interface SysioMsigActionData {
  /** `sysio.msig::propose` action data. */
  propose: SysioMsigProposeActionData
  /** `sysio.msig::approve` action data. */
  approve: SystemContracts.SysioMsigApproveAction
  /** `sysio.msig::unapprove` action data. */
  unapprove: SystemContracts.SysioMsigUnapproveAction
  /** `sysio.msig::cancel` action data. */
  cancel: SystemContracts.SysioMsigCancelAction
  /** `sysio.msig::exec` action data. */
  exec: SystemContracts.SysioMsigExecAction
  /** `sysio.msig::invalidate` action data. */
  invalidate: SystemContracts.SysioMsigInvalidateAction
  /** `sysio.msig::getproposal` action data. */
  getproposal: SystemContracts.SysioMsigGetproposalAction
}

/** Generated `sysio.msig` table rows keyed by ABI table name. */
export interface SysioMsigTableRows {
  /** `sysio.msig::proposal` table row. */
  proposal: SystemContracts.SysioMsigProposalType
  /** `sysio.msig::approvals2` table row. */
  approvals2: SystemContracts.SysioMsigApprovalsInfoType
  /** `sysio.msig::approvals` legacy table row. */
  approvals: SystemContracts.SysioMsigOldApprovalsInfoType
  /** `sysio.msig::invals` table row. */
  invals: SystemContracts.SysioMsigInvalidationType
  /** `sysio.msig::propchunks` chunked-v2 table row. */
  propchunks: SystemContracts.SysioMsigPropchunkType
}

/**
 * Runtime descriptor for `sysio.msig`.
 *
 * The type maps come from generated `SystemContractTypes`; the serializers are
 * currently supplied by hand-written `Struct` classes. A future generator can
 * emit this metadata directly for every system contract.
 */
export const descriptor: ContractDescriptor<
  SysioMsigActionData,
  SysioMsigTableRows
> = {
  account: DEFAULT_MSIG_CONTRACT,
  actions: {
    propose: {
      name: "propose",
      serialize: data => MsigPropose.from(data)
    },
    approve: {
      name: "approve",
      serialize: data => MsigApprove.from(data)
    },
    unapprove: {
      name: "unapprove",
      serialize: data => MsigUnapprove.from(data)
    },
    cancel: {
      name: "cancel",
      serialize: data => MsigCancel.from(data)
    },
    exec: {
      name: "exec",
      serialize: data => MsigExec.from(data)
    },
    invalidate: {
      name: "invalidate",
      serialize: data => MsigInvalidate.from(data)
    },
    getproposal: {
      name: "getproposal",
      serialize: data => MsigGetProposal.from(data)
    }
  },
  tables: {
    proposal: {
      name: "proposal",
      rowType: null
    },
    approvals2: {
      name: "approvals2",
      rowType: null
    },
    approvals: {
      name: "approvals",
      rowType: null
    },
    invals: {
      name: "invals",
      rowType: null
    },
    propchunks: {
      name: "propchunks",
      rowType: null
    }
  }
}
