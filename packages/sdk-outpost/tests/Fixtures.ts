import { AnchorProvider, Wallet } from "@coral-xyz/anchor"
import { Connection, Keypair, PublicKey } from "@solana/web3.js"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import {
  getAddress,
  hexlify,
  JsonRpcProvider,
  Network,
  sha256,
  toBeHex,
  zeroPadValue
} from "ethers"

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
  TestSolanaGenesisHash = "5nBtmutQLrRKBUxNfHJPDjiW5u8id6QM9Hhjg1D1g1XH",
  TestSolanaProgramAddress = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi",
  TestSolanaProgramDataAddress = "8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR",
  TestSolanaRpcUrl = "http://example.invalid",
  UpgradeableLoaderStateTagByteLength = 4,
  SolanaPublicKeyByteLength = 32,
  ProgramAccountDataByteLength =
    UpgradeableLoaderStateTagByteLength + SolanaPublicKeyByteLength,
  SolanaProgramDataMetadataByteLength = 45,
  SolanaProgramDataPaddingByteLength = 16,
  ProgramStateTag = 2,
  ProgramDataStateTag = 3,
  TestEthereumProxyAddressBase = 100,
  TestEthereumImplementationAddressBase = 200,
  TestEthereumProxyCode = "0x01",
  PackageRequire = createRequire(__filename),
  SolanaProgramArtifact =
    OutpostArtifactManifests.solana.programs[SolanaProgramName.liqsolCore],
  SolanaProgramBinary = readFileSync(
    PackageRequire.resolve(
      `${OutpostArtifactManifests.solana.package.name}/${SolanaProgramArtifact.programBinaryPath}`
    )
  )

/** Create one deterministic Ethereum address for a fixture index. */
function createEthereumAddress(index: number): string {
  return getAddress(zeroPadValue(toBeHex(index), 20))
}

/** Create linked live implementation code from one producer runtime template. */
export function createEthereumImplementationCode(
  contractName: EthereumContractName
): string {
  const artifact = OutpostArtifactManifests.ethereum.contracts[contractName],
    runtimeCode = Buffer.from(
      readFileSync(
        PackageRequire.resolve(
          `${OutpostArtifactManifests.ethereum.package.name}/${artifact.runtimeBytecodePath}`
        )
      )
    )

  artifact.runtimeLinkReferences.forEach(({ start, length }) =>
    runtimeCode.fill(1, start, start + length)
  )
  return hexlify(runtimeCode)
}

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
  const data = Buffer.alloc(
    SolanaProgramDataMetadataByteLength +
      SolanaProgramBinary.length +
      SolanaProgramDataPaddingByteLength
  )
  data.writeUInt32LE(ProgramDataStateTag, 0)
  data.writeBigUInt64LE(1n, UpgradeableLoaderStateTagByteLength)
  SolanaProgramBinary.copy(data, SolanaProgramDataMetadataByteLength)
  return data
}

/** Create a valid profile aligned with the SDK's source-owned artifacts. */
export function createOutpostDeploymentProfileFixture(): OutpostDeploymentProfile {
  const ethereumContracts = Object.fromEntries(
      Object.values(EthereumContractName).map((contractName, index) => [
        contractName,
        {
          address: createEthereumAddress(TestEthereumProxyAddressBase + index),
          implementationAddress: createEthereumAddress(
            TestEthereumImplementationAddressBase + index
          ),
          abiSha256:
            OutpostArtifactManifests.ethereum.contracts[contractName].abiSha256,
          implementationCodeSha256: sha256(
            createEthereumImplementationCode(contractName)
          ).slice(2)
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
            programDataSha256: sha256(programData).slice(2)
          }
        }
      }
    }

  return parseOutpostDeploymentProfile(profile)
}

/** Create an Ethereum provider aligned with one deployment profile. */
export function createEthereumProviderFixture(
  profile: OutpostDeploymentProfile
): JsonRpcProvider {
  const provider = new JsonRpcProvider()
  jest.spyOn(provider, "getNetwork").mockResolvedValue(
    Network.from({
      chainId: profile.ethereum.chainId,
      name: "wire-outpost"
    })
  )
  jest.spyOn(provider, "getCode").mockImplementation(async address => {
    const implementation = Object.entries(profile.ethereum.contracts).find(
      ([, deployment]) => deployment.implementationAddress === address
    )
    if (implementation != null) {
      return createEthereumImplementationCode(
        implementation[0] as EthereumContractName
      )
    }
    return Object.values(profile.ethereum.contracts).some(
      deployment => deployment.address === address
    )
      ? TestEthereumProxyCode
      : "0x"
  })
  jest.spyOn(provider, "getStorage").mockImplementation(async address => {
    const contract = Object.values(profile.ethereum.contracts).find(
      deployment => deployment.address === address
    )
    return zeroPadValue(
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
