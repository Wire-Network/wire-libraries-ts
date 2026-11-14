import { zeroPadValue } from "ethers"

import { JsonRpcClient, OppAssertionType, buildOppSnapshot, type RpcLog } from "@wireio/opp-snapshot"
import { OppAddress, oppLog } from "./oppEncoding.js"

const Staker = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
const Stake = {
  type: OppAssertionType.Stake,
  values: { staker: Staker, principal: 2n * 10n ** 18n, shares: 2n * 10n ** 18n, index: 10n ** 27n }
}

/** A node log at `blockNumber`, as `eth_getLogs` reports it. */
function nodeLog(blockNumber: number, removed = false): RpcLog {
  const log = oppLog([Stake], { blockNumber, logIndex: 0, transactionHash: zeroPadValue("0x0a", 32) })
  return {
    address: log.address,
    topics: log.topics,
    data: log.data,
    blockNumber: `0x${blockNumber.toString(16)}`,
    transactionHash: log.transactionHash,
    logIndex: "0x0",
    blockHash: zeroPadValue("0x0b", 32),
    removed
  }
}

describe("buildOppSnapshot", () => {
  afterEach(() => jest.restoreAllMocks())

  it("reads the stream range by range up to the head, drops reorged logs and replays the rest", async () => {
    const rpc = new JsonRpcClient("http://node.invalid"),
      ranges: number[][] = []
    jest.spyOn(rpc, "blockNumber").mockResolvedValue(25)
    jest.spyOn(rpc, "getLogs").mockImplementation(async filter => {
      ranges.push([filter.fromBlock, filter.toBlock])
      if (filter.fromBlock === 0) return [nodeLog(3), nodeLog(4, true)]
      return filter.fromBlock === 20 ? [nodeLog(21)] : []
    })
    jest.spyOn(rpc, "blockTimestamp").mockImplementation(async block => 1_000 + block)
    const build = await buildOppSnapshot({ rpc, oppAddress: OppAddress, fromBlock: 0, blockRange: 10, recoverPubkeys: false })
    expect(ranges).toEqual([
      [0, 9],
      [10, 19],
      [20, 25]
    ])
    expect(build.toBlock).toBe(25)
    expect(build.assertions.map(row => [row.blockNumber, row.blockTime])).toEqual([
      [3, 1_003],
      [21, 1_021]
    ])
    expect(build.snapshot.stakers).toEqual([expect.objectContaining({ address: Staker, netPrincipal: (4n * 10n ** 18n).toString(), pubkey: null })])
  })

  it("reports a block whose timestamp cannot be read and still builds", async () => {
    const rpc = new JsonRpcClient("http://node.invalid"),
      warnings: string[] = []
    jest.spyOn(rpc, "getLogs").mockResolvedValue([nodeLog(3)])
    jest.spyOn(rpc, "blockTimestamp").mockRejectedValue(new Error("pruned"))
    const build = await buildOppSnapshot({
      rpc,
      oppAddress: OppAddress,
      fromBlock: 0,
      toBlock: 5,
      recoverPubkeys: false,
      warn: message => warnings.push(message)
    })
    expect(warnings).toEqual(["block 3 timestamp unavailable: Error: pruned"])
    expect(build.assertions).toHaveLength(1)
    expect(build.assertions[0].blockTime).toBeNull()
  })
})
