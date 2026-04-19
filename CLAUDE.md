# CLAUDE.md

## Build & Development

```bash
pnpm install                # Install all deps (requires pnpm 10.32.1, Node >=22)
pnpm build                  # Build all packages via tsc -b (composite project references)
pnpm build:dev              # Watch mode (incremental)
pnpm test                   # Build + jest (all packages)
pnpm format                 # Prettier on **/*.{ts,tsx,md}
```

Per-package commands (run from package directory):
```bash
pnpm build                  # Package-level build
pnpm test                   # Package-level tests (where available)
pnpm bundle                 # esbuild bundle (CLI packages only)
pnpm dist                   # Full dist: compile + bundle + pkg binary (CLI packages only)
pnpm dev                    # Watch mode (CLI packages only)
```

## Monorepo Structure

pnpm workspaces with TypeScript composite project references. No Lerna/Nx.

### Packages

| Package | Scope | Published | Output |
|---------|-------|-----------|--------|
| `@wireio/shared` | Core utilities (logging, guards, helpers) | Yes | Hybrid ESM+CJS |
| `@wireio/shared-web` | Web-specific utilities | No | ESM |
| `@wireio/shared-node` | Node.js utilities | Yes | Hybrid ESM+CJS |
| `@wireio/sdk-core` | Wire blockchain SDK types/primitives | Yes | Hybrid ESM+CJS |
| `@wireio/wallet-ext-sdk` | Wallet extension client SDK | Yes | ESM |
| `@wireio/wallet-browser-ext` | Chrome extension developer wallet | No | Webpack bundle |
| `@wireio/protoc-gen-solana` | protoc plugin: proto3 → Rust/Solana | Yes | CJS + pkg binary |
| `@wireio/protoc-gen-solidity` | protoc plugin: proto3 → Solidity | Yes | CJS + pkg binary |
| `@wireio/wire-protobuf-bundler` | CLI: fetch protos → generate packages | Yes | CJS + pkg binary |

### Dependency Graph

```
shared ──→ shared-web
       ──→ shared-node

sdk-core ──→ wallet-ext-sdk ──→ wallet-browser-ext
```

Protoc plugins and bundler are standalone (no internal deps).

## TypeScript Configuration

Base configs live in `etc/tsconfig/`:

| Config | Purpose |
|--------|---------|
| `tsconfig.base.json` | ESM packages (ES2022, ESNext modules, bundler resolution) |
| `tsconfig.base.cjs.json` | CJS packages (nodenext module resolution) |
| `tsconfig.base.esm.json` | Pure ESM (ESNext target + modules) |
| `tsconfig.base.jest.json` | Jest transform (CJS compat for ts-jest) |
| `tsconfig.base.jest.json` | CJS Jest transform variant |

Root `tsconfig.json` has project references to all packages. Build order is resolved by `tsc -b`.

**Note:** strict mode is OFF (`strict: false`, `noImplicitAny: false`). Path aliases for all `@wireio/*` packages are defined in the base config.

## Hybrid ESM/CJS Build Pattern

Packages that publish both ESM and CJS (`shared`, `sdk-core`, `shared-node`) use:

1. Two tsconfig files: one for `lib/esm/`, one for `lib/cjs/`
2. Post-build: `scripts/fix-hybrid-output.mjs` patches relative imports with `.js` extensions and creates `lib/cjs/package.json` with `{"type":"commonjs"}`
3. Package.json `exports` map: `"import"` → `lib/esm/`, `"require"` → `lib/cjs/`

## CLI Plugin Build Pipeline (protoc-gen-*, protobuf-bundler)

1. `tsc` → `lib/` (compile)
2. `esbuild` → `dist/bundle/*.cjs` with shebang + chmod (bundle)
3. `@yao-pkg/pkg` → standalone binary at `dist/bin/` with embedded assets (dist)

Assets (Rust runtime, Solidity templates, Handlebars templates) are embedded via `pkg.assets` in package.json.

## Testing

