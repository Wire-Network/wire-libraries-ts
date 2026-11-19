import { match } from "ts-pattern"

import { OppAssertionType } from "./OppAssertionType.js"
import { OppConstants } from "./OppConstants.js"
import type {
  AssertionRow,
  BalanceOutput,
  OppSnapshot,
  PurchaserOutput,
  PurchaserState,
  StakerOutput,
  StakerState
} from "./OppTypes.js"

/** The string the API reports for the columns the snapshot does not carry. */
const ZeroAmount = "0"

/**
 * The order balances must be replayed in: block, then log, then position within the message.
 *
 * @param rows - The decoded rows, in any order.
 * @returns A sorted copy.
 */
export function sortAssertionRows<T extends AssertionRow>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      left.blockNumber - right.blockNumber ||
      left.logIndex - right.logIndex ||
      left.assertionIndex - right.assertionIndex
  )
}

/** The rows of each message, in stream order: consecutive rows of one `(txHash, logIndex)`. */
function groupByMessage(rows: readonly AssertionRow[]): AssertionRow[][] {
  const messageKey = (row: AssertionRow) => `${row.txHash}:${row.logIndex}`
  return rows.reduce<AssertionRow[][]>((messages, row, index) => {
    if (index > 0 && messageKey(rows[index - 1]) === messageKey(row)) {
      messages[messages.length - 1].push(row)
    } else {
      messages.push([row])
    }
    return messages
  }, [])
}

/** The value stored under `key`, created by `create` on first use. */
function getOrCreate<T>(states: Map<string, T>, key: string, create: () => T): T {
  if (!states.has(key)) states.set(key, create())
  return states.get(key)
}

/** A staker with nothing staked. */
function newStakerState(): StakerState {
  return { totalShares: 0n, totalPrincipalIn: 0n, totalAmountOut: 0n, yieldClaimed: 0n }
}

/** A purchaser with nothing bought. */
function newPurchaserState(): PurchaserState {
  return { pretokens: 0n, liqShares: 0n, liqPrincipalIn: 0n, yieldClaimed: 0n }
}

/**
 * Replay ordered OPP assertions into per-address staker and purchaser balances.
 *
 * Rows MUST be sorted by block, log and assertion position — see
 * {@link sortAssertionRows}. A `YieldPretokenPurchase` distributes the
 * pretokens of the `PretokenPurchase` in its own message pro rata over every
 * staker's net principal and every purchaser's liqETH principal; a
 * `PretokenPurchase` so paired credits no buyer.
 *
 * @param rows - The sorted assertion rows.
 * @param pubkeys - Each staker's recovered compressed public key, by lowercase address (see `recoverActorPubkeys`); a staker without an entry carries `pubkey: null`.
 * @returns The balances, keyed by lowercase address.
 */
