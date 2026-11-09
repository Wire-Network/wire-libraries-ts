# Pool pricing and valuation

`contracts.sysio.swap` exposes two pure, synchronous helpers:

- `getPoolValuation`: yield-adjusted spot ratios, USD reserve values, TVL and LP-token value.
- `getPoolTwap`: independently time-weighted exchange rates in both directions.

They use the existing generated contract types, `Asset`/`UInt256` codecs and swap
accrual math. They do not fetch, poll, cache, sign, select a network/feed, or assume
a WIRE peg. This is additive; trade and liquidity quote behavior is unchanged.

## Which price should an application use?

| Use | Value | Meaning |
| --- | --- | --- |
| Swap review/signing | `quoteSwap` / liquidity quotes | Amount-specific output, fee/rounding and on-chain limits |
| Current pool indication | `getPoolValuation` ratios | Marginal price after pending pool yield accrues; excludes trading fees/impact |
| Smoothed pool indication | `getPoolTwap` | Historical recorded-reserve average over the supplied window |
| Portfolio / TVL / LP display | Explicit USD references + valuation | Indicative mark, not executable proceeds, redemption backing or guaranteed payout |

The reserve ratio determines a relative price, not a USD price. A LIQETH/WIRE
pool needs a LIQETH USD reference to imply WIRE USD. Shadow LIQ represents external
LIQ, not an independent dollar oracle: using ETH/SOL market prices directly is an
application valuation assumption, not a peg or conversion rule supplied by this SDK.

## Spot valuation

