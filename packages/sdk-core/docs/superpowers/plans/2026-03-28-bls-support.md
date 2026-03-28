# BLS12-381 Support for sdk-core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `KeyType.BLS` support to `@wireio/sdk-core` with private key, public key, signature, and proof-of-possession generation using `@noble/curves/bls12-381`, matching the C++ wire-sysio encoding format exactly.

**Architecture:** BLS operations live in a new `src/crypto/BLS.ts` module that wraps `@noble/curves/bls12-381`. A new `src/crypto/BLSSerdes.ts` module handles the custom base64url + RIPEMD160 checksum encoding that matches C++ `fc::raw::pack(checksum_data)`. Existing `KeyType`, `PrivateKey`, `PublicKey`, `Signature`, and low-level crypto functions are extended with BLS branches.

**Tech Stack:** TypeScript, `@noble/curves/bls12-381.js` (already in package.json), `hash.js` (already used for RIPEMD160/SHA256)

---

## Key Technical Details

### BLS Encoding Format (matching C++ libfc)

The C++ side encodes BLS keys/signatures as: `PREFIX` + base64url(`data_bytes` + `check_bytes`)

Where:
- `data_bytes` = raw key/signature data (32 bytes for private key, 96 for public key, 192 for signature)
- `check_bytes` = first 4 bytes of RIPEMD160(data_bytes), interpreted as uint32 LE then packed as uint32 LE (i.e., just the first 4 raw bytes of the RIPEMD160 hash)
- Serialization order: **data first, then checksum** (per `FC_REFLECT_TEMPLATE(..., (data)(check))`)

Prefixes: `PVT_BLS_`, `PUB_BLS_`, `SIG_BLS_`

### BLS KeyGen (HKDF from seed)

The C++ uses standard IETF BLS KeyGen:
1. `PRK = HKDF-Extract(salt="BLS-SIG-KEYGEN-SALT-", IKM=seed||0x00)`
2. `OKM = HKDF-Expand(PRK, info=[0x00, 0x30], L=48)`
3. `SK = OS2IP(OKM) mod r` where `r = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001`

The secret key scalar is stored as 32 bytes in **little-endian** byte order (matching `std::array<uint64_t, 4>` memory layout on x86).

### Byte Ordering

- **Private key**: 32-byte scalar in LE byte order
- **Public key**: G1 affine point, 96 bytes = `x_LE(48) || y_LE(48)` (each Fp element reversed from BE)
- **Signature**: G2 affine point, 192 bytes = `x.c0_LE(48) || x.c1_LE(48) || y.c0_LE(48) || y.c1_LE(48)` (each Fp element reversed from BE)
- `@noble/curves` outputs points in **big-endian**. Conversion: reverse each 48-byte Fp element.

### Proof of Possession (non-standard)

The C++ `pop_prove` hashes the **affine LE public key bytes** (96 bytes) to G2, NOT the standard compressed BE public key. This is a deviation from the standard BLS POP spec. The DST used is `BLS_POP_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_`.

### Test Vector

Seed: `sha256("wire")` = `9b2abfc29cc47494c87171177c2af369fff9f067fd768f6f58c5d83e5c658507`

Expected outputs:
- Private key: `PVT_BLS_3VUaSS7tIjSgYU6c8rggjQw3holItXxPbVB-ijnnKV3XTPWC`
- Public key: `PUB_BLS_3igm9y-m3poDQL9IU-oE2E3rjKVD025aN5_Kpod8aVKjqtg4xOrP-jGtz4wLg_IFzc7gay9YghYwVgNafpxphE2xOY5gzEPa8li1rmtFfdpXguDFhNw2FpuLWSWami8WXgUo3A`
- POP: `SIG_BLS_qdQ36ASsBk_pJ9efSCZmSN5OcqNX7GIxjzpREX8TBOBVpUOheRfZmCGO7jay2lIZiD2vkrODGQDCsa3lfkB2FjhmoTce1TYpMOWv-PoPO4D36Y4yjItfa0iMgouirmcG_rubUJDtgn0bHdvtroCc3HDoBHVeI994Ycs62RVJEROyTjIlTVGk3iXoAK9skkQKz3DM3wT0yevxP_O47Ul85rJWnEVAlAjCUOsirAdu0yO1362pdnnl8kjXaPqEj_EYPvrRXw`

---

### Task 1: Add BLS Serialization Module (`BLSSerdes.ts`)

**Files:**
- Create: `src/crypto/BLSSerdes.ts`
- Test: `tests/crypto/bls.test.ts`

