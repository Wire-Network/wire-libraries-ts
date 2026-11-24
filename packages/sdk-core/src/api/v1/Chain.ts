import { match } from "ts-pattern"

import { APIClient } from "../Client.js"

import {
  BlockIdType,
  Bytes,
  Checksum160,
  Checksum256,
  Checksum256Type,
  Float128,
  Float64,
  Name,
  NameType,
  PackedTransaction,
  SignedTransaction,
  SignedTransactionType,
  UInt128,
  UInt32,
  UInt32Type,
  UInt64
} from "../../chain/index.js"

import {
  AccountObject,
  AccountsByAuthorizers,
  GetAbiResponse,
  GetAccountsByAuthorizersParams,
  GetBlockHeaderStateResponse,
  GetBlockInfoResponse,
  GetBlockResponse,
  GetCodeResponse,
  GetCurrencyStatsItemResponse,
  GetCurrencyStatsResponse,
  GetInfoResponse,
  GetProducerScheduleResponse,
  GetProtocolFeaturesParams,
  GetProtocolFeaturesResponse,
  GetRawAbiResponse,
  GetTableByScopeParams,
  GetTableByScopeResponse,
  GetTableRowsParams,
  GetTableRowsParamsKeyed,
  GetTableRowsParamsTyped,
  GetTableRowsResponse,
  GetTransactionStatusResponse,
  PushTransactionResponse,
  SendTransaction2Options,
  SendTransaction2Response,
  SendTransactionResponse,
  TableRowsFormat,
  TableIndexType,
  TableIndexTypes
} from "./Types.js"

import {
  ABISerializableConstructor,
  ABISerializableType,
  Serializer
} from "../../serializer/index.js"
import { isInstanceOf } from "../../Utils.js"

/** Binary table values are complete, even-length hex strings, including empty data. */
const BinaryTableValue = /^(?:[0-9a-f]{2})*$/i

/** Only callers with a matching probe share its failure. */
interface PendingTableRowsFormat {
  requestKey: string
  result: Promise<TableRowsFormat | undefined>
}

export class ChainAPI {
  private pendingTableRowsFormat?: PendingTableRowsFormat

  constructor(
    private client: APIClient,
    private tableRowsFormat?: TableRowsFormat
  ) {}

  /** Use the same legacy key type for the requested read and format discovery. */
  private getTableKeyType(
    params: GetTableRowsParams | GetTableRowsParamsKeyed
  ): keyof TableIndexTypes {
    let key_type = (params as GetTableRowsParamsKeyed).key_type
    const someBound = params.lower_bound || params.upper_bound

    if (!key_type && someBound) {
      // determine key type from bounds type
      if (isInstanceOf(someBound, UInt64)) {
        key_type = "i64"
      } else if (isInstanceOf(someBound, UInt128)) {
        key_type = "i128"
      } else if (isInstanceOf(someBound, Checksum256)) {
        key_type = "sha256"
      } else if (isInstanceOf(someBound, Checksum160)) {
        key_type = "ripemd160"
      }
    }

    return key_type || "name"
  }

