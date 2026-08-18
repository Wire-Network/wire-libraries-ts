# `@wireio/sdk-outpost`

Strictly typed access to the Ethereum contracts and Solana programs deployed
alongside a Wire chain.

`@wireio/sdk-core` owns Wire-chain identity, signing, and `sysio.*` workflows.
This package owns verified external-chain clients. Contract ABIs are published
by `wire-ethereum`, the Solana IDL is published by `wire-solana`, and immutable
deployment profiles remain caller-supplied.

Publication status as of August 18, 2026: the exact Ethereum and Solana producer
artifact packages are publicly available as `0.1.1`, while the first
`@wireio/sdk-outpost` npm release is pending. The workspace version remains
`0.0.0` until the repository-wide release workflow performs its patch bump.

## Install after the first SDK release

```sh
npm install @wireio/sdk-outpost
```

Before using the registry command, verify that `@wireio/sdk-outpost` resolves
through `npm view`. The generator consumes exact registry versions of
[`@wireio/outpost-ethereum-artifacts`](https://www.npmjs.com/package/@wireio/outpost-ethereum-artifacts)
and
[`@wireio/outpost-solana-artifacts`](https://www.npmjs.com/package/@wireio/outpost-solana-artifacts);
do not replace them with committed machine-local links.

Node.js 22 or newer is supported. The package publishes CommonJS and native ES
module entrypoints with TypeScript declarations.

## Supported surfaces

| Family   | Generated clients and workflows                                          |
| -------- | ------------------------------------------------------------------------- |
| Ethereum | `OPP`, `OPPInbound`, `OperatorRegistry`, `ReserveManager`, reserve lifecycle and swaps |
| Solana   | `liqsol_core`, configured reserve lifecycle, native SOL and classic SPL reserve swaps  |

Client creation verifies all four boundaries before returning:

- the supplied ABI/IDL digests match the producer packages compiled into this
  SDK release;
- the provider is connected to the expected external chain;
- every Ethereum proxy resolves through its EIP-1967 implementation slot to the
  configured implementation address, exact implementation code hash, and the
  producer package's normalized runtime template;
- every Solana program resolves through the upgradeable loader to the configured
  ProgramData account, exact ProgramData hash, and producer program binary.

`OutpostClient.create` is the single public construction facade. Its family
discriminator preserves the precise `EthereumOutpostClient` or
`SolanaOutpostClient` instance type without publishing separate chain-specific
factory entrypoints or internal module paths.

These checks prove deployment compatibility, not end-to-end feature readiness.
Applications must still gate swaps, staking, settlement, retry, funding, and
underwriting using platform capability evidence.

## Deployment profiles

The SDK does not contain a mutable network or endpoint catalog. Resolve the
selected Wire network group in the application, load its immutable deployment
profile from the platform release/deployment pipeline, and validate that
untrusted input with `parseOutpostDeploymentProfile`.

Schema validation and the checksum-derived profile ID do not authenticate a
profile. Load profiles only through the platform's authenticated release
channel; deployment-profile signing and distribution remain release-pipeline
responsibilities rather than SDK-owned mutable network data.

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
| Contract/program binary change with unchanged ABI/IDL   | Yes                       | Yes                   | New                                       |
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

## Reserve lifecycle

Wallet-connected clients expose the external half of the post-bootstrap
reserve lifecycle. The external create escrows reserve capital and emits the
attestation that creates a pending `sysio.reserv` row. A signed
`@wireio/sdk-core` `ReserveClient` then supplies the exact requested WIRE amount
and activates that row.

```ts
const ethereumSubmission = await ethereum.reserves.createNative({
  tokenCode,
  reserveCode,
  externalTokenAmount,
  requestedWireAmount,
  connectorWeightBps: 5_000,
  name: "Private ETH reserve",
  description: "",
  isPrivate: true,
  creatorPubKey
})

const configuredTokens = await solana.reserves.getConfiguredTokens()
const splToken = configuredTokens.find(token => !token.isNative)
if (splToken == null) throw new Error("No configured SPL reserve token.")

const solanaSubmission = await solana.reserves.create({
  tokenCode: splToken.tokenCode,
  reserveCode,
  externalTokenAmount: splAmount,
  requestedWireAmount,
  connectorWeightBps: 5_000,
  name: "Private SPL reserve",
  description: "",
  isPrivate: true,
  mint: splToken.mint
})
```

Ethereum supports native creation, ERC-20 approval or permit creation, pending
cancellation, and local reserve reads. Solana supports deployment-configured
token discovery, instruction assembly, creation, pending cancellation, address
derivation, and local reserve reads. `cancel` is valid only while creation is
pending and drives the protocol refund path.

The all-zero mint returned for a configured native SOL route is protocol
metadata, not an Anchor account. The current `create_reserve` account context
still requires a real placeholder SPL mint and the creator's token account for
native SOL creation. Consumers that have not provisioned those accounts should
select a configured non-native SPL route, as in the example above.

Private is a routing constraint, not access control or confidentiality. Private
reserves cannot use WIRE as a swap endpoint; when either external route leg is
private, Wire requires both active reserves to have the same non-empty owner.
The current protocol exposes no creator withdrawal, close, or redemption after
activation. This SDK intentionally does not invent an active-reserve exit API.

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
build-time inputs. Generation verifies every packaged ABI, IDL, normalized
runtime template, and program binary before compiling exact manifests into
`OutpostArtifactManifests`. Runtime verification then binds live executable
bytes to those producer artifacts. Generated TypeChain and Anchor sources are
ignored local build outputs; they are compiled into the published package and
are never maintained by hand in this repository.

## Consumer boundaries

- Use this package for typed external `ReserveManager`, `OperatorRegistry`,
  `OPP`, `OPPInbound`, `liqsol_core`, reserve lifecycle, and source reserve-swap
  execution.
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

Release versions are managed by the monorepo-wide patch workflow. See the
[repository release guide](https://github.com/Wire-Network/wire-libraries-ts/blob/master/RELEASING.md)
for artifact prerequisites and the verification checklist.

## License

FSL-1.1-Apache-2.0
