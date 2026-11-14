import { JsonRpcClient } from "@wireio/opp-snapshot"

const Url = "http://node.invalid/rpc"

/** Answer the next fetch with `body` and status `status`. */
function respond(body: object, status = 200) {
  return jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, statusText: status === 200 ? "OK" : "Bad Gateway" })
  )
}

describe("JsonRpcClient", () => {
  afterEach(() => jest.restoreAllMocks())

  it("posts a JSON-RPC 2.0 call and returns its result", async () => {
    const fetch = respond({ jsonrpc: "2.0", id: 1, result: "0x1f" })
    expect(await new JsonRpcClient(Url).blockNumber()).toBe(31)
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe(Url)
    expect(JSON.parse(request.body as string)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: JsonRpcClient.Method.eth_blockNumber,
      params: []
    })
  })

  it("sends log filters with hex block bounds", async () => {
    const fetch = respond({ jsonrpc: "2.0", id: 1, result: [] })
    await new JsonRpcClient(Url).getLogs({ address: "0xabc", topics: ["0x01"], fromBlock: 16, toBlock: 255 })
    expect(JSON.parse(fetch.mock.calls[0][1].body as string).params).toEqual([
      { address: "0xabc", topics: ["0x01"], fromBlock: "0x10", toBlock: "0xff" }
    ])
  })

  it("reads a block's timestamp", async () => {
    respond({ jsonrpc: "2.0", id: 1, result: { timestamp: "0x64" } })
    expect(await new JsonRpcClient(Url).blockTimestamp(5)).toBe(100)
  })

  it("throws on an HTTP error and on a JSON-RPC error", async () => {
    respond({}, 502)
    await expect(new JsonRpcClient(Url).blockNumber()).rejects.toThrow(/RPC HTTP error 502/)
    respond({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "header not found" } })
    await expect(new JsonRpcClient(Url).getTransactionByHash("0x01")).rejects.toThrow(
      /RPC error -32000: header not found/
    )
  })
})