- [ ] **Step 1: Create test file with encoding/decoding tests**

Create `tests/crypto/bls.test.ts`:

```typescript
import "jest"
import { blsEncode, blsDecode } from "@wireio/sdk-core/crypto/BLSSerdes"

describe("BLS Serdes", () => {
  test("encode then decode roundtrips", () => {
    const data = new Uint8Array(32)
    data.fill(0x42)
    const encoded = blsEncode(data)
    const decoded = blsDecode(encoded, 32)
    expect(decoded).toEqual(data)
  })

  test("known private key encoding matches C++", () => {
    // Raw SK bytes for sha256("wire") key
    const skLE = Buffer.from(
      "dd551a492eed2234a0614e9cf2b8208d0c37868948b57c4f6d507e8a39e7295d",
      "hex"
    )
    const encoded = blsEncode(new Uint8Array(skLE))
    expect("PVT_BLS_" + encoded).toBe(
      "PVT_BLS_3VUaSS7tIjSgYU6c8rggjQw3holItXxPbVB-ijnnKV3XTPWC"
    )
  })

  test("decode rejects bad checksum", () => {
    // Tamper with one character
    const encoded = "3VUaSS7tIjSgYU6c8rggjQw3holItXxPbVB-ijnnKV3XTPXC"
    expect(() => blsDecode(encoded, 32)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/shared/code/wire/wire-libraries-ts && pnpm --filter @wireio/sdk-core test -- --testPathPattern=bls`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `BLSSerdes.ts`**

Create `src/crypto/BLSSerdes.ts`:

```typescript
import { ripemd160 } from "hash.js"

/**
 * Encode raw BLS data bytes to base64url with RIPEMD160 checksum.
 * Matches C++ fc::crypto::bls::serialize_base64url format.
 *
 * Wire format: [data_bytes | check_bytes(4)]
 * check = first 4 bytes of RIPEMD160(data_bytes)
 */
export function blsEncode(data: Uint8Array): string {
  const check = blsChecksum(data)
  const packed = new Uint8Array(data.length + 4)
  packed.set(data, 0)
  packed.set(check, data.length)
  return base64UrlEncode(packed)
}

/**
 * Decode base64url-encoded BLS data with RIPEMD160 checksum verification.
 * @param encoded - base64url string (without prefix)
 * @param expectedSize - expected data size in bytes
 */
export function blsDecode(encoded: string, expectedSize: number): Uint8Array {
  const packed = base64UrlDecode(encoded)
  if (packed.length !== expectedSize + 4) {
    throw new Error(
      `BLS decode: expected ${expectedSize + 4} bytes, got ${packed.length}`
    )
  }
  const data = packed.subarray(0, expectedSize)
  const check = packed.subarray(expectedSize, expectedSize + 4)
  const expected = blsChecksum(data)
  if (
    check[0] !== expected[0] ||
    check[1] !== expected[1] ||
    check[2] !== expected[2] ||
    check[3] !== expected[3]
  ) {
    throw new Error("BLS decode: checksum mismatch")
  }
  return data
}

function blsChecksum(data: Uint8Array): Uint8Array {
  const hash: number[] = ripemd160().update(Array.from(data)).digest()
  return new Uint8Array(hash.slice(0, 4))
}

function base64UrlEncode(data: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /data/shared/code/wire/wire-libraries-ts && pnpm --filter @wireio/sdk-core test -- --testPathPattern=bls`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk-core/src/crypto/BLSSerdes.ts packages/sdk-core/tests/crypto/bls.test.ts
git commit -m "feat(sdk-core): add BLS base64url+ripemd160 serialization module"
```

---

### Task 2: Add BLS Core Crypto Module (`BLS.ts`)

**Files:**
- Create: `src/crypto/BLS.ts`
- Modify: `tests/crypto/bls.test.ts`

- [ ] **Step 1: Add BLS keygen and point-conversion tests**

Append to `tests/crypto/bls.test.ts`:

```typescript
import {
  blsKeyGen,
  blsGetPublicKey,
  blsProofOfPossession,
  blsSign,
  blsVerify,
  skToLE,
  skFromLE
} from "@wireio/sdk-core/crypto/BLS"
import { createHash } from "crypto"

function sha256(data: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest())
}

