import type { APIClient } from "../api/Client.js"
import type { ABIDef } from "../chain/Abi.js"
import { Action } from "../chain/Action.js"
import type { NameType } from "../chain/Name.js"
import { PermissionLevel, type PermissionLevelType } from "../chain/PermissionLevel.js"
import type {
  GetTableByScopeParams,
  GetTableRowsParams,
  GetTableRowsResponse,
  TableIndexType
} from "../api/v1/Types.js"

/** Contract action names that can be built from a typed action map. */
export type ContractActionKey<TActions extends object> = Extract<
  keyof TActions,
  string
>

/** Contract table names that can be read from a typed table map. */
export type ContractTableKey<TTables extends object> = Extract<
  keyof TTables,
  string
>

/** Runtime serializer used to turn generated action interfaces into ABI data. */
export type ContractActionSerializer<TData> = (data: TData) => unknown

/** Permission level input accepted by generic contract action builders. */
export type ContractPermissionLevel = PermissionLevelType | string

/** Runtime metadata for one contract action. */
export interface ContractActionDescriptor<TData> {
  /** ABI action name. */
  name: NameType
  /** Optional runtime serializer for generated action data. */
  serialize: ContractActionSerializer<TData> | null
}

/** Runtime metadata for one contract table. */
export interface ContractTableDescriptor<TRow> {
  /** ABI table name. */
  name: NameType
  /** Type marker for generated table row data. */
  rowType: TRow | null
}

/** Runtime metadata for a typed contract client. */
export interface ContractDescriptor<TActions extends object, TTables extends object> {
  /** Default account that hosts the contract. */
  account: NameType
  /** Action metadata keyed by friendly action name. */
  actions: {
    [K in ContractActionKey<TActions>]: ContractActionDescriptor<TActions[K]>
  }
  /** Table metadata keyed by friendly table name. */
  tables: {
    [K in ContractTableKey<TTables>]: ContractTableDescriptor<TTables[K]>
  }
}

/** Options for constructing a typed contract client. */
export interface ContractClientOptions<TActions extends object, TTables extends object> {
  /** Chain API client used for RPC reads. */
  client: APIClient
  /** Contract descriptor generated from, or aligned with, an ABI. */
  descriptor: ContractDescriptor<TActions, TTables>
  /** Optional account override for deployments that do not use the descriptor account. */
  contract?: NameType
}

/** Options for building one typed contract action. */
export interface ContractBuildActionOptions {
  /** Optional account override for this action only. */
  contract?: NameType
  /** Optional ABI used when action data has no runtime serializer. */
  abi?: ABIDef
}

/** Arguments accepted by `buildContractAction`. */
export interface BuildContractActionArgs<TData> extends ContractBuildActionOptions {
  /** Contract action metadata. */
  descriptor: ContractActionDescriptor<TData>
  /** Default contract account. */
  contract: NameType
  /** Permission levels authorizing the action. */
  authorization: ContractPermissionLevel[]
  /** Strongly typed action data. */
  data: TData
}

/** Options for querying typed contract table rows. */
export type ContractTableRowsOptions<Index = TableIndexType | string> = Omit<
  GetTableRowsParams<Index>,
  "code" | "table"
>

/** Options for querying typed contract table scopes. */
export type ContractTableScopesOptions = Omit<
  GetTableByScopeParams,
  "code" | "table"
>

/** Typed action builder methods derived from a contract action map. */
export type ContractActionMethods<TActions extends object> = {
  [K in ContractActionKey<TActions>]: (
    data: TActions[K],
    authorization: ContractPermissionLevel[],
    options?: ContractBuildActionOptions
  ) => Action
}

/** Typed table clients derived from a contract table map. */
export type ContractTableClients<TTables extends object> = {
  [K in ContractTableKey<TTables>]: ContractTableClient<TTables[K]>
}

/** Builds an ABI action from contract metadata and strongly typed data. */
export function buildContractAction<TData>(
  args: BuildContractActionArgs<TData>
): Action {
  const data = args.descriptor.serialize
    ? args.descriptor.serialize(args.data)
    : args.data

  return Action.from(
    {
      account: args.contract,
      name: args.descriptor.name,
      authorization: args.authorization.map(value =>
        PermissionLevel.from(value as PermissionLevelType | string)
      ),
      data
    },
    args.abi
  )
}

