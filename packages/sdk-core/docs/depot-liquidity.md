# Depot liquidity

Use `contracts.sysio.createClient` for the generated `swap` action/table surface.
The SDK already exposes `stat`, LP `accounts`, internal `evodexacnts`, config,
reservoir and price-accumulator reads, plus exchange, liquidity and custody actions.
Do not create a parallel AMM client or use retired external reserve APIs.

## Quotes

Use `quoteSwap` for an exact-input trade, `quoteAddLiquidity` for an exact LP
share mint, and `quoteRemoveLiquidity` for an exact share burn. All require a
caller-owned coherent pool snapshot and explicit slippage basis points. Yield
pools also require the swap contract's **whole** shadow holder row and symbol
index, including verified absence. Accrue pending/banked WIRE before pricing.
Different token precisions are preserved. Zero/dust estimates are possible;
the UI must not offer a zero-output trade as a useful swap.

Mint quotes ceil each proportional leg, then ceil the 1-bps liquidity fee on
that leg. Burn quotes floor each output and enforce the nonempty/locked supply
floor. Maxima round up; minima round down. The caller still checks LP ownership,
wallet/internal balances, token identities, current ABI, authority and Andon.
A snapshot estimate is never proof of execution readiness or a guaranteed price.

## Submission and custody

- **Direct wallet swap:** transfer the exact input from its issuing token contract
  to the swap account with `exchange:PAIR,MINIMUM_ASSET` (optional third memo).
  The contract sends the output directly to the same sender. Use the returned
  minimum output's exact symbol/precision. No multi-hop route is inferred.
- **Internal swap:** `openext` each needed token, transfer input to the swap,
  then `exchange`. Output credits internal custody. Follow with `withdraw` for a
  reviewed amount, or `closeext` to return and close the whole deposit row.
- **Add liquidity:** open both exact extended-symbol deposit rows, transfer the
  reviewed input maxima, then `addliquidity` with exact shares and maxima. The
  actual debit follows live pool state; unspent maxima stay in internal custody.
- **Remove liquidity:** `remliquidity` burns owned LP shares and credits both
  internal deposits. Open both rows first if absent. Withdrawal is a distinct
  action, not an implied wallet payout. Do not claim a stale quoted output is
  the actual result; reconcile exact balances and source transaction evidence.

Prepare actions through existing typed `.actions.<name>.prepare(data, options)`
and submit one action array through APIClient when atomicity is appropriate.
Token transfers use the leg's real issuing contract, not its display symbol.
Never close a preexisting deposit row without the user's explicit intent to
withdraw its **entire** balance. Refresh before signing, enforce on-chain bounds,
save signed IDs before broadcast, reconcile irreversibility and never replay an
uncertain transaction automatically. Pool creation, fee governance, reservoir
funding/cranks and bootstrap liquidity are separate privileged operations.

Sources: [swap actions](https://github.com/Wire-Network/wire-sysio/blob/master/contracts/sysio.swap/sysio.swap.cpp),
[pool accounting](https://github.com/Wire-Network/wire-sysio/blob/master/contracts/sysio.swap/include/sysio.swap/sysio.swap.hpp),
[integer share rounding](https://github.com/Wire-Network/wire-sysio/blob/master/contracts/sysio.opp.common/include/sysio.opp.common/amm_math.hpp),
[canonical yield flow](https://github.com/Wire-Network/wire-tools-ts/blob/master/packages/flow-liq-yield/src/LIQYieldScenario.ts).
