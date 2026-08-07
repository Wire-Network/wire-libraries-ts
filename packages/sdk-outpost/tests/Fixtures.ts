import { AnchorProvider, Wallet } from "@coral-xyz/anchor"
import { Connection, Keypair, PublicKey } from "@solana/web3.js"
import { providers, utils as ethersUtils } from "ethers"

import {
  EthereumContractName,
  OutpostArtifactManifests,
  type OutpostDeploymentProfile,
  SolanaProgramName,
  SolanaUpgradeableLoaderProgramId,
  parseOutpostDeploymentProfile
} from "@wireio/sdk-outpost"

const TestHash = "a".repeat(64),
  TestWireChainId = "c".repeat(64),
  TestEthereumProxyAddress = "0x5c74c94173F05dA1720953407cbb920F3DF9f887",
  TestEthereumImplementationAddress =
    "0x7412BC256355ABD22dD53De3a38E8995b5d4c1D1",
  TestSolanaGenesisHash = "5nBtmutQLrRKBUxNfHJPDjiW5u8id6QM9Hhjg1D1g1XH",
  TestSolanaProgramAddress = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi",
  TestSolanaProgramDataAddress = "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR",
  TestSolanaRpcUrl = "http://example.invalid",
  UpgradeableLoaderStateTagByteLength = 4,
  SolanaPublicKeyByteLength = 32,
  ProgramAccountDataByteLength =
    UpgradeableLoaderStateTagByteLength + SolanaPublicKeyByteLength,
  ProgramDataAccountDataByteLength = 8,
  ProgramStateTag = 2,
  ProgramDataStateTag = 3

/** Runtime bytecode returned by the Ethereum provider fixture. */
export const TestEthereumImplementationCode = "0x01"

/** Encode the upgradeable-loader Program account for one ProgramData address. */
export function createSolanaProgramAccountData(
  programDataAddress: string
): Buffer {
  const data = Buffer.alloc(ProgramAccountDataByteLength)
  data.writeUInt32LE(ProgramStateTag, 0)
  new PublicKey(programDataAddress)
    .toBuffer()
    .copy(data, UpgradeableLoaderStateTagByteLength)
  return data
}

/** Encode deterministic upgradeable-loader ProgramData account contents. */
export function createSolanaProgramDataAccountData(): Buffer {
  const data = Buffer.alloc(ProgramDataAccountDataByteLength)
  data.writeUInt32LE(ProgramDataStateTag, 0)
  data.writeUInt32LE(1, UpgradeableLoaderStateTagByteLength)
  return data
}

/** Create a valid profile aligned with the SDK's source-owned artifacts. */
export function createOutpostDeploymentProfileFixture(): OutpostDeploymentProfile {
  const ethereumContracts = Object.fromEntries(
      Object.values(EthereumContractName).map(contractName => [
        contractName,
        {
          address: TestEthereumProxyAddress,
          implementationAddress: TestEthereumImplementationAddress,
          abiSha256:
            OutpostArtifactManifests.ethereum.contracts[contractName].abiSha256,
          implementationCodeSha256: ethersUtils
            .sha256(TestEthereumImplementationCode)
            .slice(2)
        }
      ])
    ),
    programData = createSolanaProgramDataAccountData(),
    profile = {
      schemaVersion: 1,
      id: `${TestWireChainId}-${TestHash.slice(0, 12)}`,
      deploymentChecksum: TestHash,
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
            programDataAddress: TestSolanaProgramDataAddress,
            idlSha256:
              OutpostArtifactManifests.solana.programs[
                SolanaProgramName.liqsolCore
              ].idlSha256,
            programDataSha256: ethersUtils.sha256(programData).slice(2)
          }
        }
      }
    }

  return parseOutpostDeploymentProfile(profile)
}

/** Create an Ethereum provider aligned with one deployment profile. */
export function createEthereumProviderFixture(
  profile: OutpostDeploymentProfile
): providers.JsonRpcProvider {
  const provider = new providers.JsonRpcProvider()
  jest.spyOn(provider, "getNetwork").mockResolvedValue({
    chainId: profile.ethereum.chainId,
    name: "wire-outpost"
  })
  jest
    .spyOn(provider, "getCode")
    .mockResolvedValue(TestEthereumImplementationCode)
  jest.spyOn(provider, "getStorageAt").mockImplementation(async address => {
    const contract = Object.values(profile.ethereum.contracts).find(
      deployment => deployment.address === address
    )
    return ethersUtils.hexZeroPad(
      contract?.implementationAddress ??
        profile.ethereum.contracts[EthereumContractName.OPP]
          .implementationAddress,
      32
    )
  })
  return provider
}

/** Create a Solana provider aligned with one deployment profile. */
export function createSolanaProviderFixture(
  profile: OutpostDeploymentProfile
): AnchorProvider {
  const connection = new Connection(TestSolanaRpcUrl),
    provider = new AnchorProvider(connection, new Wallet(Keypair.generate())),
    program = profile.solana.programs[SolanaProgramName.liqsolCore]

  jest
    .spyOn(connection, "getGenesisHash")
    .mockResolvedValue(profile.solana.genesisHash)
  jest.spyOn(connection, "getAccountInfo").mockImplementation(async address => {
    if (address.equals(new PublicKey(program.address))) {
      return {
        data: createSolanaProgramAccountData(program.programDataAddress),
        executable: true,
        lamports: 1,
        owner: SolanaUpgradeableLoaderProgramId,
        rentEpoch: 0
      }
    }
    if (address.equals(new PublicKey(program.programDataAddress))) {
      return {
        data: createSolanaProgramDataAccountData(),
        executable: false,
        lamports: 1,
        owner: SolanaUpgradeableLoaderProgramId,
        rentEpoch: 0
      }
    }
    return null
  })
  return provider
}