/** Typed table reader for one contract table. */
export class ContractTableClient<TRow> {
  /** Table metadata. */
  readonly descriptor: ContractTableDescriptor<TRow>

  private readonly contractClient: ContractClient<any, any>

  /** Creates a typed table client. */
  constructor(
    contractClient: ContractClient<any, any>,
    descriptor: ContractTableDescriptor<TRow>
  ) {
    this.contractClient = contractClient
    this.descriptor = descriptor
  }

  /** Reads rows from this table, returning the generated row type. */
  async rows<Index = TableIndexType | string>(
    options: ContractTableRowsOptions<Index> = {}
  ): Promise<GetTableRowsResponse<Index, TRow>> {
    return this.contractClient.client.v1.chain.get_table_rows({
      code: this.contractClient.contract,
      table: this.descriptor.name,
      scope: this.contractClient.contract,
      json: true,
      ...options
    } as any) as Promise<GetTableRowsResponse<Index, TRow>>
  }

  /** Reads the first row from this table, or null when no row is available. */
  async first<Index = TableIndexType | string>(
    options: ContractTableRowsOptions<Index> = {}
  ): Promise<TRow | null> {
    const result = await this.rows({
      ...options,
      limit: options.limit || 1
    })

    return result.rows[0] || null
  }

  /** Lists scopes that currently contain rows for this table. */
  async scopes(options: ContractTableScopesOptions = {}): Promise<string[]> {
    const result = await this.contractClient.client.v1.chain.get_table_by_scope({
      code: this.contractClient.contract,
      table: this.descriptor.name,
      ...options
    })

    return result.rows.map(row => row.scope.toString())
  }
}

/** Generic typed contract client backed by generated action and table maps. */
export class ContractClient<TActions extends object, TTables extends object> {
  /** Chain API client used for RPC reads. */
  readonly client: APIClient

  /** Contract account used by this client. */
  readonly contract: NameType

  /** Contract metadata. */
  readonly descriptor: ContractDescriptor<TActions, TTables>

  /** Typed action builder methods. */
  readonly actions: ContractActionMethods<TActions>

  /** Typed table readers. */
  readonly tables: ContractTableClients<TTables>

  /** Creates a typed contract client. */
  constructor(options: ContractClientOptions<TActions, TTables>) {
    this.client = options.client
    this.contract = options.contract || options.descriptor.account
    this.descriptor = options.descriptor
    this.actions = this.createActionMethods()
    this.tables = this.createTableClients()
  }

  /** Builds one action by descriptor key. */
  buildAction<K extends ContractActionKey<TActions>>(
    action: K,
    data: TActions[K],
    authorization: ContractPermissionLevel[],
    options: ContractBuildActionOptions = {}
  ): Action {
    return buildContractAction({
      ...options,
      contract: options.contract || this.contract,
      descriptor: this.descriptor.actions[action],
      authorization,
      data
    })
  }

  /** Returns a typed table reader by descriptor key. */
  table<K extends ContractTableKey<TTables>>(
    table: K
  ): ContractTableClient<TTables[K]> {
    return this.tables[table]
  }

  private createActionMethods(): ContractActionMethods<TActions> {
    const methods: Partial<ContractActionMethods<TActions>> = {},
      mutableMethods = methods as any

    Object.keys(this.descriptor.actions).forEach(action => {
      const key = action as ContractActionKey<TActions>
      mutableMethods[key] = (
        data: TActions[typeof key],
        authorization: ContractPermissionLevel[],
        options: ContractBuildActionOptions = {}
      ) => this.buildAction(key, data, authorization, options)
    })

    return methods as ContractActionMethods<TActions>
  }

  private createTableClients(): ContractTableClients<TTables> {
    const tables: Partial<ContractTableClients<TTables>> = {},
      mutableTables = tables as any

    Object.keys(this.descriptor.tables).forEach(table => {
      const key = table as ContractTableKey<TTables>
      mutableTables[key] = new ContractTableClient(
        this,
        this.descriptor.tables[key]
      )
    })

    return tables as ContractTableClients<TTables>
  }
}

/** Creates a typed contract client from a descriptor. */
export function createContractClient<
  TActions extends object,
  TTables extends object
>(options: ContractClientOptions<TActions, TTables>): ContractClient<TActions, TTables> {
  return new ContractClient(options)
}
