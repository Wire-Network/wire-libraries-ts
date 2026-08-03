import {
  CurrentOutpostDeployment,
  OutpostDeployments,
  assertOutpostDeployment,
  getOutpostDeployment
} from "@wireio/sdk-outpost"

describe("assertOutpostDeployment", () => {
  it.each(OutpostDeployments)(
    "resolves $id from its parent Wire chain",
    deployment => {
      expect(assertOutpostDeployment(deployment.wire.chainId)).toBe(deployment)
      expect(getOutpostDeployment(deployment.id)).toBe(deployment)
    }
  )

  it("keeps the generated deployment explicit", () => {
    expect(OutpostDeployments).toContain(CurrentOutpostDeployment)
    expect(OutpostDeployments).toHaveLength(2)
  })

  it("accepts sdk-core compatible chain identity objects", () => {
    const deployment = OutpostDeployments[0]

    expect(
      assertOutpostDeployment({ hexString: deployment.wire.chainId })
    ).toBe(deployment)
  })

  it("rejects an unsupported Wire chain", () => {
    const unsupportedChainId = "f".repeat(64)

    expect(() => assertOutpostDeployment(unsupportedChainId)).toThrow(
      unsupportedChainId
    )
  })
})
