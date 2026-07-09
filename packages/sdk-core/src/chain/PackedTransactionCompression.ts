import { Bytes, BytesType } from "./Bytes.js"
import { inflateZlibBytes, ZlibCompression } from "../common/ZlibCompression.js"

/** Options for inflating zlib-compressed packed transaction bytes. */
export interface InflatePackedTransactionOptions {
  /** Maximum allowed decompressed byte length. */
  maxInflatedBytes?: number
}

/** Constants used while inflating zlib-compressed packed transaction bytes. */
export namespace PackedTransactionCompression {
  /** Default maximum decompressed byte length for packed transaction payloads, matching nodeop's zlib decompression limiter. */
  export const DefaultMaxInflatedBytes = 10_485_760

  /** Output chunk size used by the streaming zlib inflater. */
  export const InflateChunkSizeBytes = ZlibCompression.InflateChunkSizeBytes
}

const PackedTransactionInflateContext = "packed transaction"

/** Inflate zlib-compressed packed transaction bytes with a decompressed-size cap. */
export function inflatePackedTransaction(
  compressedBytes: BytesType,
  options: InflatePackedTransactionOptions = {}
): Bytes {
  const maxInflatedBytes =
    options.maxInflatedBytes ??
    PackedTransactionCompression.DefaultMaxInflatedBytes

  return inflateZlibBytes(compressedBytes, {
    maxInflatedBytes,
    context: PackedTransactionInflateContext
  })
}
