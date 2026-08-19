import { PublicKey } from "@solana/web3.js"
import { getAddress } from "ethers"
import { z } from "zod"

import { EthereumContractName, SolanaProgramName } from "./Types.js"

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/),
  WireChainIdSchema = z.string().regex(/^[0-9a-f]{64}$/),
  EthereumAddressSchema = z.string().transform((value, context) => {
    try {
      return getAddress(value)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      context.addIssue({
        code: "custom",
        message: `Invalid Ethereum address: ${message}`
      })
      return z.NEVER
    }
  }),
  SolanaAddressSchema = z.string().transform((value, context) => {
    try {
      return new PublicKey(value).toBase58()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      context.addIssue({
        code: "custom",
        message: `Invalid Solana address: ${message}`
      })
      return z.NEVER
    }
  })

/** Compatibility and runtime identity for one deployed Ethereum contract. */
export const EthereumContractDeploymentProfileSchema = z.object({
  address: EthereumAddressSchema,
  implementationAddress: EthereumAddressSchema,
  abiSha256: Sha256Schema,
  implementationCodeSha256: Sha256Schema
})

/** Compatibility and runtime identity for one deployed Solana program. */
export const SolanaProgramDeploymentProfileSchema = z.object({
  address: SolanaAddressSchema,
  programDataAddress: SolanaAddressSchema,
  idlSha256: Sha256Schema,
  programDataSha256: Sha256Schema
})

/** Immutable compatibility profile for one Wire outpost deployment. */
export const OutpostDeploymentProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    deploymentChecksum: Sha256Schema,
    wire: z.object({
      chainId: WireChainIdSchema
    }),
    ethereum: z.object({
      chainId: z.number().int().positive(),
      contracts: z.object({
        [EthereumContractName.OPP]: EthereumContractDeploymentProfileSchema,
        [EthereumContractName.OPPInbound]:
          EthereumContractDeploymentProfileSchema,
        [EthereumContractName.OperatorRegistry]:
          EthereumContractDeploymentProfileSchema,
        [EthereumContractName.ReserveManager]:
          EthereumContractDeploymentProfileSchema
      })
    }),
    solana: z.object({
      genesisHash: SolanaAddressSchema,
      programs: z.object({
        [SolanaProgramName.liqsolCore]: SolanaProgramDeploymentProfileSchema
      })
    })
  })
  .superRefine((profile, context) => {
    const expectedId = `${profile.wire.chainId}-${profile.deploymentChecksum.slice(0, 12)}`
    if (profile.id !== expectedId) {
      context.addIssue({
        code: "custom",
        message: `Deployment profile id must be ${expectedId}`,
        path: ["id"]
      })
    }
  })

/** Parsed, runtime-safe outpost deployment profile. */
export type OutpostDeploymentProfile = z.infer<
  typeof OutpostDeploymentProfileSchema
>

/** Validate an untrusted deployment profile at its JSON boundary. */
export function parseOutpostDeploymentProfile(
  value: unknown
): OutpostDeploymentProfile {
  return OutpostDeploymentProfileSchema.parse(value)
}
