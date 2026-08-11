import { PublicKey } from "@solana/web3.js"
import type { AccountInfo, Connection } from "@solana/web3.js"
import type { BytesLike, providers } from "ethers"
import { utils as ethersUtils } from "ethers"
import { match } from "ts-pattern"

import {
  assertEthereumRuntimeArtifactCompatibility,
  assertOutpostArtifactCompatibility,
  assertSolanaProgramArtifactCompatibility
} from "../artifacts/index.js"
import {
  EthereumContractName,
  OutpostChainFamily,
  SolanaProgramName,
  type OutpostDeploymentProfile
} from "../deployments/index.js"
import type { OutpostDeploymentVerificationInput } from "./Types.js"

const EmptyEthereumCode = "0x",
  Eip1967ImplementationStorageSlot =
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  Eip1967ImplementationAddressOffset = 12,
  UpgradeableLoaderStateTagByteLength = 4,
  SolanaPublicKeyByteLength = 32,
  UpgradeableLoaderProgramDataAddressEnd =
    UpgradeableLoaderStateTagByteLength + SolanaPublicKeyByteLength

enum UpgradeableLoaderStateTag {
  program = 2,
  programData = 3
}

/** Canonical Solana upgradeable-loader program identity. */
export const SolanaUpgradeableLoaderProgramId = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
)

function sha256(value: BytesLike): string {
  return ethersUtils.sha256(value).slice(2)
}

function upgradeableLoaderStateTag(data: Uint8Array): number {
  if (data.byteLength < UpgradeableLoaderStateTagByteLength) {
    throw new Error("Solana upgradeable-loader account data is truncated")
  }
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
    0,
    true
  )
}

function assertSolanaUpgradeableLoaderAccount(
  account: AccountInfo<Buffer>,
  address: string,
  label: string
): void {
  if (!account.owner.equals(SolanaUpgradeableLoaderProgramId)) {
    throw new Error(
      `${label} ${address} is not owned by the Solana upgradeable loader`
    )
  }
}

async function verifyEthereum(
  profile: OutpostDeploymentProfile,
  provider: providers.Provider
): Promise<void> {
  assertOutpostArtifactCompatibility(profile, OutpostChainFamily.ethereum)

  const network = await provider.getNetwork()
  if (network.chainId !== profile.ethereum.chainId) {
    throw new Error(
      `Ethereum chain mismatch: expected ${profile.ethereum.chainId}, received ${network.chainId}`
    )
  }

  await Promise.all(
    Object.values(EthereumContractName).map(async contractName => {
      const contract = profile.ethereum.contracts[contractName],
        proxyCode = await provider.getCode(contract.address)

      if (proxyCode === EmptyEthereumCode) {
        throw new Error(
          `Ethereum contract ${contractName} is not deployed at ${contract.address}`
        )
      }

      const implementationWord = await provider.getStorageAt(
          contract.address,
          Eip1967ImplementationStorageSlot
        ),
        implementationAddress = ethersUtils.getAddress(
          ethersUtils.hexDataSlice(
            implementationWord,
            Eip1967ImplementationAddressOffset
          )
        )

      if (implementationAddress !== contract.implementationAddress) {
        throw new Error(
          `Ethereum ${contractName} implementation mismatch: expected ${contract.implementationAddress}, received ${implementationAddress}`
        )
      }

      const implementationCode = await provider.getCode(implementationAddress)
      if (implementationCode === EmptyEthereumCode) {
        throw new Error(
          `Ethereum ${contractName} implementation is not deployed at ${implementationAddress}`
        )
      }

      const implementationCodeSha256 = sha256(implementationCode)
      if (implementationCodeSha256 !== contract.implementationCodeSha256) {
        throw new Error(
          `Ethereum ${contractName} implementation code mismatch: expected ${contract.implementationCodeSha256}, received ${implementationCodeSha256}`
        )
      }
      assertEthereumRuntimeArtifactCompatibility(
        contractName,
        implementationCode
      )
    })
  )
}

async function verifySolana(
  profile: OutpostDeploymentProfile,
  connection: Connection
): Promise<void> {
  assertOutpostArtifactCompatibility(profile, OutpostChainFamily.solana)

  const genesisHash = await connection.getGenesisHash()
  if (genesisHash !== profile.solana.genesisHash) {
    throw new Error(
      `Solana genesis mismatch: expected ${profile.solana.genesisHash}, received ${genesisHash}`
    )
  }

  await Promise.all(
    Object.values(SolanaProgramName).map(async programName => {
      const program = profile.solana.programs[programName],
        programAccount = await connection.getAccountInfo(
          new PublicKey(program.address)
        )

      if (programAccount == null || !programAccount.executable) {
        throw new Error(
          `Solana program ${programName} is not executable at ${program.address}`
        )
      }
      assertSolanaUpgradeableLoaderAccount(
        programAccount,
        program.address,
        `Solana program ${programName}`
      )

      const programStateTag = upgradeableLoaderStateTag(programAccount.data)
      if (programStateTag !== UpgradeableLoaderStateTag.program) {
        throw new Error(
          `Solana program ${programName} has invalid upgradeable-loader state ${programStateTag}`
        )
      }

      if (
        programAccount.data.byteLength < UpgradeableLoaderProgramDataAddressEnd
      ) {
        throw new Error(
          `Solana program ${programName} upgradeable-loader data is truncated`
        )
      }

      const programDataAddress = new PublicKey(
        programAccount.data.subarray(
          UpgradeableLoaderStateTagByteLength,
          UpgradeableLoaderProgramDataAddressEnd
        )
      ).toBase58()
      if (programDataAddress !== program.programDataAddress) {
        throw new Error(
          `Solana ${programName} ProgramData mismatch: expected ${program.programDataAddress}, received ${programDataAddress}`
        )
      }

      const programDataAccount = await connection.getAccountInfo(
        new PublicKey(programDataAddress)
      )
      if (programDataAccount == null) {
        throw new Error(
          `Solana ${programName} ProgramData is not deployed at ${programDataAddress}`
        )
      }
      assertSolanaUpgradeableLoaderAccount(
        programDataAccount,
        programDataAddress,
        `Solana ${programName} ProgramData`
      )

      const programDataStateTag = upgradeableLoaderStateTag(
        programDataAccount.data
      )
      if (programDataStateTag !== UpgradeableLoaderStateTag.programData) {
        throw new Error(
          `Solana ${programName} ProgramData has invalid upgradeable-loader state ${programDataStateTag}`
        )
      }

      const programDataSha256 = sha256(programDataAccount.data)
      if (programDataSha256 !== program.programDataSha256) {
        throw new Error(
          `Solana ${programName} ProgramData mismatch: expected ${program.programDataSha256}, received ${programDataSha256}`
        )
      }
      assertSolanaProgramArtifactCompatibility(
        programName,
        programDataAccount.data
      )
    })
  )
}

/** Cross-chain facade for exact outpost deployment-profile verification. */
export namespace OutpostDeploymentVerifier {
  /** Verify chain identity, interface compatibility, and exact live runtime identity. */
  export async function verify(
    input: OutpostDeploymentVerificationInput
  ): Promise<void> {
    await match(input)
      .with({ family: OutpostChainFamily.ethereum }, value =>
        verifyEthereum(value.profile, value.provider)
      )
      .with({ family: OutpostChainFamily.solana }, value =>
        verifySolana(value.profile, value.connection)
      )
      .exhaustive()
  }
}
