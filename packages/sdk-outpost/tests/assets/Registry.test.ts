import { OPPInbound__factory } from "@wireio/outpost-ethereum-artifacts"
import { liqsolCoreIdl } from "@wireio/outpost-solana-artifacts"
import { CurrentOutpostArtifactSuite } from "@wireio/sdk-outpost/artifacts/Registry"
import {
  EthereumContractName,
  OutpostArtifactManifests,
  OutpostChainFamily,
  SolanaProgramName,
  assertOutpostArtifactCompatibility
} from "@wireio/sdk-outpost"
import { createOutpostDeploymentProfileFixture } from "../Fixtures.js"

const RetiredSolanaV044IdlDigest =
  "e3650e76f9eed4db25d2720a2be108fe85420d6cb366c8089044655879cf8915"

describe("current artifact suite", () => {
  it("uses the same installed pair for public manifests, helpers and clients", () => {
    const suite = CurrentOutpostArtifactSuite
    expect(suite.ethereum.manifest).toBe(OutpostArtifactManifests.ethereum)
    expect(suite.solana.manifest).toBe(OutpostArtifactManifests.solana)
    expect(suite.ethereum.factories[EthereumContractName.OPPInbound]).toBe(
      OPPInbound__factory
    )
    expect(suite.solana.idls[SolanaProgramName.liqsolCore]).toBe(liqsolCoreIdl)
  })

  it.each([RetiredSolanaV044IdlDigest, "f".repeat(64)])(
    "rejects retired or unknown Solana interfaces (%s)",
    digest => {
      const profile = createOutpostDeploymentProfileFixture()
      profile.solana.programs.liqsolCore.idlSha256 = digest
      expect(() =>
        assertOutpostArtifactCompatibility(profile, OutpostChainFamily.solana)
      ).toThrow("IDL interface mismatch")
    }
  )

  it("rejects a different Ethereum ABI even with a current Solana IDL", () => {
    const profile = createOutpostDeploymentProfileFixture()
    profile.ethereum.contracts.OPPInbound.abiSha256 = "f".repeat(64)
    expect(() =>
      assertOutpostArtifactCompatibility(profile, OutpostChainFamily.ethereum)
    ).toThrow("ABI interface mismatch")
  })
})
