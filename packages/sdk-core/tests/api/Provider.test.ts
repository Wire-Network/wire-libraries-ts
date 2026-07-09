import {
  FetchProvider,
  FetchProviderDefaults
} from "@wireio/sdk-core/api/Provider"

const ApiPath = {
  getInfo: "/v1/chain/get_info"
} as const

const TimeoutMessage = /timed out after 5 ms/
const ResponseSizeMessage = /FetchProvider response body exceeds 3 byte limit/
const InvalidOptionMessage = /positive safe integer/
const TinyChunkCount = 150_000

function createJsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "x-wire": "ok"
    }
  })
}

function createStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)))
        controller.close()
      }
    }),
    {
      status: 200
    }
  )
}

function createTinyChunkAsyncIterableResponse(count: number) {
  return {
    status: 200,
    headers: {},
    body: {
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < count; i++) {
          yield "a"
        }
      }
    }
  }
}

describe("FetchProvider", () => {
  test("returns JSON responses while preserving request options", async () => {
    const fetch = jest.fn(async () =>
      createJsonResponse({
        ok: true
      })
    )
    const provider = new FetchProvider("https://node.example/", {
      fetch,
      headers: {
        "x-default": "default"
      }
    })
    const response = await provider.call({
      path: ApiPath.getInfo,
      method: "GET",
      params: {
        keep: "value",
        dropNull: null,
        dropEmpty: ""
      },
      headers: {
        "x-request": "request"
      }
    })

    expect(provider.timeoutMs).toBe(FetchProviderDefaults.TimeoutMs)
    expect(provider.maxResponseBytes).toBe(
      FetchProviderDefaults.MaxResponseBytes
    )
    expect(fetch).toHaveBeenCalledWith(
      "https://node.example/v1/chain/get_info?keep=value",
      expect.objectContaining({
        method: "GET",
        body: undefined,
        headers: {
          "x-default": "default",
          "x-request": "request"
        },
        signal: expect.any(AbortSignal)
      })
    )
    expect(response).toEqual({
      headers: expect.objectContaining({
        "x-wire": "ok"
      }),
      status: 200,
      json: {
        ok: true
      },
      text: '{"ok":true}'
    })
  })

  test("aborts requests that exceed the configured timeout", async () => {
    let signal: AbortSignal | undefined
    const fetch = jest.fn((_url, init) => {
      signal = init.signal
      return new Promise(() => {})
    })
    const provider = new FetchProvider("https://node.example", {
      fetch,
      timeoutMs: 5
    })

    await expect(
      provider.call({
        path: ApiPath.getInfo,
        method: "GET"
      })
    ).rejects.toThrow(TimeoutMessage)
    expect(signal?.aborted).toBe(true)
  })

  test("rejects streamed responses above the configured byte limit", async () => {
    const fetch = jest.fn(async () => createStreamResponse(["ab", "cd"]))
    const provider = new FetchProvider("https://node.example", {
      fetch,
      maxResponseBytes: 3
    })

    await expect(
      provider.call({
        path: ApiPath.getInfo,
        method: "GET"
      })
    ).rejects.toThrow(ResponseSizeMessage)
  })

  test("reads many small async-iterable chunks without spreading them", async () => {
    const fetch = jest.fn(async () =>
      createTinyChunkAsyncIterableResponse(TinyChunkCount)
    )
    const provider = new FetchProvider("https://node.example", {
      fetch,
      maxResponseBytes: TinyChunkCount
    })

    const response = await provider.call({
      path: ApiPath.getInfo,
      method: "GET"
    })

    expect(response.text.length).toBe(TinyChunkCount)
  })

  test("rejects oversized content length before reading fallback bodies", async () => {
    const arrayBuffer = jest.fn(async () => new ArrayBuffer(4))
    const fetch = jest.fn(async () => ({
      status: 200,
      headers: new Headers({
        "content-length": "4"
      }),
      arrayBuffer
    }))
    const provider = new FetchProvider("https://node.example", {
      fetch,
      maxResponseBytes: 3
    })

    await expect(
      provider.call({
        path: ApiPath.getInfo,
        method: "GET"
      })
    ).rejects.toThrow(ResponseSizeMessage)
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  test("matches plain-object content length headers case-insensitively", async () => {
    const arrayBuffer = jest.fn(async () => new ArrayBuffer(4))
    const fetch = jest.fn(async () => ({
      status: 200,
      headers: {
        "Content-Length": "4"
      },
      arrayBuffer
    }))
    const provider = new FetchProvider("https://node.example", {
      fetch,
      maxResponseBytes: 3
    })

    await expect(
      provider.call({
        path: ApiPath.getInfo,
        method: "GET"
      })
    ).rejects.toThrow(ResponseSizeMessage)
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  test.each([Number.NaN, 0, -1, 1.5])(
    "rejects invalid timeoutMs value %s",
    timeoutMs => {
      expect(
        () =>
          new FetchProvider("https://node.example", {
            fetch: jest.fn(),
            timeoutMs
          })
      ).toThrow(InvalidOptionMessage)
    }
  )

  test.each([Number.NaN, 0, -1, 1.5])(
    "rejects invalid maxResponseBytes value %s",
    maxResponseBytes => {
      expect(
        () =>
          new FetchProvider("https://node.example", {
            fetch: jest.fn(),
            maxResponseBytes
          })
      ).toThrow(InvalidOptionMessage)
    }
  )
})
