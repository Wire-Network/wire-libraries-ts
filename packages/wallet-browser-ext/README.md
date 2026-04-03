# @wireio/wallet-browser-ext

A Chrome Manifest V3 browser extension providing a developer wallet for the Wire blockchain network. Built with React 19, Redux Toolkit, and the Web Crypto API.

> **Private package** -- this extension is not published to npm. It is loaded directly into Chrome as an unpacked extension.

## Overview

Wire Wallet is a self-contained browser extension that manages cryptographic key pairs, chain endpoints, and Wire accounts. All sensitive data is encrypted at rest using AES-GCM with PBKDF2-derived keys; the user's password is never stored. The wallet automatically locks after 15 minutes of inactivity.

Web pages communicate with the extension through an EIP-1193-style provider object injected at `window.__WIRE_WALLET__`. The companion client SDK, **@wireio/wallet-ext-sdk**, provides a typed wrapper around this provider.

### Supported key types

| Code | Algorithm | Notes |
|------|-----------|-------|
| K1 | secp256k1 | Default Wire key type |
| R1 | secp256r1 | NIST P-256 / WebAuthn |
| EM | Ethereum | secp256k1 with Ethereum-style addressing |
| ED | Ed25519 | Used by Solana, Sui |

### Supported chain kinds

| Kind | Status |
|------|--------|
| WIRE | Supported |
| ETHEREUM | Planned |
| SOLANA | Planned |
| SUI | Planned |

## Install and Build

The extension is part of the `wire-libraries-ts` monorepo and uses pnpm workspaces.

```sh
# From the monorepo root
pnpm install

# Compile TypeScript (hybrid ESM+CJS output to lib/)
pnpm --filter @wireio/wallet-browser-ext build

# Bundle Chrome extension (webpack output to dist/)
pnpm --filter @wireio/wallet-browser-ext bundle

# Development builds (watch mode)
pnpm --filter @wireio/wallet-browser-ext build:dev    # TypeScript watch
pnpm --filter @wireio/wallet-browser-ext bundle:dev   # Webpack watch

# Clean build artifacts
pnpm --filter @wireio/wallet-browser-ext clean
```

The `build` command produces hybrid ESM+CJS output in `lib/`. The `bundle` command produces the Chrome extension in `dist/`.

## Loading in Chrome

1. Run `pnpm build` (or `pnpm build:dev` for live-reload during development).
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `dist/` directory inside this package.
5. The Wire Wallet icon will appear in the Chrome toolbar.

## Architecture

The extension consists of four entry points, each compiled by webpack into a separate bundle:

```
dist/
  background.js    Service worker (state management, signing)
  content.js       Content script (message bridge)
  inject.js        Provider injected into page context
  popup.html       Popup UI entry point
  popup.js         React application bundle
  popup.css        Popup styles
  manifest.json    Chrome extension manifest
```

### Background service worker (`src/background/`)

The background service worker is the single source of truth for wallet state. It:

- Holds the decrypted `ExtensionState` in memory while the wallet is unlocked.
- Persists state to `chrome.storage.local` as AES-GCM encrypted ciphertext.
- Handles all sensitive operations: unlock, lock, save state, and transaction signing.
- Signs transactions using `PrivateKey` from `@wireio/sdk-core`.
- Enforces a 15-minute auto-lock timer that resets on every successful operation.

### Content script (`src/content/`)

The content script runs in every page and serves as a message bridge:

- Injects `inject.js` into the page context at `document_start`.
- Relays requests from the page-side provider to the background service worker via `chrome.runtime.sendMessage`.
- Forwards wallet events (account changes, lock/unlock) from the background back to the page.

Message directions:

```
Page (inject.js) --[wire-wallet-to-content]--> Content Script --[chrome.runtime]--> Background
Page (inject.js) <--[wire-wallet-to-page]---- Content Script <--[chrome.runtime]--- Background
Page (inject.js) <--[wire-wallet-event]------- Content Script <--[WALLET_EVENT]----- Background
```

### Injected provider (`src/inject/Provider.ts`)

A self-contained IIFE (no imports) that creates the `window.__WIRE_WALLET__` object in the page context. It:

- Exposes an EIP-1193-style `request()` method for RPC calls.
- Manages pending requests with auto-generated IDs and a 30-second timeout.
- Supports event subscriptions via `on()` and `removeListener()`.
- Communicates exclusively through `window.postMessage`.

### Popup UI (`src/popup/`)

A React 19 single-page application using Redux Toolkit for state management. Features a dark theme with Wire Network gradient branding. The popup communicates with the background service worker via `chrome.runtime.sendMessage`.

## Data Model

### KeyPair

```typescript
interface KeyPair {
  id: string
  name: string
  type: KeyType           // K1, R1, EM, or ED
  privateKey: string      // PVT_K1_... format
  publicKey: string       // PUB_K1_... format
  address?: string        // Ethereum address (for EM keys only)
}
```

### ChainEndpoint

```typescript
interface ChainEndpoint {
  id: string
  name: string
  kind: ChainKind         // WIRE, ETHEREUM, SOLANA, or SUI
  url: string             // Defaults to http://localhost:8888
}
```

### WireAccount

```typescript
interface WireAccount {
  id: string
  name: string            // [a-z1-5.] max 12 characters
  endpoints: string[]     // Array of ChainEndpoint IDs
  keys: string[]          // Array of KeyPair IDs
}
```

### ExtensionState