  /** Discover the endpoint transport using a bounded binary read in the caller's
   * table/scope. Binary user data cannot imitate a JSON transport envelope.
   * Cache only an observed format on this API client. Recreate the client when
   * switching endpoints or after an endpoint transport upgrade.
   * @returns The known or discovered format, or undefined when a terminal empty
   * probe provides no format evidence. Empty results are not cached.
   */
  async getTableRowsFormat(
    params: GetTableRowsParams | GetTableRowsParamsKeyed
  ): Promise<TableRowsFormat | undefined> {
    if (this.tableRowsFormat) return this.tableRowsFormat
    const probe = {
      code: Name.from(params.code),
      table: Name.from(params.table),
      scope: String(params.scope ?? params.code),
      index_position: params.index_position,
      key_type: this.getTableKeyType(params),
      json: false,
      show_payer: true,
      limit: 1
    }
    const requestKey = JSON.stringify(probe)
    while (this.pendingTableRowsFormat) {
      const pending = this.pendingTableRowsFormat
      try {
        const format = await pending.result
        if (format) return format
      } catch (error) {
        // A different table/scope/index may still support binary discovery.
        if (pending.requestKey === requestKey) throw error
      }
    }
    const result = this.client
      .call<GetTableRowsResponse>({
        path: "/v1/chain/get_table_rows",
        params: probe
      })
      .then(page => {
        const row = page.rows[0]
        if (row === undefined) {
          if (page.more)
            throw new Error(
              "Table format discovery returned an incomplete empty page"
            )
          return undefined
        }
        const format = ChainAPI.isBinaryTableValue(row)
          ? TableRowsFormat.legacy
          : row &&
              typeof row === "object" &&
              "key" in row &&
              ChainAPI.isBinaryTableValue(row.value)
            ? TableRowsFormat.wireKv
            : row &&
                typeof row === "object" &&
                ChainAPI.isBinaryTableValue(row.data) &&
                typeof row.payer === "string"
              ? TableRowsFormat.legacyPayer
              : undefined
        if (!format)
          throw new Error(
            "Invalid binary table response during format discovery"
          )
        this.tableRowsFormat = format
        return format
      })
    const pending = { requestKey, result }
    this.pendingTableRowsFormat = pending
    try {
      return await result
    } finally {
      if (this.pendingTableRowsFormat === pending)
        this.pendingTableRowsFormat = undefined
    }
  }

  async get_abi(accountName: NameType) {
    return this.client.call<GetAbiResponse>({
      path: "/v1/chain/get_abi",
      params: { account_name: Name.from(accountName) }
    })
  }

  async get_code(accountName: NameType) {
    return this.client.call({
      path: "/v1/chain/get_code",
      params: { account_name: Name.from(accountName) },
      responseType: GetCodeResponse
    })
  }

  async get_raw_abi(accountName: NameType) {
    return this.client.call({
      path: "/v1/chain/get_raw_abi",
      params: { account_name: Name.from(accountName) },
      responseType: GetRawAbiResponse
    })
  }

  async get_account(accountName: NameType, responseType = AccountObject) {
    return this.client.call({
      path: "/v1/chain/get_account",
      params: { account_name: Name.from(accountName) },
      responseType: responseType
    })
  }

  async get_accounts_by_authorizers(params: GetAccountsByAuthorizersParams) {
    return this.client.call({
      path: "/v1/chain/get_accounts_by_authorizers",
      params,
      responseType: AccountsByAuthorizers
    })
  }

  async get_activated_protocol_features(params?: GetProtocolFeaturesParams) {
    return this.client.call({
      path: "/v1/chain/get_activated_protocol_features",
      params,
      responseType: GetProtocolFeaturesResponse
    })
  }

  async get_block(block_num_or_id: BlockIdType | UInt32Type) {
    return this.client.call({
      path: "/v1/chain/get_block",
      params: { block_num_or_id },
      responseType: GetBlockResponse
    })
  }

  async get_block_header_state(block_num_or_id: BlockIdType | UInt32Type) {
    return this.client.call({
      path: "/v1/chain/get_block_header_state",
      params: { block_num_or_id },
      responseType: GetBlockHeaderStateResponse
    })
  }

  async get_block_info(block_num: UInt32Type) {
    return this.client.call({
      path: "/v1/chain/get_block_info",
      params: { block_num },
      responseType: GetBlockInfoResponse
    })
  }

  async get_currency_balance(
    contract: NameType,
    accountName: NameType,
    symbol?: string
  ) {
    const params: any = {
      account: Name.from(accountName),
      code: Name.from(contract)
    }

    if (symbol) {
      params.symbol = symbol
    }

    return this.client.call({
      path: "/v1/chain/get_currency_balance",
      params,
      responseType: "asset[]"
    })
  }

  async get_currency_stats(
    contract: NameType,
    symbol: string
  ): Promise<GetCurrencyStatsResponse> {
    const params: any = {
      code: Name.from(contract),
      symbol
    }
    const response: GetCurrencyStatsResponse = await this.client.call({
      path: "/v1/chain/get_currency_stats",
      params
    })
    const result: GetCurrencyStatsResponse = {}
    Object.keys(response).forEach(
      r => (result[r] = GetCurrencyStatsItemResponse.from(response[r]))
    )
    return result
  }

