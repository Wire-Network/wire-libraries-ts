import { Fetch } from "../common/Types.js"
import type { APIMethods, APIResponse } from "./Client.js"

export interface APIProvider {
  /**
   * Call an API endpoint and return the response.
   * Provider is responsible for JSON encoding the params and decoding the response.
   * @argument path The endpoint path, e.g. `/v1/chain/get_info`
   * @argument params The request body if any.
   */
  call(args: {
    path: string
    params?: unknown
    method?: APIMethods
  }): Promise<APIResponse>
}

export interface FetchProviderOptions {
  /**
   * Fetch instance, must be provided in non-browser environments.
   * You can use the node-fetch package in Node.js.
   */
  fetch?: Fetch
  /**
   * Headers that will be applied to every request
   * */
  headers?: Record<string, string>
  /** Maximum time to wait for the request and response body, in milliseconds. */
  timeoutMs?: number
  /**
   * Maximum response body size to read before JSON parsing.
   *
   * Non-streaming fetch fallbacks must provide a valid Content-Length within
   * this limit before FetchProvider can call response.arrayBuffer().
   */
  maxResponseBytes?: number
}

/** Defaults used by FetchProvider for bounded HTTP requests. */
export namespace FetchProviderDefaults {
  /** Default request and response body timeout. */
  export const TimeoutMs = 60_000

  /** Default maximum response body size, matching the 10 MiB SDK decompression cap. */
  export const MaxResponseBytes = 10_485_760
}

const FetchProviderOptionName = {
  timeoutMs: "timeoutMs",
  maxResponseBytes: "maxResponseBytes"
} as const

const ResponseHeaderName = {
  contentEncoding: "content-encoding",
  contentLength: "content-length"
} as const

const ResponseHeaderDisplayName = {
  contentEncoding: "Content-Encoding",
  contentLength: "Content-Length"
} as const

const ResponseContentEncoding = {
  identity: "identity"
} as const

const ResponseBodyContext = "FetchProvider response body"

const ResponseBodyBufferInitialBytes = 16_384

const ContentLengthValuePattern = /^\d+$/

/** Default provider that uses the Fetch API to call a single node. */
export class FetchProvider implements APIProvider {
  readonly url: string
  readonly fetch: Fetch
  readonly headers: Record<string, string> = {}
  readonly timeoutMs: number
  readonly maxResponseBytes: number

  constructor(url: string, options: FetchProviderOptions = {}) {
    url = url.trim()
    if (url.endsWith("/")) url = url.slice(0, -1)
    this.url = url
    this.timeoutMs = getPositiveSafeIntegerOption(
      options.timeoutMs,
      FetchProviderDefaults.TimeoutMs,
      FetchProviderOptionName.timeoutMs
    )
    this.maxResponseBytes = getPositiveSafeIntegerOption(
      options.maxResponseBytes,
      FetchProviderDefaults.MaxResponseBytes,
      FetchProviderOptionName.maxResponseBytes
    )

    if (options.headers) {
      this.headers = options.headers
    }

    if (!options.fetch) {
      if (typeof window !== "undefined" && window.fetch) {
        this.fetch = window.fetch.bind(window)
      } else if (typeof global !== "undefined" && global.fetch) {
        this.fetch = global.fetch.bind(global)
      } else {
        throw new Error("Missing fetch")
      }
    } else {
      this.fetch = options.fetch
    }
  }

  async call(args: {
    path: string
    params?: Record<string, unknown>
    method?: APIMethods
    headers?: Record<string, string>
  }): Promise<APIResponse> {
    const method = args.method || "POST"
    let url = this.url + args.path
    const headers = { ...this.headers, ...args.headers }

    // Filter out undefined, null, and empty string values
    const params = args.params
      ? Object.entries(args.params)
          .filter(([_, value]) => value != null && value !== "")
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
      : {}

    let body: string | undefined

    // If GET method, convert params to query string
    if (method === "GET" && Object.keys(params).length > 0) {
      url +=
        "?" + new URLSearchParams(params as Record<string, string>).toString()
    } else if (Object.keys(params).length > 0) {
      body = JSON.stringify(params)
    }

    const { response, text } = await this.callWithTimeout(
      async abortController => {
        const response = await this.fetch(url, {
          method,
          body: method === "GET" ? undefined : body,
          headers,
          ...(abortController
            ? {
                signal: abortController.signal
              }
            : {})
        })
        const text = await readBoundedResponseText(
          response,
          this.maxResponseBytes
        )

        return { response, text }
      }
    )
    let json: any

    try {
      json = JSON.parse(text)
    } catch {
      // Ignore JSON parse errors
    }

    return {
      headers: createResponseHeaders(response.headers),
      status: response.status,
      json,
      text
    }
  }

