# @wireio/sdk-core

TypeScript and JavaScript SDK for Wire: chain RPC, asset and key types,
serialization, transaction signing, and typed system-contract access. Ships ESM
and CommonJS builds with TypeScript declarations.

[npm](https://www.npmjs.com/package/@wireio/sdk-core) ·
[API reference](https://Wire-Network.github.io/sdk-core/) ·
[Tests and examples](https://github.com/Wire-Network/wire-libraries-ts/tree/master/packages/sdk-core/tests)

- [Installation](#installation)
- [Quick start](#quick-start)
- [System contracts](#system-contracts)
- [Depot swap quotes](#depot-swap-quotes)
- [Development](#development)

## Installation

```sh
npm install @wireio/sdk-core
```

## Quick start

Replace the URL with your selected Wire network's chain RPC endpoint. This
client can read chain state without a signer.

```ts
import { APIClient, contracts } from "@wireio/sdk-core"

const api = new APIClient({ url: "https://your-wire-rpc.example" })
const info = await api.v1.chain.get_info()
const sysio = contracts.sysio.createClient({ client: api })
const proposals = await sysio.msig.tables.proposal.query({ scope: "alice" })

console.log(info.chain_id.toString(), proposals.rows)
```

## System contracts

`contracts.sysio.createClient({ client })` exposes the generated
`SysioContractDefinitions` registry. Actions and tables are typed from
`SysioContracts.SysioContractMapping`. Use `sysio.<contract>` for a known
contract or
`sysio.getSysioContract(SysioContracts.SysioContractName.<contract>)` when
selecting one dynamically. Account overrides belong in the client's `contracts`
option; defaults use the standard system accounts.

### Prepare and submit actions

Using the client above, prepare an unsigned action with explicit authorization:

```ts
const approve = sysio.msig.actions.approve.prepare(
  {
    proposer: "alice",
    proposal_name: "upgrade1",
    level: { actor: "bob", permission: "active" }
  },
  { authorization: ["bob@active"] }
)
```

`prepare` returns an ABI-encoded `Action` when a local runtime codec or supplied
ABI can encode it, otherwise a typed `AnyAction` payload. `APIClient` resolves
the deployed ABI when that payload is pushed. To submit, configure the API
client's `signer`, then use `api.pushTransaction(approve)` or the action's
`invoke` method. Preparing an action does not sign or broadcast it.
Authorization defaults to empty and must be supplied for writes.

### Read state and use domain clients

`tables.<name>.query(options)` returns rows and pagination metadata; `first`
returns the first matching row or `null`. Set the correct scope and key bounds,
and follow pagination when reading a table rather than one exact key.

| API under `contracts.sysio`                              | Purpose                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `authex.AuthexClient`                                    | External-wallet links and proof creation                   |
| `msig.MsigClient`                                        | Multisig proposals and approval compatibility              |
| `chains.ChainsClient`                                    | Chain identity, activation and depot state                 |
| `tokens.TokenRegistryClient`                             | Canonical asset metadata                                   |
| Generated `opreg`, `synd`, `bond`, `liq`, `swap` proxies | Depot collateral, syndication, bonds, shadow LIQ and pools |

Use domain clients for workflow behavior and generated proxies for action/table
access. The chain registry describes protocol identity and activation; RPC URLs,
explorers, wallet adapters and application capabilities remain caller
configuration. The former external reserve and swap-underwriter clients are
removed.

For Wire KV table pagination, call `get_table_rows<string>(...)` and pass the
returned `next_key` unchanged as the next bound (`lower_bound` forward,
`upper_bound` in reverse). KV cursors are opaque JSON or encoded keys, not
numeric account names. Domain clients such as AuthEx use this same reader.

## Depot swap quotes

`contracts.sysio.swap.quoteSwap(options)` estimates one exact-input trade from
caller-supplied state. It performs no RPC, signing or action assembly. Supply a
generated `SysioContracts.SysioSwapCurrencyStatsType` pool row, an
`ExtendedAsset` input (`{ contract, quantity }`), and explicit integer
`slippageBps` from `0` to `9999`. The input's issuing contract and full symbol,
including precision, must match a pool leg.

The result's `grossOutput`, `fee`, `output`, `minimumOutput` and `accruedYield`
are extended assets with exact quantity strings. Fees are denominated in the
output token; `output` is net of fees. Pending and banked WIRE yield is added to
the WIRE reserve before pricing.

### Source revision

Arithmetic follows Wire SYSIO revision
[`a16738c488e8a821f06e1fa7d3188b98f4e35207`](https://github.com/Wire-Network/wire-sysio/tree/a16738c488e8a821f06e1fa7d3188b98f4e35207):
[`sysio.swap.cpp`](https://github.com/Wire-Network/wire-sysio/blob/a16738c488e8a821f06e1fa7d3188b98f4e35207/contracts/sysio.swap/sysio.swap.cpp)
(`process_exch`, `quote_out`, `accrue`, `owed_yield`) and
[`shadow_yield.hpp`](https://github.com/Wire-Network/wire-sysio/blob/a16738c488e8a821f06e1fa7d3188b98f4e35207/contracts/sysio.opp.common/include/sysio.opp.common/shadow_yield.hpp).
Check the deployed contracts against this revision before relying on parity.
Rounding is gross output floor → fee floor (minimum one output unit when both
rate and gross output are nonzero) → net output. Slippage tolerance is applied
after fees and the minimum output is floored.

### Obtain the quote state

Read all rows from the same selected depot and state snapshot. For a pool with a
`yield_leg`, both holder and index lookups are required:

| Input           | Table      | Contract (`code`)                            | Scope                          | Primary key                             |
| --------------- | ---------- | -------------------------------------------- | ------------------------------ | --------------------------------------- |
| `pool`          | `stat`     | Deployed swap account, normally `sysio.swap` | Swap account                   | LP token symbol code from `pool.supply` |
| `yield.account` | `accounts` | `pool.yield_leg.contract`                    | **Swap account**, not the user | Symbol code from `pool.yield_leg.sym`   |
| `yield.index`   | `yieldidx` | `pool.yield_leg.contract`                    | Yield-leg contract             | Same yield-leg symbol code              |

These KV tables use JSON key bounds, with `symbol_code` encoded as a decimal
string and an exclusive upper bound. The following continues the quick start and
illustrates exact-key lookups; choose the LP symbol and input from your
deployment:

```ts
import { Asset, SysioContracts } from "@wireio/sdk-core"

/** Selects exactly one symbol-code key, including when its row is absent. */
function symbolBounds(symbol: string) {
  const code = Asset.SymbolCode.from(symbol).value
  return {
    lower_bound: JSON.stringify({ symbol_code: code.toString() }),
    upper_bound: JSON.stringify({ symbol_code: code.adding(1).toString() }),
    limit: 1
  }
}

const pool = await sysio.swap.tables.stat.first<string>(symbolBounds("LIQETHP"))
if (!pool) throw new Error("Pool not found")

let yieldSnapshot: contracts.sysio.swap.SwapYieldSnapshot | undefined
if (pool.yield_leg) {
  const shadow = contracts.sysio.getSysioContract(
    SysioContracts.SysioContractName.liq,
    { client: api, contract: pool.yield_leg.contract }
  )
  const bounds = symbolBounds(Asset.Symbol.from(pool.yield_leg.sym).name)
  const account = await shadow.tables.accounts.first<string>({
    ...bounds,
    scope: sysio.swap.account.toString()
  })
  const index = await shadow.tables.yieldidx.first<string>(bounds)
  yieldSnapshot = { account, index }
}

const quote = contracts.sysio.swap.quoteSwap({
  pool,
  input: { contract: "sysio.liq", quantity: "1.000000000 LIQETH" },
  slippageBps: 50,
  yield: yieldSnapshot
})
console.log(quote.output, quote.minimumOutput)
```

- **Coherence:** ordinary live `get_table_rows` calls are separate reads, not an
  atomic or block-pinned snapshot. For a coherent quote, obtain these rows from
  a caller-provided indexed or snapshot view fixed to one block ID on one chain.
  With live RPC only, re-read the entire row set and retry if it changes; label
  the result indicative even when successive reads agree. Refresh before review
  and submission. The helper cannot verify state coherence or deployment
  identity.
- **Absent rows:** `first` returns `null` after a successful empty exact-key
  lookup. Pass that value explicitly as `yield.account` or `yield.index`; if
  both are verified absent, pass `yield: { account: null, index: null }`. Never
  turn a failed read into `null`, omit an unread row, or substitute a fabricated
  zero row. Only pools without `yield_leg` may omit `yield`. An absent holder or
  an absent/zero index contributes zero accrued yield, matching the pinned
  contract.
- **Holder balance:** use the swap contract's entire holding, including
  deposited LIQ, plus its `index_checkpoint` and `owed_wire`. Pool reserves
  alone are insufficient. Preserve large integer fields as decimal strings; do
  not convert them through JavaScript `Number`.

### Execution limits

This is a single-pair estimate, not execution readiness or guaranteed
settlement. The caller must check authority, Andon, custody coverage and output
delivery, reject zero output/minimum dust quotes, and enforce the minimum output
on-chain. Tolerance is caller policy, not a fee or validity guarantee. The
helper rejects unsafe numeric inputs, malformed values and overflow; it does not
model corrupt uint128 wraparound or multi-hop routing. Unit vectors cover
arithmetic; they do not establish live deployment parity.

### Liquidity provision and custody

`contracts.sysio.swap.quoteAddLiquidity` and `quoteRemoveLiquidity` estimate exact
LP share quantities from the same pool/yield snapshot. They preserve the
contract's ceil-rounded mint inputs, one-basis-point per-leg mint fee,
floor-rounded burn outputs and locked-share floor. Returned maximum inputs and
minimum outputs include explicit basis-point tolerance; values remain exact
asset strings with issuing contracts. They perform no RPC, signing or readiness
checks. See [depot liquidity](docs/depot-liquidity.md) for transaction composition,
internal-balance recovery and source references.

## Development

From a checkout of the repository, install dependencies and build at the root,
then run the SDK tests:

```sh
pnpm install
pnpm build
pnpm --dir packages/sdk-core test
```

See the
[repository guide](https://github.com/Wire-Network/wire-libraries-ts#readme) for
workspace requirements and publishing.

### Council SDK-to-chain integration

Council declarations and the ABI fixture come from
[wire-sysio #669](https://github.com/Wire-Network/wire-sysio/pull/669), commit
`0ab1185ec02be806efc2d03abcc10fec466c2411`, for WIRE-418's simultaneous rounds.

From the Libraries repository root, `scripts/test-council-live.mjs` starts a
disposable producing Wire node and tests the locally built candidate SDK over
HTTP RPC. It reads deployed council state, constructs and signs a generated SDK
ballot, submits it, and verifies the public ballot, tally, tier ballot counter,
elected member, and counter reset while preserving the winner in the next round.

Prerequisites are a compatible Linux `nodeop` with `sys-vm-jit`, matching rebuilt
`sysio.bios`, `sysio.roa`, `sysio.system`, and `sysio.councl` ABI/WASM files, generated
SDK declarations from the council ABI, and compiled platform
`BindConfigProvider.js` with its dependencies. Build the SDK and its CommonJS
exports before running:

```sh
pnpm --dir packages/sdk-core run compile
pnpm --dir packages/sdk-core run fix:hybrid:exports
WIRE_COUNCIL_NODEOP=/absolute/path/to/nodeop \
WIRE_COUNCIL_CONTRACTS=/absolute/path/to/wire-sysio/contracts \
WIRE_COUNCIL_BIND_PROVIDER=/absolute/path/to/wire-tools-ts/packages/cluster-tool/lib/cjs/config/BindConfigProvider.js \
WIRE_COUNCIL_RUN_DIRECTORY=/absolute/path/to/new-council-test-run \
node scripts/test-council-live.mjs
```

All four inputs are required; the run directory must not already exist. HTTP and
P2P ports come from the platform bind registry. The harness generates temporary
keys and bootstraps its own accounts; it does not accept an existing node endpoint.
It stops its node and removes the private key configuration on completion or
failure. The run directory retains `nodeop.log` and, on success, `result.json`
with the ballot transaction, result, and candidate SDK path. This verifies the
local contract/SDK boundary; it does not establish npm release availability or a
working Hub UI.

To check cleanup when `nodeop` cannot launch, use the same built SDK and bind
provider with a separate new run directory:

```sh
WIRE_COUNCIL_BIND_PROVIDER=/absolute/path/to/wire-tools-ts/packages/cluster-tool/lib/cjs/config/BindConfigProvider.js \
WIRE_COUNCIL_RUN_DIRECTORY=/absolute/path/to/new-council-startup-test \
node scripts/test-council-live-startup.mjs
```

This checks missing and non-executable binaries, preserves their diagnostics,
and verifies removal of the private signing configuration without starting a node.

The current node's JSON table responses represent ABI booleans as `0`/`1`, and
the SDK's generic JSON table query returns those values without ABI normalization.
The harness checks those exact integers, then independently reads the binary
ballot and decodes it with the deployed ABI to verify semantic booleans. It reads
the complete bounded flight set (at most 21 rows). The generic SDK query now
preserves opaque KV pagination cursors; this bounded integration check does not
exercise pagination.

## License

FSL-1.1-Apache-2.0
