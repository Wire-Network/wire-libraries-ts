import {
  OutpostDeploymentId,
  Sim2Deployment,
  assertOutpostDeployment
} from "@wireio/sdk-outpost"

describe("assertOutpostDeployment", () => {
  it("resolves the deployment from the parent Wire chain", () => {
    expect(assertOutpostDeployment(Sim2Deployment.wire.chainId).id).toBe(
      OutpostDeploymentId.sim2
    )
  })

  it("rejects an unsupported Wire chain", () => {
    const unsupportedChainId = "f".repeat(64)

    expect(() => assertOutpostDeployment(unsupportedChainId)).toThrow(
      unsupportedChainId
    )
  })
})