Obtain `SwapPoolSnapshot` as described in the [quote guide](../README.md#obtain-the-quote-state):
read `sysio.swap::stat`, plus the swap contract's full LIQ holder row and symbol
index for yield pools. Failed reads are errors, not verified absent rows. Keep
chain/contract identity, observation block/time and reference-feed time with the
snapshot in the consuming application.

```ts
import { contracts } from "@wireio/sdk-core"

// snapshot: contracts.sysio.swap.SwapPoolSnapshot, read from one selected chain.
const valuation = contracts.sysio.swap.getPoolValuation({
  ...snapshot,
  prices: [{
    token: { contract: "sysio.liq", sym: "9,LIQETH" },
    usd: "3000" // Example external reference, NOT a bundled feed or current price.
  }]
})

console.log(valuation.pool2.priceUsd) // Pool-implied USD per WIRE for LIQETH/WIRE.
console.log(valuation.pool2.priceSource) // "pool"; pool1's source is "reference".
console.log(valuation.tvlUsd, valuation.lpTokenUsd)
```

`prices` contains one or two positive decimal strings. References must match a
leg's issuing contract **and full symbol/precision**. Duplicate or unrelated
references are rejected. Either leg can anchor the other. With two references,
both USD prices are honored independently; the reserve ratios remain separately
visible. Thus Hub can use one selected WIRE mark consistently across all pools:

```ts
const marked = contracts.sysio.swap.getPoolValuation({
  ...snapshot,
  prices: [liqReference, wireReference] // Both match this pool's exact tokens.
})
```

For whole-token reserves `L` and `W`, and pending/banked WIRE yield `Y`:

- Effective WIRE reserve = `W + Y`.
- WIRE in LIQ = `L / (W + Y)`; LIQ in WIRE = `(W + Y) / L`.
- With LIQ USD reference `P`, pool-implied WIRE USD = `P × L / (W + Y)`.
- TVL = the sum of each effective reserve valued at its supplied/inferred USD price.
- LP token USD = TVL / total whole LP supply, **including locked shares**.

One reference makes each side equal in USD by construction: TVL is twice the
reference leg's value. That is a pool-implied mark, not independent confirmation
of WIRE's price. Two references can disagree with the reserve ratio.

Accrual reuses the quote helper's full swap-holder balance, including deposits,
to determine owed WIRE. Only recorded reserves plus that payout enter TVL. Internal
deposits, queued yield reservoirs, all circulating LIQ, and external backing are
not additional reserves. Do not double-count them. LP value is not a removal quote.

## Time-weighted prices without writes

The generated client already exposes `swap.tables.priceaccum`. Read it alongside
`stat` at the same state, retain the observation, then repeat after a real window:

```ts
const average = contracts.sysio.swap.getPoolTwap({
  start: earlierObservation,
  end: laterObservation
})
console.log(average.pool2InPool1, average.elapsedUs)
```

Each `PoolPriceObservation` contains:

- `chainId`: the full Wire chain ID;
- `pool`: the recorded `stat` row (including its swap issuer and LP symbol);
- `accumulator`: that pair's generated `priceaccum` row;
- `observedAt`: UTC **chain block time**, ABI `time_point` syntax, up to six fractional digits.

The helper verifies matching chain, issuer, LP symbol and both token identities;
requires a positive time window and nondecreasing raw accumulators; and rejects
invalid/empty projected intervals. It cannot prove that caller-supplied rows are
coherent or finalized. Prefer an indexed, block-pinned snapshot; with ordinary RPC reads, use the quote guide's bounded
re-read strategy and label the output indicative. Clear observations on a network
change/chain respin and use a consistent finality policy.

`priceaccum` stores Q64.64 atomic-unit ratios accumulated over microseconds in two
uint128 limbs. The helper reconstructs the uint256 values, extends each observation
from `last_update` to its chain time using its **recorded** reserves, subtracts,
divides by elapsed microseconds, and adjusts for token precision. Idle pools do
not require `sync` transactions. Never extend with browser time or with reserves
from a different snapshot.

Pending yield is **not** projected into historical prices. The contract closes the
old-price interval before settlement changes reserves. Each direction has its own
accumulator: the average of inverse prices is generally not the inverse average.
Multiplying a pool TWAP by today's ETH/SOL reference gives an anchored estimate,
**not** a historical USD TWAP; a historical USD average needs aligned reference
price observations too.

## TGE and consumer integration

1. Seed ratios/LCO tranche inputs are launch parameters, not a permanent market
   price. Replace any display-only `$1 WIRE` assumption explicitly. Never fall back
   to it silently after a feed/RPC failure, and never combine mainnet and test-chain marks.
2. Establish an approved reference mapping, freshness bounds and eligible pools
   in the application/API. Identify tokens by chain + issuer + symbol/precision,
   not by removing `LIQ` from a symbol or trusting arbitrary user-created pairs.
3. Fetch shared rows once per chain/refresh, reuse each shadow holder/index read,
   coalesce concurrent requests, and cache external feeds separately. A display
   refresh around 15–30 seconds plus invalidation after confirmed pool transactions
   is a reasonable starting policy; pause background polling when unused. This is
   consumer policy, not an SDK timer. Signing still requires a fresh trade quote.
4. Publish one selected WIRE mark with its source, chain, block/time, reference time,
   observation window and status. Before a TWAP window exists, explicitly label a
   spot estimate or show unavailable. Preserve last-known data as stale on failure.
5. Keep per-pool estimates visible. Select an approved sufficiently liquid pool
   initially, or explicitly configure aggregation across approved pools. If using
   WIRE-depth weights, weight by WIRE quantities, not TVL calculated from the same
   derived WIRE price. Exclude stale/empty inputs and surface disagreement; do not
   present an arbitrary weighted mean as a protocol-authoritative oracle.
6. Use that selected WIRE reference with each LIQ reference for consistent TVL/LP
   marks, and the same price stream for portfolio/amount previews. Do not treat spot
   or short-window TWAP as safe collateral/liquidation input: shallow launch pools
   can be moved, and a longer average adds lag rather than guaranteeing safety.

No contract changes or privileged writes are needed for these calculations on a
deployment exposing the documented tables. A persistent API observation cache is
needed if applications require a warm TWAP immediately after startup. Missing
accumulator rows or an insufficient window must remain unavailable, not synthetic history.

## Precision, validation and source parity

Intermediate amounts and ratios use bigint; public USD/rate outputs are decimal
strings, floored once at the existing `UInt256` 18-decimal display boundary. Values
below that resolution render as `"0"`; do not treat this as a literal zero reserve
or use display outputs for execution. Reference prices must fit `UInt256`, be
positive and have at most 18 fractional digits. No implicit number conversion,
network request or input mutation occurs. Zero reserves/supply and bad references
throw rather than producing `Infinity`, a fabricated zero price or a fallback peg.

Valuation reuses the pinned quote/yield implementation. TWAP follows Sysio
[`3691514cad3d7c4304b648d87c1bf78326ab361f`](https://github.com/Wire-Network/wire-sysio/tree/3691514cad3d7c4304b648d87c1bf78326ab361f):
[`twap.hpp`](https://github.com/Wire-Network/wire-sysio/blob/3691514cad3d7c4304b648d87c1bf78326ab361f/contracts/sysio.opp.common/include/sysio.opp.common/twap.hpp),
[`swap_state.hpp`](https://github.com/Wire-Network/wire-sysio/blob/3691514cad3d7c4304b648d87c1bf78326ab361f/contracts/sysio.opp.common/include/sysio.opp.common/swap_state.hpp),
and `sysio.swap::update_price_accumulators` / `accrue`. The SDK rejects regressing
accumulators instead of accepting a reset/reorg as unsigned wraparound. Verify the
deployed ABI/math when adopting a different platform release.

Tests cover one/two reference prices, either anchor, mixed precisions, yield parity,
large amounts, independent rounding, immutable inputs, chain/pair mismatches, idle
projection, changed-price windows, microseconds, limb carry and invalid observations.
