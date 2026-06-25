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

System contract descriptors also feed a generic typed client factory. The current registry includes `sysio.msig`; future generated metadata can add the rest of the system contracts without changing the factory shape.

```ts
const msig = contracts.sysio.createClient({ client: api, name: "msig" })
const approve = msig.actions.approve(
  {
    proposer: "alice",
    proposal_name: "upgrade1",
    level: { actor: "bob", permission: "active" },
    proposal_hash: null
  },
  ["bob@active"]
)
const proposals = await msig.tables.proposal.rows({ scope: "alice" })
```

The multisig module supports:

- unsigned action builders for `propose`, `approve`, `unapprove`, `cancel`, `exec`, `invalidate`, and read-only `getproposal`
- ABI-driven contract capability detection for `legacy`, `chunked-v2`, and `unknown` profiles
- proposal reads through legacy scoped tables, read-only `getproposal`, or chunk table fallback
- proposal transaction unpacking and action decoding
- packed proposal hash verification when the deployed contract exposes `trx_hash`
- approval-list status helpers for UI and service consumers

Native account authority multisig is separate from `sysio.msig` proposal workflows and remains modeled by the core authority types.

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
