import { keccak256, toUtf8Bytes } from "ethers"

import { OppConstants } from "@wireio/opp-snapshot"

describe("OppConstants", () => {
  it("derives the OPPMessage topic0 as keccak256 of the event signature", () => {
    expect(OppConstants.OppMessageTopic0).toBe(keccak256(toUtf8Bytes(OppConstants.OppMessageEventSignature)))
    expect(OppConstants.OppMessageTopic0).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it("scales the index and the yield by 1e27", () => {
    expect(OppConstants.IndexPrecision).toBe(10n ** 27n)
    expect(OppConstants.YieldPrecision).toBe(10n ** 27n)
  })
})