  async get_info() {
    return this.client.call({
      path: "/v1/chain/get_info",
      responseType: GetInfoResponse,
      method: "GET"
    })
  }

  async get_producer_schedule() {
    return this.client.call({
      path: "/v1/chain/get_producer_schedule",
      responseType: GetProducerScheduleResponse
    })
  }

  async compute_transaction(tx: SignedTransactionType | PackedTransaction) {
    if (!isInstanceOf(tx, PackedTransaction)) {
      tx = PackedTransaction.fromSigned(SignedTransaction.from(tx))
    }

    return this.client.call<SendTransactionResponse>({
      path: "/v1/chain/compute_transaction",
      params: {
        transaction: tx
      }
    })
  }

  async send_read_only_transaction(
    tx: SignedTransactionType | PackedTransaction
  ) {
    if (!isInstanceOf(tx, PackedTransaction)) {
      tx = PackedTransaction.fromSigned(SignedTransaction.from(tx))
    }

    return this.client.call<SendTransactionResponse>({
      path: "/v1/chain/send_read_only_transaction",
      params: {
        transaction: tx
      }
    })
  }

  async push_transaction(tx: SignedTransactionType | PackedTransaction) {
    if (!isInstanceOf(tx, PackedTransaction)) {
      tx = PackedTransaction.fromSigned(SignedTransaction.from(tx))
    }

    return this.client.call<PushTransactionResponse>({
      path: "/v1/chain/push_transaction",
      params: tx
    })
  }

  async send_transaction(tx: SignedTransactionType | PackedTransaction) {
    if (!isInstanceOf(tx, PackedTransaction)) {
      tx = PackedTransaction.fromSigned(SignedTransaction.from(tx))
    }

    return this.client.call<SendTransactionResponse>({
      path: "/v1/chain/send_transaction",
      params: tx
    })
  }

  async send_transaction2(
    tx: SignedTransactionType | PackedTransaction,
    options?: SendTransaction2Options
  ) {
    if (!isInstanceOf(tx, PackedTransaction)) {
      tx = PackedTransaction.fromSigned(SignedTransaction.from(tx))
    }

    return this.client.call<SendTransaction2Response>({
      path: "/v1/chain/send_transaction2",
      params: {
        return_failure_trace: true,
        retry_trx: false,
        retry_trx_num_blocks: 0,
        transaction: tx,
        ...options
      }
    })
  }

