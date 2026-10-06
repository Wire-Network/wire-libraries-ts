# @wireio/sdk-core

JavaScript library for working with Wire powered blockchains (formerly EOSIO, still compatible with EOSIO).

The v1 account decoder accepts valid system-account responses that omit the
optional `created` timestamp.

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

The generated registry (`SysioContractName`) covers every depot contract
whose ABI the type generator read, including the syndication contract set:
`sysio.synd` (syndication ledger), `sysio.bond` (underwriting of provable
statements), `sysio.andon` (emergency stop), `sysio.liq` (shadow LIQ tokens and
WIRE yield index), `sysio.swap` (depot-local AMM), and `sysio.dclaim` (WIRE
claim ledger), alongside `sysio.msgch`, `sysio.epoch`, `sysio.opreg`,
`sysio.chalg`, `sysio.roa`, `sysio.authex`, `sysio.chains`, `sysio.tokens`,
`sysio.councl`, `sysio.wrap`, `sysio.msig`, `sysio.token`, and the system/bios
contracts. These contracts are reachable through typed `actions` and `tables`
on the proxy; most have no hand-written domain client.

The `AuthexClient`, `ChainsClient`, `MsigClient`, and `TokenRegistryClient`
classes are the hand-written domain facades for proof creation, registry
normalization, proposal compatibility, and other workflow behavior. Each
exposes `contractClient` for lower-level generated action and table access
without duplicating transport logic.

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

## Token registry

`contracts.sysio.tokens.TokenRegistryClient` reads canonical `sysio.tokens`
metadata and active chain deployments without a parallel token catalog.

```ts
const tokens = new contracts.sysio.tokens.TokenRegistryClient({ client: api })
const assets = await tokens.listAssets()
```

## Swaps

Swaps on WIRE are served by `sysio.swap`, a depot-local constant-product AMM in
which every pair's second leg is WIRE. Outposts do not participate and no OPP
attestation is involved. The SDK has no hand-written swap client; use the
generated proxy (`sysio.swap.actions.exchange`, `sysio.swap.tables.*`).

## Retired reserve and underwriting clients

`contracts.sysio.reserv` (`ReserveClient`, including `getSwapQuote` and
`pushMatchReserve(s)`) and `contracts.sysio.uwrit` (`UnderwritingClient`,
`WIRE_SWAP_ENDPOINT`, `pushSwapFromWire`), together with the `sysio.reserv` and
`sysio.uwrit` entries in the generated types, target depot contracts that have
been removed from the platform along with outpost-routed cross-chain swaps,
reserves, and the underwriter race. They remain exported only pending a
dedicated removal and do not work against a current depot. Do not build new
integrations on them. Underwriting of syndication envelopes now happens on
`sysio.bond`.

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
