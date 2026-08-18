import {
  EthereumContractName,
  parseOutpostDeploymentProfile
} from "@wireio/sdk-outpost"
import { createOutpostDeploymentProfileFixture } from "../Fixtures.js"

describe("OutpostDeploymentProfileSchema", () => {
  it("parses a valid profile with its Wire chain identity", () => {
    const profile = parseOutpostDeploymentProfile(
      createOutpostDeploymentProfileFixture()
    )

    expect(profile.id).toBe(
      `${profile.wire.chainId}-${profile.deploymentChecksum.slice(0, 12)}`
    )
    expect(
      profile.ethereum.contracts[EthereumContractName.ReserveManager].address
    ).toBe(
      createOutpostDeploymentProfileFixture().ethereum.contracts[
        EthereumContractName.ReserveManager
      ].address
    )
  })

  it("rejects an invalid contract address", () => {
    const fixture = createOutpostDeploymentProfileFixture()
    fixture.ethereum.contracts.OPP.address = "not-an-address"

    expect(() => parseOutpostDeploymentProfile(fixture)).toThrow(
      "Invalid Ethereum address"
    )
  })

  it("rejects a pre-BAR deployment profile schema", () => {
    const profile = {
      ...createOutpostDeploymentProfileFixture(),
      schemaVersion: 1
    }

    expect(() => parseOutpostDeploymentProfile(profile)).toThrow("expected 2")
  })

  it("rejects an invalid Solana ProgramData address", () => {
    const fixture = createOutpostDeploymentProfileFixture()
    fixture.solana.programs.liqsolCore.programDataAddress =
      "not-a-program-data-address"

    expect(() => parseOutpostDeploymentProfile(fixture)).toThrow(
      "Invalid Solana address"
    )
  })

  it("rejects an environment-specific profile id", () => {
    const fixture = createOutpostDeploymentProfileFixture()
    fixture.id = "named-environment"

    expect(() => parseOutpostDeploymentProfile(fixture)).toThrow(
      "Deployment profile id must be"
    )
  })
})
