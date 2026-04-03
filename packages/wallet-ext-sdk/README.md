# @wireio/wallet-ext-sdk

TypeScript client SDK for interacting with the Wire Wallet browser extension.

Available on npm: <https://www.npmjs.com/package/@wireio/wallet-ext-sdk>

## Overview

This package provides a typed `WireWalletClient` class that wraps the `window.__WIRE_WALLET__` provider injected by the Wire Wallet browser extension. It handles provider detection, method calls, event subscriptions, and error handling with zero runtime dependencies (only `tslib`).

The SDK is published as a hybrid ESM+CJS package with full TypeScript declarations.

## Install

```sh
npm install @wireio/wallet-ext-sdk
```

```sh
pnpm add @wireio/wallet-ext-sdk
```

```sh
yarn add @wireio/wallet-ext-sdk
```

## Quick Start

```typescript
import { WireWalletClient } from "@wireio/wallet-ext-sdk"

const wallet = new WireWalletClient()

// Wait for the extension provider to be available (polls for up to 3 seconds)
await wallet.waitForProvider()

// Check if the wallet is unlocked
const unlocked = await wallet.isUnlocked()
console.log("Unlocked:", unlocked)

// Get the active account
const account = await wallet.getActiveAccount()
if (account) {
  console.log("Account:", account.accountName)
  console.log("Public key:", account.publicKey)
  console.log("Endpoint:", account.endpoint.url)
}

// List all accounts
const accounts = await wallet.getAccounts()
for (const acct of accounts) {
  console.log(acct.name, acct.publicKeys)
}

// Sign a transaction
const result = await wallet.signTransaction({
  serializedTransaction: "...",
  chainId: "...",
})
console.log("Signatures:", result.signatures)
```

### Error handling

```typescript
import {
  WireWalletClient,
  WalletNotFoundError,
  WalletLockedError,
  UserRejectedError,
} from "@wireio/wallet-ext-sdk"

const wallet = new WireWalletClient()

try {
  await wallet.waitForProvider(5000)
  const result = await wallet.signTransaction({
    serializedTransaction: "...",
  })
} catch (err) {
  if (err instanceof WalletNotFoundError) {
    console.error("Wire Wallet extension is not installed")
  } else if (err instanceof WalletLockedError) {
    console.error("Wallet is locked -- ask the user to unlock it")
  } else if (err instanceof UserRejectedError) {
    console.error("User rejected the signing request")
  }
}
```

### Listening to events

```typescript
const wallet = new WireWalletClient()
await wallet.waitForProvider()

wallet.on("accountChanged", (data) => {
  console.log("Active account changed:", data)
})

wallet.on("lock", () => {
  console.log("Wallet was locked")
})

wallet.on("unlock", () => {
  console.log("Wallet was unlocked")
})
```

## API Reference

### `WireWalletClient`

The main class for interacting with the Wire Wallet extension.

#### `isInstalled(): boolean`

Synchronously checks whether the Wire Wallet extension is available on the current page.

```typescript
if (wallet.isInstalled()) {
  // provider is ready
}
```

#### `waitForProvider(timeoutMs?: number): Promise<WireWalletProvider>`

