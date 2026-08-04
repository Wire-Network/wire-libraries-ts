import {
  EthereumContractName,
  OutpostArtifactManifests,
  SolanaProgramName,
  type OutpostDeployment,
  parseOutpostDeployment
} from "@wireio/sdk-outpost"

const TestHash = "a".repeat(64),
  TestRevision = "b".repeat(40),
  TestWireChainId = "c".repeat(64),
  TestEthereumAddress = "0x5c74c94173F05dA1720953407cbb920F3DF9f887",
  TestSolanaGenesisHash = "5nBtmutQLrRKBUxNfHJPDjiW5u8id6QM9Hhjg1D1g1XH",
  TestSolanaProgramAddress = "11111111111111111111111111111111"

/** Create a valid runtime deployment aligned with the compiled artifact packages. */
export function createDeploymentFixture(): OutpostDeployment {
  const ethereumContracts = Object.fromEntries(
      Object.values(EthereumContractName).map(contractName => [
        contractName,
        {
          address: TestEthereumAddress,
          artifactSha256:
            OutpostArtifactManifests.ethereum.contracts[contractName]
              .artifactSha256
        }
      ])
    ),
    deployment = {
      schemaVersion: 1,
      id: `${TestWireChainId}-${TestHash.slice(0, 12)}`,
      artifactBundle: {
        generatedAt: "2026-07-31T15:47:46Z",
        sourceArchiveSha256: TestHash,
        clusterManifestSha256: TestHash,
        deploymentChecksum: TestHash,
        snapshotChecksum: TestHash,
        platformRelease: {
          tag: "v1.0.0",
          url: "https://github.com/Wire-Network/wire-platform-build-system/releases/tag/v1.0.0",
          manifest: {
            repository: "Wire-Network/wire-platform-manifest",
            revision: TestRevision
          },
          libraries: {
            repository: "Wire-Network/wire-libraries-ts",
            revision: TestRevision
          }
        },
        sources: {
          wireTools: {
            repository: "Wire-Network/wire-tools-ts",
            revision: TestRevision
          },
          wireSysio: {
            repository: "Wire-Network/wire-sysio",
            revision: TestRevision
          },
          wireEthereum: {
            repository: "Wire-Network/wire-ethereum",
            revision: TestRevision
          },
          wireSolana: {
            repository: "Wire-Network/wire-solana",
            revision: TestRevision
          }
        }
      },
      wire: { chainId: TestWireChainId },
      ethereum: {
        chainId: 31_337,
        contracts: ethereumContracts
      },
      solana: {
        genesisHash: TestSolanaGenesisHash,
        programs: {
          [SolanaProgramName.liqsolCore]: {
            address: TestSolanaProgramAddress,
            artifactSha256:
              OutpostArtifactManifests.solana.programs[
                SolanaProgramName.liqsolCore
              ].idlSha256
          }
        }
      }
    }

  return parseOutpostDeployment(deployment)
}
