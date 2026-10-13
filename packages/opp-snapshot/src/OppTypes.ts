import type { OppAssertionType } from "./OppAssertionType.js"

/** A diagnostic sink the library reports recoverable decode and RPC problems to. */
export type OppWarn = (message: string) => void

/** A raw Ethereum log, as an RPC node or a webhook delivers it. */
export interface RawLog {
  /** The emitting contract. */
  address: string
  /** The log's topics, `topic0` first. */
  topics: string[]
  /** The ABI-encoded, non-indexed event data. */
  data: string
  /** The block, as a number or as the node's 0x-hex quantity. */
  blockNumber: number | string
  /** The emitting transaction. */
  transactionHash: string
  /** The log's position in its block, as a number or a 0x-hex quantity. */
  logIndex: number | string
  /** The block's unix timestamp, when it was fetched. */
  blockTimestamp?: number
}

/**
 * One decoded assertion, positioned within its message and block: the unit
 * balances are computed from. The field names are the indexer's stored
 * column names.
 */
export interface AssertionRow {
  /** The emitting transaction. */
  txHash: string
  /** The block the message was emitted in. */
  blockNumber: number
  /** The block's unix timestamp; `null` when it was not fetched. */
  blockTime: number
  /** The message's log position within the block. */
  logIndex: number
  /** The message header's id. */
  messageId: string
  /** The id of the message this one chains from. */
  previousMessageId: string
  /** The message header's timestamp. */
  messageTimestamp: bigint
  /** The assertion's position within its message. */
  assertionIndex: number
  /** The assertion's type tag. */
  assertionType: OppAssertionType
  /** The decoded arguments, keyed by their schema names, every value a decimal or 0x-hex string. */
  args: Record<string, string>
}

/** A decoded OPP message header. */
export interface DecodedOppHeader {
  /** The message id. */
  messageId: string
  /** The id of the previous message in the chain. */
  previousMessageId: string
  /** The hash of the message payload. */
  payloadHash: string
  /** The message timestamp. */
  timestamp: bigint
}

/** A single decoded assertion. */
export interface DecodedAssertion {
  /** The assertion's type tag. */
  assertionType: OppAssertionType
  /** The decoded arguments, keyed by their schema names. */
  args: Record<string, string>
}

/** A decoded OPP message: its header and assertions. */
export interface DecodedOppMessage {
  /** The message header. */
  header: DecodedOppHeader
  /** The payload's protocol version. */
  protocolVersion: number
  /** The payload's encoding flags. */
  encodingFlags: number
  /** The assertions the decoder understood, in message order. */
  assertions: DecodedAssertion[]
}

/** A staker's running state while balances are replayed. */
export interface StakerState {
  /** liqETH shares staked. */
  totalShares: bigint
  /** Principal staked in. */
  totalPrincipalIn: bigint
  /** Principal unstaked out. */
  totalAmountOut: bigint
  /** Pretoken yield credited, scaled by `OppConstants.YieldPrecision`. */
  yieldClaimed: bigint
}

/** A purchaser's running state while balances are replayed. */
export interface PurchaserState {
  /** Pretokens bought directly. */
  pretokens: bigint
  /** liqETH shares spent on pretokens. */
  liqShares: bigint
  /** liqETH principal spent on pretokens. */
  liqPrincipalIn: bigint
  /** Pretoken yield credited, scaled by `OppConstants.YieldPrecision`. */
  yieldClaimed: bigint
}

/** A staker's computed balance. */
export interface StakerOutput {
  /** Net principal staked. */
  principal: string
  /** liqETH shares staked. */
  shares: string
  /** Pretoken yield earned. */
  pretokenYield: string
  /**
   * The staker's 33-byte compressed secp256k1 public key as 0x-hex, recovered
   * from a transaction the staker signed; `null` when no signed transaction
   * of theirs is in the stream (a contract wallet, for instance). The depot's
   * syndication import is keyed by this, not by the address.
   */
  pubkey: string
}