Waits for the `window.__WIRE_WALLET__` provider to become available. Polls every 100 ms until the provider is found or the timeout elapses.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeoutMs` | `number` | `3000` | Maximum time to wait in milliseconds |

Returns the `WireWalletProvider` instance. Throws `WalletNotFoundError` if the timeout is reached.

#### `isUnlocked(): Promise<boolean>`

Returns `true` if the wallet is currently unlocked and ready to sign transactions.

#### `getAccounts(): Promise<WireAccountInfo[]>`

Returns all accounts configured in the wallet.

Each `WireAccountInfo` contains:

```typescript
{
  name: string
  publicKeys: string[]
  endpoints: Array<{ name: string; url: string; kind: ChainKind }>
}
```

#### `getActiveAccount(): Promise<ActiveAccountInfo | null>`

Returns details about the currently selected account, or `null` if no account is active.

Each `ActiveAccountInfo` contains:

```typescript
{
  accountName: string
  publicKey: string
  endpoint: { name: string; url: string; kind: ChainKind }
}
```

#### `getPublicKeys(): Promise<string[]>`

Returns the public key strings associated with the active account.

#### `getEndpoints(): Promise<Array<{ name: string; url: string; kind: string }>>`

Returns all chain endpoints configured in the wallet.

#### `signTransaction(request: SignTransactionRequest): Promise<SignTransactionResult>`

Signs a serialized transaction using the active account's key.

**Request:**

```typescript
interface SignTransactionRequest {
  /** Serialized transaction bytes as hex string */
  serializedTransaction: string
  /** Chain ID (optional) */
  chainId?: string
  /** Required public keys (optional) */
  requiredKeys?: string[]
}
```

**Result:**

```typescript
interface SignTransactionResult {
  /** Array of signature strings */
  signatures: string[]
  /** The serialized transaction that was signed (hex) */
  serializedTransaction: string
}
```

#### `on(event: WireWalletEvent, handler: EventHandler): void`

Subscribe to a wallet event. See the Events section for available event names.

#### `removeListener(event: WireWalletEvent, handler: EventHandler): void`

Unsubscribe a previously registered event handler.

## Types

All types are exported from the package entry point.

### Enums

#### `KeyType`

```typescript
enum KeyType {
  K1 = "K1",   // secp256k1
  R1 = "R1",   // secp256r1 (NIST P-256)
  EM = "EM",   // Ethereum
  ED = "ED",   // Ed25519
}
```

#### `ChainKind`

```typescript
enum ChainKind {
  WIRE = "WIRE",
  ETHEREUM = "ETHEREUM",
  SOLANA = "SOLANA",
  SUI = "SUI",
}
```

### Interfaces

| Interface | Description |
|-----------|-------------|
| `WireWalletProvider` | The raw provider object at `window.__WIRE_WALLET__` |
| `WireAccountInfo` | Account name, public keys, and endpoints |
| `ActiveAccountInfo` | Active account name, selected public key, and selected endpoint |
| `SignTransactionRequest` | Input for `signTransaction` |
| `SignTransactionResult` | Output from `signTransaction` |
| `RequestArgs` | Generic RPC request shape (`{ method, params? }`) |

### Type aliases

| Type | Description |
|------|-------------|
| `WireWalletEvent` | Union of event name strings |
| `EventHandler` | `(...args: any[]) => void` |
| `WireWalletMethod` | Union of all `wire_*` method name strings |

### Global augmentation

The package augments the global `Window` interface:

```typescript
interface Window {
  __WIRE_WALLET__?: WireWalletProvider
}
```

This means `window.__WIRE_WALLET__` is typed automatically when the package is installed.

## Error Handling

All error classes extend `WireWalletError`, which itself extends `Error`. Each error has a numeric `code` property.

| Class | Code | Message | When thrown |
|-------|------|---------|------------|
| `WireWalletError` | varies | varies | Base class for all wallet errors |
| `WalletNotFoundError` | `4001` | Wire Wallet extension not found. Please install it. | Provider not detected (extension not installed or not loaded) |
| `WalletLockedError` | `4002` | Wire Wallet is locked. Please unlock it first. | Operation attempted while the wallet is locked |
| `UserRejectedError` | `4100` | User rejected the request. | User declined a signing or permission prompt |

```typescript
import { WireWalletError } from "@wireio/wallet-ext-sdk"

try {
  await wallet.signTransaction({ serializedTransaction: "..." })
} catch (err) {
  if (err instanceof WireWalletError) {
    console.error(`Wallet error ${err.code}: ${err.message}`)
  }
}
```

## Events

Subscribe to wallet lifecycle and state-change events using `on()` and `removeListener()`.

| Event | Payload | Description |
|-------|---------|-------------|
| `accountChanged` | Account data | The user switched the active account |
| `endpointChanged` | Endpoint data | The user switched the active endpoint |
| `lock` | -- | The wallet was locked (manual or auto-lock after 15 minutes) |
| `unlock` | -- | The wallet was unlocked |
| `connect` | -- | The wallet connected to the page |
| `disconnect` | -- | The wallet disconnected |

## License

FSL-1.1-Apache-2.0