export function computeBalances(
  rows: readonly AssertionRow[],
  pubkeys: ReadonlyMap<string, string> = new Map()
): BalanceOutput {
  const stakers = new Map<string, StakerState>(),
    purchasers = new Map<string, PurchaserState>(),
    stakerOf = (address: string) => getOrCreate(stakers, address.toLowerCase(), newStakerState),
    purchaserOf = (address: string) =>
      getOrCreate(purchasers, address.toLowerCase(), newPurchaserState),
    messages = groupByMessage(rows),
    yieldDust = 0n
  let latestIndex = OppConstants.IndexPrecision,
    lastMessageId = "",
    lastTimestamp = "",
    totalPrincipal = 0n

  const recordIndex = (index: bigint) => {
    if (index > 0n) latestIndex = index
  }

  /** Distribute a paired purchase's pretokens over every principal holder. */
  const distributeYield = (pretokens: bigint) => {
    const scaledPretokens = pretokens * OppConstants.YieldPrecision
    stakers.forEach(state => {
      const netPrincipal = state.totalPrincipalIn - state.totalAmountOut
      if (netPrincipal > 0n) state.yieldClaimed += (netPrincipal * scaledPretokens) / totalPrincipal
    })
    purchasers.forEach(state => {
      if (state.liqPrincipalIn > 0n) {
        state.yieldClaimed += (state.liqPrincipalIn * scaledPretokens) / totalPrincipal
      }
    })
  }

  messages.forEach(message => {
    const [first] = message,
      types = message.map(row => row.assertionType)
    lastMessageId = first.messageId
    lastTimestamp = first.messageTimestamp.toString()

    message.forEach(({ assertionType, args }) =>
      match(assertionType)
        .with(OppAssertionType.Stake, () => {
          const staker = stakerOf(args.staker),
            principal = BigInt(args.principal)
          staker.totalShares += BigInt(args.shares)
          staker.totalPrincipalIn += principal
          totalPrincipal += principal
          recordIndex(BigInt(args.index))
        })
        .with(OppAssertionType.Unstake, () => {
          const staker = stakerOf(args.staker),
            amount = BigInt(args.amount)
          staker.totalShares -= BigInt(args.shares)
          staker.totalAmountOut += amount
          totalPrincipal -= amount
          recordIndex(BigInt(args.index))
        })
        .with(OppAssertionType.LiqPretokenPurchase, () => {
          const purchaser = purchaserOf(args.purchaser),
            principal = BigInt(args.principal)
          purchaser.liqShares += BigInt(args.shares)
          purchaser.liqPrincipalIn += principal
          totalPrincipal += principal
          recordIndex(BigInt(args.index))
        })
        .with(OppAssertionType.PretokenPurchase, () => {
          if (!types.includes(OppAssertionType.YieldPretokenPurchase)) {
            purchaserOf(args.buyer).pretokens += BigInt(args.pretokensOut)
          }
        })
        .with(OppAssertionType.YieldPretokenPurchase, () => {
          const paired = message.find(row => row.assertionType === OppAssertionType.PretokenPurchase)
          if (paired && totalPrincipal > 0n) distributeYield(BigInt(paired.args.pretokensOut))
          recordIndex(BigInt(args.index))
        })
        .otherwise(() => undefined)
    )
  })

  const stakerOutputs: Record<string, StakerOutput> = Object.fromEntries(
      [...stakers.entries()]
        .filter(([, state]) => state.totalShares !== 0n || state.yieldClaimed !== 0n)
        .map(([address, state]) => [
          address,
          {
            principal: (state.totalPrincipalIn - state.totalAmountOut).toString(),
            shares: state.totalShares.toString(),
            pretokenYield: (state.yieldClaimed / OppConstants.YieldPrecision).toString(),
            // A served column: a staker without a recovered key reports null, not a missing key.
            pubkey: pubkeys.get(address) ?? null
          }
        ])
    ),
    purchaserOutputs: Record<string, PurchaserOutput> = Object.fromEntries(
      [...purchasers.entries()]
        .filter(
          ([, state]) =>
            state.pretokens !== 0n || state.liqShares !== 0n || state.yieldClaimed !== 0n
        )
        .map(([address, state]) => {
          const earned = state.yieldClaimed / OppConstants.YieldPrecision
          return [
            address,
            {
              pretokens: state.pretokens.toString(),
              shares: state.liqShares.toString(),
              principal: state.liqPrincipalIn.toString(),
              yield: earned.toString(),
              totalPretokens: (state.pretokens + earned).toString()
            }
          ]
        })
    ),
    sumOf = (amounts: string[]) => amounts.reduce((sum, amount) => sum + BigInt(amount), 0n)

  return {
    stakers: stakerOutputs,
    purchasers: purchaserOutputs,
    metadata: {
      lastMessageId,
      lastTimestamp,
      latestIndex: latestIndex.toString(),
      totalMessages: messages.length,
      generatedAt: new Date().toISOString(),
      yieldDust: yieldDust.toString(),
      totalLiqEthStaked: sumOf(Object.values(stakerOutputs).map(staker => staker.principal)).toString(),
      totalLiqEthPurchased: sumOf(
        Object.values(purchaserOutputs).map(purchaser => purchaser.principal)
      ).toString()
    }
  }
}

/**
 * Project a {@link BalanceOutput} onto the row shapes the indexer stores and
 * the `/opp/balances` API returns, so a node-built snapshot and a service
 * response read identically to their consumers.
 *
 * @param output - The computed balances.
 * @returns The `/opp/balances` shape.
 */
export function toSnapshot(output: BalanceOutput): OppSnapshot {
  return {
    stakers: Object.entries(output.stakers).map(([address, staker]) => ({
      address,
      pubkey: staker.pubkey,
      totalShares: staker.shares,
      totalPrincipalIn: staker.principal,
      totalAmountOut: ZeroAmount,
      netPrincipal: staker.principal,
      yieldClaimed: ZeroAmount,
      pretokenYield: staker.pretokenYield
    })),
    purchasers: Object.entries(output.purchasers).map(([address, purchaser]) => ({
      address,
      pretokens: purchaser.pretokens,
      liqShares: purchaser.shares,
      liqPrincipalIn: purchaser.principal,
      yieldClaimed: ZeroAmount,
      pretokenYield: purchaser.yield,
      totalPretokens: purchaser.totalPretokens
    })),
    metadata: {
      lastMessageId: output.metadata.lastMessageId,
      lastTimestamp: output.metadata.lastTimestamp,
      latestIndex: output.metadata.latestIndex,
      totalMessages: output.metadata.totalMessages,
      totalPrincipal: output.metadata.totalLiqEthStaked,
      yieldDust: output.metadata.yieldDust,
      totalLiqEthStaked: output.metadata.totalLiqEthStaked,
      totalLiqEthPurchased: output.metadata.totalLiqEthPurchased,
      generatedAt: output.metadata.generatedAt
    }
  }
}
