import { match } from "ts-pattern"
import { ABIDecoder } from "../serializer/Decoder.js"
import { ABIEncoder } from "../serializer/Encoder.js"
import { ABISerializableObject } from "../serializer/Serializable.js"

import { Base58 } from "../Base58.js"
import { arrayToHex, hexToArray, isInstanceOf } from "../Utils.js"

import { Bytes, BytesType } from "./Bytes.js"
import { Checksum256, Checksum256Type } from "./Checksum.js"
import { KeyType } from "./KeyType.js"
import { PublicKey } from "./PublicKey.js"

import { blsEncode, blsDecode } from "../crypto/BLSSerdes.js"
import { recover } from "../crypto/Recover.js"
import { verify } from "../crypto/Verify.js"

export type SignatureType = Signature | SignatureParts | string

export interface SignatureParts {
  type: KeyType
  r: Uint8Array
  s: Uint8Array
  recid: number
  /** ED signatures must carry the corresponding public key. */
  publicKey?: PublicKey
}

const ED_PUBLIC_KEY_LENGTH = 32
const ED_DETACHED_SIGNATURE_LENGTH = 64
const ED_SIGNATURE_LENGTH = ED_PUBLIC_KEY_LENGTH + ED_DETACHED_SIGNATURE_LENGTH

const EM_RECOVERY_ID_OFFSET = 4
const COMPACT_SIGNATURE_LENGTH = 65
const SIGNATURE_COMPONENT_LENGTH = 32
const SIGNATURE_S_OFFSET = 33
const SIGNATURE_V_OFFSET = 64

export class Signature implements ABISerializableObject {
  static abiName = "signature"

  type: KeyType
  data: Bytes

  /** Create Signature object from representing types. */
  static from(value: SignatureType): Signature {
    if (isInstanceOf(value, Signature)) return value

    if (typeof value === "object" && "r" in value && "s" in value) {
      // Convert detached r||s parts with the supplied ED public key.
      if (value.type === KeyType.ED) {
        const data = new Uint8Array(ED_DETACHED_SIGNATURE_LENGTH)
        data.set(value.r, 0)
        data.set(value.s, ED_PUBLIC_KEY_LENGTH)
        return Signature.fromRaw(data, KeyType.ED, value.publicKey)
      }

      if (value.type === KeyType.BLS) {
        return new Signature(KeyType.BLS, new Bytes(value.r))
      }

      // ECDSA signatures carry recoveryParam 0/1 and store recid + 31.
      const data = new Uint8Array(1 + 32 + 32)
      let recid = value.recid
      const type = KeyType.from(value.type)

      // ECDSA recid offset
      if (type === KeyType.K1 || type === KeyType.R1 || type === KeyType.EM) {
        recid += 31
      }

      data[0] = recid
      data.set(value.r, 1)
      data.set(value.s, 33)
      return new Signature(type, new Bytes(data))
    }

    // string form
    if (typeof value !== "string" || !value.startsWith("SIG_")) {
      throw new Error("Invalid signature string")
    }

    const firstUnderscore = value.indexOf("_")
    const secondUnderscore = value.indexOf("_", firstUnderscore + 1)

    if (firstUnderscore === -1 || secondUnderscore === -1) {
      throw new Error("Invalid signature string")
    }

    const typeStr = value.substring(firstUnderscore + 1, secondUnderscore)
    const payload = value.substring(secondUnderscore + 1)
    const type = KeyType.from(typeStr)

    let data: Bytes | Uint8Array

    if (type === KeyType.EM) {
      // SIG_EM_ hex is in libfc format [r(32)|s(32)|v(1)]
      // Convert to internal wire format [vWire(1)|r(32)|s(32)]
      const raw = hexToArray(payload)
      if (raw.length !== 65) {
        throw new Error(`EM signature hex must be 65 bytes, got ${raw.length}`)
      }
      const v = raw[64] // Ethereum v (27/28)
      const wire = new Uint8Array(65)
      wire[0] = v + 4 // vWire
      wire.set(raw.subarray(0, 32), 1) // r
      wire.set(raw.subarray(32, 64), 33) // s
      return new Signature(type, new Bytes(wire))
    }

    if (type === KeyType.BLS) {
      const data = new Bytes(blsDecode(payload, 192))
      return new Signature(type, data)
    }

    try {
      if (type === KeyType.ED) {
        // ED uses plain base58 (no ripemd160 checksum) to match fc
        data = Base58.decode(payload)
      } else {
        const length =
          type === KeyType.K1 || type === KeyType.R1 ? 65 : undefined
        data = Base58.decodeRipemd160Check(payload, length, type)
      }
    } catch (error) {
      try {
        data = hexToArray(payload)
      } catch {
        throw error
      }
    }

    return new Signature(type, data)
  }

