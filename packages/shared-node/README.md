# @wireio/shared-node

Node.js-specific shared utilities for Wire applications. Extends `@wireio/shared` with server-side functionality.

Available on npm: <https://www.npmjs.com/package/@wireio/shared-node>

## Installation

```bash
pnpm add @wireio/shared-node
```

## Usage

```typescript
import { } from "@wireio/shared-node"
```

This package is currently a placeholder that will house Node.js-specific utilities as the Wire SDK ecosystem grows. It depends on `@wireio/shared` for core utilities (logging, guards, helpers).

## Build

```bash
pnpm build       # Hybrid ESM+CJS output to lib/esm/ and lib/cjs/
pnpm build:dev   # Watch mode
pnpm test        # Run tests
```

## Module Format

Published as a hybrid ESM+CJS package:

- ESM: `lib/esm/`
- CJS: `lib/cjs/`

## License

FSL-1.1-Apache-2.0
