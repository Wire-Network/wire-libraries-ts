# Wire Libraries TypeScript

A monorepo containing shared TypeScript libraries for Wire applications, providing cross-platform utilities for logging, type guards, async helpers, blockchain SDK primitives, and protobuf code-generation tooling.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@wireio/shared`](packages/shared/) | Core shared utilities (logging, guards, helpers) | [![npm](https://img.shields.io/npm/v/@wireio/shared)](https://www.npmjs.com/package/@wireio/shared) |
| [`@wireio/shared-web`](packages/shared-web/) | Web-specific utilities | *private* |
| [`@wireio/shared-node`](packages/shared-node/) | Node.js-specific utilities | *private* |
| [`@wireio/sdk-core`](packages/sdk-core/) | Wire blockchain SDK core types and primitives | [![npm](https://img.shields.io/npm/v/@wireio/sdk-core)](https://www.npmjs.com/package/@wireio/sdk-core) |
| [`@wireio/wallet-ext-sdk`](packages/wallet-ext-sdk/) | Client SDK for the Wire Wallet browser extension | [![npm](https://img.shields.io/npm/v/@wireio/wallet-ext-sdk)](https://www.npmjs.com/package/@wireio/wallet-ext-sdk) |
| [`@wireio/wallet-browser-ext`](packages/wallet-browser-ext/) | Chrome extension developer wallet for Wire | *private* |
| [`@wireio/protoc-gen-solana`](packages/protoc-gen-solana/) | protoc plugin — Rust/Solana codegen from proto3 | [![npm](https://img.shields.io/npm/v/@wireio/protoc-gen-solana)](https://www.npmjs.com/package/@wireio/protoc-gen-solana) |
| [`@wireio/protoc-gen-solidity`](packages/protoc-gen-solidity/) | protoc plugin — Solidity codegen from proto3 | [![npm](https://img.shields.io/npm/v/@wireio/protoc-gen-solidity)](https://www.npmjs.com/package/@wireio/protoc-gen-solidity) |
| [`@wireio/wire-protobuf-bundler`](packages/protobuf-bundler/) | CLI to fetch protos and generate publishable packages | [![npm](https://img.shields.io/npm/v/@wireio/wire-protobuf-bundler)](https://www.npmjs.com/package/@wireio/wire-protobuf-bundler) |

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

# Build all packages
pnpm build

# Build in watch mode
pnpm build:dev

# Run tests
pnpm test
```

## Project Structure

```
wire-libraries-ts/
├── packages/
│   ├── shared/              # Core utilities (logging, guards, helpers)
│   ├── shared-web/          # Web-specific utilities
│   ├── shared-node/         # Node.js-specific utilities
│   ├── sdk-core/            # Wire blockchain SDK core
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
