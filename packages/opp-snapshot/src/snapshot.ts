import pLimit from "p-limit"
import { getLogger } from "@wireio/shared"

import { computeBalances, sortAssertionRows, toSnapshot } from "./balances.js"
import { decodeLogsToRows } from "./decoder.js"
import { JsonRpcClient } from "./JsonRpcClient.js"
import { OppConstants } from "./OppConstants.js"
import type {
  AssertionRow,
  BalanceOutput,
  OppSnapshot,
  OppWarn,
  RawLog
} from "./OppTypes.js"
import { recoverActorPubkeys } from "./pubkeys.js"

const log = getLogger("@wireio/opp-snapshot/snapshot")

/** The radix of the hex quantities a node reports. */
const HexRadix = 16

/** What {@link buildOppSnapshot} reads, and how. */
export interface BuildOppSnapshotOptions {
  /** The node to read from: a URL or an already-constructed client. */
  rpc: string | JsonRpcClient
  /** The OPP contract whose `OPPMessage` stream is the source. */
  oppAddress: string
  /** First block to scan. */
  fromBlock: number
  /** Last block to scan; the node's head when omitted. */
  toBlock?: number
  /** Blocks per `eth_getLogs` call; `OppConstants.DefaultLogBlockRange` when omitted. */
  blockRange?: number
  /** Recover each staking actor's compressed public key from their signed transactions (default true). */
  recoverPubkeys?: boolean
  /** Fetch block timestamps for the rows (default true). */
  fetchTimestamps?: boolean
  /** Concurrent RPC reads for timestamps and transactions; `OppConstants.DefaultConcurrency` when omitted. */
  concurrency?: number
  /** Where recoverable decode and RPC problems are reported; this module's logger when omitted. */
  warn?: OppWarn
}

/** Everything a snapshot build produces. */
export interface OppSnapshotBuild {
  /** The rows the build replayed, sorted. */
  assertions: AssertionRow[]
  /** The computed balances. */
  output: BalanceOutput
  /** The `/opp/balances`-shaped result. */
  snapshot: OppSnapshot
  /** The first block scanned. */
  fromBlock: number
  /** The last block scanned. */
  toBlock: number
}

/** Every `OPPMessage` log of the contract in the block range, in node order, reorged logs dropped. */
async function readOppLogs(
  rpc: JsonRpcClient,
  oppAddress: string,
  fromBlock: number,
  toBlock: number,
  blockRange: number
): Promise<RawLog[]> {
  const starts = Array.from(
      { length: Math.max(0, Math.ceil((toBlock - fromBlock + 1) / blockRange)) },
      (_, index) => fromBlock + index * blockRange
    ),
    logs: RawLog[] = []
  // Sequential on purpose: one range per call keeps a node's log limits predictable.
  for (const start of starts) {
    const batch = await rpc.getLogs({
      address: oppAddress,
      topics: [OppConstants.OppMessageTopic0],
      fromBlock: start,
      toBlock: Math.min(start + blockRange - 1, toBlock)
    })
    batch
      .filter(entry => !entry.removed)
      .forEach(entry =>
        logs.push({
          address: entry.address,
          topics: entry.topics,
          data: entry.data,
          blockNumber: parseInt(entry.blockNumber, HexRadix),
          transactionHash: entry.transactionHash,
          logIndex: parseInt(entry.logIndex, HexRadix)
        })
      )
  }
  return logs
}

/** Stamp each log with its block's timestamp; a block whose timestamp cannot be read is reported and left unstamped. */
async function stampBlockTimes(
  rpc: JsonRpcClient,
  logs: RawLog[],
  concurrency: number,
  warn: OppWarn
): Promise<void> {
  const limit = pLimit(concurrency),
    blocks = [...new Set(logs.map(entry => entry.blockNumber as number))],
    timestamps = new Map<number, number>()
  await Promise.all(
    blocks.map(block =>
      limit(() =>
        rpc
          .blockTimestamp(block)
          .then(timestamp => {
            timestamps.set(block, timestamp)
          })
          .catch(error => warn(`block ${block} timestamp unavailable: ${error}`))
      )
    )
  )
  logs.forEach(entry => {
    entry.blockTimestamp = timestamps.get(entry.blockNumber as number)
  })
}

/**
 * Read an OPP contract's `OPPMessage` stream straight from a node and compute
 * the same `/opp/balances` snapshot the indexer serves from its database,
 * without the indexer, its database or any webhook. This is what a launch
 * bootstrap (and the wire-tools-ts harness) uses to turn a frozen pre-launch
 * outpost into the depot's import data.
 *
 * @param options - The node, the contract, the block range and the read tuning.
 * @returns The replayed rows, the balances and the snapshot.
 */
export async function buildOppSnapshot(options: BuildOppSnapshotOptions): Promise<OppSnapshotBuild> {
  const rpc = typeof options.rpc === "string" ? new JsonRpcClient(options.rpc) : options.rpc,
    {
      oppAddress,
      fromBlock,
      toBlock = await rpc.blockNumber(),
      blockRange = OppConstants.DefaultLogBlockRange,
      recoverPubkeys = true,
      fetchTimestamps = true,
      concurrency = OppConstants.DefaultConcurrency,
      warn = (message: string) => log.warn(message)
    } = options,
    logs = await readOppLogs(rpc, oppAddress, fromBlock, toBlock, blockRange)
  if (fetchTimestamps) await stampBlockTimes(rpc, logs, concurrency, warn)
  const assertions = sortAssertionRows(decodeLogsToRows(logs, oppAddress, warn)),
    pubkeys = recoverPubkeys
      ? await recoverActorPubkeys(rpc, assertions, { concurrency, warn })
      : new Map<string, string>(),
    output = computeBalances(assertions, pubkeys)
  return { assertions, output, snapshot: toSnapshot(output), fromBlock, toBlock }
}
