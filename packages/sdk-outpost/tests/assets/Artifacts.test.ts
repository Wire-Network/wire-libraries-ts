import Crypto from "node:crypto"
import Fs from "node:fs"
import Path from "node:path"

import {
  EthereumContractName,
  OPP__factory,
  Sim2Deployment,
  SolanaProgramName,
  liqsolCoreIdl
} from "@wireio/sdk-outpost"

const PackagePath = Path.resolve(__dirname, "../.."),
  EthereumAssetPath = Path.join(PackagePath, "src/assets/ethereum/sim2"),
  SolanaAssetPath = Path.join(PackagePath, "src/assets/solana/sim2")

function sha256(file: string): string {
  return Crypto.createHash("sha256").update(Fs.readFileSync(file)).digest("hex")
}

describe("sim2 assets", () => {
  it("matches every recorded Ethereum ABI digest", () => {
    Object.values(EthereumContractName).forEach(contractName => {
      const deployment = Sim2Deployment.ethereum.contracts[contractName]

      expect(sha256(Path.join(EthereumAssetPath, `${contractName}.json`))).toBe(
        deployment.artifactSha256
      )
    })
  })

  it("matches the recorded Solana IDL and program identity", () => {
    const deployment =
      Sim2Deployment.solana.programs[SolanaProgramName.liqsolCore]

    expect(sha256(Path.join(SolanaAssetPath, "liqsol_core.json"))).toBe(
      deployment.artifactSha256
    )
    expect(liqsolCoreIdl.address).toBe(deployment.address)
  })

  it("generates callable Ethereum factories from the runtime ABI", () => {
    expect(OPP__factory.abi.length).toBeGreaterThan(0)
    expect(
      OPP__factory.createInterface().getFunction("addAttestation")
    ).toBeDefined()
  })
})
