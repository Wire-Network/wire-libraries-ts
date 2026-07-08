# TypeScript Style Guide

Organization-wide conventions for all TypeScript codebases — Node services, CLI tools, and web applications. Covers language idioms, project configuration, and packaging.


---
# Basics

- **modern code** Use forEach, ... (spreads), map, filter, and reduce modern paradigms instead of for loops and other legacy style code
- **OPP & FP (functional programming)** is preferred over old-school if/else/switch and generally branching code.
    - Use `Future` from `@3fv/prelude-ts` for async flows.
    - Use `Option`/`asOption` from `@3fv/prelude-ts` for optional values and chained flows.
    - Use `Either` from `@3fv/prelude-ts` for error handling.
    - Use `match` from `ts-pattern` for pattern matching.
    
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

### Always use `match` (`ts-pattern`) over `switch`

| Situation | Use                           |
|---|-------------------------------|
| Branching produces a value | `match().with().otherwise()`  |
| Exhaustive check on a union/enum | `match().with().exhaustive()` |
| Side-effect dispatch (start, stop, destroy) | `match().with().exhaustive()`          |


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
    serverBin: toBin("server"),
    workerBin: toBin("worker"),
    cliBin: toBin("cli"),
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

function example(): Promise<any> {
	return Deferred.useCallback(d =>
		someNodeCallback(err => {
			return err ? d.reject(err) : d.resolve(bus)
		})
	).promise
}
```


### Rules

- **`.tap()` for side effects, `.map()` for transforms.** Never mix them.
- **`.get()` is a conscious unwrap.** It throws on `None`. Use when the value is definitely present. Use `.getOrElse(fallback)` or `.getOrUndefined()` when absence is possible.

### `Either.try` vs `guard` vs `getValue` — pick by whether you USE the result

Three primitives run a function that might throw. They are **not interchangeable** — choose by what you do with the outcome, never by which one you remember first:

| You want to… | Use | From | Returns |
|---|---|---|---|
| run a throwing fn and **branch on success/failure** (`.match({Left,Right})`, `.getOrElse`, `.map`) | `Either.try(fn)` | `@3fv/prelude-ts` | `Either<Error, T>` |
| run a side-effect **best-effort**, swallow any error, **ignore the result** | `guard(fn)` | `@wireio/shared` | `void` / `Promise<void>` |
| run a fn, swallow any error, get **the value or a default** | `getValue(fn, default)` | `@wireio/shared` | `T` (or `default`) |

```ts
// ✗ WRONG — Either.try whose result is thrown away; liftEither THROWS on a
//   void-returning fn ("liftEither got undefined!"), crashing the swallow path
Either.try(() => Fs.rmSync(pidFile, { force: true }))

// ✓ RIGHT — fire-and-forget side effect
guard(() => Fs.rmSync(pidFile, { force: true }))

// ✓ RIGHT — consuming the Either (what Either.try is FOR)
Either.try(() => execFileSync("pgrep", ["-f", pattern], { stdio: "ignore" }))
  .match({ Left: () => false, Right: () => true })

// ✓ RIGHT — guarded value with a fallback
const port = getValue(() => JSON.parse(Fs.readFileSync(f, "utf8")).port, DefaultPort)
```

**Never call `Either.try(fn)` and discard the returned `Either`.** If nothing consumes the `Either`, you wanted `guard` (or `getValue`). The `return null` trick to appease `liftEither` is not a fix — it still discards the result.

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

### Options compose domain types — never flat primitive bags

An `Options` / `Config` / `Input` interface is a **composition of the richest existing domain types** that already describe the thing, never a re-spelling of their fields as primitives. If a caller has to hand-assemble endpoint strings, duplicate a value into two fields, pass empty arrays as role markers, or thread ten leaves that all came from one object — the shape is wrong.

```ts
// ✗ WRONG — primitive soup; every call site re-assembles what NodeConfig
//   already carries, and httpPort double-carries httpServerAddress's port
{ label, binary, p2pListenEndpoint: `${listen}:${p2pPort}`, httpServerAddress,
  httpPort, producerNames: [], keys: [], configPath: nodePath, dataPath: nodePath }

