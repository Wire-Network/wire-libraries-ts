// crypto/BLSSerdes.ts — BLS key/signature encoding/decoding matching C++ wire-sysio fc::crypto::bls format
import { ripemd160 } from "hash.js"

const CHECKSUM_SIZE = 4

function computeChecksum(data: Uint8Array): Uint8Array {
   const hash = ripemd160().update(Array.from(data)).digest()
   return new Uint8Array(hash.slice(0, CHECKSUM_SIZE))
}

function toBase64Url(bytes: Uint8Array): string {
   let binary = ""
   for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
   }
   return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(str: string): Uint8Array {
   // Restore standard base64
   let b64 = str.replace(/-/g, "+").replace(/_/g, "/")
   // Add padding
   while (b64.length % 4 !== 0) {
      b64 += "="
   }
   const binary = atob(b64)
   const bytes = new Uint8Array(binary.length)
   for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
   }
   return bytes
}

/**
 * Encode raw BLS data bytes to base64url string (without prefix).
 * Format: base64url(data_bytes + checksum_bytes)
 * where checksum = first 4 bytes of RIPEMD160(data_bytes)
 */
export function blsEncode(data: Uint8Array): string {
   const check = computeChecksum(data)
   const combined = new Uint8Array(data.length + CHECKSUM_SIZE)
   combined.set(data, 0)
   combined.set(check, data.length)
   return toBase64Url(combined)
}

/**
 * Decode a base64url-encoded BLS string (without prefix) back to raw data bytes.
 * Validates the embedded checksum and throws on mismatch.
 * @param encoded - base64url string (no prefix)
 * @param expectedSize - expected size of raw data in bytes (e.g. 32, 96, 192)
 */
export function blsDecode(encoded: string, expectedSize: number): Uint8Array {
   const combined = fromBase64Url(encoded)
   if (combined.length !== expectedSize + CHECKSUM_SIZE) {
      throw new Error(
         `BLS decode: expected ${expectedSize + CHECKSUM_SIZE} bytes, got ${combined.length}`
      )
   }
   const data = combined.slice(0, expectedSize)
   const embeddedCheck = combined.slice(expectedSize, expectedSize + CHECKSUM_SIZE)
   const computedCheck = computeChecksum(data)

   for (let i = 0; i < CHECKSUM_SIZE; i++) {
      if (embeddedCheck[i] !== computedCheck[i]) {
         throw new Error("BLS decode: checksum mismatch")
      }
   }
   return data
}
