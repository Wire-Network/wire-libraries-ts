/* eslint-disable no-console */
// src/crypto/public_key.ts

import { ABIDecoder } from "../serializer/Decoder.js"
import { ABIEncoder } from "../serializer/Encoder.js"
import { ABISerializableObject } from "../serializer/Serializable.js"

import { Base58 } from "../Base58.js"
import { arrayToHex, hexToArray, isInstanceOf } from "../Utils.js"

import { Bytes } from "./Bytes.js"
import { KeyType } from "./KeyType.js"
import { blsEncode, blsDecode } from "../crypto/BLSSerdes.js"

export type PublicKeyType =
  | PublicKey
  | string
  | { type: string; compressed: Uint8Array }

export class PublicKey implements ABISerializableObject {
  static abiName = "public_key"

  /** Type, e.g. `K1`, `R1`, `EM`, or `ED` */
  type: KeyType
  /** Compressed public key point. */
  data: Bytes

  /** Create PublicKey object from representing types. */
  static from(value: PublicKeyType) {
    if (isInstanceOf(value, PublicKey)) {
      return value
    }

    if (typeof value === "object" && value.type && value.compressed) {
      return new PublicKey(
        KeyType.from(value.type),
        new Bytes(value.compressed)
      )
    }

    if (typeof value !== "string") {
      throw new Error("Invalid public key")
    }

    if (value.startsWith("PUB_")) {
      const firstUnderscore = value.indexOf("_")
      const secondUnderscore = value.indexOf("_", firstUnderscore + 1)

      if (firstUnderscore === -1 || secondUnderscore === -1) {
        throw new Error("Invalid public key string")
      }

      const typeStr = value.substring(firstUnderscore + 1, secondUnderscore)
      const payload = value.substring(secondUnderscore + 1)
      const type = KeyType.from(typeStr)

      if (type === KeyType.BLS) {
        const data = new Bytes(blsDecode(payload, 96))
        return new PublicKey(type, data)
      }

      // ECDSA curves use 33-byte compressed pubs; ED25519 uses 32-byte
      const size =
        type === KeyType.K1 || type === KeyType.R1 || type === KeyType.EM
          ? 33
          : type === KeyType.ED
            ? 32
            : undefined

      let data: Bytes | Uint8Array

      try {
        if (type === KeyType.ED) {
          // ED uses plain base58 (no ripemd160 checksum) to match fc
          data = Base58.decode(payload)
        } else {
          data = Base58.decodeRipemd160Check(payload, size, type)
        }
      } catch (e) {
        try {
          data = hexToArray(payload)
        } catch (e2) {
          console.error("Both base58 and hex failed to parse", e, e2)
          throw e
        }
      }
      return new PublicKey(type, data)
    } else if (value.length >= 50) {
      // Legacy SYS key
      const data = Base58.decodeRipemd160Check(value.slice(-50))
      return new PublicKey(KeyType.K1, data)
    } else {
      throw new Error("Invalid public key string")
    }
  }

  /** @internal */
  static fromABI(decoder: ABIDecoder) {
    const type = KeyType.from(decoder.readByte())

    if (type == KeyType.WA) {
      const startPos = decoder.getPosition()
      decoder.advance(33) // key_data
      decoder.advance(1) // user presence
      decoder.advance(decoder.readVaruint32()) // rpid
      const len = decoder.getPosition() - startPos
      decoder.setPosition(startPos)
      const data = Bytes.from(decoder.readArray(len))
      return new PublicKey(KeyType.WA, data)
    }

    if (type === KeyType.BLS) {
      return new PublicKey(type, new Bytes(decoder.readArray(96)))
    }

    // ECDSA compressed keys = 33 bytes; ED25519 keys = 32 bytes
    const len = type === KeyType.ED ? 32 : 33
    return new PublicKey(type, new Bytes(decoder.readArray(len)))
  }

  /** @internal */
  constructor(type: KeyType, data: Bytes | Uint8Array) {
    this.type = type
    this.data = data instanceof Bytes ? data : new Bytes(data)
  }

  equals(other: PublicKeyType) {
    const otherKey = PublicKey.from(other)
    return this.type === otherKey.type && this.data.equals(otherKey.data)
  }

  /**
   * Return Antelope/SYSIO legacy (`SYS<base58data>`) formatted key.
   * @throws If the key type isn't `K1` or `EM`.
   */
  toLegacyString(prefix = "SYS") {
    if (this.type !== KeyType.K1 && this.type !== KeyType.EM) {
      throw new Error(
        "Unable to create legacy formatted string for non-K1/EM key"
      )
    }

    return `${prefix}${Base58.encodeRipemd160Check(this.data)}`
  }

  /** Return key in modern Antelope/SYSIO format (`PUB_<type>_<base58data>`) */
  toString() {
    if (this.type === KeyType.BLS) {
      return `PUB_BLS_${blsEncode(this.data.array)}`
    }

    // Ensure the key is compressed
    if (
      (this.type === KeyType.K1 ||
        this.type === KeyType.R1 ||
        this.type === KeyType.EM) &&
      this.data.array.length !== 33
    ) {
      throw new Error(
        `Expected 33-byte compressed key for ${this.type}, got ${this.data.array.length}`
      )
    }

    if (this.type === KeyType.K1 || this.type === KeyType.R1) {
      return `PUB_${this.type}_${Base58.encodeRipemd160Check(this.data, this.type)}`
    }
    // ED uses plain base58 (no checksum) to match fc's approach.
    // EM uses hex.
    if (this.type === KeyType.ED) {
      return `PUB_${this.type}_${Base58.encode(this.data)}`
    }
    return `PUB_${this.type}_${arrayToHex(this.data.array)}`
  }

  toHexString() {
    // Ensure the key is compressed
    if (
      (this.type === KeyType.K1 ||
        this.type === KeyType.R1 ||
        this.type === KeyType.EM) &&
      this.data.array.length !== 33
    ) {
      throw new Error(
        `Expected 33-byte compressed key for ${this.type}, got ${this.data.array.length}`
      )
    }

    return `PUB_${this.type}_${arrayToHex(this.data.array)}`
  }

  /** @internal */
  toABI(encoder: ABIEncoder) {
    encoder.writeByte(KeyType.indexFor(this.type))
    encoder.writeArray(this.data.array)
  }

  /**
   * Return the public key in the native format expected by the
   * signature_provider_manager_plugin's spec.
   *
   * - K1/R1: Legacy SYS-prefixed string
   * - EM (Ethereum): hex address (0x-prefixed, 20-byte keccak hash)
   * - ED (Solana): raw base58 of the 32-byte public key
   * - BLS: PUB_BLS_... encoded string
   */
  toNativeString(): string {
    switch (this.type) {
      case KeyType.K1:
      case KeyType.R1:
        return this.toLegacyString()
      case KeyType.EM:
        return "0x" + arrayToHex(this.data.array)
      case KeyType.ED:
        return Base58.encode(this.data)
      case KeyType.BLS:
        return `PUB_BLS_${blsEncode(this.data.array)}`
      default:
        return this.toString()
    }
  }

  /** @internal */
  toJSON() {
    return this.toString()
  }
}
