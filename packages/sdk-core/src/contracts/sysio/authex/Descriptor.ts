import type { ContractDescriptor } from "../../Contract.js"
import type * as SystemContracts from "../../../types/SystemContractTypes.js"

import { DEFAULT_AUTHEX_CONTRACT } from "./Constants.js"
import {
  AuthexClearLinks,
  AuthexCreateLink,
  AuthexRecordLink
} from "./Structs.js"

/** Generated `sysio.authex` action data keyed by ABI action name. */
export interface SysioAuthexActionData {
  /** `sysio.authex::createlink` action data. */
  createlink: SystemContracts.SysioAuthexCreatelinkAction
  /** `sysio.authex::recordlink` action data. */
  recordlink: SystemContracts.SysioAuthexRecordlinkAction
  /** `sysio.authex::clearlinks` action data. */
  clearlinks: SystemContracts.SysioAuthexClearlinksAction
}

/** Generated `sysio.authex` table rows keyed by ABI table name. */
export interface SysioAuthexTableRows {
  /** `sysio.authex::links` table row. */
  links: SystemContracts.SysioAuthexLinksSType
}

/**
 * Runtime descriptor for `sysio.authex`.
 *
 * The data interfaces come from generated `SystemContractTypes`; the serializers
 * mirror the deployed ABI so callers can build typed actions without fetching
 * an ABI before serialization.
 */
export const descriptor: ContractDescriptor<
  SysioAuthexActionData,
  SysioAuthexTableRows
> = {
  account: DEFAULT_AUTHEX_CONTRACT,
  actions: {
    createlink: {
      name: "createlink",
      serialize: data => AuthexCreateLink.from(data)
    },
    recordlink: {
      name: "recordlink",
      serialize: data => AuthexRecordLink.from(data)
    },
    clearlinks: {
      name: "clearlinks",
      serialize: data => AuthexClearLinks.from(data)
    }
  },
  tables: {
    links: {
      name: "links",
      rowType: null
    }
  }
}
