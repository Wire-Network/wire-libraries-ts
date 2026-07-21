import type { APIClient } from "../../api/Client.js"
import type { TransactionExtraOptions } from "../../api/Types.js"
import type {
  GetTableRowsResponse,
  TableIndexType
} from "../../api/v1/Types.js"
import type { ABIDef } from "../../chain/Abi.js"
import { Action, type AnyAction } from "../../chain/Action.js"
import type { NameType } from "../../chain/Name.js"
import {
  PermissionLevel,
  type PermissionLevelType
} from "../../chain/PermissionLevel.js"
import {
  SysioContractDefinitions,
  SysioContractName,
  type SysioContractMapping
} from "../../types/SysioContractTypes.js"
import type {
  ContractActionDescriptor,
  ContractBuildActionOptions,
  ContractPermissionLevel,
  ContractTableRowsOptions,
  ContractTableScopesOptions
} from "../Contract.js"
import {
  descriptor as authexDescriptor,
  type SysioAuthexActionData
} from "./authex/Descriptor.js"
import {
  descriptor as msigDescriptor,
  type SysioMsigActionData
} from "./msig/Descriptor.js"
import {
  descriptor as reservDescriptor,
  type SysioReservActionData
} from "./reserv/Descriptor.js"

const GetSysioContractMember = "getSysioContract"
const PromiseThenMember = "then"

enum SysioMemberKind {
  action = "action",
  table = "table"
}

/** Generated action and table surface for one system contract. */
export type SysioContract<Name extends SysioContractName> =
  SysioContractMapping[Name]

/** Generated action names for one system contract. */
export type SysioActionName<Name extends SysioContractName> = Extract<
  keyof SysioContract<Name>["actions"],
  string
>

/** Generated action data for one system contract action. */
export type SysioActionData<
  Name extends SysioContractName,
  ActionName extends SysioActionName<Name>
> = Name extends keyof RuntimeActionDataMapping
  ? ActionName extends keyof RuntimeActionDataMapping[Name]
    ? RuntimeActionDataMapping[Name][ActionName]
    : SysioContract<Name>["actions"][ActionName]
  : SysioContract<Name>["actions"][ActionName]

/** Generated table names for one system contract. */
export type SysioTableName<Name extends SysioContractName> = Extract<
  keyof SysioContract<Name>["tables"],
  string
>

/** Generated table row for one system contract table. */
export type SysioTableRow<
  Name extends SysioContractName,
  TableName extends SysioTableName<Name>
> = SysioContract<Name>["tables"][TableName]

/** Options shared by typed system-contract action preparation and invocation. */
export interface SysioActionOptions extends ContractBuildActionOptions {
  /** Permission levels authorizing the action. Empty for read-only actions. */
  authorization?: ContractPermissionLevel[]
}

/** Options for invoking a typed system-contract action. */
export interface SysioActionInvocationOptions extends SysioActionOptions {
  /** Optional signed-transaction behavior such as waiting for finality. */
  pushOptions?: TransactionExtraOptions
}

/** Unencoded action payload retained when synchronous ABI encoding is unavailable. */
export interface SysioActionPayload<
  Name extends SysioContractName,
  ActionName extends SysioActionName<Name>
> extends AnyAction {
  /** Generated short system-contract name. */
  readonly contract: Name
  /** On-chain account hosting the contract. */
  readonly account: NameType
  /** ABI action name. */
  readonly name: ActionName
  /** Normalized action authorization. */
  readonly authorization: PermissionLevelType[]
  /** Generated ABI action data. */
  readonly data: SysioActionData<Name, ActionName>
}

/** Prepared action: ABI encoded when possible, otherwise ready for APIClient ABI resolution. */
export type SysioPreparedAction<
  Name extends SysioContractName,
  ActionName extends SysioActionName<Name>
> = Action | SysioActionPayload<Name, ActionName>

/** Typed prepare/invoke interface for one generated system-contract action. */
export interface SysioActionInvoker<
  Name extends SysioContractName,
  ActionName extends SysioActionName<Name>
> {
  /** Backward-compatible shorthand for {@link SysioActionInvoker.prepare}. */
  (
    data: SysioActionData<Name, ActionName>,
    authorization: ContractPermissionLevel[],
    options?: ContractBuildActionOptions
  ): Action

  /** Prepares an unsigned action, preferring synchronous ABI encoding. */
  prepare(
    data: SysioActionData<Name, ActionName>,
    options?: SysioActionOptions
  ): SysioPreparedAction<Name, ActionName>

  /** Prepares and pushes the action through the configured signed API client. */
  invoke(
    data: SysioActionData<Name, ActionName>,
    options?: SysioActionInvocationOptions
  ): Promise<Awaited<ReturnType<APIClient["pushTransaction"]>>>
}

