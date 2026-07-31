# `@wireio/sdk-outpost`

Strictly typed access to the Ethereum contracts and Solana programs that form a
Wire outpost.

The package extends `@wireio/sdk-core`: core owns Wire-chain identity, signing,
and `sysio.*` contract workflows; this package owns external-chain deployment
artifacts and their typed clients. Product orchestration remains in consuming
applications.

## Status

This is a preview package. Its first deployment bundle is sourced from the
sim2 artifacts generated on July 31, 2026 and records the compatible Wire
platform release and every source revision. A deployment is exposed only when
the supplied artifacts and live chain state prove it exists.

## Development

```bash
pnpm --dir packages/sdk-outpost run compile
pnpm --dir packages/sdk-outpost run test
pnpm --dir packages/sdk-outpost run generate:ethereum
pnpm --dir packages/sdk-outpost run generate:solana
```

Generated contract and program types must be regenerated from checked-in
artifacts. Do not hand-edit generated files or re-declare their shapes.