- Framework: Jest 30 with ts-jest
- Root `jest.config.ts` lists all package projects
- Tests live in `<package>/tests/` (not alongside source)
- Test environments: `node` for most packages, `jsdom` for web/extension packages
- Module name mapping strips `.js` extensions: `(^.{1,2}/.*)\\.js$` → `$1`
- protoc plugins have no TS unit tests — tested via `pnpm generate:test` which runs protoc end-to-end

## Code Style & Approach

Enforced by Prettier (`.prettierrc.js`):
- **modern code** Use forEach, ... (spreads), map, filter, and reduce modern paradigms instead of for loops and other legacy style code
- **OPP & FP (functional programming)** is preferred over old-school if/else/switch and generally branching code.
    - Use `Future` from `@3fv/prelude-ts` for async flows.
    - Use `Option`/`asOption` from `@3fv/prelude-ts` for optional values and chained flows.
    - Use `Either` from `@3fv/prelude-ts` for error handling.
    - Use `match` from `ts-pattern` for pattern matching.
- No semicolons
- Double quotes
- No trailing commas
- 2-space indent, no tabs
- Arrow parens: avoid when possible
- No ESLint configured

## Code Quality Invariants

Apply these to every change. Check them before declaring a task complete — they are not optional polish.

### 1. No duplicated helpers

If the same function / guard / computation appears in two files, extract it. Pick the home by scope:

- **Package-internal:** a `src/util/` module exported for in-package use.
- **Shared across packages:** add to `@wireio/shared` (or `@wireio/shared-node` / `@wireio/shared-web` when the helper is environment-bound), then import from there. Never copy-paste across packages.
- **Subclass-common behaviour:** a `protected` method on the base class (or a mixin), not repeated in every subclass.

### 2. No magic literals

Every string or numeric value that isn't a trivial array index / loop bound gets a named constant:

- **Module-local:** `const X = ...` at the top of the file, or `as const` for tuples / objects when TypeScript should infer the narrowest literal types.
- **Shared:** `export const` from a dedicated module (e.g. `constants.ts`).
- **Command / CLI / event names, RPC method names, field keys:** group in an `enum` or `as const` object so autocomplete and find-usages work.

### 3. Enums over raw values

Closed-set values — command names, status codes, chain kinds, network types, event names — use an `enum` or an `as const` union, never the raw string or number:

```ts
enum ClusterCommand { create = "create", run = "run", destroy = "destroy" }
// or, equivalent (often preferred in FP-heavy code):
const ClusterCommand = { create: "create", run: "run", destroy: "destroy" } as const
type ClusterCommand = typeof ClusterCommand[keyof typeof ClusterCommand]
```

Then `ClusterCommand.create`, never `"create"`. Rename propagates through the compiler; raw strings do not.

## CI/CD

GitHub Actions (`.github/workflows/publish-npm.yaml`):
- Triggers on push to `master` (skips if `[skip release]` in commit message)
- Bumps all packages patch version (`pnpm -r exec -- pnpm version patch`)
- Auto-commits `chore(release): bump patch [skip release]`
- Publishes all non-private packages to npm (`pnpm -r publish --access public`)

## Documentation Comments

All generated or modified code **must** include JSDoc comments (`/** ... */`), compatible with Docusaurus.

## Gotchas

- `pnpm test` runs `npm run build` first (not `pnpm build`), then jest — the build must succeed before tests run
- protoc-gen packages have `postinstall` scripts that trigger `pnpm dist` — this can be slow on first install
- The `fix-hybrid-output.mjs` script must run after every build of hybrid packages or ESM imports will break in Node
- `wallet-browser-ext` uses a global shim to avoid `new Function()` restrictions in Chrome MV3
- Path aliases in tsconfig base resolve to `src/` for dev, but published packages use `lib/` — jest module name maps handle this mismatch
- Node >=22 required (package.json says >=22, README says >=24 — actual CI uses v24)
- The `web-logging-example` requires `WIRE_PUSH_URL` env var injected at webpack build time
