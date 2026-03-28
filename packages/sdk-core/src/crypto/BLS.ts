// crypto/BLS.ts — Core BLS12-381 cryptographic operations matching C++ wire-sysio format
import { bls12_381 } from "@noble/curves/bls12-381.js"
import { createHmac } from "crypto"

const BLS_CURVE_ORDER =
  0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n
const POP_DST = "BLS_POP_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reverse a byte array (returns a new copy). */
function reverseBytes(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length)
  for (let i = 0; i < src.length; i++) {
    out[i] = src[src.length - 1 - i]
  }
  return out
}

/** Reverse `src` into `dst` starting at `offset`. */
function reverseInto(src: Uint8Array, dst: Uint8Array, offset: number): void {
  for (let i = 0; i < src.length; i++) {
    dst[offset + i] = src[src.length - 1 - i]
  }
}

/** Convert a big-endian Uint8Array to a BigInt. */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i])
  }
  return result
}

/** Convert a BigInt to a big-endian Uint8Array of `length` bytes. */
function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length)
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(value & 0xffn)
    value >>= 8n
  }
  return out
}

// ---------------------------------------------------------------------------
// G1 byte order conversions (public key)
// ---------------------------------------------------------------------------

/**
 * Noble G1 toBytes(false): x_BE(48) || y_BE(48)  (96 bytes)
 * C++ affine LE:           x_LE(48) || y_LE(48)  (96 bytes)
 */
function g1ToAffineLE(nobleUncompressed: Uint8Array): Uint8Array {
  const result = new Uint8Array(96)
  reverseInto(nobleUncompressed.subarray(0, 48), result, 0) // x_BE → x_LE
  reverseInto(nobleUncompressed.subarray(48, 96), result, 48) // y_BE → y_LE
  return result
}

function affineLE_to_G1Bytes(le: Uint8Array): Uint8Array {
  const result = new Uint8Array(96)
  reverseInto(le.subarray(0, 48), result, 0) // x_LE → x_BE
  reverseInto(le.subarray(48, 96), result, 48) // y_LE → y_BE
  return result
}

// ---------------------------------------------------------------------------
// G2 byte order conversions (signature / proof of possession)
// ---------------------------------------------------------------------------

/**
 * Noble G2 toBytes(false): [x.c1_BE(48) | x.c0_BE(48) | y.c1_BE(48) | y.c0_BE(48)]
 * C++ affine LE:           [x.c0_LE(48) | x.c1_LE(48) | y.c0_LE(48) | y.c1_LE(48)]
 */
function g2ToAffineLE(nobleUncompressed: Uint8Array): Uint8Array {
  const result = new Uint8Array(192)
  const xc1BE = nobleUncompressed.subarray(0, 48)
  const xc0BE = nobleUncompressed.subarray(48, 96)
  const yc1BE = nobleUncompressed.subarray(96, 144)
  const yc0BE = nobleUncompressed.subarray(144, 192)
  reverseInto(xc0BE, result, 0) // x.c0_LE at offset 0
  reverseInto(xc1BE, result, 48) // x.c1_LE at offset 48
  reverseInto(yc0BE, result, 96) // y.c0_LE at offset 96
  reverseInto(yc1BE, result, 144) // y.c1_LE at offset 144
  return result
}

function affineLE_to_G2Bytes(le: Uint8Array): Uint8Array {
  const result = new Uint8Array(192)
  // C++: [x.c0_LE | x.c1_LE | y.c0_LE | y.c1_LE]
  // Noble: [x.c1_BE | x.c0_BE | y.c1_BE | y.c0_BE]
  reverseInto(le.subarray(0, 48), result, 48) // x.c0_LE → x.c0_BE at pos 48
  reverseInto(le.subarray(48, 96), result, 0) // x.c1_LE → x.c1_BE at pos 0
  reverseInto(le.subarray(96, 144), result, 144) // y.c0_LE → y.c0_BE at pos 144
  reverseInto(le.subarray(144, 192), result, 96) // y.c1_LE → y.c1_BE at pos 96
  return result
}

// ---------------------------------------------------------------------------
// hashToCurve type bridge
// ---------------------------------------------------------------------------

/**
 * Convert an H2CPoint (from hashToCurve) to a proper WeierstrassPoint
 * so that .toBytes() and .multiply() return the right TypeScript types.
 * At runtime these are the same object, but the v1.x type declarations
 * declare H2CPoint without toBytes/multiply returning WeierstrassPoint.
 */