// ✓ RIGHT — compose the domain types; derive everything inside the component
export interface NodeopOptions {
  node: NodeConfig              // name/role/ports/peers + the cluster config
  operator?: OperatorAccount    // the account the node acts for
  tuning?: NodeopTuningOptions  // genuine per-instance leaves, typed + defaulted
}
```

Rules of thumb: each member is the richest existing type for its concept; derivation (endpoint strings, paths, labels) happens **inside** the component, once; role/variant is expressed by the domain type, not degenerate values (`producerNames: []`); genuine per-instance leaves keep a typed `…TuningOptions` sub-group with defaults. If more than ~5 primitive fields survive, look again.

---

## 4. Factory Model

Use the **async static factory** (`create()`) with a **private constructor** pattern only when one of the two criteria below is met. Plain synchronous constructors stay plain — adding a factory just to follow a pattern is overhead.

**Use a factory when:**
1. Construction is **genuinely async** — filesystem checks, binary lookups, ping handshakes, anything that has to `await` before the instance is usable. Constructors can't be `async`.
2. The class is a **singleton** with a precondition that must be set before first use (see "Singleton variant" below).

**Don't use a factory when:**
- The constructor takes plain values and stores them — no I/O, no async, no validation that needs to fail loudly. A plain `new Foo(opts)` is clearer.
- The "factory" only forwards args to `new`. That's pattern-matching for its own sake.

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
  private static rootPath: string
  private static instance: ProcessManager

  static setRootPath(path: string): typeof ProcessManager {
    assert(!this.rootPath || this.rootPath === path, "Already set")
    this.rootPath = path
    return this
  }

  static get(): ProcessManager {
    assert(!!this.rootPath, "Root path must be set first")
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

- **PascalCase** for files exporting a class as primary export: `FooManager.ts`, `ServiceRegistry.ts`
- **camelCase** for functions, constants, utilities: `cli.ts`, `keyGen.ts`, `logger.ts`
- **`index.ts`** for barrel re-exports only
- Filename matches primary export: `FooManager.ts` → `export class FooManager`

### Variables

- **Directory** references → suffix `Path`: `buildPath`, `rootPath`, `dataPath`
- **File** references → suffix `File`: `configFile`, `genesisFile`, `stateFile`
- **Subpath constants** (relative segments) → suffix `Subpath`: `LedgerSubpath`, `StateSubpath`

### Verbs — the standard stems

Names are not free choices: find the standard stem (or the repo's existing name for the concept) and use it verbatim. A synonym for an established name is a fork.

| Concept | Standard | BANNED synonyms |
|---|---|---|
| Get-or-throw / assertion helper | `assert*` (`assertOperator`, `assertProviderName`) | **`require*` — never.** `require` is the Node global module fn (worse under CJS output) |
| Construction / factory | `create*` | `make*`, `build*` (for factories), `getOrMake` |
| "new / newly created" | `new*` | `fresh*` |
| Composition of builds / accumulation | `append` | `apply` (collides with `Function.apply`) |
| Facade variant backend | `<facadeName><Variant>` (`toSignatureProviderEM`) | any different stem (`formatEMSignatureProvider`) |

### No abbreviations

Every word in an identifier is spelled out: `requiredBatchOperatorCollateral`, not `reqBatchopCollat`; `minimumBond`, not `minBond`. Only established short names (`id`) and unit suffixes (`Ms`, `Sec`) are exempt. Chain names use the **full word** — `ethereum` / `solana` for the blockchain (`ethereumWallet`, `solanaKeypair`); `ETH` / `SOL` only where the symbol genuinely means the *token*.

### Enums

String enums with identity mapping — **value === key, character-for-character**:

```ts
enum Command {
  create = "create",
  run = "run",
  destroy = "destroy",
}
```

If the value **cannot** equal the key because it is a meaningful non-identity string (an on-chain account name, an error substring, a wire-format spelling, a file extension), it is **not an identity enum** — either it duplicates a generated type (delete it, import the generated one) or it is a string-keyed lookup of external values (use a `const` object / `as const`, not an `enum`).

**Enums are first-class at every call site.** Anything drawn from a closed set rides its typed enum — never the raw literal, even when a third-party API types the parameter as a string-literal union. POSIX signals go through the signal-name enum (`process.kill(pid, ProcessSignalName.SIGKILL)`, never `"SIGKILL"`); chain kinds, statuses, and attestation types come from their generated enums. Raw literals don't survive renames; enum members do.

### Numeric literals

Separators for readability: `15_000` (15 seconds), `131_072` (128K), `999_999`.

---

## 6. Declarations and Expressions

### Joined `const` declarations

Group related bindings into a single `const`:

```ts
const argv = await parser.parse(),
  command = argv._[0] as Command,
  rootPath = Path.resolve(argv.rootPath as string),
  configFile = Path.join(rootPath, "config.json"),
  force = argv.force as boolean
