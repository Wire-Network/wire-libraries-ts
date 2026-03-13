# Wire Libraries TypeScript

A monorepo containing shared TypeScript libraries for Wire applications, providing cross-platform utilities for logging, type guards, async helpers, and blockchain SDK primitives.

## Packages

| Package | Description |
|---------|-------------|
| [@wireio/shared](./packages/shared) | Core shared utilities: logging framework, type guards, async helpers |
| [@wireio/shared-web](./packages/shared-web) | Web-specific utilities (browser environment) |
| [@wireio/shared-node](./packages/shared-node) | Node.js-specific utilities (server environment) |
| [@wireio/sdk-core](./packages/sdk-core) | Core SDK for Wire powered blockchains: chain types, serialization, cryptography, signing |

## Examples

| Example | Description |
|---------|-------------|
| [web-logging-example](./examples/web-logging-example) | Demonstrates browser-based logging with AWS Firehose |

## Requirements

- Node.js >= 22
- pnpm >= 9.0.0

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build in watch mode (development)
pnpm build:dev

# Run tests
pnpm test
```

## Project Structure

```
wire-libraries-ts/
├── packages/
│   ├── shared/           # Core shared utilities
│   ├── shared-web/       # Web-specific utilities
│   ├── shared-node/      # Node.js-specific utilities
│   └── sdk-core/         # Wire blockchain SDK core
├── examples/
│   └── web-logging-example/  # Browser logging demo
├── etc/
│   └── tsconfig/         # Shared TypeScript configurations
└── tsconfig.json         # Root TypeScript config with project references
```

## TypeScript Configuration

The project uses TypeScript project references for incremental builds. The base configuration is located at `etc/tsconfig/tsconfig.base.json` and individual packages extend this configuration.

## License

Private
