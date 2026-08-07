# `@wireio/sdk-outpost`

Strictly typed access to the Ethereum contracts and Solana programs deployed
alongside a Wire chain.

`@wireio/sdk-core` owns Wire-chain identity, signing, and `sysio.*` workflows.
This package owns verified external-chain clients. Contract ABIs are published
by `wire-ethereum`, the Solana IDL is published by `wire-solana`, and immutable
deployment profiles remain caller-supplied.

Available on npm: <https://www.npmjs.com/package/@wireio/sdk-outpost>

## Install

```sh
npm install @wireio/sdk-outpost
```

Node.js 22 or newer is supported. The package publishes CommonJS and native ES
module entrypoints with TypeScript declarations.

## Supported surfaces

| Family   | Generated clients and workflows                                          |
| -------- | ------------------------------------------------------------------------ |
| Ethereum | `OPP`, `OPPInbound`, `OperatorRegistry`, `ReserveManager`, reserve swaps |
| Solana   | `liqsol_core`, native SOL and classic SPL reserve swaps                  |

Client creation verifies all four boundaries before returning:

- the supplied ABI/IDL digests match the producer packages compiled into this
  SDK release;
- the provider is connected to the expected external chain;
- every Ethereum proxy resolves through its EIP-1967 implementation slot to the
  configured implementation address and exact implementation code hash;
- every Solana program resolves through the upgradeable loader to the configured
  ProgramData account and exact ProgramData hash.

These checks prove deployment compatibility, not end-to-end feature readiness.
Applications must still gate swaps, staking, settlement, retry, funding, and
underwriting using platform capability evidence.

## Deployment profiles

The SDK does not contain a mutable network or endpoint catalog. Resolve the
selected Wire network group in the application, load its immutable deployment
profile from the platform release/deployment pipeline, and validate that
untrusted input with `parseOutpostDeploymentProfile`.

A deployment profile carries:

- the full parent Wire chain ID;
- one deployment checksum and deployment-checksum-derived profile ID;
- the Ethereum chain ID, proxy addresses, implementation addresses, ABI hashes,
  and exact live implementation code hashes;
- the Solana genesis hash, program and ProgramData addresses, IDL hash, and
  exact live ProgramData hash.

RPC URLs, private keys, wallet state, and mutable capability results are not SDK
data. Keep mutable RPC/explorer endpoints in a separate catalog that points to a
deployment-profile ID. A cluster respin with the same deployable code creates a
new profile without requiring a producer-artifact or SDK release.

| Change                                                  | Producer artifact release | `sdk-outpost` release | Deployment profile                        |
| ------------------------------------------------------- | ------------------------- | --------------------- | ----------------------------------------- |
| Same-code chain respin                                  | No                        | No                    | New                                       |
| Contract/program binary change with unchanged ABI/IDL   | Yes                       | No                    | New                                       |
| ABI or IDL change                                       | Yes                       | Yes                   | New                                       |
| Asset/reserve onboarding without code/interface changes | No                        | No                    | Update operational configuration/evidence |
| RPC or explorer rotation                                | No                        | No                    | Update endpoint catalog only              |

## Usage

Validate caller-owned deployment data and provide the matching external-chain
provider:

```ts
import { providers } from "ethers"

import {
  EthereumContractName,
  OutpostChainFamily,
  OutpostClient,
  parseOutpostDeploymentProfile
} from "@wireio/sdk-outpost"

const profile = parseOutpostDeploymentProfile(platformRelease.outpostProfile)
const ethereum = await OutpostClient.create({
  family: OutpostChainFamily.ethereum,
  options: {
    profile,
    connection: new providers.JsonRpcProvider(ethereumRpcUrl)
  }
})
const reserves = ethereum.contract(EthereumContractName.ReserveManager)
```

Wallet-connected clients expose verified reserve-swap workflows without a
separate deployment address book:

```ts
const submission = await ethereum.swaps.requestNative({
  sourceTokenCode,
  sourceReserveCode,
  sourceAmount,
  targetChainCode,
  targetTokenCode,
  targetReserveCode,
  targetRecipient,
  targetAmount,
  targetToleranceBps
})

// Correlate this protocol id with sysio.uwrit; the transaction hash alone is
// only source-chain submission evidence.
console.log(submission.sourceRequestId)
```

Ethereum also exposes `requestErc20WithApproval`, `nativeBalance`, and
`erc20Balance`. Solana exposes `requestNative`, `requestSpl`, `nativeBalance`,
and `splBalance` through the same `client.swaps` ownership boundary.

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
  options: { profile, provider: anchorProvider }
})
const liqsol = solana.program(SolanaProgramName.liqsolCore)
```

The generated `LiqsolCore` type preserves the IDL's literal account namespace,
including `Program<LiqsolCore>["account"]["outpostConfig"]` and
`Program<LiqsolCore>["account"]["reserve"]`. Regenerate from the source artifact
package; never widen the IDL to the base `Idl` type or edit generated Anchor
output by hand.

## Artifact ownership

`@wireio/outpost-ethereum-artifacts` and `@wireio/outpost-solana-artifacts` are
build-time inputs. Their exact manifests are compiled into
`OutpostArtifactManifests` for interface compatibility and readiness reporting.
Generated TypeChain and Anchor sources are ignored local build outputs; they are
compiled into the published package and are never maintained by hand in this
repository.

## Consumer boundaries

- Use this package for typed external `ReserveManager`, `OperatorRegistry`,
  `OPP`, `OPPInbound`, `liqsol_core`, and source reserve-swap execution.
- Use `@wireio/sdk-core` for Wire transaction construction, reserve and token
  registries, underwriting state, and settlement correlation.
- Recreate external clients whenever the selected deployment profile changes.
- Combine SDK deployment verification with flow-specific capability gates before
  enabling a product action.
- Ethereum reserve-swap submissions estimate the live call and add 25% gas
  headroom for nested OPP execution; unused gas is not charged.

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
