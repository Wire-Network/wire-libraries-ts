import { BlockId } from "@wireio/sdk-core/chain/BlockId"

const CHECKSUM_BYTES = new Uint8Array(32)

describe("BlockId", () => {
  test("fromBlockChecksum packs block number bytes", () => {
    const id = BlockId.fromBlockChecksum(CHECKSUM_BYTES, 16)

    expect(id.blockNum.toNumber()).toBe(16)
  })

  test("fromBlockChecksum rejects malformed block number strings", () => {
    expect(() => BlockId.fromBlockChecksum(CHECKSUM_BYTES, "0x10")).toThrow(
      "Invalid number"
    )
    expect(() => BlockId.fromBlockChecksum(CHECKSUM_BYTES, "abc")).toThrow(
      "Invalid number"
    )
  })
})
