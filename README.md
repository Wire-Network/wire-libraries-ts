# Wire Libraries TypeScript

A monorepo containing shared TypeScript libraries for Wire applications, providing cross-platform utilities, blockchain primitives, signing, system-contract workflows, and verified external-chain clients.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@wireio/shared`](packages/shared/) | Core shared utilities (logging, guards, helpers) | [![npm](https://img.shields.io/npm/v/@wireio/shared)](https://www.npmjs.com/package/@wireio/shared) |
| [`@wireio/shared-web`](packages/shared-web/) | Web-specific utilities | *private* |
| [`@wireio/shared-node`](packages/shared-node/) | Node.js-specific utilities | [npm](https://www.npmjs.com/package/@wireio/shared-node) |
| [`@wireio/sdk-core`](packages/sdk-core/) | Wire blockchain SDK core types, primitives, signing helpers, generated `sysio` contract proxy, and domain workflows | [![npm](https://img.shields.io/npm/v/@wireio/sdk-core)](https://www.npmjs.com/package/@wireio/sdk-core) |
| [`@wireio/sdk-outpost`](packages/sdk-outpost/) | Verified Ethereum/Solana outpost clients with native withdrawal requests and claims | [![npm](https://img.shields.io/npm/v/@wireio/sdk-outpost)](https://www.npmjs.com/package/@wireio/sdk-outpost) |
| [`@wireio/wallet-ext-sdk`](packages/wallet-ext-sdk/) | Client SDK for the Wire Wallet browser extension | [![npm](https://img.shields.io/npm/v/@wireio/wallet-ext-sdk)](https://www.npmjs.com/package/@wireio/wallet-ext-sdk) |
| [`@wireio/wallet-browser-ext`](packages/wallet-browser-ext/) | Chrome extension developer wallet for Wire | *private* |

See the [SDK core guide](packages/sdk-core/README.md) for installation, [ED wallet signing](packages/sdk-core/README.md#ed-wallet-signatures), contract access, [desyndication request decoding](packages/sdk-core/README.md#desyndication-request-decoding), and [depot swap quote snapshots](packages/sdk-core/README.md#depot-swap-quotes).

See [native deposits and syndication](packages/sdk-outpost/README.md#native-deposits-and-syndication) for external LIQ acquisition, deposit fee quotes and the separate Wire-settlement boundary.

Use caller-owned [deployment profiles](packages/sdk-outpost/README.md#deployment-profiles)
with the exact current artifact pair. Older deployments must keep their matching
SDK until upgraded. See [migration notes](packages/sdk-core/README.md#migration-from-10)
and the [release process](RELEASING.md) before adopting this breaking candidate.

## Examples

The [Core SDK guide](packages/sdk-core/README.md) covers generated contract access
and multisig compatibility, including Wire KV bounds, ABI recovery and read-only failure handling.

| Example | Description |
|---------|-------------|
| [`web-logging-example`](examples/web-logging-example/) | Browser-based logging demo using `@wireio/shared` |

## Requirements

- **Node.js** >= 22 (CI and releases use Node 24)
- **pnpm** 10.34.5 (pinned in `package.json`)

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build in watch mode
pnpm compile:watch

# Run tests
pnpm test
```

## Publishing

GitHub Actions publishes non-private workspace packages to npm with provenance. Each published package manifest must keep `repository.url` set to `https://github.com/Wire-Network/wire-libraries-ts` or npm will reject provenance validation.

Use [Prepare Release and Tag Release](RELEASING.md); minor, major and release-candidate
bumps are supported. CI and publication install the committed registry lockfile
with local linking hooks disabled. No package version is assigned by this cleanup.
The CI gate also loads the built shared/core/outpost entrypoints through native
CommonJS and ESM loaders, so bundler interop cannot hide broken published imports.

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
│   └── wallet-browser-ext/  # Chrome extension wallet
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
- **`tsconfig.base.jest.json`** — Jest transform

## License

FSL-1.1-Apache-2.0; see individual package manifests.