  async get_table_rows<Index extends TableIndexType | string = Name>(
    params: GetTableRowsParams<Index>
  ): Promise<GetTableRowsResponse<Index>>
  async get_table_rows<Key extends keyof TableIndexTypes>(
    params: GetTableRowsParamsKeyed<TableIndexTypes[Key], Key>
  ): Promise<GetTableRowsResponse<TableIndexTypes[Key]>>
  async get_table_rows<
    Row extends ABISerializableConstructor,
    Index extends TableIndexType | string = Name
  >(
    params: GetTableRowsParamsTyped<Index, Row>
  ): Promise<GetTableRowsResponse<Index, InstanceType<Row>>>
  async get_table_rows<
    Row extends ABISerializableConstructor,
    Key extends keyof TableIndexTypes
  >(
    params: GetTableRowsParamsTyped<TableIndexTypes[Key], Row> &
      GetTableRowsParamsKeyed<TableIndexTypes[Key], Key>
  ): Promise<GetTableRowsResponse<TableIndexTypes[Key], InstanceType<Row>>>
  async get_table_rows(
    params:
      | GetTableRowsParams
      | GetTableRowsParamsTyped
      | GetTableRowsParamsKeyed
  ) {
    const type = (params as GetTableRowsParamsTyped).type
    const key_type = this.getTableKeyType(params)

    let json = params.json

    if (json === undefined) {
      // if we know the row type don't ask the node to perform abi decoding
      json = type === undefined
    }

    let upper_bound = params.upper_bound

    if (upper_bound && typeof upper_bound !== "string") {
      upper_bound = String(upper_bound)
    }

    let lower_bound = params.lower_bound

    if (lower_bound && typeof lower_bound !== "string") {
      lower_bound = String(lower_bound)
    }

    let scope = params.scope

    if (typeof scope === "undefined") {
      scope = String(Name.from(params.code))
    } else if (typeof scope !== "string") {
      scope = String(scope)
    }

    // eslint-disable-next-line prefer-const
    let { rows, more, next_key } = await this.client.call<any>({
      path: "/v1/chain/get_table_rows",
      params: {
        ...params,
        code: Name.from(params.code),
        table: Name.from(params.table),
        limit:
          params.limit !== undefined ? UInt32.from(params.limit) : undefined,
        scope,
        key_type,
        // Keep the transport envelope even when callers forward raw RPC options.
        values_only: undefined,
        show_payer: params.show_payer,
        json,
        upper_bound,
        lower_bound
      }
    })
    const format =
      rows.length || next_key
        ? await this.getTableRowsFormat(params)
        : this.tableRowsFormat
    if (!format && (rows.length || next_key)) {
      throw new Error(
        "Unable to determine table response format. Configure APIClient tableRowsFormat for this endpoint."
      )
    }
    const wrapped =
      format === TableRowsFormat.wireKv ||
      (format === TableRowsFormat.legacyPayer && params.show_payer)
    const ram_payers = params.show_payer
      ? rows.map(row =>
          wrapped && row.payer ? Name.from(row.payer) : undefined
        )
      : undefined
    if (wrapped) {
      const field = format === TableRowsFormat.wireKv ? "value" : "data"
      rows = rows.map(row => {
        if (!row || typeof row !== "object" || !(field in row)) {
          throw new Error("Invalid table response envelope")
        }
        return row[field]
      })
    }

    if (type) {
      if (json) {
        rows = rows.map(value => {
          if (typeof value === "string" && Bytes.isBytes(value)) {
            // this handles the case where nodeop bails on abi decoding and just returns a hex string
            return Serializer.decode({ data: Bytes.from(value), type })
          } else {
            return Serializer.decode({ object: value, type })
          }
        })
      } else {
        rows = rows
          .map(hex => Bytes.from(hex))
          .map(data => Serializer.decode({ data, type }))
      }
    }

    const isKvCursor = format === TableRowsFormat.wireKv
    if (next_key && next_key.length > 0 && !isKvCursor) {
      const indexType: ABISerializableType = match(key_type)
        .with("i64", () => UInt64)
        .with("i128", () => UInt128)
        .with("name", () => Name)
        .with("float64", () => Float64)
        .with("float128", () => Float128)
        .with("sha256", () => Checksum256)
        .with("ripemd160", () => Checksum160)
        .otherwise(() => {
          throw new Error(`Unsupported key type: ${key_type}`)
        })

      if (indexType === Name) {
        // names are sent back as an uint64 string instead of a name string..
        next_key = Name.from(
          Serializer.decode({ object: next_key, type: UInt64 })
        )
      } else {
        next_key = Serializer.decode({ object: next_key, type: indexType })
      }
    } else if (!next_key) {
      next_key = undefined
    }

    return { rows, more, next_key, ram_payers }
  }

  async get_table_by_scope(params: GetTableByScopeParams) {
    return this.client.call({
      path: "/v1/chain/get_table_by_scope",
      params,
      responseType: GetTableByScopeResponse
    })
  }

  async get_transaction_status(id: Checksum256Type) {
    return this.client.call({
      path: "/v1/chain/get_transaction_status",
      params: {
        id: Checksum256.from(id)
      },
      responseType: GetTransactionStatusResponse
    })
  }
}

/** Table-transport helpers for `ChainAPI` callers. */
export namespace ChainAPI {
  /**
   * Returns true when a table value is the hex encoding of its stored bytes:
   * every row of a `json: false` read, and, under `json: true`, a row the node
   * could not ABI-decode, which it returns as hex instead of a JSON value.
   *
   * @param value - One table value or row as the endpoint returned it.
   * @returns True for a complete, even-length hex string, including `""`.
   */
  export function isBinaryTableValue(value: unknown): value is string {
    return typeof value === "string" && BinaryTableValue.test(value)
  }
}
