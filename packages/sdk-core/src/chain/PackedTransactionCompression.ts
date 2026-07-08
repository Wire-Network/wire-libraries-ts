import pako from "pako"

import { concatBytes } from "../Utils.js"
import { Bytes, BytesType } from "./Bytes.js"

/** Options for inflating zlib-compressed packed transaction bytes. */
export interface InflatePackedTransactionOptions {
  /** Maximum allowed decompressed byte length. */
  maxInflatedBytes?: number
}

/** Constants used while inflating zlib-compressed packed transaction bytes. */
export namespace PackedTransactionCompression {
  /** Default maximum decompressed byte length for packed transaction payloads. */
  export const DefaultMaxInflatedBytes = 1_048_576

  /** Output chunk size used by the streaming zlib inflater. */
  export const InflateChunkSizeBytes = 65_536
}

/** Inflate zlib-compressed packed transaction bytes with a decompressed-size cap. */
export function inflatePackedTransaction(
  compressedBytes: BytesType,
  options: InflatePackedTransactionOptions = {}
): Bytes {
  const maxInflatedBytes =
    options.maxInflatedBytes ??
    PackedTransactionCompression.DefaultMaxInflatedBytes

  assertMaxInflatedBytes(maxInflatedBytes)

  const chunks: Uint8Array[] = []
  let inflatedBytes = 0
  const inflator = new pako.Inflate({
    chunkSize: PackedTransactionCompression.InflateChunkSizeBytes
  })

  inflator.onData = (chunk: Uint8Array | string) => {
    if (!(chunk instanceof Uint8Array)) {
      throw new Error("Packed transaction zlib output must be binary")
    }

    inflatedBytes += chunk.byteLength

    if (inflatedBytes > maxInflatedBytes) {
      throw new Error(
        `Packed transaction zlib output exceeds ${maxInflatedBytes} byte limit`
      )
    }

    chunks.push(chunk)
  }

  const pushed = inflator.push(Bytes.from(compressedBytes).array, true)

  if (!pushed || inflator.err) {
    throw new Error(
      `Unable to inflate packed transaction: ${inflator.msg || inflator.err}`
    )
  }

  return Bytes.from(concatBytes(...chunks))
}

/** Assert that a packed transaction inflate limit is representable and usable. */
function assertMaxInflatedBytes(maxInflatedBytes: number) {
  if (!Number.isSafeInteger(maxInflatedBytes) || maxInflatedBytes < 0) {
    throw new Error("Packed transaction inflate limit must be a safe integer")
  }
}
