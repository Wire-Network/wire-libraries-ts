# TypeScript Style Guide

Organization-wide conventions for all TypeScript codebases — Node services, CLI tools, and web applications. Covers language idioms, project configuration, and packaging.

---

# Part 1 — General (All TypeScript)

These rules apply everywhere: Node backends, web frontends, shared libraries, CLI tools.

---

## 1. Pattern Matching with `ts-pattern`

Use [`ts-pattern`](https://github.com/gvergnaud/ts-pattern) for exhaustive, expression-oriented branching. Reserve `switch` for side-effect-only dispatch.

### Use `match()` when branching produces a value

```ts
import { match } from "ts-pattern"

const config = await match(command)
  .with(Command.create, async () => {
    // resolve paths, build config, write to disk
    return config
  })
  .otherwise(() => {
    // load existing config from disk
    return JSON.parse(Fs.readFileSync(configFile, "utf-8"))
  })
```

Assign the result directly to a `const`. The match is an expression, not a statement.

### Use `.exhaustive()` on unions and enums

```ts
const label = match(status)
  .with(Status.pending, () => "Pending")
  .with(Status.active, () => "Active")
  .with(Status.closed, () => "Closed")
  .exhaustive() // compile error if a variant is missing
```

### When to use `match()` vs. `switch`

| Situation | Use                           |
|---|-------------------------------|
| Branching produces a value | `match().with().otherwise()`  |
| Exhaustive check on a union/enum | `match().with().exhaustive()` |
| Side-effect dispatch (start, stop, destroy) | `match().with().exhaustive()`          |
| Single boolean check | `asOption(),filter()`           |

### Async arms

`match(...).with(X, async () => ...)` returns a `Promise`. Always `await` the entire expression.

---

## 2. Functional Pipelines with `@3fv/prelude-ts`

Use `asOption()` from [`@3fv/prelude-ts`](https://github.com/nicholasgasior/prelude-ts) for wrapping, transforming, and validating values in a linear pipeline. This is not full FP — it's a concise alternative to null-checks and imperative setup blocks.

### Core pattern: wrap → transform → unwrap

```ts
import { asOption } from "@3fv/prelude-ts"

// Construct + validate in one expression
const exePaths: ExePaths = asOption({
    nodeop: toBin("nodeop"),
    kiod: toBin("kiod"),
    clio: toBin("clio"),
    ...
  })
  .tap(paths =>
    Object.entries(paths).forEach(([name, path]) =>
      Assert.ok(path && Fs.existsSync(path), `${name} not found at ${path}`)
    )
  )
  .get()
```

### Promisifying callback APIs

```ts
import { Deferred } from "@wireio/shared"

function pm2LaunchBus(): Promise<any> {
	return Deferred.useCallback(d =>
		pm2.launchBus((err, bus) => {
			return err ? d.reject(err) : d.resolve(bus)
		})
	).promise
}
```


### Rules

- **`.tap()` for side effects, `.map()` for transforms.** Never mix them.
- **`.get()` is a conscious unwrap.** It throws on `None`. Use when the value is definitely present. Use `.getOrElse(fallback)` or `.getOrUndefined()` when absence is possible.

---

## 3. Configuration (Options / Config / Defaults)

A three-layer type system separates caller input, runtime requirements, and default resolution.

### The three types

```ts
/** What the caller provides. All fields optional. */
export interface FooOptions {
  /** Server hostname. Default: FooManager.DefaultHost */
  host?: string
  /** Server port. Default: FooManager.DefaultPort */
  port?: number
  /** Path to binary. Default: resolved via `which()` */
  binary?: string
  extraArgs?: string[]
}

/** What the implementation requires. All fields present. */
export interface FooConfig extends Required<FooOptions> {}

/** Resolves defaults. May be async (binary lookups, env reads). */
export async function createFooDefaultOptions(): Promise<Partial<FooOptions>> {
  return {
    host: FooManager.DefaultHost,
    port: FooManager.DefaultPort,
    binary: asOption(await which("foo")).getOrUndefined(),
  }
}
```

### Merge with `lodash.defaults`

```ts
import { defaults } from "lodash"

const config = defaults(
  { ...options },                    // spread to avoid mutating input
  await createFooDefaultOptions()
) as FooConfig
```

Caller's explicit values win. Omitted fields get defaults. Validate after merge.

### Why `Required<T>`?

It mechanically guarantees the config shape mirrors the options shape. Add a field to `FooOptions` and `FooConfig` updates automatically. No drift.

### Namespace-scoped defaults

Default values live as static constants on a companion `namespace`, never as magic numbers:

```ts
export namespace FooManager {
  export const DefaultHost = "127.0.0.1"
  export const DefaultPort = 8545
  export const StartupTimeoutMs = 15_000
}
```

---

## 4. Factory Model

Classes that manage resources use an **async static factory** with a **private constructor**.

```ts
export class FooManager {
  static async create(options: FooOptions = {}): Promise<FooManager> {
    const config = defaults({ ...options }, await createFooDefaultOptions()) as FooConfig
    assert(existsSync(config.binary), `binary not found: ${config.binary}`)
    return new FooManager(config)
  }

  private constructor(readonly config: FooConfig) {}

  async start(): Promise<void> { /* ... */ }
  async stop(): Promise<void> { /* ... */ }
}
```

**Why?**
1. Constructors can't be `async`. Default resolution often needs `await`.
2. Validation happens *before* instantiation. Callers never hold invalid instances.
3. Single entry point. The private constructor eliminates partially-configured objects.

### Singleton variant

For process-global resources, use a precondition-guarded `get()`:

```ts
export class ProcessManager {
  private static clusterPath: string
  private static instance: ProcessManager

  static setClusterPath(path: string): typeof ProcessManager {
    assert(!this.clusterPath || this.clusterPath === path, "Already set")
    this.clusterPath = path
    return this
  }

  static get(): ProcessManager {
    assert(!!this.clusterPath, "Cluster path must be set first")
    return (this.instance ??= new ProcessManager())
  }

  private constructor() {}
}
```

### Companion namespace

Use declaration merging to co-locate constants, helpers, and sub-types:

```ts
export class FooManager { /* ... */ }

export namespace FooManager {
  export const DefaultPort = 8545
  export const StartupTimeoutMs = 15_000
  export const NodePrefix = "node_"

  export function padIndex(i: number): string {
    return String(i).padStart(2, "0")
  }

  export function toNodePath(i: number): string {
    return `${NodePrefix}${padIndex(i)}`
  }

  // Sub-types live here too
  export interface InfoResponse {
    version: string
    blockNum: number
  }
}
```

The namespace serves three roles: default values/timeouts (process managers), path constants/builders (orchestration classes), sub-types/response interfaces (client classes).

---

## 5. Naming Conventions

### Files

- **PascalCase** for files exporting a class as primary export: `AnvilManager.ts`, `ClusterManager.ts`
- **camelCase** for functions, constants, utilities: `cli.ts`, `keyGen.ts`, `logger.ts`
- **`index.ts`** for barrel re-exports only
- Filename matches primary export: `AnvilManager.ts` → `export class AnvilManager`

### Variables

- **Directory** references → suffix `Path`: `buildPath`, `clusterPath`, `dataPath`
- **File** references → suffix `File`: `configFile`, `genesisFile`, `stateFile`
- **Subpath constants** (relative segments) → suffix `Subpath`: `LedgerSubpath`, `StateSubpath`

### Enums

String enums with identity mapping:

```ts
enum Command {
  create = "create",
  run = "run",
  destroy = "destroy",
}
```

### Numeric literals

Separators for readability: `15_000` (15 seconds), `131_072` (128K), `999_999`.

---

## 6. Declarations and Expressions

### Joined `const` declarations

Group related bindings into a single `const`:

```ts
const argv = await parser.parse(),
  command = argv._[0] as Command,
  clusterPath = Path.resolve(argv.clusterPath as string),
  configFile = Path.join(clusterPath, "cluster-config.json"),
  force = argv.force as boolean
```

Use when bindings derive from the same source and share a lifecycle. Separate `const` for independent bindings.

### Fluent method chaining

Methods that configure an instance return `this`:

```ts
class ClusterManager {
  loadState(): this {
    // ...
    return this
  }
}

// Enables:
await createClusterManager(config).loadState().startAndWait()
```

---

## 7. Error Handling

### Assert early

```ts
assert(config.port > 0 && config.port < 65536, `Invalid port: ${config.port}`)
assert(existsSync(config.binary), `Binary not found: ${config.binary}`)
```

Validate preconditions at the top of public methods and factories. Fail fast with a message that includes the actual value.

### Never swallow errors

```ts
// WRONG
try { await riskyOp() } catch {}

// RIGHT
try { await riskyOp() }
catch (err) {
  log.error("riskyOp failed", { err })
  throw err
}
```

---

## 8. Imports and Dependencies

### Import order

1. Node built-ins (`node:fs`, `node:path`)
2. External packages (`lodash`, `ts-pattern`, `@3fv/prelude-ts`)
3. Internal monorepo packages (`@wireio/shared`, `@wire-e2e-tests/harness`)
4. Relative imports (`./utils`, `../config`)

Blank line between each group.

### Lodash

Import individual functions:

```ts
import { defaults, range, last, identity } from "lodash"
```

Use for focused utilities only. Don't use for things native `Array`/`Object` methods handle.

---

## 9. General Rules

- **No magic literals.** Extract to namespace constants if not trivially obvious.
- **JSDoc on every interface field.** One-line description + default if applicable.
- **`source-map-support/register`** at every CLI/service entry point.
- **No default exports.** Named exports only.
- **One concept per file.** One class, one factory, or one focused set of utilities.

---

# Part 2 — Web (React + Redux Toolkit)

Standard stack: **React** (function components + hooks), **Redux Toolkit** (RTK) for state, **RTK Query** for data fetching. No class components. No raw Redux.

> **Angular migration note.** Existing Angular codebases remain in maintenance mode. New feature work and greenfield apps use React + RTK.

---

## 1. Component Architecture

### Function components only

```tsx
interface UserCardProps {
  /** User's display name. */
  name: string
  /** Avatar URL. Omit for default avatar. */
  avatarUrl?: string
  /** Callback fired when the card is clicked. */
  onClick?: () => void
}

export function UserCard({ name, avatarUrl, onClick }: UserCardProps) {
  return (
    <div className="user-card" onClick={onClick}>
      <img src={avatarUrl ?? "/default-avatar.png"} alt={name} />
      <span>{name}</span>
    </div>
  )
}
```

- **Props interface, not inline type.** Always named, always exported.
- **Destructure props in the signature.**
- **No `React.FC`.** Declare return type explicitly only if needed.
- **One component per file.** PascalCase filenames: `UserCard.tsx`.

---

## 2. State Management with Redux Toolkit

### Slice structure

```ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit"

interface AuthState {
  token: string | null
  userId: string | null
  status: "idle" | "loading" | "authenticated" | "error"
}

const initialState: AuthState = {
  token: null,
  userId: null,
  status: "idle",
}

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ token: string; userId: string }>) {
      state.token = action.payload.token
      state.userId = action.payload.userId
      state.status = "authenticated"
    },
    logout(state) {
      state.token = null
      state.userId = null
      state.status = "idle"
    },
  },
})

export const { setCredentials, logout } = authSlice.actions
```

- **One slice per domain.** `authSlice`, `usersSlice`, `networkSlice`.
- **Typed state interface.** Explicit, with JSDoc.
- **Use `PayloadAction<T>`.** Always type the payload.
- **Export actions and selectors from the slice file.**

### Typed hooks

```ts
import { useDispatch, useSelector, TypedUseSelectorHook } from "react-redux"

export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
```

Always use `useAppDispatch` and `useAppSelector` — never raw `useDispatch` / `useSelector`.

---

## 3. Data Fetching with RTK Query

```ts
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/v1" }),
  tagTypes: ["User", "Network"],
  endpoints: (builder) => ({
    getUser: builder.query<User, string>({
      query: (id) => `/users/${id}`,
      providesTags: (result, error, id) => [{ type: "User", id }],
    }),
    updateUser: builder.mutation<User, Partial<User> & Pick<User, "id">>({
      query: ({ id, ...body }) => ({ url: `/users/${id}`, method: "PATCH", body }),
      invalidatesTags: (result, error, { id }) => [{ type: "User", id }],
    }),
  }),
})

export const { useGetUserQuery, useUpdateUserMutation } = apiSlice
```

- **One `createApi` per base URL.** Use `injectEndpoints` for large APIs.
- **Tag-based cache invalidation.** Every query `providesTags`, every mutation `invalidatesTags`.
- **No manual `useEffect` + `fetch`.** RTK Query handles caching, dedup, loading states, refetching.
- **Typed generics.** `builder.query<ResponseType, ArgType>` — always both.

---

## 4. Web tsconfig

Web packages extend the libraries base config, which adds DOM libs and JSX support. From `wire-libraries-ts/etc/tsconfig/tsconfig.base.json`:

```jsonc
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "lib": ["DOM", "DOM.Iterable", "ESNext"],       // ← DOM libs for web
    "jsx": "react-jsx",                               // ← React JSX transform
    "allowJs": false,
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "composite": true,
    "incremental": true,
    "noFallthroughCasesInSwitch": false,
    "allowSyntheticDefaultImports": true,
    "noImplicitAny": false,
    "disableSizeLimit": false,
    "preserveConstEnums": true,
    "resolveJsonModule": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "inlineSourceMap": true,
    "inlineSources": true,
    "sourceMap": false,
    "skipLibCheck": true,
    "skipDefaultLibCheck": true,
    "strictNullChecks": false,
    "strict": false,
    "preserveWatchOutput": true,
    "target": "ES2022",
    "types": ["node", "jest"],
    "paths": {
      "@wireio/shared":              ["./packages/shared/src"],
      "@wireio/shared/*":            ["./packages/shared/src/*"],
      "@wireio/shared-web":          ["./packages/shared-web/src"],
      "@wireio/shared-web/*":        ["./packages/shared-web/src/*"],
      "@wireio/shared-node":         ["./packages/shared-node/src"],
      "@wireio/shared-node/*":       ["./packages/shared-node/src/*"],
      "@wireio/sdk-core":            ["./packages/sdk-core/src"],
      "@wireio/sdk-core/*":          ["./packages/sdk-core/src/*"],
      "@wireio/wallet-ext-sdk":      ["./packages/wallet-ext-sdk/src"],
      "@wireio/wallet-ext-sdk/*":    ["./packages/wallet-ext-sdk/src/*"],
      "@wireio/protoc-gen-solana":   ["./packages/protoc-gen-solana/src"],
      "@wireio/protoc-gen-solana/*": ["./packages/protoc-gen-solana/src/*"],
      "@wireio/protoc-gen-solidity":   ["./packages/protoc-gen-solidity/src"],
      "@wireio/protoc-gen-solidity/*": ["./packages/protoc-gen-solidity/src/*"],
      "@wireio/wire-protobuf-bundler":   ["./packages/protobuf-bundler/src"],
      "@wireio/wire-protobuf-bundler/*": ["./packages/protobuf-bundler/src/*"]
    }
  },
  "include": ["src", "types"],
  "exclude": [
    "lib", "dist", "target", "node_modules",
    "**/*.js", "**/lib/**", "**/dist/**", "**/target/**", "**/node_modules/**"
  ]
}
```

Key differences from the Node base:
- `lib` includes `"DOM"` and `"DOM.Iterable"` (Node base only has `"ESNext"`)
- `jsx` is set to `"react-jsx"` (Node base omits it)

Both bases share everything else — same `target`, same `module`/`moduleResolution`, same strictness settings, same source map strategy.

---

# Part 3 — Node

Rules for Node.js services, CLI tools, and server-side packages.

---

## 1. tsconfig Setup

### Base config hierarchy

All Node packages build from a layered tsconfig hierarchy stored at `etc/tsconfig/`:

```
etc/tsconfig/
├── tsconfig.base.json          # Shared compiler options, path aliases
├── tsconfig.base.esm.json      # Extends base → module: ESNext, target: ESNext
├── tsconfig.base.cjs.json      # Extends base → module: nodenext, moduleResolution: nodenext
└── tsconfig.base.jest.json     # Extends base → module: CommonJS, external sourceMap
```

### `tsconfig.base.json` — the foundation

This is the single source of truth for compiler settings and monorepo-wide path aliases. Every package's tsconfig extends one of the base configs, which all chain back to this file.

```jsonc
// etc/tsconfig/tsconfig.base.json (from wire-e2e-tests)
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "lib": ["ESNext"],
    "allowJs": false,
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "composite": true,
    "incremental": true,
    "noFallthroughCasesInSwitch": false,
    "allowSyntheticDefaultImports": true,
    "noImplicitAny": false,
    "disableSizeLimit": false,
    "preserveConstEnums": true,
    "resolveJsonModule": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "inlineSourceMap": true,
    "inlineSources": true,
    "sourceMap": false,
    "skipLibCheck": true,
    "skipDefaultLibCheck": true,
    "strictNullChecks": false,
    "strict": false,
    "preserveWatchOutput": true,
    "target": "ES2022",
    "types": ["node", "jest"],
    "paths": {
      "@wire-e2e-tests/harness":   ["./packages/harness/src"],
      "@wire-e2e-tests/harness/*": ["./packages/harness/src/*"],
      "@wire-e2e-tests/flow-a":    ["./packages/flow-a/src"],
      "@wire-e2e-tests/flow-a/*":  ["./packages/flow-a/src/*"],
      "@wire-e2e-tests/flow-b":    ["./packages/flow-b/src"],
      "@wire-e2e-tests/flow-b/*":  ["./packages/flow-b/src/*"],
      "@wire-e2e-tests/flow-c":    ["./packages/flow-c/src"],
      "@wire-e2e-tests/flow-c/*":  ["./packages/flow-c/src/*"]
    }
  },
  "include": ["src", "types"],
  "exclude": [
    "lib", "dist", "target", "node_modules",
    "**/*.js", "**/lib/**", "**/dist/**", "**/target/**", "**/node_modules/**"
  ]
}
```

### Setting-by-setting rationale

| Setting | Value | Why |
|---|---|---|
| `declaration` / `declarationMap` | `true` | Emit `.d.ts` + maps for project references and go-to-definition into source `.ts` |
| `lib: ["ESNext"]` | Node-only | No DOM types. Web base adds `"DOM"` and `"DOM.Iterable"` |
| `module: "ESNext"` | Default emit format | Overridden by ESM/CJS/Jest sub-configs |
| `moduleDetection: "force"` | Treat every file as a module | Prevents accidental global-script interpretation |
| `moduleResolution: "bundler"` | Default resolution | Allows extensionless imports during development. Overridden by CJS/Jest sub-configs when Node-native resolution is needed |
| `composite` / `incremental` | `true` | Required for `tsc -b` project references and faster rebuilds |
| `noFallthroughCasesInSwitch` | `false` | Intentional fallthrough is used in some switch dispatch patterns |
| `allowSyntheticDefaultImports` | `true` | Enables `import X from "cjs-pkg"` syntax |
| `noImplicitAny` | `false` | Legacy relaxation — new packages should aim for `true` |
| `preserveConstEnums` | `true` | Keep const enums as objects for cross-package compatibility |
| `resolveJsonModule` | `true` | Import `.json` with types |
| `emitDecoratorMetadata` / `experimentalDecorators` | `true` | Required for decorator-based patterns (DI, ORM, etc.) |
| `esModuleInterop` | `true` | Correct default-import behavior for CJS modules |
| `isolatedModules` | `true` | Every file independently transpilable (required by esbuild, SWC, etc.) |
| `inlineSourceMap` / `inlineSources` | `true` / `true` | Embed maps in output — no sidecar `.js.map` files. `sourceMap: false` to avoid conflict |
| `skipLibCheck` / `skipDefaultLibCheck` | `true` | Skip type-checking `.d.ts` from `node_modules` — significant build time savings |
| `strictNullChecks` / `strict` | `false` | Legacy baseline. New packages should enable `strict: true` |
| `preserveWatchOutput` | `true` | Don't clear terminal on `tsc -w` rebuilds |
| `target: "ES2022"` | Runtime target | Supports native `async`/`await`, `Array.at()`, `Object.hasOwn()`, etc. |
| `types: ["node", "jest"]` | Ambient type packages | Automatically available without explicit `/// <reference>` |

### Path aliases

Path aliases live in the base config and map `@scope/package-name` to `./packages/package-name/src`. This enables cross-package imports that resolve to source during development and declarations after build:

```jsonc
"paths": {
  "@wire-e2e-tests/harness":   ["./packages/harness/src"],
  "@wire-e2e-tests/harness/*": ["./packages/harness/src/*"]
}
```

Every package gets both a bare import and a deep-import (`/*`) alias. Paths are relative to the monorepo root (where the base config lives).

### Exclude patterns

```jsonc
"exclude": [
  "lib", "dist", "target", "node_modules",
  "**/*.js", "**/lib/**", "**/dist/**", "**/target/**", "**/node_modules/**"
]
```

Excludes all build output directories (`lib`, `dist`, `target`), all `node_modules` at any depth, and all `.js` files (compile from `.ts` only). This prevents the compiler from picking up generated output or vendored JS.

---

## 2. Output-specific sub-configs

The base config defines shared options. Three sub-configs override `module`/`moduleResolution`/`target` for each output target.

### `tsconfig.base.esm.json` — ESM output

```jsonc
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "target": "ESNext"
  }
}
```

Used for ESM-first packages. `module: "ESNext"` emits native `import`/`export`. `target: "ESNext"` avoids any downlevel transforms.

### `tsconfig.base.cjs.json` — CJS output (Node-native resolution)

```jsonc
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "esnext"
  }
}
```

Used for CJS output in hybrid packages and Node-native module resolution. `module: "nodenext"` + `moduleResolution: "nodenext"` enables Node's native ESM/CJS interop rules — requires file extensions in imports. `target` stays `"esnext"` because the CJS transform only changes module syntax, not language features.

**Note:** Some per-package CJS tsconfigs override further to `module: "commonjs"` / `moduleResolution: "node"` with `ignoreDeprecations: "6.0"` when targeting pure CommonJS output (see hybrid packaging below).

### `tsconfig.base.jest.json` — Jest/test output

For `wire-e2e-tests`:

```jsonc
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "nodenext",
    "ignoreDeprecations": "6.0",
    "composite": true,
    "sourceMap": true,
    "inlineSourceMap": false
  }
}
```

For `wire-libraries-ts`:

```jsonc
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "node16",
    "moduleResolution": "node16",
    "ignoreDeprecations": "6.0",
    "sourceMap": true,
    "inlineSourceMap": false
  }
}
```

Both flip to **external source maps** (`sourceMap: true`, `inlineSourceMap: false`) — Jest needs separate `.js.map` files for accurate stack traces and coverage mapping. `module` is set to CommonJS-compatible mode because Jest's default transform pipeline runs CJS. `ignoreDeprecations: "6.0"` silences warnings about `moduleResolution: "node"` being legacy.

---

## 3. Per-package tsconfig structure

Each package in a monorepo has its own tsconfig files that extend the appropriate base:

```
packages/foo/
├── tsconfig.json           # Project references root
├── tsconfig.esm.json       # ESM output → lib/esm/
├── tsconfig.cjs.json       # CJS output → lib/cjs/ (hybrid only)
└── tsconfig.cjs.jest.json  # Jest CJS output → lib/test-cjs/ (if tests need CJS)
```

### Root `tsconfig.json` — orchestrator only

```jsonc
{
  "extends": "../../etc/tsconfig/tsconfig.base.json",
  "files": [],
  "references": [
    { "path": "./tsconfig.esm.json" },
    { "path": "./tsconfig.cjs.json" },
    { "path": "./tsconfig.cjs.jest.json" }
  ]
}
```

`files: []` means this config compiles nothing itself. It only orchestrates the sub-configs via project references. `tsc -b tsconfig.json` builds all referenced configs in dependency order.

### ESM sub-config

```jsonc
{
  "extends": "../../etc/tsconfig/tsconfig.base.esm.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib/esm"
  },
  "include": ["src"]
}
```

Compiles `src/` → `lib/esm/` using the ESM base settings.

### CJS sub-config

```jsonc
{
  "extends": "../../etc/tsconfig/tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib/cjs",
    "module": "commonjs",
    "moduleResolution": "node",
    "ignoreDeprecations": "6.0"
  },
  "include": ["src"]
}
```

Compiles the same `src/` → `lib/cjs/` using CommonJS module output. `moduleResolution: "node"` (the legacy Node algorithm) is required for CommonJS emit. `ignoreDeprecations: "6.0"` suppresses the deprecation warning for this resolution mode.

### Jest sub-config

```jsonc
{
  "extends": "../../etc/tsconfig/tsconfig.base.jest.json",
  "compilerOptions": {
    "rootDir": "tests",
    "outDir": "lib/test-cjs",
    "module": "commonjs",
    "moduleResolution": "node",
    "ignoreDeprecations": "6.0",
    "composite": true,
    "incremental": true,
    "paths": {
      "@wireio/sdk-core":   ["./src"],
      "@wireio/sdk-core/*": ["./src/*"]
    }
  },
  "references": [
    { "path": "./tsconfig.cjs.json" }
  ],
  "include": ["tests"]
}
```

Key details:
- **`rootDir: "tests"`** — tests live in a separate `tests/` directory, not alongside source.
- **`outDir: "lib/test-cjs"`** — compiled tests go to their own output dir, separate from the library build.
- **`paths` overrides** — re-map the package's own scope (`@wireio/sdk-core`) to point at local `./src` so tests import the source directly rather than the built output.
- **`references`** — declares a dependency on `tsconfig.cjs.json` so `tsc -b` builds the library before the tests.

---

## 4. Hybrid CJS + ESM Packaging

Libraries consumed by both CJS and ESM consumers need dual output. This is **only for published npm packages** — internal-only packages should be ESM-only.

### `package.json` exports map

From `@wireio/sdk-core`:

```jsonc
{
  "name": "@wireio/sdk-core",
  "types": "lib/esm/index.d.ts",
  "main": "lib/cjs/index.js",
  "module": "lib/esm/index.js",
  "exports": {
    ".": {
      "import": "./lib/esm/index.js",
      "require": "./lib/cjs/index.js",
      "types": "./lib/esm/index.d.ts"
    },
    "./*": {
      "import": "./lib/esm/*.js",
      "require": "./lib/cjs/*.js",
      "types": "./lib/esm/*.d.ts"
    }
  },
  "files": ["lib", "README.md"],
  "scripts": {
    "build": "tsc -b tsconfig.json",
    "build:dev": "tsc -b tsconfig.json -w",
    "test": "jest",
    "fix:hybrid:exports": "node ../../scripts/fix-hybrid-output.mjs ."
  }
}
```

Field-by-field:

| Field | Value | Purpose |
|---|---|---|
| `types` | `lib/esm/index.d.ts` | TypeScript type entry point (legacy tooling fallback) |
| `main` | `lib/cjs/index.js` | CJS entry for `require()` (legacy bundlers, Node CJS) |
| `module` | `lib/esm/index.js` | ESM entry (legacy bundlers that understand `module` field) |
| `exports["."].import` | `./lib/esm/index.js` | Node ESM entry via `import` |
| `exports["."].require` | `./lib/cjs/index.js` | Node CJS entry via `require()` |
| `exports["."].types` | `./lib/esm/index.d.ts` | TypeScript resolution for modern `moduleResolution` |
| `exports["./*"]` | Deep-import wildcards | Allows `import { foo } from "@wireio/sdk-core/utils"` |

### Post-build fixup script

TypeScript's CJS output and ESM output both need post-processing for Node compatibility:

```js
#!/usr/bin/env node
// scripts/fix-hybrid-output.mjs
//
// 1. Create lib/cjs/package.json with {"type":"commonjs"}
//    Node.js uses the nearest package.json to determine module type.
//    Without this, if the root package.json has "type": "module",
//    Node treats .js files in lib/cjs/ as ESM and fails.
//
// 2. Fix ESM relative imports — add .js extensions
//    TypeScript emits `import { foo } from "./bar"` but Node's
//    native ESM loader requires `import { foo } from "./bar.js"`.
//    Walk lib/esm/, find extensionless relative import specifiers
//    in .js and .d.ts files, and append .js.
//    Handles both file imports (→ .js) and directory imports (→ /index.js).
```

Run as a build step:

```jsonc
"fix:hybrid:exports": "node ../../scripts/fix-hybrid-output.mjs ."
```

### When to use hybrid packaging

| Package type | Module strategy |
|---|---|
| Published npm library consumed by unknown dependents | Hybrid CJS + ESM |
| Internal monorepo package | ESM-only |
| CLI tool | ESM-only |
| Web app bundle input | ESM-only (bundler handles it) |

---

## 5. CLI Tools

### Entry point

```ts
#!/usr/bin/env node
import "source-map-support/register"
```

Always register source-map-support first. Stack traces should point to `.ts` lines.

### Framework-native dispatch

Use the CLI framework's routing — don't rebuild it with `switch` or `match`:

```ts
Yargs(cleanArgs)
  .command(Command.create, "Create a new cluster", builder, handler)
  .command(Command.run, "Start an existing cluster", identity, handler)
  .command(Command.destroy, "Tear down a cluster", identity, handler)
  .demandCommand(1)
  .strict()
  .parse()
```

- **Enum members as command names.** `Command.create`, not `"create"`.
- **Collocate builder and handler.** Don't split across files.
- **`identity` for no-op builders.** Import from lodash.

### Shared state via middleware

```ts
const globalArgs = { clusterPath: "", configFile: "", force: false }

.middleware(({ clusterPath, force }) => {
  Object.assign(globalArgs, {
    clusterPath,
    configFile: Path.join(clusterPath, "config.json"),
    force,
  })
  ProcessManager.setClusterPath(clusterPath)
})
```

### Signal handlers at module scope

```ts
let activeManager: ClusterManager | null = null

const shutdown = async () => {
  log.info("Shutting down...")
  await activeManager?.stop()
}

process.on("SIGINT", () => void shutdown())
process.on("SIGTERM", () => void shutdown())
```

---

## 6. Process Management

CLI args are always `string[]` arrays, never shell-interpolated strings:

```ts
const args = ["--host", config.host, "--port", String(config.port)]
if (config.verbose) args.push("--verbose")
if (config.extraArgs) args.push(...config.extraArgs)
```

### Lifecycle: `start()` / `stop()`

- `start()` spawns the process, waits for a health-check endpoint, returns.
- `stop()` looks up the handle and kills it.
- Both are idempotent where feasible.

---

## 7. Config Persistence

Resolved config objects are serialized to JSON during `create` and loaded from disk for subsequent commands:

- Expensive resolution (binary lookups, directory creation) happens once.
- The persisted file is the single source of truth.
- Config interfaces must be JSON-serializable.
- Executable paths are resolved and validated in a dedicated `resolveExePaths()` function before the config is constructed.

---

# Appendix — Interface Design Summary

| Interface | Role | Fields optional? | Examples |
|---|---|---|---|
| `FooOptions` | Caller input | All optional | `AnvilOptions`, `KiodOptions` |
| `FooConfig` | Runtime config | None (`Required<FooOptions>`) | `AnvilConfig`, `KiodConfig` |
| `ExePaths` | Resolved binary locations | None (validated at build) | All paths checked with `existsSync` |
| `ProcessConfig` | Spawn descriptor | Mix | `{ label, command, args, cwd?, env? }` |
| `ProcessHandle` | Returned resource handle | None | `{ pid, kill(), wait() }` |
| `FooState` | Serializable snapshot | None | Written to JSON, loaded on restart |
| `FooProps` | React component props | Mix | `{ name: string, onClick?: () => void }` |