  /** Run a request phase with the provider timeout and abort when supported. */
  private async callWithTimeout<T>(
    fn: (abortController?: AbortController) => Promise<T>
  ): Promise<T> {
    const abortController =
      typeof AbortController !== "undefined" ? new AbortController() : undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        abortController?.abort()
        reject(
          new Error(
            `FetchProvider request timed out after ${this.timeoutMs} ms`
          )
        )
      }, this.timeoutMs)
      const timeoutHandle = timeoutId as ReturnType<typeof setTimeout> & {
        unref?: () => void
      }
      timeoutHandle.unref?.()
    })

    const operation = Promise.resolve().then(() => fn(abortController))

    return Promise.race([operation, timeout]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    })
  }
}

/** Read a fetch response body while enforcing the configured byte limit. */
async function readBoundedResponseText(
  response: any,
  maxResponseBytes: number
): Promise<string> {
  assertContentLengthWithinLimit(response.headers, maxResponseBytes)

  if (response.body && typeof response.body.getReader === "function") {
    return readWebReadableStream(response.body, maxResponseBytes)
  }

  if (
    response.body &&
    typeof response.body[Symbol.asyncIterator] === "function"
  ) {
    return readAsyncIterableBody(response.body, maxResponseBytes)
  }

  if (typeof response.arrayBuffer === "function") {
    return readArrayBufferFallback(response, maxResponseBytes)
  }

  throw new Error(`${ResponseBodyContext} is not readable`)
}

/** Read an arrayBuffer fallback only after Content-Length bounds allocation. */
async function readArrayBufferFallback(
  response: any,
  maxResponseBytes: number
): Promise<string> {
  assertFallbackContentEncodingIdentity(response.headers)
  assertFallbackContentLengthWithinLimit(response.headers, maxResponseBytes)
  const body = new Uint8Array(await response.arrayBuffer())
  assertMaxResponseBytes(body.byteLength, maxResponseBytes)
  return decodeResponseBytes(body)
}

/** Read a web ReadableStream while enforcing the configured byte limit. */
async function readWebReadableStream(
  body: { getReader: () => any },
  maxResponseBytes: number
): Promise<string> {
  const reader = body.getReader()
  const buffer = new ResponseBodyBuffer(maxResponseBytes)

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        return decodeResponseBytes(buffer.bytes)
      }

      const chunk = createResponseChunkBytes(value)
      if (!buffer.append(chunk)) {
        const cancelResult = reader.cancel?.()
        if (cancelResult && typeof cancelResult.catch === "function") {
          cancelResult.catch(() => undefined)
        }
        throw new Error(
          `${ResponseBodyContext} exceeds ${maxResponseBytes} byte limit`
        )
      }
    }
  } finally {
    reader.releaseLock?.()
  }
}

/** Read an async-iterable response body while enforcing the configured byte limit. */
async function readAsyncIterableBody(
  body: AsyncIterable<any>,
  maxResponseBytes: number
): Promise<string> {
  const buffer = new ResponseBodyBuffer(maxResponseBytes)

  for await (const value of body) {
    const chunk = createResponseChunkBytes(value)

    if (!buffer.append(chunk)) {
      throw new Error(
        `${ResponseBodyContext} exceeds ${maxResponseBytes} byte limit`
      )
    }
  }

  return decodeResponseBytes(buffer.bytes)
}

/** Convert a response body chunk into bytes for counting and decoding. */
function createResponseChunkBytes(value: any): Uint8Array {
  if (value instanceof Uint8Array) {
    return value
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }

  if (typeof value === "string") {
    return new TextEncoder().encode(value)
  }

  throw new Error(`${ResponseBodyContext} contains an unsupported chunk type`)
}

/** Decode response bytes using fetch-compatible UTF-8 replacement behavior. */
function decodeResponseBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

/** Convert fetch Headers or a header-like object into an API response map. */
function createResponseHeaders(headers: any): Record<string, string> {
  if (!headers) {
    return {}
  }

  if (typeof headers.entries === "function") {
    return Object.fromEntries(headers.entries())
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)])
  )
}

