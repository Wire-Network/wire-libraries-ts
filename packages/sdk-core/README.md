# @wireio/sdk-core

JavaScript library for working with Wire powered blockchains (formerly EOSIO, still compatible with EOSIO).

Available on npm: <https://www.npmjs.com/package/@wireio/sdk-core>

## Multisig

`contracts.sysio.msig` provides UI-neutral helpers for `sysio.msig` proposal workflows, including action builders, proposal reads, transaction decoding, hash verification, and legacy/chunked contract compatibility.

```ts
import { APIClient, contracts } from "@wireio/sdk-core"

const api = new APIClient({ url: "https://example-wire-rpc.invalid" })
const client = new contracts.sysio.msig.MsigClient({ client: api })
const detail = await client.getProposalDetail("alice", "upgrade1")
```

## Generated system-contract proxy

`contracts.sysio.createClient({ client })` exposes every contract in the
generated `SysioContractDefinitions` registry. Contract, action, and table
members are typed from `SysioContractMapping`, validated at runtime, and cached
after their first access. Its `actions.<name>.prepare/invoke` and
`tables.<name>.query` surface mirrors Wire Tools' `getSysioContract`. Use either
the concise root syntax or `getSysioContract` when the contract name is dynamic.

```ts
import { SysioContracts } from "@wireio/sdk-core"

const sysio = contracts.sysio.createClient({ client: api })
const msig = sysio.msig
const epoch = sysio.getSysioContract(SysioContracts.SysioContractName.epoch)

const approve = msig.actions.approve.prepare(
  {
    proposer: "alice",
    proposal_name: "upgrade1",
    level: { actor: "bob", permission: "active" },
    proposal_hash: null
  },
  { authorization: ["bob@active"] }
)
const proposals = await msig.tables.proposal.query({ scope: "alice" })

await epoch.actions.advance.invoke({}, { authorization: ["operator@active"] })
```

`prepare` returns an ABI-encoded `Action` when a local runtime codec or caller
ABI can encode the action. If synchronous encoding is unavailable or fails, it
returns the same generated data as a typed `AnyAction`; `APIClient` resolves the
deployed ABI when that payload is invoked or pushed. Authorization is empty by
default and must be supplied explicitly for writes.

The `AuthexClient`, `MsigClient`, and `ReserveClient` classes remain the public
domain facades for proof creation, proposal compatibility, reserve
normalization, and other workflow behavior. Each exposes `contractClient` for
lower-level generated action and table access without duplicating transport
logic.

The multisig module supports:

- unsigned action builders for `propose`, `approve`, `unapprove`, `cancel`, `exec`, `invalidate`, and read-only `getproposal`
- ABI-driven contract capability detection for `legacy`, `chunked-v2`, and `unknown` profiles
- proposal reads through legacy scoped tables, read-only `getproposal`, or chunk table fallback
- proposal transaction unpacking and action decoding
- packed proposal hash verification when the deployed contract exposes `trx_hash`
- approval-list status helpers for UI and service consumers

Native account authority multisig is separate from `sysio.msig` proposal workflows and remains modeled by the core authority types.

## AuthEx

`contracts.sysio.authex` provides UI-neutral helpers for `sysio.authex` external-wallet links. It includes typed action builders, `links` table reads, create-link message/signature preparation for EVM and Solana, and an `AuthexClient` that can build or push `createlink` actions when supplied a signed `APIClient`.

```ts
const authex = new contracts.sysio.authex.AuthexClient({ client: api })
const links = await authex.getLinks("alice")
```

Current wire-sysio nodes expose `links` as a KV table. `AuthexClient` uses the deployed named indexes and JSON bounds, unwraps KV rows through `ChainAPI`, normalizes generated enum-name responses, and treats compressed/uncompressed EM public-key renderings as the same external key.

## Chain registry

`contracts.sysio.chains` exposes the active Wire chain registry through the
same typed proxy used by the other system-contract facades. `ChainsClient`
normalizes packed chain codes, enum-name responses, lifecycle timestamps, and
depot state while preserving the generated row for lower-level consumers.

```ts
const chains = new contracts.sysio.chains.ChainsClient({ client: api })
const activeOutposts = await chains.listChains({
  activeOnly: true,
  includeDepot: false
})
```

The on-chain registry is authoritative for protocol identity and activation.
RPC URLs, explorers, icons, wallet adapters, and application capabilities stay
in the consuming application's runtime configuration.

## Reserves

`contracts.sysio.reserv` provides normalized reserve registry reads,
chain/token and status filters, exact reserve lookup, WIRE-side activation, and
read-only swap quotes. External-chain reserve creation and cancellation remain
in the chain SDK that owns the deployed ABI or IDL.

```ts
const reserves = new contracts.sysio.reserv.ReserveClient({ client: api })
const pending = await reserves.listReserves({
  status: SysioReservReservestatus.RESERVE_STATUS_PENDING
})

await reserves.pushMatchReserve({
  chainCode: "ETHEREUM",
  tokenCode: "ETH",
  reserveCode: "PRIMARY",
  matcher: "alice",
  wireAmount: pending[0].requestedWireAmount
})
```

## Reserve swaps

Reserve swap integrations compose three on-chain sources instead of carrying a
parallel token or route catalog:

- `contracts.sysio.tokens.TokenRegistryClient` reads canonical token metadata
  and active chain deployments.
- `contracts.sysio.reserv.ReserveClient` discovers active liquidity and returns
  live `swapquote` output for external or WIRE endpoints.
- `contracts.sysio.uwrit.UnderwritingClient` reads swap lifecycle state and
  submits WIRE-origin swaps into the next-epoch queue.

```ts
const tokens = new contracts.sysio.tokens.TokenRegistryClient({ client: api })
const reserves = new contracts.sysio.reserv.ReserveClient({ client: api })
const underwriting = new contracts.sysio.uwrit.UnderwritingClient({ client: api })

const assets = await tokens.listAssets()
const quote = await reserves.getSwapQuote({
  from: contracts.sysio.uwrit.WIRE_SWAP_ENDPOINT,
  fromAmount: 10_000_000_000n,
  to: { chainCode: "SOLANA", tokenCode: "SOL", reserveCode: "PRIMARY" }
})

await underwriting.pushSwapFromWire({
  user: "alice",
  wireAmount: 10_000_000_000n,
  destination: { chainCode: "SOLANA", tokenCode: "SOL", reserveCode: "PRIMARY" },
  targetAmount: quote,
  targetToleranceBps: 500,
  recipientKind: SysioUwritChainkind.CHAIN_KIND_SVM,
  recipientAddress: "<solana-public-key-bytes>"
})
```

External-origin swap submission remains in the chain SDK that owns the deployed
outpost ABI or IDL. A mined source transaction means the swap was submitted;
`uwreqs` remains the source of truth for relay, underwriting, settlement, and
revert status.

## Install

```sh
npm install @wireio/sdk-core
```

## API Documentation

- [API Documentation](https://Wire-Network.github.io/sdk-core/)

## Documentation

[Tests](https://github.com/Wire-Network/wire-libraries-ts/tree/master/packages/sdk-core/tests) provide good reference material on how to do nearly everything.

## Running Tests

```sh
npm test
```

## License

FSL-1.1-Apache-2.0
