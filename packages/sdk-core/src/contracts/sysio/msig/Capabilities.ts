import { match } from "ts-pattern"

import type { APIClient } from "../../../api/Client.js"
import { ABI } from "../../../chain/Abi.js"
import { Name, NameType } from "../../../chain/Name.js"

import { DEFAULT_MSIG_CONTRACT } from "./Constants.js"
import type {
  MsigActionName,
  MsigCapabilities,
  MsigProposalFieldName,
  MsigTableName
} from "./Types.js"

/** Base action surface required by legacy and chunked-v2 `sysio.msig`. */
export const MSIG_BASE_ACTIONS = [
  "propose",
  "approve",
  "unapprove",
  "cancel",
  "exec",
  "invalidate"
] as const satisfies readonly MsigActionName[]

/**
 * Complete action surface checked by this module.
 *
 * `getproposal` is chunked-v2 specific. It gives clients a read-only path for
 * reassembled proposal bytes without duplicating contract chunk assembly logic.
 */
export const MSIG_ACTIONS = [
  ...MSIG_BASE_ACTIONS,
  "getproposal"
] as const satisfies readonly MsigActionName[]

/** Base table surface required by legacy and chunked-v2 `sysio.msig`. */
export const MSIG_BASE_TABLES = [
  "proposal",
  "approvals2",
  "approvals",
  "invals"
] as const satisfies readonly MsigTableName[]

/**
 * Complete table surface checked by this module.
 *
 * `propchunks` is intentionally enhanced-only. Legacy contracts remain readable
 * through scoped `proposal` rows when this table is absent.
 */
export const MSIG_TABLES = [
  ...MSIG_BASE_TABLES,
  "propchunks"
] as const satisfies readonly MsigTableName[]

/** Base proposal row fields required for legacy table reads. */
export const MSIG_BASE_PROPOSAL_FIELDS = [
  "proposal_name",
  "packed_transaction"
] as const satisfies readonly MsigProposalFieldName[]

/** Proposal row fields added by the chunked-v2 contract shape. */
export const MSIG_CHUNKED_PROPOSAL_FIELDS = [
  "chunk_count",
  "total_size",
  "trx_hash"
] as const satisfies readonly MsigProposalFieldName[]

/** Complete proposal field surface checked by this module. */
export const MSIG_PROPOSAL_FIELDS = [
  ...MSIG_BASE_PROPOSAL_FIELDS,
  "earliest_exec_time",
  ...MSIG_CHUNKED_PROPOSAL_FIELDS
] as const satisfies readonly MsigProposalFieldName[]

type AbiLike = ABI.Def | { abi?: ABI.Def | null } | null

function resolveAbi(response: AbiLike): ABI.Def | null {
  const candidate =
    response && "abi" in response ? response.abi || null : response || null

  return candidate as ABI.Def | null
}

function namesFromAbi(abi: ABI.Def | null, key: "actions" | "tables"): Set<string> {
  return new Set((abi?.[key] || []).map(entry => String(entry.name)))
}

function actionTypeFromAbi(abi: ABI.Def | null, actionName: string): string {
  const action = (abi?.actions || []).find(
    entry => String(entry.name) === actionName
  )

  return action?.type ? String(action.type) : actionName
}

function fieldsFromStruct(abi: ABI.Def | null, structName: string): Set<string> {
  const struct = (abi?.structs || []).find(
    entry => String(entry.name) === structName
  )

  return new Set((struct?.fields || []).map(field => String(field.name)))
}

function actionResultsFromAbi(abi: ABI.Def | null): Set<string> {
  return new Set((abi?.action_results || []).map(entry => String(entry.name)))
}

function flagRecord<T extends string>(
  names: readonly T[],
  available: Set<string>
): Record<T, boolean> {
  return names.reduce(
    (record, name) => ({
      ...record,
      [name]: available.has(name)
    }),
    {} as Record<T, boolean>
  )
}

function missing<T extends string>(
  prefix: string,
  names: readonly T[],
  flags: Record<T, boolean>
): string[] {
  return names.filter(name => !flags[name]).map(name => `${prefix}:${name}`)
}

function missingFields<T extends string>(
  structName: string,
  names: readonly T[],
  flags: Record<T, boolean>
): string[] {
  return names
    .filter(name => !flags[name])
    .map(name => `field:${structName}.${name}`)
}

