import {
  EthereumContractName,
  OutpostDeploymentId,
  parseOutpostDeployment
} from "@wireio/sdk-outpost"

const Hash = "a".repeat(64),
  Revision = "b".repeat(40),
  WireChainId = "c".repeat(64),
  EthereumAddress = "0x5c74c94173F05dA1720953407cbb920F3DF9f887",
  SolanaAddress = "5nBtmutQLrRKBUxNfHJPDjiW5u8id6QM9Hhjg1D1g1XH"

function createDeploymentFixture() {
  const ethereumContract = {
    address: EthereumAddress,
    artifactSha256: Hash
  }
  return {
    schemaVersion: 1,
    id: OutpostDeploymentId.sim2,
    artifactBundle: {
      generatedAt: "2026-07-31T15:47:46Z",
      sourceArchiveSha256: Hash,
      platformRelease: {
        tag: "v1.0.0",
        url: "https://github.com/Wire-Network/wire-platform-build-system/releases/tag/v1.0.0"
      },
      sources: {
        wireTools: {
          repository: "Wire-Network/wire-tools-ts",
          revision: Revision
        },
        wireSysio: {
          repository: "Wire-Network/wire-sysio",
          revision: Revision
        },
        wireEthereum: {
          repository: "Wire-Network/wire-ethereum",
          revision: Revision
        },
        wireSolana: {
          repository: "Wire-Network/wire-solana",
          revision: Revision
        }
      }
    },
    wire: { chainId: WireChainId },
    ethereum: {
      chainId: 31_337,
      contracts: {
        OPP: ethereumContract,
        OPPInbound: ethereumContract,
        OperatorRegistry: ethereumContract,
        ReserveManager: ethereumContract
      }
    },
    solana: {
      programs: {
        liqsolCore: {
          address: SolanaAddress,
          artifactSha256: Hash
        }
      }
    }
  }
}

describe("OutpostDeploymentSchema", () => {
  it("parses a valid deployment into sdk-core chain identity", () => {
    const deployment = parseOutpostDeployment(createDeploymentFixture())

    expect(deployment.id).toBe(OutpostDeploymentId.sim2)
    expect(deployment.wire.chainId.hexString).toBe(WireChainId)
    expect(
      deployment.ethereum.contracts[EthereumContractName.ReserveManager].address
    ).toBe(EthereumAddress)
  })

  it("rejects an invalid contract address", () => {
    const fixture = createDeploymentFixture()
    fixture.ethereum.contracts.OPP.address = "not-an-address"

    expect(() => parseOutpostDeployment(fixture)).toThrow(
      "Invalid Ethereum address"
    )
  })
})
