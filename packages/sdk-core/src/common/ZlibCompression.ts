import pako from "pako"

import { concatBytes } from "../Utils.js"
import { Bytes, BytesType } from "../chain/Bytes.js"

/** Options for bounded zlib decompression. */
export interface InflateZlibBytesOptions {
  /** Maximum allowed decompressed byte length. */
  maxInflatedBytes: number
  /** Whether the compressed input omits the zlib header. */
  raw?: boolean
  /** Lowercase payload name used in decompression error messages. */
  context: string
}

/** Constants used while inflating zlib-compressed bytes. */
export namespace ZlibCompression {
  /** Output chunk size used by the streaming zlib inflater. */
  export const InflateChunkSizeBytes = 65_536
}

/** Inflate zlib-compressed bytes with a decompressed-size cap. */
export function inflateZlibBytes(
  compressedBytes: BytesType,
  options: InflateZlibBytesOptions
): Bytes {
  assertMaxInflatedBytes(options.maxInflatedBytes, options.context)

  const chunks: Uint8Array[] = []
  let inflatedBytes = 0
  const inflator = new pako.Inflate({
    chunkSize: ZlibCompression.InflateChunkSizeBytes,
    raw: options.raw === true
  })

  inflator.onData = (chunk: Uint8Array) => {
    inflatedBytes += chunk.byteLength

    if (inflatedBytes > options.maxInflatedBytes) {
      throw new Error(
        `${formatInflateContext(options.context)} zlib output exceeds ${
          options.maxInflatedBytes
        } byte limit`
      )
    }

    chunks.push(chunk)
  }

  const pushed = inflator.push(Bytes.from(compressedBytes).array, true)

  if (!pushed || inflator.err) {
    throw new Error(
      `Unable to inflate ${options.context}: ${inflator.msg || inflator.err}`
    )
  }

  if (!inflator.ended) {
    throw new Error(
      `Unable to inflate ${options.context}: incomplete zlib stream`
    )
  }

  return Bytes.from(concatBytes(...chunks))
}

/** Assert that a zlib inflate limit is representable and usable. */
function assertMaxInflatedBytes(maxInflatedBytes: number, context: string) {
  if (!Number.isSafeInteger(maxInflatedBytes) || maxInflatedBytes < 0) {
    throw new Error(
      `${formatInflateContext(
        context
      )} inflate limit must be a non-negative safe integer`
    )
  }
}

/** Format a payload name for the start of an inflate error message. */
function formatInflateContext(context: string) {
  return `${context.charAt(0).toUpperCase()}${context.slice(1)}`
}
