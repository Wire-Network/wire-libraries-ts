import type { ContractDescriptor } from "../../Contract.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"

import { DEFAULT_CHAINS_CONTRACT } from "./Constants.js"
import { ChainsActivateChain, ChainsRegisterChain } from "./Structs.js"

/** Generated `sysio.chains` action data keyed by ABI action name. */
export interface SysioChainsActionData {
  /** `sysio.chains::regchain` action data. */
  regchain: SysioContracts.SysioChainsRegchainAction
  /** `sysio.chains::activchain` action data. */
  activchain: SysioContracts.SysioChainsActivchainAction
}

/** Generated `sysio.chains` table rows keyed by ABI table name. */
export interface SysioChainsTableRows {
  /** `sysio.chains::chains` registry row. */
  chains: SysioContracts.SysioChainsChainRowType
}

/** Runtime descriptor for the public `sysio.chains` integration surface. */
export const descriptor: ContractDescriptor<
  SysioChainsActionData,
  SysioChainsTableRows
> = {
  account: DEFAULT_CHAINS_CONTRACT,
  actions: {
    regchain: {
      name: "regchain",
      serialize: data => ChainsRegisterChain.from(data)
    },
    activchain: {
      name: "activchain",
      serialize: data => ChainsActivateChain.from(data)
    }
  },
  tables: {
    chains: {
      name: "chains",
      rowType: null
    }
  }
}
