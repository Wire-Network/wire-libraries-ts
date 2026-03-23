# protoc-gen-solana

A `protoc` plugin that generates Rust protobuf encode/decode modules from proto3 definitions, optimized for Solana programs.

Given a `.proto` file, the plugin outputs:

- A `.rs` file per proto file containing Rust structs with `encode()` / `decode()` methods
- A shared `protobuf_runtime.rs` with wire format primitives (varint, fixed, zigzag, length-delimited)

Generated code targets minimal allocations and efficient compute, suitable for Solana's on-chain constraints.

## Install

```bash
npm install @wireio/protoc-gen-solana
```

Requires Node >= 24 on your PATH.

## Usage

```bash
[npx] protoc \
  --plugin=protoc-gen-solana=./node_modules/.bin/protoc-gen-solana \
  --solana_out=./generated \
  path/to/your.proto
```

### Plugin Parameters

Pass parameters via `--solana_opt`:

```bash
[npx] protoc --solana_opt=log_level=debug ...
```

| Parameter   | Values                                          | Default |
|-------------|-------------------------------------------------|---------|
| `log_level` | `log`, `trace`, `debug`, `info`, `warn`, `error` | `info`  |

## Example

Given this proto:

```proto
syntax = "proto3";
package example;

message SolanaAccount {
  bytes pubkey = 1;
  uint64 lamports = 2;
  bytes owner = 3;
  bool executable = 4;
  uint64 rent_epoch = 5;
  bytes data = 6;
}
```

The plugin generates a Rust struct:

```rust
use crate::protobuf_runtime::*;

#[derive(Clone, Debug, Default, PartialEq)]
#[cfg_attr(feature = "borsh", derive(borsh::BorshSerialize, borsh::BorshDeserialize))]
pub struct SolanaAccount {
    pub pubkey: Vec<u8>,
    pub lamports: u64,
    pub owner: Vec<u8>,
    pub executable: bool,
    pub rent_epoch: u64,
    pub data: Vec<u8>,
}

impl SolanaAccount {
    pub fn encode(&self) -> Vec<u8> { /* ... */ }
    pub fn decode(data: &[u8]) -> Result<Self, DecodeError> { /* ... */ }
}
```

## Supported Proto3 Features

| Feature | Rust Representation |
|---|---|
| Scalar types (int32, uint64, bool, string, bytes, float, double, etc.) | Native Rust types (`i32`, `u64`, `bool`, `String`, `Vec<u8>`, `f32`, `f64`) |
| Nested messages | Struct with `encode()`/`decode()` |
| Repeated fields | `Vec<T>` |
| Map fields | Parallel `Vec<K>` + `Vec<V>` (keys and values) |
| Enums | `i32` |
| sint32 / sint64 | ZigZag-encoded `i32` / `i64` |
| fixed32 / fixed64 / sfixed32 / sfixed64 | Fixed-width encoding |
| Unknown fields | Silently skipped during decode |
| Borsh serialization | Opt-in via `feature = "borsh"` on the generated crate |

### Map Field Convention

Proto map fields are represented as parallel vectors rather than `HashMap`, keeping serialization efficient for Solana:

```proto
map<string, string> metadata = 8;
```

becomes:

```rust
pub metadata_keys: Vec<String>,
pub metadata_values: Vec<String>,
```

## Generated File Layout

For a proto file `path/to/service.proto` with `package example.nested`:

```
<output_dir>/
  protobuf_runtime.rs          # Always emitted — shared wire format primitives
  example/nested/service.rs  # Per-proto generated structs
```

The generated code imports the runtime via `use crate::protobuf_runtime::*;`, so both files should live in the same Rust crate.

## Development

```bash
pnpm install
pnpm dev        # Watch mode (TypeScript compile + esbuild bundle)
pnpm dist       # Full production build (compile + bundle + pkg binary)
pnpm format     # Format source with prettier
```

### Testing

```bash
pnpm generate:test
```

This builds the plugin binary and runs `protoc` against the proto files in `tests/protos/`, writing generated Rust output to `dist/tests/generated/`.

The Rust runtime (`rs/protobuf_runtime.rs`) contains `#[cfg(test)]` unit tests covering all wire format primitives.

## License

See [LICENSE](LICENSE) for details.