```typescript
interface ExtensionState {
  keys: KeyPair[]
  endpoints: ChainEndpoint[]
  accounts: WireAccount[]
  activeAccount?: {
    accountId: string
    keyId: string
    endpointId: string
  }
}
```

## Encrypted Storage

Wallet state is encrypted before being written to `chrome.storage.local`. The encryption pipeline:

1. **Key derivation** -- PBKDF2 with 100,000 iterations, SHA-256, and a random 16-byte salt produces a 256-bit AES key.
2. **Encryption** -- AES-GCM with a random 12-byte IV encrypts the JSON-serialized state.
3. **Encoding** -- Salt, IV, and ciphertext are concatenated and Base64-encoded for storage.

The user's password is held in service-worker memory only while the wallet is unlocked. It is never persisted to disk.

## Provider API

The injected provider at `window.__WIRE_WALLET__` exposes the following interface:

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `isWireWallet` | `true` | Identifies the provider as Wire Wallet |
| `version` | `string` | Provider version |

### Methods

All methods return a `Promise`.

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `request({ method, params? })` | `RequestArgs` | `Promise<any>` | Send an RPC-style request |
| `on(event, handler)` | `string, Function` | `void` | Subscribe to a wallet event |
| `removeListener(event, handler)` | `string, Function` | `void` | Unsubscribe from a wallet event |

### RPC Methods (`wire_*`)

These are passed as the `method` field of `request()`:

| Method | Description |
|--------|-------------|
| `wire_isUnlocked` | Returns `boolean` indicating whether the wallet is currently unlocked |
| `wire_getAccounts` | Returns an array of all accounts configured in the wallet |
| `wire_getActiveAccount` | Returns the currently active account (name, public key, endpoint) or `null` |
| `wire_getPublicKeys` | Returns an array of public key strings for the active account |
| `wire_getEndpoints` | Returns an array of configured chain endpoints |
| `wire_signTransaction` | Signs a serialized transaction; params: `[{ serializedTransaction, chainId?, requiredKeys? }]` |

### Events

| Event | Description |
|-------|-------------|
| `accountChanged` | The active account was switched |
| `endpointChanged` | The active endpoint was switched |
| `lock` | The wallet was locked |
| `unlock` | The wallet was unlocked |
| `connect` | The wallet connected |
| `disconnect` | The wallet disconnected |

### Background Messages

Internal messages between the popup/content script and the background service worker:

| Message Type | Direction | Description |
|-------------|-----------|-------------|
| `HAS_VAULT` | Popup -> Background | Check if an encrypted vault exists |
| `IS_UNLOCKED` | Any -> Background | Check if wallet is currently unlocked |
| `SETUP` | Popup -> Background | Initialize a new vault with a password |
| `UNLOCK` | Popup -> Background | Decrypt and load state with password |
| `LOCK` | Popup -> Background | Clear state from memory |
| `GET_STATE` | Popup -> Background | Retrieve decrypted state |
| `SAVE_STATE` | Popup -> Background | Encrypt and persist updated state |
| `GET_ACCOUNTS` | Content -> Background | List accounts (used by provider) |
| `SIGN_REQUEST` | Content -> Background | Sign a transaction (used by provider) |

## Features

### Key Management

- Generate new key pairs for any supported key type.
- Import existing key pairs from private key strings (`PVT_K1_...` format).
- Rename and delete key pairs.
- Copy public keys to clipboard.
- Show or hide private keys in the UI.

### Endpoint Management

- Add, edit, and delete chain endpoints.
- Each endpoint has a name, URL, and chain kind.
- Default endpoint: `http://localhost:8888` (local Wire node).

### Account Management

- Create, edit, and delete Wire accounts.
- Account names follow Wire naming rules: lowercase `a-z`, digits `1-5`, periods `.`, maximum 12 characters.
- Each account references one or more key pairs and chain endpoints.
- Select an active account with a specific key and endpoint.

### Security

- Password-encrypted persistent storage (AES-GCM + PBKDF2).
- Password is never written to disk.
- 15-minute auto-lock clears all sensitive data from memory.
- Private keys are only accessible while the wallet is unlocked.

## Development

### Prerequisites

- Node.js (see root `.nvmrc`)
- pnpm
- Google Chrome

### Project structure

```
src/
  background/          Service worker
    index.ts
  content/             Content script
    index.ts
  inject/              Page-injected provider
    Provider.ts
  popup/               React popup UI
    App.tsx             Root component
    Store.ts            Redux store
    Hooks.ts            Typed Redux hooks
    index.html          HTML template
    index.tsx           React entry point
    styles.css          Global styles
    assets/             Icons, images
    components/         Reusable UI components
    slices/             Redux Toolkit slices
    views/              Page-level view components
  Crypto.ts            AES-GCM encryption/decryption
  Storage.ts           Encrypted chrome.storage wrapper
  Types.ts             Shared TypeScript interfaces
  Validation.ts        Input validation helpers
```

### Build tooling

- **Webpack** bundles four entry points (`background`, `content`, `inject`, `popup`) into the `dist/` directory.
- **ts-loader** compiles TypeScript.
- **MiniCssExtractPlugin** extracts CSS into separate files.
- **CopyPlugin** copies `manifest.json` to the output.
- **HtmlWebpackPlugin** generates `popup.html` with the popup chunk injected.

### Companion SDK

For web applications that need to interact with the wallet, use **@wireio/wallet-ext-sdk** -- a lightweight typed client that wraps the `window.__WIRE_WALLET__` provider.

```sh
npm install @wireio/wallet-ext-sdk
```

## License

FSL-1.1-Apache-2.0
