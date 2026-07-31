# `@wireio/sdk-outpost`

Strictly typed access to the Ethereum contracts and Solana programs that form a
Wire outpost.

The package extends `@wireio/sdk-core`: core owns Wire-chain identity, signing,
and `sysio.*` contract workflows; this package owns external-chain deployment
artifacts and their typed clients. Product orchestration remains in consuming
applications.

## Status

This is a preview package. Its first deployment bundle is sourced from the sim2
artifacts generated on July 31, 2026 and records the compatible Wire platform
release and every source revision. A deployment is exposed only when the
supplied artifacts and live chain state prove it exists.

| Family   | sim2 assets                                               |
| -------- | --------------------------------------------------------- |
| Ethereum | `OPP`, `OPPInbound`, `OperatorRegistry`, `ReserveManager` |
| Solana   | `liqsol_core`                                             |

The package does not infer support from an ABI, IDL, RPC URL, or configured
address alone. Client creation verifies the external chain identity and every
configured contract or program before returning. Higher-level stake, swap,
settlement, and retry workflows stay gated until the platform capabilities that
back those flows are proven operational.

## Usage

Resolve a deployment from the selected parent Wire chain, then provide the
current external-chain provider. RPC selection remains caller-owned so a Hub
network change can rebuild clients from its live network-group configuration.

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

Zod validates versioned deployment data at the handwritten data boundary.
Contract and program call types come directly from generator-owned ABI and IDL
outputs; the package does not wrap or re-declare them.

## Hub integration sequence

1. Install the published preview beside `@wireio/sdk-core`.
2. Resolve the deployment from the selected Wire `ChainId`.
3. Build Ethers and Anchor providers from the Hub's current network-group RPCs.
4. Recreate both clients when that network-group observable changes; feed
   verification failures into the existing top-level capability gate.
5. Replace local external-chain ABI/IDL connections with these typed clients,
   while retaining Hub product state and transaction orchestration services.
6. Enable stake or swap actions only when both SDK verification and the
   platform's flow-specific capability checks pass.

This keeps network transport dynamic, deployment identity versioned, and feature
availability honest without moving application concerns into the SDK.

## Development

```bash
pnpm --dir packages/sdk-outpost run compile
pnpm --dir packages/sdk-outpost run test
pnpm --dir packages/sdk-outpost run generate:ethereum
pnpm --dir packages/sdk-outpost run generate:solana
```

Generated contract and program types must be regenerated from checked-in
artifacts. Do not hand-edit generated files or re-declare their shapes.
Generated outputs live under each chain's `generated/` directory and are
excluded from handwritten-code lint rules.

The TypeChain generator is isolated on its compatible Prettier 2 dependency; the
repository and Solana generator remain on the pinned Prettier 3 toolchain.