  /** @internal */
  static fromABI(decoder: ABIDecoder): Signature {
    const type = KeyType.from(decoder.readByte())

    if (type === KeyType.WA) {
      const startPos = decoder.getPosition()
      decoder.advance(65) // compact_signature
      decoder.advance(decoder.readVaruint32()) // auth_data
      decoder.advance(decoder.readVaruint32()) // client_json
      const len = decoder.getPosition() - startPos
      decoder.setPosition(startPos)
      const data = Bytes.from(decoder.readArray(len))
      return new Signature(KeyType.WA, data)
    }

    if (type === KeyType.BLS) {
      return new Signature(type, new Bytes(decoder.readArray(192)))
    }

    const length =
      type === KeyType.ED ? ED_SIGNATURE_LENGTH : COMPACT_SIGNATURE_LENGTH
    const bytes = decoder.readArray(length)

    if (type === KeyType.EM) {
      // libfc ABI format is [r(32)|s(32)|v(1)] where v=27/28
      // Convert to internal wire format [vWire|r|s] where vWire = v + 4
      const v = bytes[64]
      const wire = new Uint8Array(65)
      wire[0] = v + 4 // vWire
      wire.set(bytes.subarray(0, 32), 1) // r
      wire.set(bytes.subarray(32, 64), 33) // s
      return new Signature(type, new Bytes(wire))
    }

    return new Signature(type, new Bytes(bytes))
  }

  /**
   * Build a signature directly from a hex string.
   * @param hexStr  0x-prefixed or plain hex:
   *                  • 130 chars → K1/R1/EM (r‖s‖v)
   *                  • 192 chars → ED     (public key‖r‖s)
   * @param type    KeyType.K1 | KeyType.R1 | KeyType.EM | KeyType.ED
   */
  static fromHex(hexStr: string, type: KeyType): Signature {
    const h = hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr
    const raw = hexToArray(h)
    return Signature.fromRaw(raw, type)
  }

  /**
   * Build a Signature from native bytes or an ED wallet’s detached signature.
   * @param raw    96 bytes (ED), or 64 detached bytes with publicKey, or 65 bytes (EM/K1/R1) in [r(32)‖s(32)‖vRaw(1)] form
   * @param type   KeyType.ED | KeyType.EM | KeyType.K1 | KeyType.R1
   * @param publicKey Required for a detached ED wallet signature; checked against embedded ED keys.
   */
  static fromRaw(
    raw: Uint8Array,
    type: KeyType,
    publicKey?: PublicKey
  ): Signature {
    if (type === KeyType.ED) {
      if (publicKey && publicKey.type !== KeyType.ED) {
        throw new Error("ED signatures require an ED public key")
      }
      if (raw.length === ED_SIGNATURE_LENGTH) {
        const signature = new Signature(type, raw)
        if (
          publicKey &&
          !Bytes.from(raw.subarray(0, ED_PUBLIC_KEY_LENGTH)).equals(
            publicKey.data
          )
        ) {
          throw new Error("ED signature public key does not match the signer")
        }
        return signature
      }
      if (raw.length !== ED_DETACHED_SIGNATURE_LENGTH || !publicKey) {
        throw new Error(
          "ED signatures require 96 bytes, or 64 detached bytes with an ED public key"
        )
      }
      return new Signature(type, publicKey.data.appending(raw))
    }

    // ECDSA/EIP-191: raw should be 65 bytes [r‖s‖v]
    if (raw.length !== 65) {
      throw new Error(`Raw sig must be 65 bytes for ${type}, got ${raw.length}`)
    }

    const r = raw.subarray(0, 32)
    const s = raw.subarray(32, 64)
    const vRaw = raw[64]

    // Compute the wire‐format recid byte (vWire)
    let vWire: number

    if (type === KeyType.EM) {
      // Ethereum v (27/28) → wire recid in [31,32]
      vWire = vRaw + 4
    } else {
      // K1/R1: raw recid (0/1) → wire recid in [31,32]
      vWire = vRaw + 31
    }

    // Pack into [vWire‖r‖s]
    const wire = new Uint8Array(65)
    wire[0] = vWire
    wire.set(r, 1)
    wire.set(s, 33)

    return new Signature(type, new Bytes(wire))
  }