function h2cToG2Point(
  h2c: ReturnType<typeof bls12_381.G2.hashToCurve>
) {
  const aff = h2c.toAffine()
  return new bls12_381.G2.Point(aff.x, aff.y, bls12_381.fields.Fp2.ONE)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * BLS key generation from a 32-byte seed (HKDF matching C++ implementation).
 * Returns a 32-byte big-endian secret key scalar.
 */
export function blsKeyGen(seed: Uint8Array): Uint8Array {
  if (seed.length !== 32) {
    throw new Error("blsKeyGen: seed must be 32 bytes")
  }

  // 1. PRK = HMAC-SHA256(key="BLS-SIG-KEYGEN-SALT-", data=seed||0x00)
  const salt = Buffer.from("BLS-SIG-KEYGEN-SALT-", "ascii")
  const ikmPadded = new Uint8Array(seed.length + 1)
  ikmPadded.set(seed, 0)
  ikmPadded[seed.length] = 0x00
  const prk = createHmac("sha256", salt).update(ikmPadded).digest()

  // 2. OKM = HKDF-Expand(PRK, info=[0x00, 0x30], L=48)
  const info = new Uint8Array([0x00, 0x30])
  // HKDF-Expand for L=48: T(1) = HMAC(PRK, info||0x01), T(2) = HMAC(PRK, T(1)||info||0x02)
  const t1 = createHmac("sha256", prk)
    .update(Buffer.concat([info, new Uint8Array([0x01])]))
    .digest()
  const t2 = createHmac("sha256", prk)
    .update(Buffer.concat([t1, info, new Uint8Array([0x02])]))
    .digest()
  const okm = new Uint8Array(48)
  okm.set(t1, 0)
  okm.set(t2.subarray(0, 16), 32)

  // 3. SK = BigInt(OKM) % BLS_CURVE_ORDER
  const sk = bytesToBigInt(okm) % BLS_CURVE_ORDER

  // Return as 32-byte big-endian
  return bigIntToBytes(sk, 32)
}

/** Convert secret key from big-endian to little-endian (32 bytes). */
export function skToLE(skBE: Uint8Array): Uint8Array {
  return reverseBytes(skBE)
}

/** Convert secret key from little-endian to big-endian (same operation as skToLE). */
export function skFromLE(skLE: Uint8Array): Uint8Array {
  return reverseBytes(skLE)
}

/**
 * Derive the BLS public key from a 32-byte big-endian secret key.
 * Returns 96-byte affine LE format matching C++.
 */
export function blsGetPublicKey(skBE: Uint8Array): Uint8Array {
  const skScalar = bytesToBigInt(skBE)
  const pk = bls12_381.G1.Point.BASE.multiply(skScalar)
  const pkBytes = pk.toBytes(false) // 96 bytes: x_BE(48) || y_BE(48)
  return g1ToAffineLE(pkBytes)
}

/**
 * Generate a BLS proof of possession for the given secret key.
 * Non-standard: hashes affine LE public key bytes (96 bytes) to G2.
 * Returns 192-byte affine LE format matching C++.
 */
export function blsProofOfPossession(skBE: Uint8Array): Uint8Array {
  const pkLE = blsGetPublicKey(skBE)
  const msgPoint = h2cToG2Point(bls12_381.G2.hashToCurve(pkLE, { DST: POP_DST }))
  const skScalar = bytesToBigInt(skBE)
  const sigPoint = msgPoint.multiply(skScalar)
  const sigBytes = sigPoint.toBytes(false) // 192 bytes noble format
  return g2ToAffineLE(sigBytes)
}

/**
 * Sign a message with BLS. Uses standard BLS_SIG DST.
 * Returns 192-byte affine LE signature matching C++.
 */
export function blsSign(skBE: Uint8Array, message: Uint8Array): Uint8Array {
  const skScalar = bytesToBigInt(skBE)
  const msgPoint = h2cToG2Point(bls12_381.G2.hashToCurve(message, {
    DST: "BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_NUL_"
  }))
  const sigPoint = msgPoint.multiply(skScalar)
  const sigBytes = sigPoint.toBytes(false)
  return g2ToAffineLE(sigBytes)
}

/**
 * Verify a BLS signature.
 * @param sigLE - 192-byte signature in affine LE format
 * @param message - the signed message
 * @param pkLE - 96-byte public key in affine LE format
 */
export function blsVerify(
  sigLE: Uint8Array,
  message: Uint8Array,
  pkLE: Uint8Array
): boolean {
  // Convert from C++ LE format back to noble format
  const sigNoble = affineLE_to_G2Bytes(sigLE)
  const pkNoble = affineLE_to_G1Bytes(pkLE)

  // Reconstruct points from uncompressed bytes via affine → projective
  const sigAff = bls12_381.G2.Point.fromBytes(sigNoble)
  const sig = new bls12_381.G2.Point(sigAff.x, sigAff.y, bls12_381.fields.Fp2.ONE)
  const pkAff = bls12_381.G1.Point.fromBytes(pkNoble)
  const pk = new bls12_381.G1.Point(pkAff.x, pkAff.y, bls12_381.fields.Fp.ONE)

  // Hash message to G2
  const msgPoint = h2cToG2Point(bls12_381.G2.hashToCurve(message, {
    DST: "BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_NUL_"
  }))

  // Verify using pairing: e(pk, H(m)) == e(G1, sig)
  return bls12_381.longSignatures.verify(sig, msgPoint, pk)
}

/**
 * Generate a random BLS secret key (32-byte big-endian).
 */
export function blsGenerate(): Uint8Array {
  const randomBytes = new Uint8Array(32)
  // Use crypto.getRandomValues if available, else Node crypto
  try {
    globalThis.crypto.getRandomValues(randomBytes)
  } catch {
    // fallback to Node.js crypto
    const { randomFillSync } = require("crypto")
    randomFillSync(randomBytes)
  }
  return blsKeyGen(randomBytes)
}
