import { zeroPadValue } from "ethers"

import {
  OppAssertionType,
  decodeAssertionBytes,
  decodeLogsToRows,
  decodeOppLog,
  isOppLog
} from "@wireio/opp-snapshot"
import { OppAddress, oppLog, packAssertion } from "./oppEncoding.js"

const Staker = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
const Stake = {
  type: OppAssertionType.Stake,
  values: { staker: Staker, principal: 5n * 10n ** 18n, shares: 4n * 10n ** 18n, index: 10n ** 27n + 7n }
}
const Bond = {
  type: OppAssertionType.BondedActor,
  values: {
    actor: Staker,
    owner: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    bondLevelId: zeroPadValue("0x05", 32),
    tokenId: 42n,
    bondedAt: 1_700_000_123n
  }
}
const Position = { blockNumber: 12, logIndex: 3, transactionHash: zeroPadValue("0xaa", 32) }

describe("decoder", () => {
  it("decodes the header and every packed argument type", () => {
    const message = decodeOppLog(oppLog([Stake, Bond], Position), OppAddress)
    expect(message.header.messageId).toBe(zeroPadValue("0x01", 32))
    expect(message.header.timestamp).toBe(1_700_000_000n)
    expect(message.protocolVersion).toBe(1)
    expect(message.assertions).toEqual([
      {
        assertionType: OppAssertionType.Stake,
        args: {
          staker: Staker,
          principal: "5000000000000000000",
          shares: "4000000000000000000",
          index: (10n ** 27n + 7n).toString()
        }
      },
      {
        assertionType: OppAssertionType.BondedActor,
        args: {
          actor: Staker,
          owner: Bond.values.owner,
          bondLevelId: Bond.values.bondLevelId,
          tokenId: "42",
          bondedAt: "1700000123"
        }
      }
    ])
  })

  it("only decodes OPPMessages of the given contract", () => {
    const log = oppLog([Stake], Position)
    expect(isOppLog(log, OppAddress.toUpperCase().replace("0X", "0x"))).toBe(true)
    expect(decodeOppLog({ ...log, address: Staker }, OppAddress)).toBeNull()
    expect(decodeOppLog({ ...log, topics: [zeroPadValue("0x01", 32)] }, OppAddress)).toBeNull()
    expect(decodeOppLog({ ...log, topics: [] }, OppAddress)).toBeNull()
  })

  it("drops assertions of unknown types and reports truncated data instead of throwing", () => {
    const warnings: string[] = [],
      warn = (message: string) => warnings.push(message)
    expect(decodeOppLog(oppLog([{ ...Stake, type: 3003 }, Stake], Position), OppAddress, warn).assertions).toHaveLength(1)
    const truncated = oppLog([Stake], Position)
    expect(decodeOppLog({ ...truncated, data: truncated.data.slice(0, 200) }, OppAddress, warn)).toBeNull()
    expect(warnings).toEqual([expect.stringMatching(/^Failed to decode OPP log: /)])
  })

  it("reports a payload that runs out instead of throwing", () => {
    const warnings: string[] = [],
      payload = packAssertion(Stake)
    expect(
      decodeAssertionBytes(OppAssertionType.Stake, Buffer.from(payload.slice(0, payload.length - 1)), message =>
        warnings.push(message)
      )
    ).toBeNull()
    expect(warnings).toEqual([expect.stringMatching(/^Failed to decode assertion type 3001: /)])
    expect(decodeAssertionBytes(3003, Buffer.from(payload))).toBeNull()
  })

  it("flattens messages into positioned rows, reading hex block numbers", () => {
    const rows = decodeLogsToRows(
      [
        { ...oppLog([Stake, Bond], Position), blockNumber: "0x10", logIndex: "0x2", blockTimestamp: 99 },
        { ...oppLog([Stake], Position), address: Staker },
        oppLog([Stake], { ...Position, logIndex: 4 })
      ],
      OppAddress
    )
    expect(rows.map(row => [row.blockNumber, row.logIndex, row.assertionIndex, row.assertionType, row.blockTime])).toEqual([
      [16, 2, 0, OppAssertionType.Stake, 99],
      [16, 2, 1, OppAssertionType.BondedActor, 99],
      [12, 4, 0, OppAssertionType.Stake, null]
    ])
    expect(rows[0].txHash).toBe(Position.transactionHash)
  })
})
