import type { ContractDescriptor } from "../../Contract.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"

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
  extends SysioContracts.SysioMsigTransactionHeaderType,
    SysioContracts.SysioMsigTransactionType {}

/** Generated `sysio.msig::propose` data with complete transaction fields. */
export interface SysioMsigProposeActionData
  extends Omit<SysioContracts.SysioMsigProposeAction, "trx"> {
  /** Proposed transaction including header and action arrays. */
  trx: SysioMsigTransactionData
}

/** Generated `sysio.msig` action data keyed by ABI action name. */
export interface SysioMsigActionData {
  /** `sysio.msig::propose` action data. */
  propose: SysioMsigProposeActionData
  /** `sysio.msig::approve` action data. */
  approve: SysioContracts.SysioMsigApproveAction
  /** `sysio.msig::unapprove` action data. */
  unapprove: SysioContracts.SysioMsigUnapproveAction
  /** `sysio.msig::cancel` action data. */
  cancel: SysioContracts.SysioMsigCancelAction
  /** `sysio.msig::exec` action data. */
  exec: SysioContracts.SysioMsigExecAction
  /** `sysio.msig::invalidate` action data. */
  invalidate: SysioContracts.SysioMsigInvalidateAction
  /** `sysio.msig::getproposal` action data. */
  getproposal: SysioContracts.SysioMsigGetproposalAction
}

/** Generated `sysio.msig` table rows keyed by ABI table name. */
export interface SysioMsigTableRows {
  /** `sysio.msig::proposal` table row. */
  proposal: SysioContracts.SysioMsigProposalType
  /** `sysio.msig::approvals2` table row. */
  approvals2: SysioContracts.SysioMsigApprovalsInfoType
  /** `sysio.msig::approvals` legacy table row. */
  approvals: SysioContracts.SysioMsigOldApprovalsInfoType
  /** `sysio.msig::invals` table row. */
  invals: SysioContracts.SysioMsigInvalidationType
  /** `sysio.msig::propchunks` chunked-v2 table row. */
  propchunks: SysioContracts.SysioMsigPropchunkType
}

/**
 * Runtime descriptor for `sysio.msig`.
 *
 * The type maps come from generated `SysioContractTypes`; the serializers are
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