  /**
   * @internal
   * @param type   Which curve (K1/R1/EM/ED)
   * @param data   **Wire‐format** signature bytes:
   *               - EM/K1/R1: 65 bytes `[vWire (31/32)‖r(32)‖s(32)]`
   *               - ED:       96 bytes `[public key(32)‖r(32)‖s(32)]`
   */
  constructor(type: KeyType, data: Bytes | Uint8Array) {
    this.type = type
    this.data = data instanceof Bytes ? data : new Bytes(data)
    if (type === KeyType.ED && this.data.length !== ED_SIGNATURE_LENGTH) {
      throw new Error(
        `ED signature must be ${ED_SIGNATURE_LENGTH} bytes, got ${this.data.length}`
      )
    }
  }

  equals(other: SignatureType): boolean {
    const otherSig = Signature.from(other)
    return this.type === otherSig.type && this.data.equals(otherSig.data)
  }

  /** Recover public key from given message digest. */
  recoverDigest(digest: Checksum256Type): PublicKey {
    digest = Checksum256.from(digest)
    if (this.type === KeyType.ED) {
      return this.recoverMessage(Bytes.from(digest.hexString, "utf8"))
    }
    return recover(this.data.array, digest.array, this.type)
  }

  /** Recover public key from given message using this signature's message domain. */
  recoverMessage(message: BytesType): PublicKey {
    if (this.type === KeyType.ED) {
      const key = new PublicKey(
        KeyType.ED,
        this.data.array.subarray(0, ED_PUBLIC_KEY_LENGTH)
      )
      if (!this.verifyMessage(message, key))
        throw new Error("Invalid ED signature")
      return key
    }
    if (this.type === KeyType.EM) {
      return recover(this.data.array, Bytes.from(message).array, this.type)
    }

    return this.recoverDigest(Checksum256.hash(message))
  }

  /** Verify this signature with given message digest and public key. */
  verifyDigest(digest: Checksum256Type, publicKey: PublicKey): boolean {
    digest = Checksum256.from(digest)

    if (this.type === KeyType.EM) {
      return verify(
        this.toEthereumSignatureBytes(),
        digest.array,
        publicKey.data.array,
        this.type
      )
    }

    if (this.type === KeyType.ED)
      return this.verifyMessage(Bytes.from(digest.hexString, "utf8"), publicKey)
    return verify(
      this.data.array,
      digest.array,
      publicKey.data.array,
      this.type
    )
  }

  /**
   * Verify this signature against a message and public key.
   *
   * The signature.data must be in **wire-format**:
   *  - **KeyType.ED**: 96 bytes `[public key||r||s]`
   *  - **KeyType.EM**: 65 bytes `[vWire‖r‖s]` where `vWire = ethV + 4` (Ethereum EIP-191)
   *  - **KeyType.K1/R1**: 65 bytes `[vWire‖r‖s]` where `vWire = recid + 31` (secp256k1 / R1)
   *
   * Verification logic:
   *  - **ED25519 (ED)**: verifies the raw message bytes directly via TweetNaCl.
   *  - **Ethereum (EM)**: unwraps wire-format to `[r||s||vRaw]`, applies the EIP-191 prefix + keccak256, then recovers and compares the address.
   *  - **K1/R1**: computes SHA-256(message) digest and verifies with the appropriate elliptic curve.
   *
   * @param message    The original message bytes (Uint8Array or BytesType, UTF-8 encoded if from string).
   * @param publicKey  The PublicKey instance corresponding to the signer’s key type.
   * @returns           `true` if the signature is valid, `false` otherwise.
   */
  verifyMessage(message: BytesType, publicKey: PublicKey): boolean {
    const rawMsg = Bytes.from(message).array

    return match(this.type)
      .with(
        KeyType.ED,
        () =>
          publicKey.type === KeyType.ED &&
          Bytes.from(this.data.array.subarray(0, ED_PUBLIC_KEY_LENGTH)).equals(
            publicKey.data
          ) &&
          verify(
            this.data.array.subarray(ED_PUBLIC_KEY_LENGTH),
            rawMsg,
            publicKey.data.array,
            KeyType.ED
          )
      )
      .with(KeyType.BLS, () =>
        verify(this.data.array, rawMsg, publicKey.data.array, this.type)
      )
      .with(KeyType.EM, () =>
        verify(
          this.toEthereumSignatureBytes(),
          rawMsg,
          publicKey.data.array,
          KeyType.EM
        )
      )
      .otherwise(() => this.verifyDigest(Checksum256.hash(message), publicKey))
  }

