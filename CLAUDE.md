# CLAUDE.md

> **Opt-in deep reference**: the org-wide TypeScript style guide is at `STYLE.md` (~1000 lines). It is **NOT auto-imported** — pull it in deliberately for tasks that warrant it: `@STYLE.md`. The rules below cover the day-to-day invariants for this repo.

## Build & Development

```bash
pnpm install                # Install registry deps (pnpm 10.34.5, Node >=22)
# Link local OPP models from wire-sysio:
WIRE_LINK_LOCAL_OPP_MODELS=1 pnpm install --lockfile=false
pnpm build                  # Build all packages via tsc -b
pnpm build:dev              # Watch mode (incremental)
pnpm test                   # Build + jest (all packages)
pnpm format                 # Prettier on **/*.{ts,tsx,md}
pnpm lint                    # ESLint (eslint.config.mjs) — no-restricted-syntax bans + typescript-eslint
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

Enforced by Prettier (`.prettierrc.js`) + ESLint (`eslint.config.mjs`):
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
- **ESLint is configured** (`eslint.config.mjs`, run via `pnpm lint` = `eslint .`) — a flat config **copied from `wire-tools-ts`** that encodes the same `no-restricted-syntax` bans (`BanSwitch`, `BanInlineIife`, `BanNullUnionReturn`, `BanInlineTypeLiteral`, `BanPickParameter`, `BanStringLiteralUnion`, `BanAsOptionAwait`, `BanMemberCoalesceDeclarator`) on top of `typescript-eslint`'s recommended set. The per-selector grandfather debt-file lists are **ratchets**: touching a listed file pays down its debt and deletes its entry — never add one.

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

### 3. Import/export path hygiene

- **All relative imports include the `.js` extension.** `import { X } from "./foo.js"`, never `"./foo"`. Required by `nodenext`/Node-native ESM resolution.
- **Never reference a directory directly.** Write `export * from "./rpc/index.js"` and `import { X } from "./rpc/index.js"`, not `"./rpc"`. Always spell out `index.js`.
- **Barrel contents are `export * from "./<file>.js"` lines only.** No logic, no types, no constants. Parent barrels re-export child subdirectories via `export * from "./<subdir>/index.js"`.
- **No wildcard re-exports of third-party surface.** Consumers import generated-model types from their source package.

### 4. Enums over raw values

Closed-set values — command names, status codes, chain kinds, network types, event names — use an `enum` or an `as const` union, never the raw string or number:

```ts
enum ClusterCommand { create = "create", run = "run", destroy = "destroy" }
// or, equivalent (often preferred in FP-heavy code):
const ClusterCommand = { create: "create", run: "run", destroy: "destroy" } as const
type ClusterCommand = typeof ClusterCommand[keyof typeof ClusterCommand]
```

Then `ClusterCommand.create`, never `"create"`. Rename propagates through the compiler; raw strings do not. This holds **at every call site**, even when a third-party API types the parameter as a string-literal union (POSIX signals go through the signal-name enum, never `"SIGKILL"`). String enums are identity-mapped — value === key; a meaningful non-identity string is NOT an enum (use a `const` object, or the generated type it duplicates). See STYLE.md §5.

### 5. Names come from the standard stems

`assert*` never `require*` (Node global collision); `create*` for factories, never `make*`/`build*`; `new*` never `fresh*`; `append` never `apply` (collides with `Function.apply`); facade variants are `<facadeName><Variant>`. Identifiers are abbreviation-free (only `id` and unit suffixes `Ms`/`Sec` exempt); `ethereum`/`solana` spelled out — `ETH`/`SOL` only for the token. See STYLE.md §5.

### 6. Per-file logger, no `console.*`

Every file that logs makes its own `const log = getLogger(__filename)` — never a shared/exported `log`, never `console.*` in library/service code (jest buffers it; the framework writes through with category + level). Carve-outs in STYLE.md §10.

### 7. Timer hygiene

Every `setTimeout` inside a `Promise.race` is cleared when the race settles (`.finally(() => clearTimeout(...))`); long-lived module timers are `.unref()`d. Leaked race timers are the historical cause of jest's "worker failed to exit gracefully" warning. See STYLE.md §11.

### 8. `null` over `undefined` — without ceremony

`null` is the intentional "no value" sentinel, but this repo compiles with `strictNullChecks: false`: never add `?? null` normalization or `| null` unions just to satisfy the rule — explicit `null` only where it has runtime meaning (JSON persistence: `undefined` drops the key, `null` survives). See STYLE.md §12.

### 9. Generated types first; no `unknown` shortcuts

Before declaring any chain/OPP/network shape, grep the generated sources (sdk-core's `SysioContracts` / `SysioContractTypes.ts`). Never duplicate a generated type; never type a real domain field as `unknown`/`any`. See STYLE.md §13.

### 10. `Either.try` vs `guard` vs `getValue`

Branch on the outcome → `Either.try(fn).match(...)`; best-effort side effect, result ignored → `guard(fn)`; value-or-default → `getValue(fn, fallback)` (both from `@wireio/shared`). Never discard a returned `Either`. RPC/chain `catch`es always log the error's message through the framework. See STYLE.md §2 and §7.

### 11. Tests per symbol, environment-independent

Every new/modified symbol ships unit tests in the same change. Tests never assume process ancestry (`process.ppid` is not reliably a `node` binary — spawn a real child when a live known-basename pid is needed), never hard-pin ports, and never leave children/timers/servers alive past the worker. See STYLE.md §15.

## Cross-repo rules (authoritative)

`wire-platform-manifest/.claude/rules/*.md` is the authoritative cross-repo rule set — read the relevant file before acting; the one-liners below only index the ones that bind this repo:

- **`opp-models-packages.md` / `cross-repo.md`** — `@wireio/opp-typescript-models` and `@wireio/opp-solidity-models` MUST NOT appear in any `wire-libraries-ts` package: the generators that produce them live here (tool/output cycle). Sighting one under `node_modules/.pnpm/` here is a red flag.
- **`standard-names-not-invented.md`** — the author's / repo's existing name for a concept is the spec; synonyms are violations (the `assert*`-not-`require*` table).
- **`string-enum-value-equals-key.md`**, **`enums-are-first-class.md`** — identity string enums; typed enums at every layer, never raw literals/ints.
- **`search-generated-types-before-creating-new.md`**, **`precise-types-no-unknown-shortcut.md`** — generated types first; no `unknown`/`any` for typed domain fields.
- **`use-logging-framework.md`**, **`per-file-logger-and-std-streams.md`**, **`never-swallow-rpc-errors-ts.md`** — framework logging per file; RPC catches always log.
- **`dynamic-import-esm-only-deps.md`** — one cached accessor per ESM-only dep (STYLE.md Part 3 §8).
- **`either-try-vs-guard.md`** — pick by whether the result is used.
- **`prefer-null-over-undefined.md`** — with the `strictNullChecks: false` nuance (no `?? null` / `| null` ceremony).
- **`one-generic-facade-per-concept.md`**, **`compose-options-from-domain-types.md`**, **`design-not-driven-by-file-count-or-simplicity.md`** — facade + composition + decision-basis rules for any new API surface.

## CI/CD

GitHub Actions (`.github/workflows/publish-npm.yaml`):
- Triggers on push to `master` (skips if `[skip release]` in commit message)
- Bumps all packages patch version (`pnpm -r exec -- pnpm version patch`)
- Auto-commits `chore(release): bump patch [skip release]`
- Publishes all non-private packages to npm with provenance (`pnpm -r publish --access public --provenance`)
- Published package manifests must keep `repository.url` set to `https://github.com/Wire-Network/wire-libraries-ts` so npm provenance matches GitHub Actions source metadata.

## Documentation Comments

All generated or modified code **must** include JSDoc comments (`/** ... */`), compatible with Docusaurus.

## Gotchas

- `pnpm test` runs `npm run build` first (not `pnpm build`), then jest — the build must succeed before tests run
- protoc-gen packages have `postinstall` scripts that trigger `pnpm dist` — this can be slow on first install
- The `fix-hybrid-output.mjs` script must run after every build of hybrid packages or ESM imports will break in Node
- Keep `AccountObject.created` optional: valid system-account responses may omit it.
- `packages/sdk-core/src/contracts/sysio/authex` owns `sysio.authex` action builders, link table reads, and create-link proof helpers. Consumers should not duplicate the `createlink` message/signature rules locally.
- `packages/sdk-core/src/contracts/sysio/chains` owns `sysio.chains` registry reads, chain-code normalization, lifecycle filtering, and privileged action construction. Treat registry rows as protocol identity/activation data; RPCs, explorers, icons, wallets, and application capability metadata remain consumer concerns.
- AuthEx `links` reads use wire-sysio KV `index_name` queries with JSON-encoded bounds. Preserve KV row unwrapping, generated enum-name normalization, and compressed/uncompressed EM key equivalence.
- `packages/sdk-core/src/contracts/sysio/reserv` owns public `sysio.reserv` registry reads, normalized rows, matching, rewards, and read-only quote helpers. External-chain reserve custody belongs in the ABI/IDL-owning chain SDK.
- `wallet-browser-ext` uses a global shim to avoid `new Function()` restrictions in Chrome MV3
- Path aliases in tsconfig base resolve to `src/` for dev, but published packages use `lib/` — jest module name maps handle this mismatch
- Node >=22 required (package.json says >=22, README says >=24 — actual CI uses v24)
- The `web-logging-example` requires `WIRE_PUSH_URL` env var injected at webpack build time
