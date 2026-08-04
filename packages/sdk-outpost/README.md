# `@wireio/sdk-outpost`

Strictly typed access to the Ethereum contracts and Solana programs deployed
alongside a Wire chain.

`@wireio/sdk-core` owns Wire-chain identity, signing, and `sysio.*` workflows.
This package owns verified external-chain clients. Contract ABIs are published
by `wire-ethereum`, the Solana IDL is published by `wire-solana`, and runtime
deployment data remains caller-supplied.

Available on npm: <https://www.npmjs.com/package/@wireio/sdk-outpost>

## Install

```sh
npm install @wireio/sdk-outpost
```

Node.js 22 or newer is supported. The package publishes CommonJS and native ES
module entrypoints with TypeScript declarations.

## Supported surfaces

| Family   | Generated clients                                         |
| -------- | --------------------------------------------------------- |
| Ethereum | `OPP`, `OPPInbound`, `OperatorRegistry`, `ReserveManager` |
| Solana   | `liqsol_core`                                             |

Client creation verifies all three boundaries before returning:

- the supplied deployment digests match the ABI/IDL packages compiled into this
  SDK release;
- the provider is connected to the expected external chain;
- every configured contract has bytecode and every configured Solana program is
  executable.

These checks prove deployment compatibility, not end-to-end feature readiness.
Applications must still gate swaps, staking, settlement, retry, funding, and
underwriting using platform capability evidence.

## Runtime deployment data

The SDK does not contain a network catalog. Resolve the selected Wire network
group in the application, load its deployment document from the platform
manifest pipeline, and validate that untrusted input with
`parseOutpostDeployment`.

A deployment document carries:

- the full parent Wire chain ID;
- the Ethereum chain ID and deployed contract addresses;
- the Solana genesis hash and deployed program addresses;
- platform and source provenance;
- deployment and interface digests used for compatibility checks.

RPC URLs, private keys, wallet state, and mutable capability results are not SDK
data. A cluster respin updates the runtime deployment document without requiring
an SDK or interface-package release when the underlying ABI and IDL are
unchanged.

## Usage

Validate caller-owned deployment data and provide the matching external-chain
provider:

```ts
import { providers } from "ethers"

import {
  EthereumContractName,
  OutpostChainFamily,
  OutpostClient,
  parseOutpostDeployment
} from "@wireio/sdk-outpost"

const deployment = parseOutpostDeployment(clusterManifest.outpost)
const ethereum = await OutpostClient.create({
  family: OutpostChainFamily.ethereum,
  options: {
    deployment,
    connection: new providers.JsonRpcProvider(ethereumRpcUrl)
  }
})
const reserves = ethereum.contract(EthereumContractName.ReserveManager)
```

Solana uses the same facade and returns the precise Anchor program type at the
runtime program address:

```ts
import {
  OutpostChainFamily,
  OutpostClient,
  SolanaProgramName
} from "@wireio/sdk-outpost"

const solana = await OutpostClient.create({
  family: OutpostChainFamily.solana,
  options: { deployment, provider: anchorProvider }
})
const liqsol = solana.program(SolanaProgramName.liqsolCore)
```

## Artifact ownership

`@wireio/outpost-ethereum-artifacts` and `@wireio/outpost-solana-artifacts` are
build-time inputs. Their exact manifests are compiled into
`OutpostArtifactManifests` for deployment compatibility and readiness reporting.
Generated TypeChain and Anchor sources are ignored local build outputs; they are
compiled into the published package and are never maintained by hand in this
repository.

## Consumer boundaries

- Use this package for typed external `ReserveManager`, `OperatorRegistry`,
  `OPP`, `OPPInbound`, and `liqsol_core` access.
- Use `@wireio/sdk-core` for Wire transaction construction, reserve and token
  registries, underwriting state, and settlement correlation.
- Rebuild external clients whenever the selected Wire network group changes.
- Combine SDK deployment verification with flow-specific capability gates before
  enabling a product action.

## Maintainer commands

```sh
pnpm --dir packages/sdk-outpost run generate
pnpm --dir packages/sdk-outpost run test
pnpm --dir packages/sdk-outpost run verify:release
pnpm --dir packages/sdk-outpost pack --dry-run
```

Release versions are managed by the monorepo-wide patch workflow. See
[`RELEASING.md`](RELEASING.md) for artifact prerequisites and the verification
checklist.

## License

FSL-1.1-Apache-2.0