```

Use when bindings derive from the same source and share a lifecycle. Separate `const` for independent bindings.

### Fluent method chaining

Methods that configure an instance return `this`:

```ts
class FooManager {
  loadState(): this {
    // ...
    return this
  }
}

// Enables:
await createFooManager(config).loadState().startAndWait()
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

### RPC / chain / network errors are NEVER silent

A `catch` around any RPC, chain, or network interaction (HTTP clients, `ethers`, `@solana/web3.js`, JSON-RPC `fetch`, …) must at minimum log through the framework — even when continuing past the error is correct behavior. A bare `catch {}` or comment-only `catch { /* transient */ }` converts a precise, localized failure into a confusing far-away symptom.

Pick the level by intent, but always log, and always include the **error's message** (the remote reason is the whole point):

- `log.debug` — genuinely-expected, high-frequency control flow (a retry/poll loop where "already resolved" is the normal case). Continue, but leave a breadcrumb.
- `log.warn` — a transient you tolerate that shouldn't recur every iteration; persistent occurrence is a real bug.
- `log.error` (usually + rethrow) — unexpected / fatal; never continue as if nothing happened.

---

## 8. Imports and Dependencies

### Import order

1. Node built-ins (`node:fs`, `node:path`)
2. External packages (`lodash`, `ts-pattern`, `@3fv/prelude-ts`)
3. Internal monorepo packages (`@wireio/shared`)
4. Relative imports (`./utils.js`, `../config.js`)

Blank line between each group.

### Relative import paths

- **Always include the `.js` extension** on relative imports. `import { X } from "./foo.js"`, never `"./foo"`. Node's native ESM loader and `nodenext` module resolution both require the extension.
- **Never reference a directory directly.** Write `import { X } from "./rpc/index.js"`, not `"./rpc"`. The resolver finds `index.ts` via the explicit `index.js` path; keeping the path explicit means no surprises across `moduleResolution` modes and no dependency on silent directory-resolution behaviour.

### Barrel exports (`index.ts`)

- Every subdirectory with public exports has an `index.ts` barrel of `export * from "./<file>.js"` lines only — no logic, types, or constants live in the barrel itself.
- **File re-exports include the `.js` extension.** `export * from "./Paths.js"`, never `"./Paths"`.
- **Parent barrels re-export child subdirectories** via `export * from "./<subdir>/index.js"` — NOT `./<subdir>`. Always spell the barrel path out.
- Consumers import from the package root or a directory path (`import { Foo } from "@scope/pkg"`) — never from a specific file. Moving `Foo.ts` between subdirectories should not ripple through callers.
- Never `export *` a third-party package from a local barrel.

### Lodash

Import individual functions:

```ts
import { defaults, range, last, identity } from "lodash"
```

Use for focused utilities only. Don't use for things native `Array`/`Object` methods handle.

---

## 9. General Rules

- **No magic literals.** Extract to namespace constants if not trivially obvious.
- **Use `null` for intentional absence.** Do not return or store `undefined` as a meaningful value in new code. Use optional properties only for caller-provided configuration surfaces, and normalize runtime absence to `null`.
- **JSDoc on every public / exported symbol.** That covers exported functions, exported classes, public methods, exported interfaces (and every interface field), type aliases, enums, exported constants, and public class fields/properties. **Skip:** local (function-scoped) variables and `private`/`protected` class fields — their names plus types already document them.
- **`source-map-support/register`** at every CLI/service entry point.
- **No default exports.** Named exports only.
- **One concept per file.** One class, one factory, or one focused set of utilities.
- **Design decisions are never driven by file count or "simpler".** "Fewer files", "less surface area", "less ceremony", "let's consolidate" are not valid inputs to an architecture or API-shape decision. Decide on semantic correctness, the plan's intent, and these rules — if the semantically-correct answer is more files / more types, that is the answer.
- **"No ceremony" means no EMPTY wrapping** — a lambda that wraps a single call, dead indirection, a band-aid. It never justifies collapsing *meaningful* typed/semantic structure to shrink a count. Judge by semantic content, not by number of symbols.

