# @wireio/shared-web

Web-specific shared utilities for Wire applications. Extends `@wireio/shared` with browser-targeted functionality.

> **Private package** -- not published to npm.

## Installation

```bash
pnpm add @wireio/shared-web
```

## Usage

```typescript
import { } from "@wireio/shared-web"
```

This package is currently a placeholder that will house browser-specific utilities as the Wire SDK ecosystem grows. It depends on `@wireio/shared` for core utilities (logging, guards, helpers).

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