  /** Convert internal EM wire bytes `[vWire||r||s]` to Ethereum `[r||s||v]`. */
  private toEthereumSignatureBytes(): Uint8Array {
    const wire = this.data.array
    const vRaw = wire[0] - EM_RECOVERY_ID_OFFSET
    const out = new Uint8Array(COMPACT_SIGNATURE_LENGTH)
    out.set(wire.subarray(1, SIGNATURE_S_OFFSET), 0)
    out.set(
      wire.subarray(SIGNATURE_S_OFFSET, COMPACT_SIGNATURE_LENGTH),
      SIGNATURE_COMPONENT_LENGTH
    )
    out[SIGNATURE_V_OFFSET] = vRaw
    return out
  }

  /** Native string representation (`SIG_<type>_<data>`), using each curve’s chain encoding. */
  toString(): string {
    if (this.type === KeyType.BLS) {
      return `SIG_BLS_${blsEncode(this.data.array)}`
    }

    if (this.type === KeyType.EM) {
      // Internal wire format is [vWire|r|s], but SIG_EM_ hex uses
      // libfc's [r|s|v] format where v = vWire - 4 (Ethereum v: 27/28)
      return `SIG_${this.type}_${arrayToHex(this.toEthereumSignatureBytes())}`
    }

    // ED uses plain base58 (no ripemd160 checksum) to match fc's approach.
    // K1/R1 use base58 with ripemd160 checksum.
    if (this.type === KeyType.ED) {
      return `SIG_${this.type}_${Base58.encode(this.data)}`
    }
    return `SIG_${this.type}_${Base58.encodeRipemd160Check(this.data, this.type)}`
  }

  /**
   * Return the raw signature as a 0x‐prefixed hex string:
   * - EM: [r||s||v] with Ethereum v (27/28)
   * - K1/R1: [r||s||v] with secp256k1 v (0/1)
   * - ED: [public key||r||s] (96 bytes)
   */
  toHex(): string {
    const wire = this.data.array
    const raw = match(this.type)
      .with(KeyType.EM, () => this.toEthereumSignatureBytes())
      .with(KeyType.K1, KeyType.R1, () => {
        const bytes = new Uint8Array(COMPACT_SIGNATURE_LENGTH)
        bytes.set(wire.subarray(1, SIGNATURE_S_OFFSET), 0)
        bytes.set(
          wire.subarray(SIGNATURE_S_OFFSET, COMPACT_SIGNATURE_LENGTH),
          SIGNATURE_COMPONENT_LENGTH
        )
        bytes[SIGNATURE_V_OFFSET] = wire[0] - 31
        return bytes
      })
      .with(KeyType.ED, () => wire)
      .otherwise(() => {
        throw new Error(`toHex() not supported for key type ${this.type}`)
      })

    // hex‐encode
    const hex = Array.from(raw)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
    return "0x" + hex
  }

  /** @internal */
  toABI(encoder: ABIEncoder): void {
    if (this.type === KeyType.BLS) {
      encoder.writeByte(KeyType.indexFor(this.type))
      encoder.writeArray(this.data.array)
      return
    }

    encoder.writeByte(KeyType.indexFor(this.type))
    if (this.type === KeyType.EM) {
      // Internal wire format is [vWire|r|s], but libfc's
      // em::compact_signature expects [r|s|v] where v = vWire - 4
      encoder.writeArray(this.toEthereumSignatureBytes())
    } else {
      encoder.writeArray(this.data.array)
    }
  }

  /** @internal */
  toJSON(): string {
    return this.toString()
  }
}