---

## 10. Logging

Every file that logs diagnostics makes its **own** logger — the filename becomes the category, so every line is tagged with its source module for free:

```ts
import { getLogger } from "@wireio/shared"

const log = getLogger(__filename)          // CJS
// const log = getLogger(import.meta.filename)  // ESM
```

- **Never `export const log` and import it across files.** A shared `log` singleton erases the per-module category — every line looks like it came from `logger.ts`.
- **Never `console.log` / `console.warn` / `console.error` in library, service, or harness code.** The framework logger writes through to its sinks immediately (jest buffers `console.*` until the run ends — useless for live diagnosis), carries timestamp/level/category, and level-filters.
- **Never name a logger `out`** or anything ambiguous. `log` for diagnostics; dedicated `stdout` / `stderr` stream loggers (via a routing appender in the package's `logger.ts`) when a CLI needs a clean machine-readable data channel.
- Carve-outs: a CLI `main()`'s first lines before the logger exists; build/deploy scripts whose stdout **is** the developer UI; tests that assert on stdout. Everything else uses the framework.

---

## 11. Timer Hygiene

**Every `setTimeout` armed inside a `Promise.race` is cleared the moment the race settles.** A timer that loses the race but stays pending is a leaked handle: one per call parked on the event loop, and under jest it holds the worker open past its exit grace — the perennial *"A worker process has failed to exit gracefully"* warning traces to exactly this class (a phase executor's stale step timer, then a process manager's 30s graceful-kill escalation timer, each found the hard way).

```ts
let escalation: ReturnType<typeof setTimeout> | null = null
const timer = new Promise<"timeout">(resolve => {
  escalation = setTimeout(() => resolve("timeout"), GracefulKillMs)
})
const outcome = await Promise.race([exited, timer, aborted]).finally(() => {
  if (escalation != null) clearTimeout(escalation)
})
```

Long-lived module-scope timers (caches, lock expiries) that must not block process exit are `.unref()`d at creation.

---

## 12. `null` over `undefined`

When the choice is yours, `null` is the "no value" sentinel — `undefined` is reserved for what the language forces (`?` optional params/props, `Promise<void>`, third-party APIs; normalize those at the boundary).

**This repo compiles with `strictNullChecks: false`** (see `etc/tsconfig/tsconfig.base.json`), which changes what the rule buys you:

- **Never write `?? null` to "normalize" a value** — `arr.find(...)`, `map.get(k)`, an optional field: return/pass them as-is. With the checker off, the coalesce is dead noise.
- **Never append `| null` / `| undefined` to a return type or field** to satisfy the rule — write the plain type; callers guard with `!= null` (catches both).
- Use an explicit `null` **only where it carries runtime meaning you rely on** — chiefly JSON persistence: `JSON.stringify({ x: undefined })` drops the key, `{ x: null }` survives. A persisted/serialized slot that must round-trip as present is the legitimate `null`.
- `let pending: Foo | null = null` for assign-later locals remains the standing form (matches the codebase; the annotation documents intent even unchecked).

---

## 13. Generated Types First

Before declaring **any** type touching chain state, OPP, attestations, or a network request/response shape: **grep the generated sources first**. In this repo that is `sdk-core`'s generated `SysioContractTypes.ts` (the `SysioContracts` namespace — per-contract action-data types, table-row types, contract enums, and the `SysioContractName` / `SysioContractMapping` / `SysioContractDefinitions` registry); in consumer repos it additionally includes `@wireio/opp-typescript-models`.

- **Never hand-roll a duplicate** of a generated type. A dupe drifts the moment the proto/ABI changes and loses the precise field types.
- **Never use `unknown` / `any` for a field that has a real type.** `amount` on a chain-token type is the generated amount type, never `unknown`. The only legitimate `unknown`s: a caught error, a raw not-yet-parsed blob, a documented type-erased existential. `any` only at a genuinely broken third-party boundary, normalized away immediately.

---

## 14. One Generic Facade per Concept

When a single concept has several heterogeneous implementations keyed by a closed, typed discriminator (a `KeyType`, a `ChainKind`, a `Format`…), expose **one generic entry point** whose type parameter is that discriminator — never a scattered set of per-variant public functions callers must know to pick between.

```ts
export namespace KeyGenerator {
  export async function create<T extends KeyType>(
    type: T, context: Context, options: CreateOptions = {}
  ): Promise<KeyPair<T>> {
    const keyPair = await match(type as KeyType)
      .with(KeyType.K1,  () => createK1(context.clio))
      .with(KeyType.BLS, () => createBLS(context.sysUtil))
      .with(KeyType.ED,  async () => createED())
      .with(KeyType.EM,  async () => createEM(context.ethereumMnemonic, options.ethereumHdIndex))
      .otherwise(() => { throw new Error(`KeyGenerator: unsupported key type ${KeyType[type] ?? type}`) })
    return keyPair as KeyPair<T>   // the ONE cast — call sites stay precisely typed
  }
  // createK1 / createBLS / createED / createEM are PRIVATE backends.
}
```

- Dispatch with `match` on the discriminator **inside** the facade; the single unavoidable cast lives at the dispatch point, never at call sites.
- Variant backends are named `<facadeName><Variant>` (`toSignatureProviderK1`, `toSignatureProviderBLS`, …) — never a different stem.
- Per-variant inputs ride a typed `Context` / `Options`, not the discriminator.
- Adding a variant is a one-line change inside the facade; the closed discriminator + `match` makes the compiler flag an unhandled variant.

---

## 15. Testing

- **Unit tests are mandatory for every new or modified symbol** — happy path plus at least one failure/edge case, shipped in the same change. Tests mirror the `src/` tree under `tests/`. No exceptions for "trivial" code.
- **Never depend on incidental process ancestry.** A test that assumes `process.ppid` is a `node` binary breaks under wrapper chains (`npx` → `sh`, in-band jest). When a test needs a live pid with a known command basename, **spawn a real child** (`spawn(process.execPath, ["-e", …], { stdio: "ignore" })`, `.unref()` it, reap it in `afterAll`).
- **Never bind or assert a fixed port.** Any test that produces a bind port or URL resolves an available one through the project's availability-checked helper (preferring the named default when free) in `beforeAll` — a hard-pinned port collides with parallel suites and co-resident dev servers.
- Test children and fixtures must not outlive the worker: `.unref()` spawned helpers, clear armed timers, close servers in `afterAll`.

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
      "@wireio/wallet-ext-sdk/*":    ["./packages/wallet-ext-sdk/src/*"]
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
// etc/tsconfig/tsconfig.base.json
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
      "@wireio/shared":         ["./packages/shared/src"],
      "@wireio/shared/*":       ["./packages/shared/src/*"],
      "@wireio/shared-node":    ["./packages/shared-node/src"],
      "@wireio/shared-node/*":  ["./packages/shared-node/src/*"],
      "@wireio/sdk-core":       ["./packages/sdk-core/src"],
      "@wireio/sdk-core/*":     ["./packages/sdk-core/src/*"]
    }
  },
  "include": ["src", "types"],
  "exclude": [
    "lib", "dist", "target", "node_modules",
    "**/*.js", "**/lib/**", "**/dist/**", "**/target/**", "**/node_modules/**"
  ]
}
```

> The example above is trimmed for clarity — every package in the monorepo gets a paired bare and deep-import alias; see `wire-libraries-ts/etc/tsconfig/tsconfig.base.json` for the full set (`shared-web`, `wallet-ext-sdk`, `protoc-gen-*`, `wire-protobuf-bundler`, …).

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
  "@wireio/sdk-core":   ["./packages/sdk-core/src"],
  "@wireio/sdk-core/*": ["./packages/sdk-core/src/*"]
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

Flips to **external source maps** (`sourceMap: true`, `inlineSourceMap: false`) — Jest needs separate `.js.map` files for accurate stack traces and coverage mapping. `module` is set to a CommonJS-compatible mode (`node16` here, `CommonJS` + `moduleResolution: nodenext` in some downstream repos) because Jest's default transform pipeline runs CJS. `ignoreDeprecations: "6.0"` silences warnings about the legacy `node`/`node16` resolution modes.

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
  .command(Command.create, "Create a new instance", builder, handler)
  .command(Command.run, "Start an existing instance", identity, handler)
  .command(Command.destroy, "Tear down an instance", identity, handler)
  .demandCommand(1)
  .strict()
  .parse()
```

