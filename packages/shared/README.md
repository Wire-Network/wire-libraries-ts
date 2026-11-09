# @wireio/shared

Core shared utilities for Wire applications, providing a logging framework, type guards, and async helpers that work across browser and Node.js environments.

## Installation

```bash
pnpm add @wireio/shared
```

The package exposes CommonJS and ES module entrypoints. CI checks native Node
imports for this package together with the SDKs; module loading does not require
bundler-specific CommonJS named-export interop.

## Modules

- [Logging](#logging) - Flexible logging framework with multiple appenders
- [Guards](#guards) - Type guards and assertion utilities
- [Helpers](#helpers) - Async utilities including `Deferred`

---

## Logging

A flexible, extensible logging framework supporting multiple log levels, appenders, and contextual logging.

### Basic Usage

```typescript
import { getLoggingManager } from "@wireio/shared"

const logManager = getLoggingManager()
const log = logManager.getLogger("my-module")

log.trace("Detailed trace message")
log.debug("Debug information")
log.info("Informational message")
log.warn("Warning message")
log.error("Error occurred", new Error("Something went wrong"))
log.fatal("Fatal error - application cannot continue")
```

### Log Levels

Levels are ordered by severity (lowest to highest):

| Level | Threshold | Description |
|-------|-----------|-------------|
| `trace` | 0 | Fine-grained debugging |
| `debug` | 1 | Debugging information |
| `info` | 2 | Informational messages |
| `warn` | 3 | Warning conditions |
| `error` | 4 | Error conditions |
| `fatal` | 5 | Critical failures |

### Configuring the Logging Manager

```typescript
import { getLoggingManager, Level, ConsoleAppender } from "@wireio/shared"

const logManager = getLoggingManager()

// Set the root logging level
logManager.setRootLevel(Level.debug)

// Replace default appenders
logManager.setAppenders(new ConsoleAppender({ prettyPrint: true }))

// Add additional appenders
logManager.addAppenders(new MyCustomAppender())

// Configure threshold overrides for specific categories
logManager.addThresholdOverrides(
  [/^database/, "debug"],  // Enable debug for database.* categories
  ["auth", "trace"]        // Enable trace for exact "auth" category
)
```

### Environment-Based Debug Patterns

Set the `DEBUG_PATTERNS` environment variable to enable debug logging for specific categories:

```bash
DEBUG_PATTERNS="database.*,auth.*" node app.js
```

### Level Checking

Check if a level is enabled before expensive operations:

```typescript
if (log.isDebugEnabled()) {
  log.debug("Expensive data:", computeExpensiveDebugInfo())
}
```

### Log Records

Each log record contains:

```typescript
interface LogRecord {
  timestamp: number      // EPOCH Milliseconds
  category: string       // Logger category
  level: LevelKind       // Log level
  message: string        // Log message
  args?: any[]           // Additional arguments
  data?: any             // Structured data
  tags?: string[]        // Tags for filtering
  url?: string           // Source URL (auto-populated)
  env?: string           // Environment (auto-populated)
  errorMessage?: string  // Error message (if Error passed)
  errorStack?: string    // Error stack trace (if Error passed)
}
```

### Built-in Appenders

#### ConsoleAppender

Default appender that writes to the console:

```typescript
import { ConsoleAppender } from "@wireio/shared"

const appender = new ConsoleAppender({
  prettyPrint: true,
  formatter: ({ level, message, category }) =>
    `[${category}] (${level}) ${message}`
})
```

#### AWSFirehoseAppender

Streams logs to AWS Kinesis Data Firehose for centralized log aggregation:

```typescript
import { AWSFirehoseAppender, AWSFirehoseCredentialManager } from "@wireio/shared"

const credManager = new AWSFirehoseCredentialManager()
const firehoseAppender = new AWSFirehoseAppender(credManager)

logManager.addAppenders(firehoseAppender)
```

**Features:**
- Automatic credential refresh before expiration (3-minute buffer)
- Batched record delivery (up to 10 records per batch)
- Queue management with 10,000 record limit (oldest records dropped when exceeded)
- Automatic retry on expired token errors
- Event-driven credential handling via EventEmitter3

**Credential Manager Events:**

```typescript
credManager.on("received", (creds) => {
  console.log("Credentials received, stream:", creds.streamName)
})

credManager.on("expired", () => {
  console.log("Credentials expired")
})
```

**AWS Credentials Structure:**

```typescript
interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  streamName: string      // Firehose delivery stream name
  region: string          // AWS region
  expiration: string      // ISO 8601 expiration timestamp
}
```

The credential manager fetches temporary credentials from an HTTP endpoint and automatically schedules refresh before expiration.

### Custom Appenders

Implement the `Appender` interface:

```typescript
import { Appender, LogRecord } from "@wireio/shared"

class MyCustomAppender implements Appender {
  append(record: LogRecord): void {
    // Send to external service, write to file, etc.
  }
}
```

---

## Guards

Type guards and assertion utilities for runtime type checking with TypeScript type narrowing.

### Primitive Guards

```typescript
import {
  isString, isNumber, isBoolean, isFunction,
  isObject, isArray, isNil, isDefined, isPromise
} from "@wireio/shared"

if (isString(value)) {
  // value is narrowed to string
  console.log(value.toUpperCase())
}

if (isDefined(maybeNull)) {
  // maybeNull is narrowed to exclude null/undefined
}

if (isPromise(result)) {
  // result is narrowed to Promise<any>
  await result
}
```

### Available Guards

| Guard | Type Narrowing |
|-------|----------------|
| `isNil(o)` | `undefined \| null` |
| `isDefined(o)` | Excludes `undefined \| null` |
| `isString(o)` | `string` |
| `isNumber(o)` | `number` (excludes NaN) |
| `isBoolean(o)` | `boolean` |
| `isFunction(o)` | `Function` |
| `isObject(o)` | `Object` |
| `isArray(o)` | `Array<T>` |
| `isPromise(o)` | `Promise<any>` |
| `isSymbol(o)` | `Symbol` |
| `isDate(o)` | `Date` |
| `isPrimitive(o)` | `boolean \| string \| number` |

### Assertions

```typescript
import { assert, AssertError } from "@wireio/shared"

// Throws AssertError if condition is false
assert(user !== null, "User must be defined")

// With function condition
assert(() => array.length > 0, "Array must not be empty")

// Lifted assertions for reuse
const assertPositive = assert.lift(
  (n: number) => n > 0,
  (n) => `Expected positive number, got ${n}`
)

assertPositive(5)   // OK
assertPositive(-1)  // Throws AssertError
```

### Safe Value Access

```typescript
import { getValue, guard } from "@wireio/shared"

// Get value with fallback on error
const name = getValue(() => user.profile.name, "Unknown")

// Execute function, swallow errors
guard(() => riskyOperation())

// With error handler
guard(() => riskyOperation(), (err) => console.error(err))
```

---

## Deferred (a `Promise` you manage)

A `Deferred` is a Promise that can be resolved or rejected externally, useful for coordinating async operations.

```typescript
import { Deferred, DeferredStatus } from "@wireio/shared"

// Create a deferred promise
const deferred = new Deferred<string>()

// Resolve it later
setTimeout(() => deferred.resolve("done"), 1000)

// Await the promise
const result = await deferred.promise
```

### Deferred API

```typescript
// Create with optional existing promise to wrap
const deferred = new Deferred<T>(existingPromise?)

// The underlying promise
deferred.promise: Promise<T>

// Resolve the promise
deferred.resolve(value?: T): void

// Reject the promise
deferred.reject(error: any): void

// Cancel (prevents future resolve/reject)
deferred.cancel(): void

// Status checks
deferred.isFulfilled(): boolean
deferred.isRejected(): boolean
deferred.isSettled(): boolean
deferred.isCancelled(): boolean
deferred.status(): DeferredStatus

// Get result (throws if not settled)
deferred.value: T
deferred.error: Error | undefined
```

### Static Methods

```typescript
// Create an already-resolved Deferred
const resolved = Deferred.resolve("value")

// Delay utility
await Deferred.delay(1000)  // Wait 1 second
```

### Use Cases

**Timeout wrapper:**
```typescript
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const deferred = new Deferred<T>()
  const timer = setTimeout(() => deferred.reject(new Error("Timeout")), ms)

  promise
    .then((v) => { clearTimeout(timer); deferred.resolve(v) })
    .catch((e) => { clearTimeout(timer); deferred.reject(e) })

  return deferred.promise
}
```

**Coordination:**
```typescript
class ResourceLoader {
  private loadDeferred: Deferred<Resource> | null = null

  async load(): Promise<Resource> {
    if (this.loadDeferred) return this.loadDeferred.promise

    this.loadDeferred = new Deferred()
    try {
      const resource = await fetchResource()
      this.loadDeferred.resolve(resource)
    } catch (e) {
      this.loadDeferred.reject(e)
    }
    return this.loadDeferred.promise
  }
}
```

---

## API Reference

### Logging Exports

```typescript
import {
  // Manager
  LoggingManager,
  getLoggingManager,

  // Logger
  Logger,
  LoggerOptions,

  // Levels
  Level,
  LevelKind,
  LevelNames,
  LevelThresholds,

  // Records
  LogRecord,

  // Appenders
  Appender,
  ConsoleAppender,
  DebugAppender,
  AWSFirehoseAppender,

  // Formatters
  Formatter,
} from "@wireio/shared"
```

### Guards Exports

```typescript
import {
  // Primitives
  isNil, isDefined, isString, isNumber, isBoolean,
  isFunction, isObject, isArray, isPromise, isSymbol,
  isDate, isPrimitive,

  // Assertions
  assert, AssertError,

  // Utilities
  getValue, guard,
} from "@wireio/shared"
```

### Helpers Exports

```typescript
import { Deferred, DeferredStatus } from "@wireio/shared"
```
