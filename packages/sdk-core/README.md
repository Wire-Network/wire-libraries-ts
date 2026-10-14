# @wireio/sdk-core

JavaScript library for working with Wire powered blockchains (formerly EOSIO, still compatible with EOSIO).

Available on npm: <https://www.npmjs.com/package/@wireio/sdk-core>

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

## Generated system-contract proxy

`contracts.sysio.createClient({ client })` exposes every contract in the
generated `SysioContractDefinitions` registry. Contract, action, and table
members are typed from `SysioContractMapping`, validated at runtime, and cached
after their first access. Its `actions.<name>.prepare/invoke` and
`tables.<name>.query` surface mirrors Wire Tools' `getSysioContract`. Use either
the concise root syntax or `getSysioContract` when the contract name is dynamic.

The declarations are generated from the checked-in system ABIs at
[wire-sysio #639](https://github.com/Wire-Network/wire-sysio/pull/639), merge
`f3a887e0ddd76113a128510de72da1ee40c9973c`. Pay, returned collateral, and
DClaim balances do not expire. Andon exposes `pull({ reason })`,
`clear({ note })`, and `cord` with `pulled`, `when`, and `reason`. Configure its
native permissions separately and supply explicit action authorization when
preparing writes. There is no contract-managed panic/puller registry, and
syndication buckets no longer expose `frozen_mark`.

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

## Depot-native settlement

Use generated `sysio.opreg`, `sysio.synd`, `sysio.bond`, `sysio.liq` and
`sysio.swap` proxies for collateral, syndicated envelopes, bond resolution,
shadow LIQ and native pools. `TokenRegistryClient` supplies canonical asset
metadata. The external reserve and swap-underwriter clients have been removed.

## License

FSL-1.1-Apache-2.0