/** A purchaser's computed balance. */
export interface PurchaserOutput {
  /** Pretokens bought directly. */
  pretokens: string
  /** liqETH shares spent on pretokens. */
  shares: string
  /** liqETH principal spent on pretokens. */
  principal: string
  /** Pretoken yield earned. */
  yield: string
  /** Pretokens bought plus pretoken yield. */
  totalPretokens: string
}

/** What a balance computation records about the stream it replayed. */
export interface BalanceMetadata {
  /** The last message replayed. */
  lastMessageId: string
  /** The last message's timestamp. */
  lastTimestamp: string
  /** The last liqETH index the stream carried. */
  latestIndex: string
  /** Messages replayed. */
  totalMessages: number
  /** When the computation ran (ISO-8601). */
  generatedAt: string
  /** Yield lost to flooring; always zero today. */
  yieldDust: string
  /** Net principal across every staker. */
  totalLiqEthStaked: string
  /** liqETH principal across every purchaser. */
  totalLiqEthPurchased: string
}

/** A full balance computation, keyed by lowercase address. */
export interface BalanceOutput {
  /** Stakers with a position. */
  stakers: Record<string, StakerOutput>
  /** Purchasers with a position. */
  purchasers: Record<string, PurchaserOutput>
  /** What the computation replayed. */
  metadata: BalanceMetadata
}

/** A staker row as the indexer stores it and the `/opp/balances` API returns it. */
export interface OppStakerRow {
  /** The staker's lowercase address. */
  address: string
  /** The recovered compressed public key; `null` when none was recovered. */
  pubkey: string
  /** liqETH shares staked. */
  totalShares: string
  /** Net principal (the indexer stores net principal here). */
  totalPrincipalIn: string
  /** Always `"0"`: the net principal already accounts for it. */
  totalAmountOut: string
  /** Net principal staked. */
  netPrincipal: string
  /** Always `"0"`: the scaled accumulator is not exposed. */
  yieldClaimed: string
  /** Pretoken yield earned. */
  pretokenYield: string
}

/** A purchaser row as the indexer stores it and the `/opp/balances` API returns it. */
export interface OppPurchaserRow {
  /** The purchaser's lowercase address. */
  address: string
  /** Pretokens bought directly. */
  pretokens: string
  /** liqETH shares spent on pretokens. */
  liqShares: string
  /** liqETH principal spent on pretokens. */
  liqPrincipalIn: string
  /** Always `"0"`: the scaled accumulator is not exposed. */
  yieldClaimed: string
  /** Pretoken yield earned. */
  pretokenYield: string
  /** Pretokens bought plus pretoken yield. */
  totalPretokens: string
}

/** The metadata row as the indexer stores it and the `/opp/balances` API returns it. */
export interface OppMetadataRow {
  /** The last message replayed. */
  lastMessageId: string
  /** The last message's timestamp. */
  lastTimestamp: string
  /** The last liqETH index the stream carried. */
  latestIndex: string
  /** Messages replayed. */
  totalMessages: number
  /** Net principal across every staker. */
  totalPrincipal: string
  /** Yield lost to flooring. */
  yieldDust: string
  /** Net principal across every staker. */
  totalLiqEthStaked: string
  /** liqETH principal across every purchaser. */
  totalLiqEthPurchased: string
  /** When the computation ran (ISO-8601). */
  generatedAt: string
}

/**
 * The `/opp/balances` response shape: what `sysio.dclaim`'s
 * `convert_import.py` and the wire-tools-ts seed converters consume, produced
 * identically by the indexer (from its database) and by `buildOppSnapshot`
 * (from a node).
 */
export interface OppSnapshot {
  /** Every staker with a position. */
  stakers: OppStakerRow[]
  /** Every purchaser with a position. */
  purchasers: OppPurchaserRow[]
  /** What the snapshot replayed. */
  metadata: OppMetadataRow
}