- **Enum members as command names.** `Command.create`, not `"create"`.
- **Collocate builder and handler.** Don't split across files.
- **`identity` for no-op builders.** Import from lodash.

### Shared state via middleware

```ts
const globalArgs = { rootPath: "", configFile: "", force: false }

.middleware(({ rootPath, force }) => {
  Object.assign(globalArgs, {
    rootPath,
    configFile: Path.join(rootPath, "config.json"),
    force,
  })
  ProcessManager.setRootPath(rootPath)
})
```

### Signal handlers at module scope

```ts
let activeManager: FooManager | null = null

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

## 8. ESM-only Dependencies from CJS

A CJS-emitting package (`module: nodenext`, `"type": "commonjs"`) that needs an ESM-only dep (`get-port`, `nanoid` v4+, `chalk` v5+, `execa` v6+) cannot `import` it statically — that down-levels to `require()` and throws `ERR_REQUIRE_ESM`. The fix is a dynamic `import()`, done **once, through a single cached module accessor** — never scattered `await import()` calls:

```ts
import { Deferred } from "@wireio/shared"

type GetPortModule = typeof import("get-port")              // whole module, typed from the dep
type GetPortParameters = Parameters<GetPortModule["default"]>

let getPortModule: Deferred<GetPortModule> | null = null