/** Typed query interface for one generated system-contract table. */
export interface SysioTableQuery<
  Name extends SysioContractName,
  TableName extends SysioTableName<Name>
> {
  /** Reads table rows with the complete chain table-query option surface. */
  query<Index = TableIndexType | string>(
    options?: ContractTableRowsOptions<Index>
  ): Promise<GetTableRowsResponse<Index, SysioTableRow<Name, TableName>>>

  /** Backward-compatible alias for {@link SysioTableQuery.query}. */
  rows<Index = TableIndexType | string>(
    options?: ContractTableRowsOptions<Index>
  ): Promise<GetTableRowsResponse<Index, SysioTableRow<Name, TableName>>>

  /** Reads the first matching table row. */
  first<Index = TableIndexType | string>(
    options?: ContractTableRowsOptions<Index>
  ): Promise<SysioTableRow<Name, TableName>>

  /** Lists scopes containing rows for this table. */
  scopes(options?: ContractTableScopesOptions): Promise<string[]>
}

/** Typed action invokers keyed by one contract's generated action names. */
export type SysioActionInvokers<Name extends SysioContractName> = {
  readonly [ActionName in SysioActionName<Name>]: SysioActionInvoker<
    Name,
    ActionName
  >
}

/** Typed table queries keyed by one contract's generated table names. */
export type SysioTableQueries<Name extends SysioContractName> = {
  readonly [TableName in SysioTableName<Name>]: SysioTableQuery<Name, TableName>
}

/** Generated typed action/table proxy for one system contract. */
export interface SysioContractClient<Name extends SysioContractName> {
  /** Generated short system-contract name. */
  readonly name: Name
  /** On-chain account hosting the contract. */
  readonly account: NameType
  /** Lazily resolved typed action invokers. */
  readonly actions: SysioActionInvokers<Name>
  /** Lazily resolved typed table queries. */
  readonly tables: SysioTableQueries<Name>
}

/** Per-contract account overrides for nonstandard system-contract deployments. */
export type SysioContractAccounts = Partial<Record<SysioContractName, NameType>>

/** String values accepted by the backward-compatible named client factory. */
export type SysioContractNameInput = `${SysioContractName}`

/** Generated enum member corresponding to a named factory input. */
export type SysioContractNameFromInput<Name extends SysioContractNameInput> =
  Extract<SysioContractName, Name>

/** Options for creating the root system-contract proxy. */
export interface SysioClientOptions {
  /** Chain API client used for reads and signed action invocation. */
  client: APIClient
  /** Optional account overrides keyed by generated system-contract name. */
  contracts?: SysioContractAccounts
}

/** Options for directly resolving one system-contract proxy. */
export interface GetSysioContractOptions {
  /** Optional API client; action preparation works without one. */
  client?: APIClient
  /** Optional on-chain account override. */
  contract?: NameType
}

/** Backward-compatible options for creating one named system-contract client. */
export interface SystemContractClientOptions<
  Name extends SysioContractNameInput
> extends SysioClientOptions {
  /** Generated system-contract name. */
  name: Name
  /** Optional on-chain account override. */
  contract?: NameType
}

/** Root proxy methods shared with the sister-repository Wire client. */
export interface SysioClientMethods {
  /** Resolves one generated typed system-contract client. */
  getSysioContract<Name extends SysioContractName>(
    name: Name
  ): SysioContractClient<Name>
}

/** Root proxy exposing every generated system contract by its short name. */
export type SysioClient = SysioClientMethods & {
  readonly [Name in SysioContractName]: SysioContractClient<Name>
}

interface RuntimeActionDescriptor {
  serialize: ContractActionDescriptor<unknown>["serialize"]
}

interface RuntimeContractDescriptor {
  actions: Record<string, RuntimeActionDescriptor>
}

interface RuntimeActionDataMapping {
  [SysioContractName.authex]: SysioAuthexActionData
  [SysioContractName.msig]: SysioMsigActionData
  [SysioContractName.reserv]: SysioReservActionData
}