/** Check Content-Length before reading a body when the server provides it. */
function assertContentLengthWithinLimit(
  headers: any,
  maxResponseBytes: number
) {
  const contentLengthBytes = getContentLengthBytes(headers)

  if (contentLengthBytes === undefined) {
    return
  }

  assertMaxResponseBytes(contentLengthBytes, maxResponseBytes)
}

/** Require fallback Content-Length before arrayBuffer can allocate a body. */
function assertFallbackContentLengthWithinLimit(
  headers: any,
  maxResponseBytes: number
) {
  const contentLengthBytes = getContentLengthBytes(headers)

  if (contentLengthBytes === undefined) {
    throw new Error(
      `${ResponseBodyContext} fallback requires a valid ${ResponseHeaderDisplayName.contentLength} header`
    )
  }

  assertMaxResponseBytes(contentLengthBytes, maxResponseBytes)
}

/** Reject encoded fallback bodies because decoded bytes can exceed Content-Length. */
function assertFallbackContentEncodingIdentity(headers: any) {
  const contentEncoding = getHeaderValue(
    headers,
    ResponseHeaderName.contentEncoding
  )

  if (contentEncoding === undefined) {
    return
  }

  if (
    contentEncoding.trim().toLowerCase() === ResponseContentEncoding.identity
  ) {
    return
  }

  throw new Error(
    `${ResponseBodyContext} fallback does not support ${ResponseHeaderDisplayName.contentEncoding}`
  )
}

/** Parse a trusted decimal Content-Length header value. */
function getContentLengthBytes(headers: any): number | undefined {
  const contentLength = getHeaderValue(
    headers,
    ResponseHeaderName.contentLength
  )

  if (contentLength === undefined) {
    return undefined
  }

  const normalizedContentLength = contentLength.trim()

  if (!ContentLengthValuePattern.test(normalizedContentLength)) {
    return undefined
  }

  const contentLengthBytes = Number(normalizedContentLength)

  return Number.isSafeInteger(contentLengthBytes)
    ? contentLengthBytes
    : undefined
}

/** Read a header from fetch Headers or a plain header object. */
function getHeaderValue(headers: any, name: string): string | undefined {
  if (!headers) {
    return undefined
  }

  if (typeof headers.get === "function") {
    return headers.get(name) || undefined
  }

  const normalizedName = name.toLowerCase()
  const value = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === normalizedName
  )?.[1]

  return value === undefined ? undefined : String(value)
}

/** Assert that an already-buffered fallback body stayed within the limit. */
function assertMaxResponseBytes(
  responseBytes: number,
  maxResponseBytes: number
) {
  if (responseBytes > maxResponseBytes) {
    throw new Error(
      `${ResponseBodyContext} exceeds ${maxResponseBytes} byte limit`
    )
  }
}

/** Resolve and validate a positive integer FetchProvider option. */
function getPositiveSafeIntegerOption(
  value: number | undefined,
  defaultValue: number,
  optionName: string
) {
  const resolved = value ?? defaultValue

  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error(
      `FetchProvider ${optionName} must be a positive safe integer`
    )
  }

  return resolved
}

/** Grow a single bounded response buffer instead of retaining one object per chunk. */
class ResponseBodyBuffer {
  private buffer: Uint8Array
  private length = 0

  constructor(private readonly maxBytes: number) {
    this.buffer = new Uint8Array(
      Math.min(ResponseBodyBufferInitialBytes, maxBytes)
    )
  }

  /** The appended response bytes. */
  get bytes(): Uint8Array {
    return this.buffer.subarray(0, this.length)
  }

  /** Append bytes and return false when the configured maximum would be exceeded. */
  append(chunk: Uint8Array): boolean {
    const nextLength = this.length + chunk.byteLength

    if (nextLength > this.maxBytes) {
      return false
    }

    this.ensureCapacity(nextLength)
    this.buffer.set(chunk, this.length)
    this.length = nextLength
    return true
  }

  /** Ensure the backing buffer can hold the requested length. */
  private ensureCapacity(nextLength: number) {
    if (nextLength <= this.buffer.byteLength) {
      return
    }

    const nextCapacity = Math.min(
      this.maxBytes,
      Math.max(nextLength, this.buffer.byteLength * 2)
    )
    const nextBuffer = new Uint8Array(nextCapacity)
    nextBuffer.set(this.bytes)
    this.buffer = nextBuffer
  }
}
