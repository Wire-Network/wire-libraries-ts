/** An `eth_getLogs` entry. */
export interface RpcLog {
  /** The emitting contract. */
  address: string
  /** The log's topics. */
  topics: string[]
  /** The ABI-encoded event data. */
  data: string
  /** The block, as a 0x-hex quantity. */
  blockNumber: string
  /** The emitting transaction. */
  transactionHash: string
  /** The log's position in its block, as a 0x-hex quantity. */
  logIndex: string
  /** The block's hash. */
  blockHash: string
  /** Whether a reorg removed the log. */
  removed: boolean
}

/** One entry of an EIP-2930 access list. */
export interface RpcAccessListEntry {
  /** The accessed contract. */
  address: string
  /** The accessed storage slots. */
  storageKeys: string[]
}

/** An `eth_getTransactionByHash` entry: every field a signature recovery needs. */
export interface RpcTransaction {
  /** The transaction hash. */
  hash: string
  /** The sender. */
  from: string
  /** The recipient; `null` for a contract creation. */
  to: string
  /** The calldata. */
  input: string
  /** The sender nonce, 0x-hex. */
  nonce: string
  /** The value sent, 0x-hex. */
  value: string
  /** The gas limit, 0x-hex. */
  gas: string
  /** The legacy gas price, 0x-hex. */
  gasPrice?: string
  /** The EIP-1559 fee cap, 0x-hex. */
  maxFeePerGas?: string
  /** The EIP-1559 tip cap, 0x-hex. */
  maxPriorityFeePerGas?: string
  /** The EIP-4844 blob fee cap, 0x-hex. */
  maxFeePerBlobGas?: string
  /** The EIP-4844 blob hashes. */
  blobVersionedHashes?: string[]
  /** The chain id, 0x-hex. */
  chainId?: string
  /** The transaction type, 0x-hex. */
  type?: string
  /** The EIP-2930 access list. */
  accessList?: RpcAccessListEntry[]
  /** The legacy signature `v`, 0x-hex. */
  v?: string
  /** The typed-transaction signature parity, 0x-hex. */
  yParity?: string
  /** The signature `r`. */
  r: string
  /** The signature `s`. */
  s: string
}

/** An `eth_getLogs` filter, its block bounds as numbers. */
export interface LogFilter {
  /** The emitting contract. */
  address: string
  /** Topic filters, `null` for a wildcard position. */
  topics: string[]
  /** First block, inclusive. */
  fromBlock: number
  /** Last block, inclusive. */
  toBlock: number
}

/** The subset of Ethereum JSON-RPC the OPP snapshot needs, over plain `fetch`. */
export class JsonRpcClient {
  /**
   * @param url - The node's JSON-RPC endpoint.
   */
  constructor(readonly url: string) {}

  /**
   * Call one JSON-RPC method.
   *
   * @param method - The method name.
   * @param params - The positional parameters.
   * @returns The call's `result`.
   * @throws when the node answers with an HTTP error or a JSON-RPC error.
   */
  async call<T>(method: JsonRpcClient.Method, params: unknown[]): Promise<T> {
    const response = await fetch(this.url, {
      method: JsonRpcClient.HttpMethod,
      headers: JsonRpcClient.RequestHeaders,
      body: JSON.stringify({
        jsonrpc: JsonRpcClient.Version,
        id: JsonRpcClient.RequestId,
        method,
        params
      })
    })
    if (!response.ok) {
      throw new Error(`RPC HTTP error ${response.status}: ${response.statusText}`)
    }
    const json = (await response.json()) as JsonRpcClient.Response<T>
    if (json.error) {
      throw new Error(`RPC error ${json.error.code}: ${json.error.message}`)
    }
    return json.result
  }

  /** `eth_getLogs` over an inclusive block range. */
  getLogs(filter: LogFilter): Promise<RpcLog[]> {
    return this.call<RpcLog[]>(JsonRpcClient.Method.eth_getLogs, [
      {
        address: filter.address,
        topics: filter.topics,
        fromBlock: JsonRpcClient.toQuantity(filter.fromBlock),
        toBlock: JsonRpcClient.toQuantity(filter.toBlock)
      }
    ])
  }

  /** `eth_blockNumber`: the node's head. */
  async blockNumber(): Promise<number> {
    return Number(await this.call<string>(JsonRpcClient.Method.eth_blockNumber, []))
  }

  /** A block's unix timestamp. */
  async blockTimestamp(blockNumber: number): Promise<number> {
    const block = await this.call<JsonRpcClient.BlockHeader>(
      JsonRpcClient.Method.eth_getBlockByNumber,
      [JsonRpcClient.toQuantity(blockNumber), false]
    )
    return Number(block.timestamp)
  }

  /** `eth_getTransactionByHash`; `null` when the node does not know the transaction. */
  getTransactionByHash(hash: string): Promise<RpcTransaction> {
    return this.call<RpcTransaction>(JsonRpcClient.Method.eth_getTransactionByHash, [hash])
  }
}

/** The client's wire constants and response shapes. */
export namespace JsonRpcClient {
  /** The JSON-RPC methods the client calls. */
  export enum Method {
    eth_getLogs = "eth_getLogs",
    eth_blockNumber = "eth_blockNumber",
    eth_getBlockByNumber = "eth_getBlockByNumber",
    eth_getTransactionByHash = "eth_getTransactionByHash"
  }
  /** The JSON-RPC protocol version. */
  export const Version = "2.0"
  /** The request id; the client sends one request per HTTP call. */
  export const RequestId = 1
  /** The HTTP method JSON-RPC rides. */
  export const HttpMethod = "POST"
  /** The request headers. */
  export const RequestHeaders = { "Content-Type": "application/json" }

  /** A JSON-RPC error object. */
  export interface ErrorObject {
    /** The error code. */
    code: number
    /** The error message. */
    message: string
  }

  /** A JSON-RPC response envelope. */
  export interface Response<T> {
    /** The protocol version. */
    jsonrpc: string
    /** The request id it answers. */
    id: number
    /** The result, on success. */
    result?: T
    /** The error, on failure. */
    error?: ErrorObject
  }

  /** The block header fields the client reads. */
  export interface BlockHeader {
    /** The block's unix timestamp, 0x-hex. */
    timestamp: string
  }

  /** A number as a JSON-RPC 0x-hex quantity. */
  export function toQuantity(value: number): string {
    return `0x${value.toString(16)}`
  }
}
