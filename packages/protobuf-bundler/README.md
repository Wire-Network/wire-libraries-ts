# @wireio/wire-protobuf-bundler

[![npm](https://img.shields.io/npm/v/@wireio/wire-protobuf-bundler)](https://www.npmjs.com/package/@wireio/wire-protobuf-bundler)

CLI tool that fetches `.proto` files from a GitHub repository, runs `protoc` with Wire plugins, and generates
publishable Rust crates or npm packages.

> Part of the [`wire-libraries-ts`](../../README.md) monorepo.

## Prerequisites

- **Node.js** >= 24
- **pnpm** >= 10
- **protoc** — installed via the `protoc` npm package or on PATH
- Wire protoc plugins (installed automatically as dependencies):
    - [`@wireio/protoc-gen-solana`](../protoc-gen-solana/) — for Solana/Rust target
    - [`@wireio/protoc-gen-solidity`](../protoc-gen-solidity/) — for Solidity target

## Install

```bash
npm install -g @wireio/wire-protobuf-bundler
```

Or use directly with npx:

```bash
npx @wireio/wire-protobuf-bundler --help
```

## Usage

```
wire-protobuf-bundler --repo <repo> --target <target> --output <dir> --package-name <name>
```

### Options

| Flag                | Required | Description                                                                           |
|---------------------|----------|---------------------------------------------------------------------------------------|
| `--repo`            | Yes      | GitHub repo or local path: `<owner/repo>[/<subfolder>][#<branch>]` or `file://<path>` |
| `--target`          | Yes      | Code generation target: `solana` or `solidity`                                        |
| `--output`          | Yes      | Output directory for the generated package                                            |
| `--package-name`    | Yes      | Name for the generated package                                                        |
| `--package-version` | No       | Version string for the generated package                                              |
| `--package-data`    | No       | JSON string with additional package metadata                                          |
| `--verbose`         | No       | Enable debug logging                                                                  |

### Examples

Generate a Solidity npm package from a local proto directory:

```bash
wire-protobuf-bundler \
    --repo 'file://../wire-sysio/libraries/opp/proto' \
    --target solidity \
    --output build/generated/solidity \
    --package-name '@wireio/opp-solidity-models' \
    --package-version 1.0.0
```

Generate a Rust crate from a GitHub repo:

```bash
wire-protobuf-bundler \
    --repo 'Wire-Network/wire-sysio/libraries/opp/proto#master' \
    --target solana \
    --output build/generated/solana \
    --package-name 'wire-opp-solana-models'
```

With additional package metadata:

```bash
wire-protobuf-bundler \
    --repo 'Wire-Network/wire-sysio/libraries/opp/proto#master' \
    --target solana \
    --output build/generated/solana \
    --package-name 'wire-opp-solana-models' \
    --package-version 1.0.0 \
    --package-data '{ "license": "MIT" }'
```

## Pipeline

The tool executes a three-step pipeline:

1. **Fetch** — Downloads proto files from the specified repo/path using `degit` (or copies from a local `file://` path)
2. **Compile** — Runs `protoc` with the appropriate Wire plugin ([`protoc-gen-solana`](../protoc-gen-solana/) or [
   `protoc-gen-solidity`](../protoc-gen-solidity/))
3. **Package** — Renders Handlebars templates to produce a publishable crate or npm package

## Output Structure

### Solana target (Rust crate)

```
<output>/
├── Cargo.toml
├── README.md
├── proto/                    # Original .proto source files
└── src/
    ├── lib.rs                # Barrel file re-exporting all modules
    ├── *.rs                  # Generated protobuf modules
    └── protobuf_runtime.rs   # Shared wire format primitives
```

Publish with `cargo publish`.

### Solidity target (npm package)

```
<output>/
├── package.json
├── index.mjs
├── README.md
├── proto/                    # Original .proto source files
└── contracts/
    └── *.sol                 # Generated Solidity contracts
```

Publish with `npm publish`.

## Development

```bash
pnpm install
pnpm build        # TypeScript compilation
pnpm bundle       # esbuild bundling
pnpm dist         # Full build + pkg binary
pnpm dev          # Watch mode (build + bundle)
pnpm test         # Run unit tests
pnpm format       # Prettier formatting
pnpm clean        # Remove build artifacts
```

## License

MIT
