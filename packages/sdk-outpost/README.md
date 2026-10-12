# `@wireio/sdk-outpost`

Strictly typed access to the Ethereum contracts and Solana programs deployed
alongside a Wire chain.

`@wireio/sdk-core` owns Wire-chain identity, signing, and `sysio.*` workflows.
This package owns verified external-chain clients. Contract ABIs are published
by `wire-ethereum`, the Solana IDL is published by `wire-solana`, and immutable
deployment profiles remain caller-supplied.

The current source pins Ethereum artifacts `0.3.0` and Solana artifacts `0.3.1`
as one verified compatible artifact suite. Their published manifests identify
the exact producer commits, runtime artifacts, and ethers v6/Anchor bindings
used by the SDK. Package versions are managed and published only through the
repository release workflow.

## Install

```sh
npm install @wireio/sdk-outpost
```

Before installing, verify the desired `@wireio/sdk-outpost` release through
`npm view`.
The SDK consumes exact npm versions of
[`@wireio/outpost-ethereum-artifacts`](https://www.npmjs.com/package/@wireio/outpost-ethereum-artifacts)
and
[`@wireio/outpost-solana-artifacts`](https://www.npmjs.com/package/@wireio/outpost-solana-artifacts);
do not replace them with committed machine-local links.

Node.js 22 or newer and ethers v6 are supported. The package publishes CommonJS
and ES module entrypoints with TypeScript declarations.

For local `wire-platform` development, the repository pnpm hook links available
sibling artifact-package outputs automatically. Run `pnpm install --lockfile=false`
after building those outputs; otherwise the exact registry versions remain in use.

## Supported surfaces

| Family   | Generated clients and workflows                                          |
| -------- | ------------------------------------------------------------------------- |
| Ethereum | `OPP`, `OPPInbound`, `BAR`, node-owner registration |
| Solana   | `liqsol_core`, OPP transport and LIQ custody  |

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
Applications must still gate staking, settlement, retry, funding, and
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

## Artifact suite selection

The SDK keeps an internal, compile-time registry of supported Ethereum and
Solana producer package pairs. Client creation selects compatible bindings from
the deployment profile's ABI or IDL digests, then verifies the selected
candidate against the exact live Ethereum runtime or Solana ProgramData before
returning a client.

This registry is not a network, endpoint, or environment catalog. It contains no
RPC URLs, does not download code, and is not keyed by names such as sandbox or
devnet. A new deployment profile that uses an already-registered artifact suite
works without an SDK release. A deployable code or interface change requires a
producer artifact release, a corresponding internal suite entry, and an SDK
release; consumers continue to use the same `OutpostClient.create` facade.

### Current Sandbox validation

The Ethereum `0.3.0` and Solana `0.3.1` pair was validated on the current
Sandbox deployment, optionally described as **Bearbox** when distinguishing
that specific chain from other local sandboxes. Bearbox is validation
provenance, not an SDK environment key: any sandbox or other deployment with a
matching authenticated profile selects the same artifact suite. A later
same-code sandbox respin needs a new profile but no artifact or SDK release.

## Usage

Validate caller-owned deployment data and provide the matching external-chain
provider:

```ts
import { JsonRpcProvider } from "ethers"

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
    connection: new JsonRpcProvider(ethereumRpcUrl)
  }
})
const inbound = ethereum.contract(EthereumContractName.OPPInbound)
```

## Ethereum node owners

The verified Ethereum client exposes `nodeOwners` for the external half of the
node-owner flow. It resolves the canonical WireNodes ERC-1155 contract from
BAR, reads owned tiers, obtains approval only when needed, and submits
`BAR.commitNode`. Wire account authority parsing reuses `@wireio/sdk-core`; the
SDK validates that the uncompressed depositor key belongs to the EVM signer.
BAR is an optional deployment capability: schema-v1 profiles without a BAR
identity continue to support the existing reserve and swap clients, while
accessing `nodeOwners` fails closed with an explicit availability error.

```ts
const slots = await ethereum.nodeOwners.ownedSlots(ownerAddress)
const submission = await ethereum.nodeOwners.commit({
  tokenId: slots[0].tokenId,
  wireAccountName: Name.from(wireAccountName),
  wirePublicKey: PublicKey.from(wirePublicKey),
  depositorPublicKey
})
```

This surface does not mint test tokens, guess a fallback contract, create the
Wire account directly, or infer protocol completion from the EVM receipt. Hub
must keep the action disabled unless deployment and capability evidence both
advertise the complete node-owner flow, then follow the resulting Wire-side
registration state separately.

## Artifact ownership

`@wireio/outpost-ethereum-artifacts` and `@wireio/outpost-solana-artifacts` are
normal runtime dependencies. Their producers verify and publish the ABIs, IDL,
runtime bytes, manifests, ethers v6 factories, and Anchor types together from a
checksummed deployment artifact handoff. `sdk-outpost` imports those published
libraries directly, registers their generated bindings as one internal artifact
suite, and uses their manifests for live deployment verification; it does not
download handoffs or regenerate chain code.

## Consumer boundaries

- Use this package for verified `OPP`, `OPPInbound`, `BAR` and `liqsol_core` clients.
- Use `@wireio/sdk-core` for WIRE transactions, token registration, collateral,
  syndication and bond state.
- Recreate external clients whenever the selected deployment profile changes.
- Combine deployment verification with flow-specific capability checks.

## Maintainer commands

```sh
pnpm --dir packages/sdk-outpost run build
pnpm --dir packages/sdk-outpost run test
```

The artifact tests read the installed producer-package payloads, verify their
published runtime checksums and required generated bindings, and assert that the
internal registry accepts only the exact paired Ethereum and Solana suite.

Release versions are managed by the monorepo-wide patch workflow. See the
[repository release guide](https://github.com/Wire-Network/wire-libraries-ts/blob/master/RELEASING.md)
for artifact prerequisites and the verification checklist.

## License

FSL-1.1-Apache-2.0
