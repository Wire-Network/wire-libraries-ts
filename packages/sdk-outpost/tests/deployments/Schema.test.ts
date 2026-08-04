import {
  EthereumContractName,
  parseOutpostDeployment
} from "@wireio/sdk-outpost"
import { createDeploymentFixture } from "../Fixtures.js"

describe("OutpostDeploymentSchema", () => {
  it("parses a valid deployment with its Wire chain identity", () => {
    const deployment = parseOutpostDeployment(createDeploymentFixture())

    expect(deployment.id).toBe(
      `${deployment.wire.chainId}-${deployment.artifactBundle.deploymentChecksum.slice(0, 12)}`
    )
    expect(
      deployment.ethereum.contracts[EthereumContractName.ReserveManager].address
    ).toBe(
      createDeploymentFixture().ethereum.contracts[
        EthereumContractName.ReserveManager
      ].address
    )
  })

  it("rejects an invalid contract address", () => {
    const fixture = createDeploymentFixture()
    fixture.ethereum.contracts.OPP.address = "not-an-address"

    expect(() => parseOutpostDeployment(fixture)).toThrow(
      "Invalid Ethereum address"
    )
  })

  it("rejects an invalid Solana program address", () => {
    const fixture = createDeploymentFixture()
    fixture.solana.programs.liqsolCore.address = "not-a-program-address"

    expect(() => parseOutpostDeployment(fixture)).toThrow(
      "Invalid Solana address"
    )
  })

  it("rejects an environment-specific deployment id", () => {
    const fixture = createDeploymentFixture()
    fixture.id = "named-environment"

    expect(() => parseOutpostDeployment(fixture)).toThrow(
      "Deployment id must be"
    )
  })
})
