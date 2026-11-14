import { OppAssertionType, computeBalances, sortAssertionRows, toSnapshot, type AssertionRow } from "@wireio/opp-snapshot"

const Ether = 10n ** 18n
const Alice = "0xaaaa000000000000000000000000000000000001"
const Bob = "0xbbbb000000000000000000000000000000000002"
const Carol = "0xcccc000000000000000000000000000000000003"
const AliceKey = "0x02" + "ab".repeat(32)

/** A row in message `logIndex` of block `blockNumber`. */
function row(
  blockNumber: number,
  logIndex: number,
  assertionIndex: number,
  assertionType: OppAssertionType,
  args: Record<string, string>
): AssertionRow {
  return {
    txHash: `0x${String(blockNumber).padStart(4, "0")}${logIndex}`,
    blockNumber,
    blockTime: null,
    logIndex,
    messageId: `0xm${blockNumber}${logIndex}`,
    previousMessageId: "0x00",
    messageTimestamp: BigInt(blockNumber * 10),
    assertionIndex,
    assertionType,
    args
  }
}

const stake = (address: string, principal: bigint, index = 10n ** 27n) => ({
  staker: address,
  principal: principal.toString(),
  shares: principal.toString(),
  index: index.toString()
})

describe("balances", () => {
  it("sorts by block, then log, then position", () => {
    const rows = [
      row(2, 0, 0, OppAssertionType.Stake, stake(Alice, Ether)),
      row(1, 1, 1, OppAssertionType.Stake, stake(Alice, Ether)),
      row(1, 1, 0, OppAssertionType.Stake, stake(Alice, Ether)),
      row(1, 0, 0, OppAssertionType.Stake, stake(Alice, Ether))
    ]
    expect(sortAssertionRows(rows).map(entry => [entry.blockNumber, entry.logIndex, entry.assertionIndex])).toEqual([
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [2, 0, 0]
    ])
    expect(rows[0].blockNumber).toBe(2)
  })

  it("nets stakes against unstakes and keys stakers by lowercase address with their recovered key", () => {
    const output = computeBalances(
      [
        row(1, 0, 0, OppAssertionType.Stake, stake(Alice.toUpperCase().replace("0X", "0x"), 5n * Ether)),
        row(2, 0, 0, OppAssertionType.Unstake, {
          staker: Alice,
          amount: (2n * Ether).toString(),
          shares: (2n * Ether).toString(),
          index: (10n ** 27n + 5n).toString(),
          tokenId: "1"
        }),
        row(3, 0, 0, OppAssertionType.Stake, stake(Bob, Ether, 10n ** 27n + 8n)),
        row(4, 0, 0, OppAssertionType.Unstake, {
          staker: Bob,
          amount: Ether.toString(),
          shares: Ether.toString(),
          index: "0",
          tokenId: "2"
        })
      ],
      new Map([[Alice, AliceKey]])
    )
    expect(output.stakers).toEqual({
      [Alice]: { principal: (3n * Ether).toString(), shares: (3n * Ether).toString(), pretokenYield: "0", pubkey: AliceKey }
    })
    expect(output.metadata).toMatchObject({
      totalMessages: 4,
      // Bob's unstake carries index 0, which never overwrites the last real index.
      latestIndex: (10n ** 27n + 8n).toString(),
      lastMessageId: "0xm40",
      lastTimestamp: "40",
      totalLiqEthStaked: (3n * Ether).toString()
    })
  })

  it("distributes a paired pretoken purchase pro rata and credits no buyer for it", () => {
    const output = computeBalances([
      row(1, 0, 0, OppAssertionType.Stake, stake(Alice, 3n * Ether)),
      row(2, 0, 0, OppAssertionType.LiqPretokenPurchase, {
        purchaser: Bob,
        principal: Ether.toString(),
        shares: Ether.toString(),
        index: (10n ** 27n).toString()
      }),
      row(3, 0, 0, OppAssertionType.PretokenPurchase, {
        buyer: Carol,
        ethIn: "1",
        usdValue: "1",
        pretokensOut: "400"
      }),
      row(3, 0, 1, OppAssertionType.YieldPretokenPurchase, {
        purchaser: Carol,
        principal: "1",
        index: (10n ** 27n + 9n).toString()
      }),
      row(4, 0, 0, OppAssertionType.PretokenPurchase, {
        buyer: Carol,
        ethIn: "1",
        usdValue: "1",
        pretokensOut: "70"
      })
    ])
    expect(output.stakers[Alice].pretokenYield).toBe("300")
    expect(output.purchasers[Bob]).toEqual({
      pretokens: "0",
      shares: Ether.toString(),
      principal: Ether.toString(),
      yield: "100",
      totalPretokens: "100"
    })
    expect(output.purchasers[Carol]).toEqual({
      pretokens: "70",
      shares: "0",
      principal: "0",
      yield: "0",
      totalPretokens: "70"
    })
    expect(output.metadata.latestIndex).toBe((10n ** 27n + 9n).toString())
    expect(output.metadata.totalLiqEthPurchased).toBe(Ether.toString())
  })

  it("projects balances onto the /opp/balances rows", () => {
    const output = computeBalances([row(1, 0, 0, OppAssertionType.Stake, stake(Alice, Ether))])
    expect(toSnapshot(output)).toEqual({
      stakers: [
        {
          address: Alice,
          pubkey: null,
          totalShares: Ether.toString(),
          totalPrincipalIn: Ether.toString(),
          totalAmountOut: "0",
          netPrincipal: Ether.toString(),
          yieldClaimed: "0",
          pretokenYield: "0"
        }
      ],
      purchasers: [],
      metadata: { ...output.metadata, totalPrincipal: Ether.toString() }
    })
  })
})
