# `@wireio/sdk-outpost`

Strictly typed access to the Ethereum contracts and Solana programs deployed
alongside a Wire chain.

`@wireio/sdk-core` owns Wire-chain identity, signing, and `sysio.*` workflows.
This package owns external-chain deployment records, generated contract and
program types, and verified clients. Product orchestration remains in consuming
applications.

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

The package does not infer availability from an ABI, IDL, RPC URL, or address
alone. Client creation verifies the external chain identity and every configured
contract or program before returning. Higher-level feature gates must still
verify the complete platform lifecycle required by an application.

## Deployment catalog

Each catalog record represents one immutable Wire network group:

- the full parent Wire chain ID;
- the external Ethereum chain ID and deployed contract addresses;
- the external Solana genesis hash and program addresses;
- the platform release and exact source revisions;
- the source archive, manifest, deployment, snapshot, ABI, and IDL digests.

Artifacts are grouped by full Wire chain ID and deployment checksum. Public
record IDs use `<wire-chain-id>-<deployment-checksum-prefix>` and do not depend
on environment names, RPC hostnames, or mutable labels. RPC selection remains
caller-owned.

## Usage

Resolve the deployment from the selected Wire chain and provide the matching
external-chain provider:

```ts
import { providers } from "ethers"

import {
  EthereumContractName,
  OutpostChainFamily,
  OutpostClient,
  assertOutpostDeployment
} from "@wireio/sdk-outpost"

const deployment = assertOutpostDeployment(wireChainId)
const ethereum = await OutpostClient.create({
  family: OutpostChainFamily.ethereum,
  options: {
    deployment,
    connection: new providers.JsonRpcProvider(ethereumRpcUrl)
  }
})
const reserves = ethereum.contract(EthereumContractName.ReserveManager)
```

Solana uses the same facade and returns the precise Anchor program type:

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

Zod validates deployment documents at the generated catalog boundary. Contract
and program call types come directly from generator-owned ABI and IDL outputs;
the package does not wrap or re-declare those shapes.

## Importing a deployment

Import every rebuilt network group as a new immutable record. The importer
validates the archived manifest, copies only supported runtime assets, records
exact provenance, regenerates the catalog and client types, and verifies that
the current type surface still covers older records.

```sh
pnpm --dir packages/sdk-outpost run import:deployment -- \
  --archive /path/to/outpost-artifacts.tar.gz \
  --manifest /path/to/cluster-manifest.json \
  --platform-manifest-revision <full-git-sha> \
  --libraries-revision <full-git-sha> \
  --current
```

Existing chain/checksum records are protected. Use `--replace` only to correct
that exact record. Omitting `--current` adds history without changing which
artifacts generate the exported contract and program types.

Do not hand-edit generated files or re-declare ABI/IDL shapes.

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
pnpm --dir packages/sdk-outpost run verify:generated
pnpm --dir packages/sdk-outpost run verify:deployments
pnpm --dir packages/sdk-outpost run test
pnpm --dir packages/sdk-outpost run verify:release
pnpm --dir packages/sdk-outpost pack --dry-run
```

Release versions are managed by the monorepo-wide patch workflow. See
[`RELEASING.md`](RELEASING.md) for the first-publication and verification
checklist.

## License

FSL-1.1-Apache-2.0