/** Builds an ABI-derived `sysio.msig` capability matrix. */
export function capabilitiesFromAbi(
  response: AbiLike,
  contract: NameType = DEFAULT_MSIG_CONTRACT
): MsigCapabilities {
  const abi = resolveAbi(response),
    hasAbi = !!abi,
    actionNames = namesFromAbi(abi, "actions"),
    tableNames = namesFromAbi(abi, "tables"),
    proposalFieldNames = fieldsFromStruct(abi, "proposal"),
    approveFieldNames = fieldsFromStruct(abi, actionTypeFromAbi(abi, "approve")),
    actionResultNames = actionResultsFromAbi(abi),
    actions = flagRecord(MSIG_ACTIONS, actionNames),
    tables = flagRecord(MSIG_TABLES, tableNames),
    proposalFields = flagRecord(MSIG_PROPOSAL_FIELDS, proposalFieldNames),
    approveFields = {
      proposal_hash: approveFieldNames.has("proposal_hash")
    },
    actionResults = {
      getproposal: actionResultNames.has("getproposal")
    },
    missingRequired = !hasAbi
      ? ["abi"]
      : [
          ...missing("action", MSIG_BASE_ACTIONS, actions),
          ...missing("table", MSIG_BASE_TABLES, tables),
          ...missingFields("proposal", MSIG_BASE_PROPOSAL_FIELDS, proposalFields)
        ],
    missingEnhanced = !hasAbi
      ? ["abi"]
      : [
          ...(!actions.getproposal ? ["action:getproposal"] : []),
          ...(!actionResults.getproposal ? ["action_result:getproposal"] : []),
          ...(!tables.propchunks ? ["table:propchunks"] : []),
          ...missingFields(
            "proposal",
            MSIG_CHUNKED_PROPOSAL_FIELDS,
            proposalFields
          ),
          ...(!approveFields.proposal_hash
            ? ["field:approve.proposal_hash"]
            : [])
        ],
    supports = {
      baseActions: MSIG_BASE_ACTIONS.every(name => actions[name]),
      baseTables: MSIG_BASE_TABLES.every(name => tables[name]),
      legacyTableRead:
        tables.proposal &&
        proposalFields.proposal_name &&
        proposalFields.packed_transaction,
      readOnlyGetProposal: actions.getproposal && actionResults.getproposal,
      chunkedProposals:
        tables.propchunks &&
        MSIG_CHUNKED_PROPOSAL_FIELDS.every(name => proposalFields[name]),
      proposalHash: proposalFields.trx_hash,
      approveProposalHash: approveFields.proposal_hash,
      approvals2: tables.approvals2,
      legacyApprovals: tables.approvals,
      invalidations: tables.invals
    },
    hasBaseContract =
      hasAbi &&
      supports.baseActions &&
      supports.baseTables &&
      supports.legacyTableRead,
    hasChunkedContract =
      hasBaseContract &&
      supports.readOnlyGetProposal &&
      supports.chunkedProposals &&
      supports.approveProposalHash,
    profile = match({ hasBaseContract, hasChunkedContract })
      .with({ hasBaseContract: false }, () => "unknown" as const)
      .with({ hasChunkedContract: true }, () => "chunked-v2" as const)
      .otherwise(() => "legacy" as const)

  return {
    contract: Name.from(contract).toString(),
    hasAbi,
    profile,
    readStrategy: supports.readOnlyGetProposal
      ? "read-only-getproposal"
      : "legacy-table",
    actions,
    tables,
    proposalFields,
    actionResults,
    approveFields,
    supports,
    missingRequired,
    missingEnhanced
  }
}

/** Reads a deployed ABI and classifies its `sysio.msig` feature support. */
export async function detectMsigCapabilities(
  client: APIClient,
  contract: NameType = DEFAULT_MSIG_CONTRACT
): Promise<MsigCapabilities> {
  try {
    return capabilitiesFromAbi(await client.v1.chain.get_abi(contract), contract)
  } catch {
    // Capability detection is diagnostic: an ABI read failure means callers
    // should see an `unknown` profile instead of losing the whole msig view.
    return capabilitiesFromAbi(null, contract)
  }
}
