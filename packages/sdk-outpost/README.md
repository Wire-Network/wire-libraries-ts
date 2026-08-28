# `@wireio/sdk-outpost`

Strictly typed access to the Ethereum contracts and Solana programs deployed
alongside a Wire chain.

`@wireio/sdk-core` owns Wire-chain identity, signing, and `sysio.*` workflows.
This package owns verified external-chain clients. Contract ABIs are published
by `wire-ethereum`, the Solana IDL is published by `wire-solana`, and immutable
deployment profiles remain caller-supplied.

The current source pins Ethereum and Solana artifacts `0.3.0`, directly
importable TypeScript libraries assembled from the same verified deployment
handoff. Their published manifests identify the exact producer commits, runtime
artifacts, and ethers v6/Anchor bindings used by the SDK. The workspace version
remains `0.0.0` until the repository release workflow performs its patch bump.

## Install after the first SDK release

```sh
npm install @wireio/sdk-outpost
```

Before installing, verify that `@wireio/sdk-outpost` resolves through `npm view`.
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

The producer-owned `LiqsolCore` type preserves the IDL's literal account namespace,
including `Program<LiqsolCore>["account"]["outpostConfig"]` and
`Program<LiqsolCore>["account"]["reserve"]`. Import it from
`@wireio/outpost-solana-artifacts`; never widen the IDL to the base `Idl` type.

## Artifact ownership

`@wireio/outpost-ethereum-artifacts` and `@wireio/outpost-solana-artifacts` are
normal runtime dependencies. Their producers verify and publish the ABIs, IDL,
runtime bytes, manifests, ethers v6 factories, and Anchor types together from a
checksummed deployment artifact handoff. `sdk-outpost` imports those published
libraries directly, registers their generated bindings as one internal artifact
suite, and uses their manifests for live deployment verification; it does not
download handoffs or regenerate chain code.

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