/** Lazily import `get-port` once; every caller shares the same module. */
function importGetPortModule(): Promise<GetPortModule> {
  if (getPortModule === null) {
    getPortModule = new Deferred()                          // assigned SYNC → no double-import race
    import("get-port")
      .then(mod => getPortModule.resolve(mod))
      .catch(err => {
        const failed = getPortModule
        getPortModule = null                                // let a later call retry
        failed.reject(err)                                  // never leave callers hanging
      })
  }
  return getPortModule.promise
}

/** EVERY export goes through the one accessor — one cached module. */
async function getPort(...args: GetPortParameters): Promise<number> {
  return (await importGetPortModule()).default(...args)
}
async function clearPortLocks(): Promise<void> {
  ;(await importGetPortModule()).clearLockedPorts()
}
```

- **Cache assigned synchronously, before the first `await`** — `??=` with an `await` on the right side is a check-then-await race (two concurrent callers both fire `import()`).
- **Cache the whole module**, so every export (default + named) is served from the one import.
- **Type from the module** (`typeof import("dep")`, `Parameters<…>`) — never re-declare the dep's option/return types.
- Under jest this requires `NODE_OPTIONS=--experimental-vm-modules` in the test script; with `module: nodenext`, ts-jest preserves the `import()` so the ESM dep loads under test too.
- Deps that ship CJS (or dual) are imported statically — check the dep's `package.json` `"type"` / `exports` first.

---

# Appendix — Interface Design Summary

| Interface | Role | Fields optional? | Examples |
|---|---|---|---|
| `FooOptions` | Caller input | All optional | `ServerOptions`, `WorkerOptions` |
| `FooConfig` | Runtime config | None (`Required<FooOptions>`) | `ServerConfig`, `WorkerConfig` |
| `ExePaths` | Resolved binary locations | None (validated at build) | All paths checked with `existsSync` |
| `ProcessConfig` | Spawn descriptor | Mix | `{ label, command, args, cwd?, env? }` |
| `ProcessHandle` | Returned resource handle | None | `{ pid, kill(), wait() }` |
| `FooState` | Serializable snapshot | None | Written to JSON, loaded on restart |
| `FooProps` | React component props | Mix | `{ name: string, onClick?: () => void }` |
