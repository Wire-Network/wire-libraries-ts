import { ABI, ABICache, APIClient, Blob, Serializer } from "@wireio/sdk-core"

describe("ABI request cache", () => {
  it("coalesces concurrent reads, releases failures and caches a successful retry", async () => {
    const api = new APIClient({ url: "https://example.invalid" }),
      cache = new ABICache(api),
      abi = ABI.from({ version: "eosio::abi/1.2", structs: [] }),
      fetch = jest
        .spyOn(api.v1.chain, "get_raw_abi")
        .mockRejectedValueOnce(new Error("RPC unavailable"))
        .mockResolvedValue({
          abi: new Blob(Serializer.encode({ object: abi }).array)
        } as never)
    const failed = await Promise.allSettled([
      cache.getAbi("sysio"),
      cache.getAbi("sysio")
    ])
    expect(failed.map(result => result.status)).toEqual([
      "rejected",
      "rejected"
    ])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(cache.pending.size).toBe(0)
    const [first, second] = await Promise.all([
      cache.getAbi("sysio"),
      cache.getAbi("sysio")
    ])
    expect(first.version).toBe(abi.version)
    expect(second.version).toBe(first.version)
    expect(await cache.getAbi("sysio")).toBe(second)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(cache.pending.size).toBe(0)
  })
})
