# wire-protobuf-bundler

CLI tool that fetches `.proto` files from a GitHub repository, runs `protoc` with Wire plugins, and generates publishable Rust crates or npm packages.

## Prerequisites

- **Node.js** >= 24
- **pnpm** >= 10
- **protoc** — installed via the `protoc` npm package or on PATH
- One of the Wire protoc plugins installed:
  - `@wireio/protoc-gen-solana` — for Solana/Rust target
  - `@wireio/protoc-gen-solidity` — for Solidity target

## Installation

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

| Flag | Required | Description |
|------|----------|-------------|
| `--repo` | Yes | GitHub repo spec: `<owner/repo>[/<subfolder>][#<branch>]` |
| `--target` | Yes | Code generation target: `solana` or `solidity` |
| `--output` | Yes | Output directory for the generated package |
| `--package-name` | Yes | Name for the generated package |
| `--package-data` | No | JSON string with additional package metadata |
| `--verbose` | No | Enable debug logging |

### Examples

Generate a Rust crate:

```bash
wire-protobuf-bundler \
    --repo 'Wire-Network/wire-sysio/libraries/opp#feature/protobuf-support-for-opp' \
    --target solana \
    --output build/generated/solana \
    --package-name 'wire-opp-solana-models'
```

Generate an npm package:

```bash
wire-protobuf-bundler \
    --repo 'Wire-Network/wire-sysio/libraries/opp#feature/protobuf-support-for-opp' \
    --target solidity \
    --output build/generated/solidity \
    --package-name '@wireio/opp-solidity-models' \
    --package-version 1.0.0
```

With additional package metadata:

```bash
wire-protobuf-bundler \
    --repo 'Wire-Network/wire-sysio/libraries/opp/proto#feature/protobuf-support-for-opp' \
    --target solana \
    --output build/generated/solana \
    --package-name 'wire-opp-solana-models' \
    --package-version 1.0.0 \
    --package-data '{ "version": "1.0.0", "license": "MIT" }'
```

## Pipeline

The tool executes a three-step pipeline:

1. **Fetch** — Downloads proto files from the specified GitHub repo/subfolder/branch using `degit`
2. **Compile** — Runs `protoc` with the appropriate Wire plugin (`protoc-gen-solana` or `protoc-gen-solidity`)
3. **Package** — Renders Handlebars templates to produce a publishable crate or npm package

## Output Structure

### Solana target (Rust crate)

```
<output>/
├── Cargo.toml
├── README.md
├── proto/          # Original .proto source files
└── src/
    ├── lib.rs      # Barrel file re-exporting all modules
    ├── *.rs     # Generated protobuf modules
    └── protobuf_runtime.rs
```

Publish with `cargo publish`.

### Solidity target (npm package)

```
<output>/
├── package.json
├── index.mjs       # export default {}
├── README.md
├── proto/           # Original .proto source files
└── contracts/
    └── *.sol        # Generated Solidity contracts
```

Publish with `npm publish`.

## Development

```bash
pnpm install
pnpm build        # TypeScript compilation
pnpm bundle       # esbuild bundling
pnpm dist         # Full build + pkg binary
pnpm dev          # Watch mode (build + bundle)
pnpm format       # Prettier formatting
pnpm clean        # Remove build artifacts
```
