import { SigningKey, Transaction, computeAddress } from "ethers"
import pLimit from "p-limit"
import { match } from "ts-pattern"
import { getLogger, getValue } from "@wireio/shared"

import { OppAssertionType } from "./OppAssertionType.js"
import { OppConstants } from "./OppConstants.js"
import type { JsonRpcClient, RpcTransaction } from "./JsonRpcClient.js"
import type { AssertionRow, OppWarn } from "./OppTypes.js"

const log = getLogger("@wireio/opp-snapshot/pubkeys")

/** How {@link recoverActorPubkeys} reads the transactions. */
export interface RecoverActorPubkeysOptions {
  /** Concurrent `eth_getTransactionByHash` reads; `OppConstants.DefaultConcurrency` when omitted. */
  concurrency?: number
  /** Where a failed read is reported; this module's logger when omitted. */
  warn?: OppWarn
}

/** An optional 0x-hex quantity as a bigint; `null` when absent, as ethers' transaction fields take it. */
function optionalQuantity(quantity: string): bigint {
  return quantity === undefined ? null : BigInt(quantity)
}

/** Rebuild the signed transaction a node reported and recover its sender's uncompressed key. */
function recoverSenderKey(transaction: RpcTransaction): string {
  const { yParity, v: legacyParity } = transaction,
    parity = yParity ?? legacyParity
  if (parity === undefined) return null
  return Transaction.from({
    type: transaction.type === undefined ? null : Number(transaction.type),
    to: transaction.to,
    nonce: Number(transaction.nonce),
    gasLimit: BigInt(transaction.gas),
    gasPrice: optionalQuantity(transaction.gasPrice),
    maxFeePerGas: optionalQuantity(transaction.maxFeePerGas),
    maxPriorityFeePerGas: optionalQuantity(transaction.maxPriorityFeePerGas),
    maxFeePerBlobGas: optionalQuantity(transaction.maxFeePerBlobGas),
    blobVersionedHashes: transaction.blobVersionedHashes ?? null,
    data: transaction.input,
    value: BigInt(transaction.value),
    chainId: transaction.chainId === undefined ? 0n : BigInt(transaction.chainId),
    accessList: transaction.accessList ?? null,
    signature: { r: transaction.r, s: transaction.s, v: BigInt(parity) }
  }).fromPublicKey
}

/**
 * The 33-byte compressed secp256k1 public key of a transaction's sender,
 * recovered from its signature.
 *
 * @param transaction - The transaction as `eth_getTransactionByHash` reports it.
 * @returns The 0x-hex compressed key; `null` for an unsigned or undecodable
 *   transaction, or one whose recovered key does not derive its `from`.
 */
export function recoverSenderPubkey(transaction: RpcTransaction): string {
  const uncompressed = getValue(() => recoverSenderKey(transaction), null)
  if (!uncompressed) return null
  if (computeAddress(uncompressed).toLowerCase() !== transaction.from.toLowerCase()) return null
  return SigningKey.computePublicKey(uncompressed, true)
}

/** The actor an assertion credits, for the types whose actor signs the transaction itself. */
function actorOf(row: AssertionRow): string {
  return match(row.assertionType)
    .with(OppAssertionType.Stake, OppAssertionType.Unstake, () => row.args.staker)
    .with(OppAssertionType.LiqPretokenPurchase, () => row.args.purchaser)
    .otherwise(() => undefined)
}

/**
 * Recover the compressed public key of every staking actor that signed one of
 * the stream's transactions itself. For each `Stake`, `Unstake` and
 * `LiqPretokenPurchase` row the transaction is read and, when its sender IS
 * the actor, the sender's key is recorded under the actor's lowercase
 * address. An actor that only ever acted through a contract wallet gets no
 * entry. The result keys `computeBalances`' `pubkey` column.
 *
 * @param rpc - The node to read the transactions from.
 * @param rows - The decoded assertion rows.
 * @param options - Read concurrency and the diagnostic sink.
 * @returns Each recovered key, by lowercase actor address.
 */
export async function recoverActorPubkeys(
  rpc: JsonRpcClient,
  rows: readonly AssertionRow[],
  options: RecoverActorPubkeysOptions = {}
): Promise<Map<string, string>> {
  const {
      concurrency = OppConstants.DefaultConcurrency,
      warn = (message: string) => log.warn(message)
    } = options,
    hashesByActor = rows.reduce((byActor, row) => {
      const actor = actorOf(row)?.toLowerCase()
      if (actor) {
        if (!byActor.has(actor)) byActor.set(actor, new Set<string>())
        byActor.get(actor).add(row.txHash.toLowerCase())
      }
      return byActor
    }, new Map<string, Set<string>>()),
    pubkeys = new Map<string, string>(),
    transactions = new Map<string, Promise<RpcTransaction>>(),
    limit = pLimit(concurrency)

  /** Read a transaction once, however many actors' searches reach it. */
  const transactionOf = (hash: string): Promise<RpcTransaction> => {
    if (!transactions.has(hash)) {
      transactions.set(
        hash,
        limit(() =>
          rpc.getTransactionByHash(hash).catch(error => {
            warn(`pubkey recovery: eth_getTransactionByHash ${hash} failed: ${error}`)
            return null
          })
        )
      )
    }
    return transactions.get(hash)
  }

  /** The first of the actor's own transactions whose signature yields a key. */
  const recoverActor = async (actor: string, hashes: Set<string>): Promise<void> => {
    for (const hash of hashes) {
      const transaction = await transactionOf(hash)
      if (!transaction || transaction.from.toLowerCase() !== actor) continue
      const pubkey = recoverSenderPubkey(transaction)
      if (pubkey) {
        pubkeys.set(actor, pubkey)
        return
      }
    }
  }

  await Promise.all([...hashesByActor.entries()].map(([actor, hashes]) => recoverActor(actor, hashes)))
  return pubkeys
}