/** @deprecated Use the generated proxy; retained for descriptor consumers. */
export const descriptors = {
  [SysioContractName.authex]: authexDescriptor,
  [SysioContractName.msig]: msigDescriptor,
  [SysioContractName.reserv]: reservDescriptor
} as const

/** @deprecated Use {@link SysioContractNameInput}. */
export type SystemContractName = `${keyof typeof descriptors}`

/** @deprecated Use generated action and table maps through the proxy. */
export type SystemContractDescriptor<Name extends SystemContractName> =
  (typeof descriptors)[Extract<keyof typeof descriptors, Name>]

/** @deprecated Use {@link SysioContractClient}. */
export type SystemContractClient<Name extends SystemContractName> =
  SysioContractClient<SysioContractNameFromInput<Name>>

const RuntimeDescriptors: Partial<
  Record<SysioContractName, RuntimeContractDescriptor>
> = descriptors as unknown as Partial<
  Record<SysioContractName, RuntimeContractDescriptor>
>

/** Returns true when a reflected root-proxy member is a generated contract name. */
function isSysioContractName(value: string): value is SysioContractName {
  return Object.prototype.hasOwnProperty.call(SysioContractDefinitions, value)
}

/** Throws when a read or invocation is attempted without an API client. */
function assertClient(client: APIClient): APIClient {
  if (!client) {
    throw new Error(
      "An APIClient is required to query or invoke a system contract."
    )
  }
  return client
}

/** Normalizes string and object permission inputs for action payloads. */
function normalizeAuthorization(
  authorization: ContractPermissionLevel[] = []
): PermissionLevel[] {
  return authorization.map(value => PermissionLevel.from(value))
}

/** Returns the optional runtime action descriptor used for synchronous encoding. */
function getRuntimeActionDescriptor(
  name: SysioContractName,
  actionName: string
): RuntimeActionDescriptor {
  return RuntimeDescriptors[name]?.actions[actionName]
}

/** Prefers an encoded Action and deliberately retains the raw payload on encoding failure. */
function prepareAction<
  Name extends SysioContractName,
  ActionName extends SysioActionName<Name>
>(
  payload: SysioActionPayload<Name, ActionName>,
  abi?: ABIDef
): SysioPreparedAction<Name, ActionName> {
  try {
    const descriptor = getRuntimeActionDescriptor(
        payload.contract,
        String(payload.name)
      ),
      data = descriptor?.serialize
        ? descriptor.serialize(payload.data)
        : payload.data

    return Action.from({ ...payload, data }, abi)
  } catch {
    // Raw AnyAction payloads are intentional: APIClient resolves the deployed
    // ABI during push, keeping generated contracts usable without hand codecs.
    return payload
  }
}

/** Creates one lazy typed action invoker. */
function createActionInvoker<
  Name extends SysioContractName,
  ActionName extends SysioActionName<Name>
>(
  name: Name,
  account: NameType,
  actionName: ActionName,
  client?: APIClient
): SysioActionInvoker<Name, ActionName> {
  const prepare = (
      data: SysioActionData<Name, ActionName>,
      options: SysioActionOptions = {}
    ) => {
      const contract = options.contract || account,
        payload: SysioActionPayload<Name, ActionName> = {
          contract: name,
          account: contract,
          name: actionName,
          authorization: normalizeAuthorization(options.authorization),
          data
        }

      return prepareAction(payload, options.abi)
    },
    invoker = (
      data: SysioActionData<Name, ActionName>,
      authorization: ContractPermissionLevel[],
      options: ContractBuildActionOptions = {}
    ) => assertEncodedAction(prepare(data, { ...options, authorization }))

  invoker.prepare = prepare
  invoker.invoke = async (
    data: SysioActionData<Name, ActionName>,
    options: SysioActionInvocationOptions = {}
  ) =>
    assertClient(client).pushTransaction(
      prepare(data, options),
      options.pushOptions
    )

  return invoker
}

/** Creates one lazy typed table query. */
function createTableQuery<
  Name extends SysioContractName,
  TableName extends SysioTableName<Name>
>(
  account: NameType,
  tableName: TableName,
  client?: APIClient
): SysioTableQuery<Name, TableName> {
  const query = async <Index = TableIndexType | string>(
      options: ContractTableRowsOptions<Index> = {}
    ) =>
      assertClient(client).v1.chain.get_table_rows({
        code: account,
        table: tableName,
        scope: account,
        json: true,
        ...options
      } as any) as Promise<
        GetTableRowsResponse<Index, SysioTableRow<Name, TableName>>
      >,
    first = async <Index = TableIndexType | string>(
      options: ContractTableRowsOptions<Index> = {}
    ) => {
      const result = await query({ ...options, limit: options.limit || 1 })
      return result.rows[0] || null
    },
    scopes = async (options: ContractTableScopesOptions = {}) => {
      const result = await assertClient(client).v1.chain.get_table_by_scope({
        code: account,
        table: tableName,
        ...options
      })
      return result.rows.map(row => row.scope.toString())
    }

  return { query, rows: query, first, scopes }
}

