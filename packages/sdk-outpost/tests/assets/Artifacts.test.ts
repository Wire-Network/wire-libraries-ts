import Crypto from "node:crypto"
import Fs from "node:fs"
import Path from "node:path"

import {
  CurrentOutpostDeployment,
  EthereumContractName,
  OPP__factory,
  OperatorRegistry__factory,
  OutpostDeployments,
  ReserveManager__factory,
  SolanaProgramName,
  liqsolCoreIdl
} from "@wireio/sdk-outpost"

const PackagePath = Path.resolve(__dirname, "../..")

function sha256(file: string): string {
  return Crypto.createHash("sha256").update(Fs.readFileSync(file)).digest("hex")
}

describe("versioned deployment assets", () => {
  it.each(OutpostDeployments)(
    "matches every $id artifact digest",
    deployment => {
      Object.values(EthereumContractName).forEach(contractName => {
        const contract = deployment.ethereum.contracts[contractName]

        expect(
          sha256(
            Path.join(
              PackagePath,
              "src/assets/ethereum",
              deployment.id,
              `${contractName}.json`
            )
          )
        ).toBe(contract.artifactSha256)
      })

      const program = deployment.solana.programs[SolanaProgramName.liqsolCore]

      expect(
        sha256(
          Path.join(
            PackagePath,
            "src/assets/solana",
            deployment.id,
            "liqsol_core.json"
          )
        )
      ).toBe(program.artifactSha256)
    }
  )

  it("generates the current callable swap and collateral surfaces", () => {
    expect(liqsolCoreIdl.address).toBe(
      CurrentOutpostDeployment.solana.programs[SolanaProgramName.liqsolCore]
        .address
    )
    expect(OPP__factory.abi.length).toBeGreaterThan(0)
    expect(
      OPP__factory.createInterface().getFunction("addAttestation")
    ).toBeDefined()
    expect(
      ReserveManager__factory.createInterface().getFunction("requestSwap")
    ).toBeDefined()
    expect(
      ReserveManager__factory.createInterface().getFunction(
        "requestSwapErc20WithApproval"
      )
    ).toBeDefined()
    expect(
      OperatorRegistry__factory.createInterface().getFunction("deposit")
    ).toBeDefined()
    expect(
      OperatorRegistry__factory.createInterface().getFunction("commit")
    ).toBeDefined()
    expect(
      liqsolCoreIdl.instructions.map(instruction => instruction.name)
    ).toEqual(
      expect.arrayContaining([
        "requestSwap",
        "requestSwapSpl",
        "commitUnderwrite"
      ])
    )
  })
})
