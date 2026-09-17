import {
  assertEthereumReserveCreateRequest,
  assertReserveCreateDefinition,
  assertReserveSwapRequest,
  assertReserveUnsigned64,
  type EthereumReserveCreateRequest,
  type ReserveCreateDefinition,
  type ReserveSwapRequest
} from "@wireio/sdk-outpost"

const InvalidConnectorWeights = [0, 10_000]

const reserveDefinition: ReserveCreateDefinition = {
  tokenCode: 1,
  reserveCode: 2,
  externalTokenAmount: 3,
  requestedWireAmount: 4,
  connectorWeightBps: 5_000,
  name: "Private ETH reserve",
  description: "Same-owner external routing",
  isPrivate: true
}

const ethereumRequest: EthereumReserveCreateRequest = {
  ...reserveDefinition,
  creatorPubKey: `0x02${"11".repeat(32)}`
}

const request: ReserveSwapRequest = {
  sourceTokenCode: 1,
  sourceReserveCode: 2,
  sourceAmount: 3,
  targetChainCode: 4,
  targetTokenCode: 5,
  targetReserveCode: 6,
  targetRecipient: Uint8Array.from([7]),
  targetAmount: 8,
  targetToleranceBps: 500
}

describe("reserve swap validation", () => {
  it("accepts portable and Ethereum reserve creation requests", () => {
    expect(() => assertReserveCreateDefinition(reserveDefinition)).not.toThrow()
    expect(() =>
      assertEthereumReserveCreateRequest(ethereumRequest)
    ).not.toThrow()
  })

  it("rejects invalid reserve creation metadata and creator keys", () => {
    InvalidConnectorWeights.forEach(connectorWeightBps =>
      expect(() =>
        assertReserveCreateDefinition({
          ...reserveDefinition,
          connectorWeightBps
        })
      ).toThrow("connectorWeightBps")
    )
    expect(() =>
      assertReserveCreateDefinition({ ...reserveDefinition, name: "" })
    ).toThrow("name must contain")
    expect(() =>
      assertEthereumReserveCreateRequest({
        ...ethereumRequest,
        creatorPubKey: "0x02"
      })
    ).toThrow("33-byte compressed")
    expect(() =>
      assertEthereumReserveCreateRequest({
        ...ethereumRequest,
        creatorPubKey: `0x04${"11".repeat(32)}`
      })
    ).toThrow("33-byte compressed")
    expect(() =>
      assertEthereumReserveCreateRequest({
        ...ethereumRequest,
        creatorPubKey: "not-hex"
      })
    ).toThrow("33-byte compressed")
  })

  it("accepts a portable positive request", () => {
    expect(() => assertReserveSwapRequest(request)).not.toThrow()
    expect(assertReserveUnsigned64(8, "value")).toBe(8n)
  })

  it("rejects an empty recipient and values outside uint64", () => {
    expect(() =>
      assertReserveSwapRequest({
        ...request,
        targetRecipient: new Uint8Array()
      })
    ).toThrow("targetRecipient is required")
    expect(() => assertReserveUnsigned64(0, "value")).toThrow(
      "between 1 and uint64 max"
    )
  })
})