/** Creates a guarded lazy member proxy for actions or tables. */
function createMemberProxy<Member>(
  contractName: SysioContractName,
  kind: SysioMemberKind,
  knownMembers: ReadonlyArray<string>,
  createMember: (member: string) => Member
): Record<string, Member> {
  const members = new Map<string, Member>()

  return new Proxy({} as Record<string, Member>, {
    get: (_target, property) => {
      if (typeof property === "symbol" || property === PromiseThenMember) {
        return null
      }

      const member = String(property)
      if (!knownMembers.includes(member)) {
        throw new Error(`Unknown sysio.${contractName} ${kind}: ${member}`)
      }

      const existing = members.get(member)
      if (existing) return existing

      const created = createMember(member)
      members.set(member, created)
      return created
    }
  })
}

/**
 * Resolves one generated system-contract proxy.
 *
 * Action preparation is available without an API client; reads and invocation
 * assert that one was supplied. Runtime member access is restricted to the
 * generated contract definition.
 */
export function getSysioContract<Name extends SysioContractName>(
  name: Name,
  options: GetSysioContractOptions = {}
): SysioContractClient<Name> {
  if (!isSysioContractName(String(name))) {
    throw new Error(`Unknown sysio contract: ${name}`)
  }

  const definition = SysioContractDefinitions[name],
    account = options.contract || definition.account,
    actions = createMemberProxy(
      name,
      SysioMemberKind.action,
      definition.actions,
      actionName =>
        createActionInvoker(
          name,
          account,
          actionName as SysioActionName<Name>,
          options.client
        )
    ),
    tables = createMemberProxy(
      name,
      SysioMemberKind.table,
      definition.tables,
      tableName =>
        createTableQuery<Name, SysioTableName<Name>>(
          account,
          tableName as SysioTableName<Name>,
          options.client
        )
    )

  return {
    name,
    account,
    actions,
    tables
  } as unknown as SysioContractClient<Name>
}

/** Creates the root proxy exposing all generated system contracts. */
export function createSysioClient(options: SysioClientOptions): SysioClient {
  const clients = new Map<
      SysioContractName,
      SysioContractClient<SysioContractName>
    >(),
    getContract = <Name extends SysioContractName>(name: Name) => {
      const existing = clients.get(name)
      if (existing) return existing as SysioContractClient<Name>

      const created = getSysioContract(name, {
        client: options.client,
        contract: options.contracts?.[name]
      })
      clients.set(name, created as SysioContractClient<SysioContractName>)
      return created
    }

  return new Proxy({ getSysioContract: getContract } as SysioClient, {
    get: (target, property) => {
      if (typeof property === "symbol" || property === PromiseThenMember) {
        return null
      }
      if (property === GetSysioContractMember) return target.getSysioContract

      const member = String(property)
      if (!isSysioContractName(member)) {
        throw new Error(`Unknown sysio contract: ${member}`)
      }
      return getContract(member)
    }
  })
}

/** Creates either the root proxy or one named proxy using the legacy factory form. */
export function createClient(options: SysioClientOptions): SysioClient
export function createClient<Name extends SysioContractNameInput>(
  options: SystemContractClientOptions<Name>
): SysioContractClient<SysioContractNameFromInput<Name>>
export function createClient(
  options:
    | SysioClientOptions
    | SystemContractClientOptions<SysioContractNameInput>
): SysioClient | SysioContractClient<SysioContractName> {
  if (!("name" in options)) return createSysioClient(options)

  return getSysioContract(options.name as SysioContractName, {
    client: options.client,
    contract: options.contract
  })
}

/** Asserts that preparation produced an ABI-encoded action. */
export function assertEncodedAction<
  Name extends SysioContractName,
  ActionName extends SysioActionName<Name>
>(action: SysioPreparedAction<Name, ActionName>): Action {
  if (!(action instanceof Action)) {
    throw new Error(
      "System-contract action could not be synchronously ABI encoded."
    )
  }
  return action
}
