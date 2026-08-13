# Wire Libraries TypeScript

A monorepo containing shared TypeScript libraries for Wire applications, providing cross-platform utilities for logging, type guards, async helpers, blockchain SDK primitives, and protobuf code-generation tooling.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@wireio/shared`](packages/shared/) | Core shared utilities (logging, guards, helpers) | [![npm](https://img.shields.io/npm/v/@wireio/shared)](https://www.npmjs.com/package/@wireio/shared) |
| [`@wireio/shared-web`](packages/shared-web/) | Web-specific utilities | *private* |
| [`@wireio/shared-node`](packages/shared-node/) | Node.js-specific utilities | *private* |
| [`@wireio/sdk-core`](packages/sdk-core/) | Wire blockchain SDK core types, primitives, signing helpers, generated `sysio` contract proxy, and domain workflows such as multisig and reserves | [![npm](https://img.shields.io/npm/v/@wireio/sdk-core)](https://www.npmjs.com/package/@wireio/sdk-core) |
| [`@wireio/sdk-outpost`](packages/sdk-outpost/) | Strictly typed Ethereum and Solana outpost clients generated from source-owned artifact packages | *first release pending* |
| [`@wireio/wallet-ext-sdk`](packages/wallet-ext-sdk/) | Client SDK for the Wire Wallet browser extension | [![npm](https://img.shields.io/npm/v/@wireio/wallet-ext-sdk)](https://www.npmjs.com/package/@wireio/wallet-ext-sdk) |
| [`@wireio/wallet-browser-ext`](packages/wallet-browser-ext/) | Chrome extension developer wallet for Wire | *private* |

The `sdk-outpost` generator preserves the source Solana IDL's literal account
names, so Anchor consumers retain precise `Program<LiqsolCore>["account"]`
members after regeneration. Generated clients remain build outputs and must not
be edited by hand.

For local cluster integration, the same generator accepts an infra deployment
artifact directory or tarball through `--deployment-artifacts-path`. That mode
compiles the bundle's exact ABI/IDL and binds runtime verification to its exact
implementation and ProgramData hashes. It is deliberately rejected by the
package release verifier; published builds always regenerate from canonical
producer packages.

`@wireio/sdk-outpost` and its two producer artifact packages are not yet
available from npm. Local sibling links are valid for integration testing but
do not prove a frozen registry install and must not be committed as the final
consumer dependency.

In the manifest workspace, `pnpm install --lockfile=false` automatically links
producer outputs that exist under the sibling sysio, Ethereum, and Solana build
directories. Remove those outputs when exercising the registry-only release
gate.

## Examples

| Example | Description |
|---------|-------------|
| [`web-logging-example`](examples/web-logging-example/) | Browser-based logging demo using `@wireio/shared` |

## Requirements

- **Node.js** >= 24
- **pnpm** >= 9

## Getting Started

```bash
# Install dependencies
pnpm install

# Install with available sibling producer outputs
pnpm install --lockfile=false

# Build all packages
pnpm build

# Build in watch mode
pnpm build:dev

# Run tests
pnpm test
```

## Publishing

GitHub Actions publishes non-private workspace packages to npm with provenance. Each published package manifest must keep `repository.url` set to `https://github.com/Wire-Network/wire-libraries-ts` or npm will reject provenance validation.

## Project Structure

```
wire-libraries-ts/
├── packages/
│   ├── shared/              # Core utilities (logging, guards, helpers)
│   ├── shared-web/          # Web-specific utilities
│   ├── shared-node/         # Node.js-specific utilities
│   ├── sdk-core/            # Wire blockchain SDK core
│   ├── sdk-outpost/         # Typed external-chain outpost SDK
│   ├── wallet-ext-sdk/      # Wallet extension client SDK
│   ├── wallet-browser-ext/  # Chrome extension wallet
│   ├── protoc-gen-solana/   # protoc plugin → Rust/Solana
│   ├── protoc-gen-solidity/ # protoc plugin → Solidity
│   └── protobuf-bundler/    # CLI for proto → package pipeline
├── examples/
│   └── web-logging-example/
├── etc/
│   └── tsconfig/            # Shared TypeScript configurations
└── tsconfig.json            # Root config with project references
```

## TypeScript Configuration

The monorepo uses [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) with shared base configs in `etc/tsconfig/`:

- **`tsconfig.base.json`** — ESM packages (DOM + ESNext)
- **`tsconfig.base.cjs.json`** — CommonJS packages (Node-only)
- **`tsconfig.base.jest.json`** / **`tsconfig.base.jest.json`** — Jest transforms

## License

MIT