describe("BLS core crypto", () => {
  const seed = sha256("wire")

  test("keygen from sha256('wire') produces known SK", () => {
    const skBE = blsKeyGen(seed)
    const skLE = skToLE(skBE)
    expect(Buffer.from(skLE).toString("hex")).toBe(
      "dd551a492eed2234a0614e9cf2b8208d0c37868948b57c4f6d507e8a39e7295d"
    )
  })

  test("public key matches C++ output", () => {
    const skBE = blsKeyGen(seed)
    const pkLE = blsGetPublicKey(skBE)
    expect(Buffer.from(pkLE).toString("hex")).toBe(
      "de2826f72fa6de9a0340bf4853ea04d84deb8ca543d36e5a379fcaa6877c6952" +
        "a3aad838c4eacffa31adcf8c0b83f205cdcee06b2f5882163056035a7e9c698" +
        "44db1398e60cc43daf258b5ae6b457dda5782e0c584dc36169b8b59259a9a2f16"
    )
  })

  test("proof of possession matches C++ output", () => {
    const skBE = blsKeyGen(seed)
    const popLE = blsProofOfPossession(skBE)
    expect(popLE.length).toBe(192)
    // Verify by decoding the expected SIG_BLS_ string
    const expectedEncoded =
      "qdQ36ASsBk_pJ9efSCZmSN5OcqNX7GIxjzpREX8TBOBVpUOheRfZmCGO7jay2lIZ" +
      "iD2vkrODGQDCsa3lfkB2FjhmoTce1TYpMOWv-PoPO4D36Y4yjItfa0iMgouirmcG_" +
      "rubUJDtgn0bHdvtroCc3HDoBHVeI994Ycs62RVJEROyTjIlTVGk3iXoAK9skkQKz3" +
      "DM3wT0yevxP_O47Ul85rJWnEVAlAjCUOsirAdu0yO1362pdnnl8kjXaPqEj_EYPvrRXw"
    // Decode removes the 4-byte checksum
    const { blsDecode } = require("@wireio/sdk-core/crypto/BLSSerdes")
    const expectedBytes = blsDecode(expectedEncoded, 192)
    expect(Buffer.from(popLE).toString("hex")).toBe(
      Buffer.from(expectedBytes).toString("hex")
    )
  })

  test("sign and verify roundtrip", () => {
    const skBE = blsKeyGen(seed)
    const pkLE = blsGetPublicKey(skBE)
    const message = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const sigLE = blsSign(skBE, message)
    expect(sigLE.length).toBe(192)
    expect(blsVerify(sigLE, message, pkLE)).toBe(true)
  })

  test("verify rejects wrong message", () => {
    const skBE = blsKeyGen(seed)
    const pkLE = blsGetPublicKey(skBE)
    const message = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const sigLE = blsSign(skBE, message)
    const wrong = new Uint8Array([0xca, 0xfe])
    expect(blsVerify(sigLE, wrong, pkLE)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /data/shared/code/wire/wire-libraries-ts && pnpm --filter @wireio/sdk-core test -- --testPathPattern=bls`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `BLS.ts`**

Create `src/crypto/BLS.ts`:

```typescript
import { bls12_381 } from "@noble/curves/bls12-381.js"
import { createHmac } from "crypto"

const BLS_CURVE_ORDER = BigInt(
  "0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001"
)
const POP_DST = "BLS_POP_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_"

/**
 * Derive a BLS secret key from a 32-byte seed using HKDF (IETF KeyGen).
 * Returns 32-byte secret key in big-endian byte order.
 */
export function blsKeyGen(seed: Uint8Array): Uint8Array {
  if (seed.length < 32) throw new Error("BLS seed must be at least 32 bytes")

  const salt = Buffer.from("BLS-SIG-KEYGEN-SALT-", "ascii")
  const ikm = new Uint8Array(seed.length + 1)
  ikm.set(seed)
  ikm[seed.length] = 0

  const prk = createHmac("sha256", salt).update(ikm).digest()
  const L = 48
  const info = Buffer.from([0x00, L])

  let okm = Buffer.alloc(0)
  let prev = Buffer.alloc(0)
  for (let i = 1; okm.length < L; i++) {
    prev = createHmac("sha256", prk)
      .update(Buffer.concat([prev, info, Buffer.from([i])]))
      .digest()
    okm = Buffer.concat([okm, prev])
  }
  okm = okm.subarray(0, L)

  let sk = BigInt("0x" + okm.toString("hex"))
  sk = sk % BLS_CURVE_ORDER

  const hex = sk.toString(16).padStart(64, "0")
  return hexToBytes(hex)
}

/** Convert 32-byte secret key from BE to LE (for C++ wire format). */
export function skToLE(skBE: Uint8Array): Uint8Array {
  const le = new Uint8Array(32)
  for (let i = 0; i < 32; i++) le[i] = skBE[31 - i]
  return le
}

/** Convert 32-byte secret key from LE to BE. */
export function skFromLE(skLE: Uint8Array): Uint8Array {
  return skToLE(skLE) // reverse is its own inverse
}

/**
 * Get 96-byte public key in affine LE format from BE secret key.
 * Returns: x_LE(48) || y_LE(48)
 */
export function blsGetPublicKey(skBE: Uint8Array): Uint8Array {
  const pubPoint = bls12_381.longSignatures.getPublicKey(skBE)
  const uncompressed = pubPoint.toBytes(false) // x_BE(48) || y_BE(48)
  return g1ToAffineLE(uncompressed)
}

/**
 * Generate proof of possession (non-standard, matching C++ pop_prove).
 * Hashes the affine LE public key bytes (96 bytes) to G2 using POP DST.
 * Returns 192-byte signature in affine LE format.
 */
export function blsProofOfPossession(skBE: Uint8Array): Uint8Array {
  const pkLE = blsGetPublicKey(skBE)
  const msgPoint = bls12_381.G2.hashToCurve(pkLE, { DST: POP_DST })
  const sigPoint = msgPoint.multiply(bytesToBigInt(skBE))
  return g2ToAffineLE(sigPoint.toBytes(false))
}

/**
 * Sign a message using BLS. Returns 192-byte signature in affine LE format.
 * Uses standard BLS_SIG DST via noble's longSignatures.sign.
 */
export function blsSign(skBE: Uint8Array, message: Uint8Array): Uint8Array {
  const msgPoint = bls12_381.longSignatures.hash(message)
  const sigPoint = bls12_381.longSignatures.sign(msgPoint, skBE)
  return g2ToAffineLE(sigPoint.toBytes(false))
}

/**
 * Verify a BLS signature. Signature and public key in affine LE format.
 */
export function blsVerify(
  sigLE: Uint8Array,
  message: Uint8Array,
  pkLE: Uint8Array
): boolean {
  const sigBE = affineLE_to_G2Bytes(sigLE)
  const pkBE = affineLE_to_G1Bytes(pkLE)
  const sigPoint = bls12_381.longSignatures.Signature.fromBytes(sigBE)
  const msgPoint = bls12_381.longSignatures.hash(message)
  const pkPoint = bls12_381.G1.Point.fromBytes(pkBE)
  return bls12_381.longSignatures.verify(sigPoint, msgPoint, pkPoint)
}

/**
 * Generate a random BLS private key. Returns 32-byte BE secret key.
 */
export function blsGenerate(): Uint8Array {
  const seed = new Uint8Array(32)
  globalThis.crypto.getRandomValues(seed)
  return blsKeyGen(seed)
}

// --- Internal helpers ---

/** Convert G1 uncompressed BE bytes (96) to affine LE bytes (96). */
function g1ToAffineLE(uncompressed: Uint8Array): Uint8Array {
  const result = new Uint8Array(96)
  // x: reverse first 48 bytes
  for (let i = 0; i < 48; i++) result[i] = uncompressed[47 - i]
  // y: reverse second 48 bytes
  for (let i = 0; i < 48; i++) result[48 + i] = uncompressed[95 - i]
  return result
}

/**
 * Convert G2 uncompressed BE bytes (192) to affine LE bytes (192).
 * Noble G2 uncompressed format: x.c1_BE(48) || x.c0_BE(48) || y.c1_BE(48) || y.c0_BE(48)
 * C++ affine LE format: x.c0_LE(48) || x.c1_LE(48) || y.c0_LE(48) || y.c1_LE(48)
 */
function g2ToAffineLE(uncompressed: Uint8Array): Uint8Array {
  const result = new Uint8Array(192)
  // Noble: [x.c1_BE(48) | x.c0_BE(48) | y.c1_BE(48) | y.c0_BE(48)]
  // C++:   [x.c0_LE(48) | x.c1_LE(48) | y.c0_LE(48) | y.c1_LE(48)]
  const xc1BE = uncompressed.subarray(0, 48)
  const xc0BE = uncompressed.subarray(48, 96)
  const yc1BE = uncompressed.subarray(96, 144)
  const yc0BE = uncompressed.subarray(144, 192)
  // Reverse each component BE -> LE and reorder
  reverseInto(xc0BE, result, 0) // x.c0_LE
  reverseInto(xc1BE, result, 48) // x.c1_LE
  reverseInto(yc0BE, result, 96) // y.c0_LE
  reverseInto(yc1BE, result, 144) // y.c1_LE
  return result
}

/** Convert affine LE G1 (96) back to uncompressed BE (96). */
function affineLE_to_G1Bytes(le: Uint8Array): Uint8Array {
  const result = new Uint8Array(96)
  for (let i = 0; i < 48; i++) result[i] = le[47 - i]
  for (let i = 0; i < 48; i++) result[48 + i] = le[95 - i]
  return result
}

/** Convert affine LE G2 (192) back to uncompressed BE (192). */
function affineLE_to_G2Bytes(le: Uint8Array): Uint8Array {
  const result = new Uint8Array(192)
  // C++: [x.c0_LE | x.c1_LE | y.c0_LE | y.c1_LE]
  // Noble: [x.c1_BE | x.c0_BE | y.c1_BE | y.c0_BE]
  reverseInto(le.subarray(0, 48), result, 48) // x.c0_LE -> x.c0_BE at pos 48
  reverseInto(le.subarray(48, 96), result, 0) // x.c1_LE -> x.c1_BE at pos 0
  reverseInto(le.subarray(96, 144), result, 144) // y.c0_LE -> y.c0_BE at pos 144
  reverseInto(le.subarray(144, 192), result, 96) // y.c1_LE -> y.c1_BE at pos 96
  return result
}

function reverseInto(
  src: Uint8Array,
  dst: Uint8Array,
  offset: number
): void {
  for (let i = 0; i < src.length; i++) {
    dst[offset + i] = src[src.length - 1 - i]
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = ""
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0")
  }
  return BigInt("0x" + hex)
}
```

**IMPORTANT NOTE:** The G2 byte ordering between noble and C++ needs careful verification. The noble `toBytes(false)` format for G2 may use `[x.c1_BE | x.c0_BE | y.c1_BE | y.c0_BE]` or `[x.c0_BE | x.c1_BE | y.c0_BE | y.c1_BE]`. The test will reveal which format noble uses. If the POP test fails, swap the c0/c1 ordering in `g2ToAffineLE` and `affineLE_to_G2Bytes`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /data/shared/code/wire/wire-libraries-ts && pnpm --filter @wireio/sdk-core test -- --testPathPattern=bls`
Expected: PASS (may need to adjust G2 byte ordering if POP test fails)

- [ ] **Step 5: Commit**

```bash
git add packages/sdk-core/src/crypto/BLS.ts packages/sdk-core/tests/crypto/bls.test.ts
git commit -m "feat(sdk-core): add BLS12-381 core crypto operations"
```

---

### Task 3: Add `KeyType.BLS`

**Files:**
- Modify: `src/chain/KeyType.ts`

- [ ] **Step 1: Add BLS to KeyType enum and switch statements**

In `src/chain/KeyType.ts`, add `BLS = "BLS"` to the enum and index 5 to both switch statements:

```typescript
export enum KeyType {
  K1 = "K1",
  R1 = "R1",
  WA = "WA",
  EM = "EM",
  ED = "ED",
  BLS = "BLS"
}

export namespace KeyType {
  export function indexFor(value: KeyType) {
    switch (value) {
      case KeyType.K1: return 0
      case KeyType.R1: return 1
      case KeyType.WA: return 2
      case KeyType.EM: return 3
      case KeyType.ED: return 4
      case KeyType.BLS: return 5
      default: throw new Error(`Unknown curve type: ${value}`)
    }
  }
  export function from(value: number | string) {
    let index: number
    if (typeof value !== "number") {
      index = KeyType.indexFor(value as KeyType)
    } else {
      index = value
    }
    switch (index) {
      case 0: return KeyType.K1
      case 1: return KeyType.R1
      case 2: return KeyType.WA
      case 3: return KeyType.EM
      case 4: return KeyType.ED
      case 5: return KeyType.BLS
      default: throw new Error("Unknown curve type")
    }
  }
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd /data/shared/code/wire/wire-libraries-ts && pnpm --filter @wireio/sdk-core test`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/sdk-core/src/chain/KeyType.ts
git commit -m "feat(sdk-core): add KeyType.BLS enum value"
```

---

### Task 4: Update Low-Level Crypto Functions for BLS

**Files:**
- Modify: `src/crypto/Generate.ts`
- Modify: `src/crypto/GetPublic.ts`
- Modify: `src/crypto/Sign.ts`
- Modify: `src/crypto/Verify.ts`
- Modify: `src/crypto/Recover.ts`
- Modify: `src/crypto/SharedSecret.ts`
- Modify: `src/crypto/index.ts`

- [ ] **Step 1: Update `Generate.ts`**

Add BLS case before the `default`:

```typescript
import { blsGenerate, skToLE } from "./BLS"

// In the switch:
case KeyType.BLS: {
  const skBE = blsGenerate()
  return skToLE(skBE) // Return LE for consistency with wire format
}
```

- [ ] **Step 2: Update `GetPublic.ts`**

Add BLS case:

```typescript
import { blsGetPublicKey, skFromLE } from "./BLS"

// In the switch:
case KeyType.BLS: {
  const skBE = skFromLE(privkey)
  return blsGetPublicKey(skBE)
}
```

- [ ] **Step 3: Update `Sign.ts`**

Add BLS case. BLS signatures don't use r/s/recid parts — store the full 192-byte signature as `r`:

```typescript
import { blsSign, skFromLE } from "./BLS"

// In the switch:
case KeyType.BLS: {
  const skBE = skFromLE(secret)
  const sigLE = blsSign(skBE, message)
  return { type, r: sigLE, s: new Uint8Array(0), recid: 0 }
}
```

- [ ] **Step 4: Update `Verify.ts`**

Add BLS case:

```typescript
import { blsVerify } from "./BLS"

// In the switch:
case KeyType.BLS:
  return blsVerify(signature, message, pubkey)
```

- [ ] **Step 5: Update `Recover.ts`**

Add BLS case (BLS does not support recovery):

```typescript
case KeyType.BLS:
  throw new Error("BLS does not support public key recovery")
```

- [ ] **Step 6: Update `SharedSecret.ts`**

Add BLS case (BLS does not support ECDH):

```typescript
case KeyType.BLS:
  throw new Error("BLS does not support shared secret")
```

- [ ] **Step 7: Update `index.ts`**

Add export for BLS module in `src/crypto/index.ts`:

```typescript
export * from "./BLS"
export * from "./BLSSerdes"
```

- [ ] **Step 8: Verify tests pass**

Run: `cd /data/shared/code/wire/wire-libraries-ts && pnpm --filter @wireio/sdk-core test`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add packages/sdk-core/src/crypto/
git commit -m "feat(sdk-core): integrate BLS into low-level crypto functions"
```

---

### Task 5: Update `PrivateKey` Class for BLS

**Files:**
- Modify: `src/chain/PrivateKey.ts`

- [ ] **Step 1: Update constructor to accept BLS key length (32 bytes)**

In the constructor, add BLS validation alongside K1/R1/EM:

```typescript
if (
  (type === KeyType.K1 || type === KeyType.R1 || type === KeyType.EM || type === KeyType.BLS) &&
  data.length !== 32
) {
  throw new Error("Invalid private key length")
}
```

- [ ] **Step 2: Update `fromString` / `decodeKey` to handle BLS base64url encoding**

In the `decodeKey` function, handle BLS specially since it uses base64url not base58:

```typescript
import { blsDecode } from "../crypto/BLSSerdes"

// Inside decodeKey, in the PVT_ branch:
if (type === KeyType.BLS) {
  const data = new Bytes(blsDecode(parts[2], 32))
  return { type, data }
}
```

- [ ] **Step 3: Update `toString` to use BLS base64url encoding**

```typescript
import { blsEncode } from "../crypto/BLSSerdes"

// In toString():
if (this.type === KeyType.BLS) {
  return `PVT_BLS_${blsEncode(this.data.array)}`
}
return `PVT_${this.type}_${Base58.encodeRipemd160Check(this.data, this.type)}`
```

- [ ] **Step 4: Update `signMessage` for BLS (raw message signing)**

BLS signs raw messages, not digests:

```typescript
if (this.type === KeyType.BLS) {
  return Signature.from(sign(this.data.array, raw, this.type))
}
```

- [ ] **Step 5: Update `toPublic` — no changes needed**

The existing `toPublic()` calls `getPublic()` which already routes to BLS.

- [ ] **Step 6: Update `toWif` and `toElliptic` to throw for BLS**

Add guards:

```typescript
// In toWif():
if (this.type === KeyType.BLS) {
  throw new Error("Unable to generate WIF for BLS key")
}

// In toElliptic():
if (this.type === KeyType.BLS) {
  throw new Error("BLS keys are not elliptic curve keys")
}
```

- [ ] **Step 7: Verify tests pass**

Run: `cd /data/shared/code/wire/wire-libraries-ts && pnpm --filter @wireio/sdk-core test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/sdk-core/src/chain/PrivateKey.ts
git commit -m "feat(sdk-core): add BLS support to PrivateKey class"
```

---

### Task 6: Update `PublicKey` Class for BLS

**Files:**
- Modify: `src/chain/PublicKey.ts`

- [ ] **Step 1: Update `from` to handle BLS base64url format**

In `PublicKey.from()`, when parsing `PUB_BLS_`:

```typescript
import { blsDecode } from "../crypto/BLSSerdes"

// In the PUB_ parsing branch, after determining type:
if (type === KeyType.BLS) {
  const data = new Bytes(blsDecode(parts[2], 96))
  return new PublicKey(type, data)
}
```

Also set size to `undefined` for BLS so it doesn't hit the base58 path:

```typescript
const size =
  type === KeyType.K1 || type === KeyType.R1 || type === KeyType.EM
    ? 33
    : type === KeyType.ED
      ? 32
      : type === KeyType.BLS
        ? 96
        : undefined
```

- [ ] **Step 2: Update `fromABI` for BLS (96 bytes)**

```typescript
if (type === KeyType.BLS) {
  return new PublicKey(type, new Bytes(decoder.readArray(96)))
}
```

- [ ] **Step 3: Update `toString` to use base64url for BLS**

```typescript
import { blsEncode } from "../crypto/BLSSerdes"

// In toString():
if (this.type === KeyType.BLS) {
  return `PUB_BLS_${blsEncode(this.data.array)}`
}
```

- [ ] **Step 4: Verify tests pass**

Run: `cd /data/shared/code/wire/wire-libraries-ts && pnpm --filter @wireio/sdk-core test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk-core/src/chain/PublicKey.ts
git commit -m "feat(sdk-core): add BLS support to PublicKey class"
```

---

### Task 7: Update `Signature` Class for BLS

**Files:**
- Modify: `src/chain/Signature.ts`

- [ ] **Step 1: Update `Signature.from(parts)` for BLS**

BLS signature parts use `r` as the full 192-byte LE signature data:

```typescript
if (value.type === KeyType.BLS) {
  return new Signature(KeyType.BLS, new Bytes(value.r))
}
```

- [ ] **Step 2: Update `Signature.from(string)` for BLS base64url**

```typescript
import { blsDecode } from "../crypto/BLSSerdes"

// In the string parsing branch:
if (type === KeyType.BLS) {
  const data = new Bytes(blsDecode(parts[2], 192))
  return new Signature(type, data)
}
```

- [ ] **Step 3: Update `fromABI` for BLS (192 bytes)**

```typescript
if (type === KeyType.BLS) {
  return new Signature(type, new Bytes(decoder.readArray(192)))
}
```

- [ ] **Step 4: Update `toString` for BLS**

```typescript
import { blsEncode } from "../crypto/BLSSerdes"

// In toString():
if (this.type === KeyType.BLS) {
  return `SIG_BLS_${blsEncode(this.data.array)}`
}
```

- [ ] **Step 5: Update `verifyMessage` for BLS (raw message verification)**

```typescript
case KeyType.BLS:
  return Crypto.verify(
    this.data.array,
    rawMsg,
    publicKey.data.array,
    this.type
  )
```

- [ ] **Step 6: Update `recoverDigest` / `recoverMessage` to throw for BLS**

The existing code calls `Crypto.recover` which already throws for BLS. No change needed.

- [ ] **Step 7: Update `toABI` for BLS**

```typescript
// In toABI():
if (this.type === KeyType.BLS) {
  encoder.writeByte(KeyType.indexFor(this.type))
  encoder.writeArray(this.data.array)
  return
}
```

- [ ] **Step 8: Verify tests pass**

Run: `cd /data/shared/code/wire/wire-libraries-ts && pnpm --filter @wireio/sdk-core test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/sdk-core/src/chain/Signature.ts
git commit -m "feat(sdk-core): add BLS support to Signature class"
```

---

### Task 8: Add Integration Tests with Known Test Vector

**Files:**
- Modify: `tests/crypto/bls.test.ts`

- [ ] **Step 1: Add end-to-end test using high-level classes**

Append to `tests/crypto/bls.test.ts`:

```typescript
import { PrivateKey } from "@wireio/sdk-core/chain/PrivateKey"
import { PublicKey } from "@wireio/sdk-core/chain/PublicKey"
import { Signature } from "@wireio/sdk-core/chain/Signature"
import { KeyType } from "@wireio/sdk-core/chain/KeyType"
import { Bytes } from "@wireio/sdk-core/chain/Bytes"
import { blsKeyGen, skToLE, blsProofOfPossession } from "@wireio/sdk-core/crypto/BLS"
import { blsEncode } from "@wireio/sdk-core/crypto/BLSSerdes"

describe("BLS integration with high-level classes", () => {
  const seed = sha256("wire")
  const skBE = blsKeyGen(seed)
  const skLE = skToLE(skBE)

  const expectedPrivKey =
    "PVT_BLS_3VUaSS7tIjSgYU6c8rggjQw3holItXxPbVB-ijnnKV3XTPWC"
  const expectedPubKey =
    "PUB_BLS_3igm9y-m3poDQL9IU-oE2E3rjKVD025aN5_Kpod8aVKjqtg4xOrP-jGtz4wLg_IFzc7gay9YghYwVgNafpxphE2xOY5gzEPa8li1rmtFfdpXguDFhNw2FpuLWSWami8WXgUo3A"
  const expectedPOP =
    "SIG_BLS_qdQ36ASsBk_pJ9efSCZmSN5OcqNX7GIxjzpREX8TBOBVpUOheRfZmCGO7jay2lIZiD2vkrODGQDCsa3lfkB2FjhmoTce1TYpMOWv-PoPO4D36Y4yjItfa0iMgouirmcG_rubUJDtgn0bHdvtroCc3HDoBHVeI994Ycs62RVJEROyTjIlTVGk3iXoAK9skkQKz3DM3wT0yevxP_O47Ul85rJWnEVAlAjCUOsirAdu0yO1362pdnnl8kjXaPqEj_EYPvrRXw"

  test("PrivateKey from seed produces correct string", () => {
    const pvt = new PrivateKey(KeyType.BLS, new Bytes(skLE))
    expect(pvt.toString()).toBe(expectedPrivKey)
  })

  test("PrivateKey roundtrips through string", () => {
    const pvt = PrivateKey.from(expectedPrivKey)
    expect(pvt.type).toBe(KeyType.BLS)
    expect(pvt.toString()).toBe(expectedPrivKey)
  })

  test("PublicKey derivation produces correct string", () => {
    const pvt = PrivateKey.from(expectedPrivKey)
    const pub = pvt.toPublic()
    expect(pub.toString()).toBe(expectedPubKey)
  })

  test("PublicKey roundtrips through string", () => {
    const pub = PublicKey.from(expectedPubKey)
    expect(pub.type).toBe(KeyType.BLS)
    expect(pub.toString()).toBe(expectedPubKey)
  })

  test("Proof of possession matches C++ output", () => {
    const popLE = blsProofOfPossession(skBE)
    const popStr = "SIG_BLS_" + blsEncode(popLE)
    expect(popStr).toBe(expectedPOP)
  })

  test("Signature roundtrips through string", () => {
    const sig = Signature.from(expectedPOP)
    expect(sig.type).toBe(KeyType.BLS)
    expect(sig.toString()).toBe(expectedPOP)
  })

  test("BLS sign/verify roundtrip through high-level classes", () => {
    const pvt = PrivateKey.from(expectedPrivKey)
    const pub = pvt.toPublic()
    const message = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const sig = pvt.signMessage(message)
    expect(sig.type).toBe(KeyType.BLS)
    expect(sig.toString()).toMatch(/^SIG_BLS_/)
    expect(sig.verifyMessage(message, pub)).toBe(true)
  })

  test("BLS key generation produces unique keys", () => {
    const a = PrivateKey.generate(KeyType.BLS)
    const b = PrivateKey.generate(KeyType.BLS)
    expect(a.toString()).not.toBe(b.toString())
  })

  test("BLS recovery throws", () => {
    const pvt = PrivateKey.from(expectedPrivKey)
    const message = new Uint8Array([1, 2, 3])
    const sig = pvt.signMessage(message)
    expect(() => sig.recoverMessage(message)).toThrow()
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `cd /data/shared/code/wire/wire-libraries-ts && pnpm --filter @wireio/sdk-core test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add packages/sdk-core/tests/crypto/bls.test.ts
git commit -m "test(sdk-core): add comprehensive BLS integration tests with C++ test vectors"
```

---

### Task 9: Clean Up Test File in wire-sysio

**Files:**
- Modify: `/data/shared/code/wire/wire-sysio/libraries/libfc/test/test_bls.cpp`

- [ ] **Step 1: Remove the temporary `bls_dump_wire_key_bytes` test case**

Remove the `BOOST_AUTO_TEST_CASE(bls_dump_wire_key_bytes)` that was added during exploration.

- [ ] **Step 2: Commit in wire-sysio**

```bash
cd /data/shared/code/wire/wire-sysio
git add libraries/libfc/test/test_bls.cpp
git commit -m "chore: remove temporary BLS debug test case"
```
