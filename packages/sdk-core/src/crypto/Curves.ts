import { p256 } from "@noble/curves/nist.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import elliptic from "elliptic"
import type { ec } from "elliptic"
import { match } from "ts-pattern"
import { KeyType } from "../chain/KeyType.js"

const curves: Record<string, ec> = {}
const nobleCurves: Record<string, typeof secp256k1> = {}

/**
 * Get curve for key type.
 * @internal
 */
export function getCurve(type: KeyType): ec {
  let rv = curves[type]

  if (!rv) {
    // Use the CommonJS default export for native ESM and transpiled consumers.
    rv = curves[type] = match(type)
      .with(KeyType.K1, KeyType.EM, () => new elliptic.ec("secp256k1"))
      .with(KeyType.R1, () => new elliptic.ec("p256"))
      .with(KeyType.ED, () => {
        throw new Error(
          "ED25519 keys are not supported via elliptic; use libsodium for ED-based operations"
        )
      })
      .otherwise(() => {
        throw new Error(`Unknown curve type: ${type}`)
      })
  }

  return rv
}

/**
 * Get the Noble curve implementation for a classic key type.
 * @internal
 */
export function getNobleCurve(type: KeyType): typeof secp256k1 {
  let curve = nobleCurves[type]

  if (!curve) {
    curve = nobleCurves[type] = match(type)
      .with(KeyType.K1, KeyType.EM, () => secp256k1)
      .with(KeyType.R1, () => p256)
      .with(KeyType.ED, () => {
        throw new Error(
          "ED25519 keys are not supported via Noble Weierstrass curves"
        )
      })
      .otherwise(() => {
        throw new Error(`Unknown curve type: ${type}`)
      })
  }

  return curve
}
