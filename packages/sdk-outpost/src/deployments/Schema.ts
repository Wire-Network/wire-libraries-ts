import { PublicKey } from "@solana/web3.js"
import { utils as ethersUtils } from "ethers"
import { z } from "zod"

import { ChainId } from "@wireio/sdk-core"

import {
  EthereumContractName,
  OutpostDeploymentId,
  SolanaProgramName
} from "./Types.js"

const SourceRevisionSchema = z.string().regex(/^[0-9a-f]{8,40}$/),
  Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/),
  WireChainIdSchema = z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .transform(value => ChainId.from(value)),
  EthereumAddressSchema = z
    .string()
    .refine(ethersUtils.isAddress, "Invalid Ethereum address"),
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

/** Source repository identity embedded in an artifact bundle. */
export const ArtifactSourceSchema = z.object({
  repository: z.string().regex(/^Wire-Network\/[a-z0-9-]+$/),
  revision: SourceRevisionSchema
})

/** Metadata proving where an SDK artifact bundle came from. */
export const ArtifactBundleSchema = z.object({
  generatedAt: z.iso.datetime(),
  sourceArchiveSha256: Sha256Schema,
  platformRelease: z.object({
    tag: z.string().regex(/^v\d+\.\d+\.\d+$/),
    url: z.url(),
    manifest: ArtifactSourceSchema,
    libraries: ArtifactSourceSchema
  }),
  sources: z.object({
    wireTools: ArtifactSourceSchema,
    wireSysio: ArtifactSourceSchema,
    wireEthereum: ArtifactSourceSchema,
    wireSolana: ArtifactSourceSchema
  })
})

/** Runtime metadata for one deployed Ethereum contract. */
export const EthereumContractDeploymentSchema = z.object({
  address: EthereumAddressSchema,
  artifactSha256: Sha256Schema
})

/** Runtime metadata for one deployed Solana program. */
export const SolanaProgramDeploymentSchema = z.object({
  address: SolanaAddressSchema,
  artifactSha256: Sha256Schema
})

/** Complete deployment schema for a Wire network group. */
export const OutpostDeploymentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.enum(OutpostDeploymentId),
  artifactBundle: ArtifactBundleSchema,
  wire: z.object({
    chainId: WireChainIdSchema
  }),
  ethereum: z.object({
    chainId: z.number().int().positive(),
    contracts: z.object({
      [EthereumContractName.OPP]: EthereumContractDeploymentSchema,
      [EthereumContractName.OPPInbound]: EthereumContractDeploymentSchema,
      [EthereumContractName.OperatorRegistry]: EthereumContractDeploymentSchema,
      [EthereumContractName.ReserveManager]: EthereumContractDeploymentSchema
    })
  }),
  solana: z.object({
    genesisHash: SolanaAddressSchema,
    programs: z.object({
      [SolanaProgramName.liqsolCore]: SolanaProgramDeploymentSchema
    })
  })
})

/** Parsed source-repository identity. */
export type ArtifactSource = z.infer<typeof ArtifactSourceSchema>

/** Parsed artifact-bundle provenance. */
export type ArtifactBundle = z.infer<typeof ArtifactBundleSchema>

/** Parsed, runtime-safe outpost deployment. */
export type OutpostDeployment = z.infer<typeof OutpostDeploymentSchema>

/** Validate an untrusted deployment document at its JSON boundary. */
export function parseOutpostDeployment(value: unknown): OutpostDeployment {
  return OutpostDeploymentSchema.parse(value)
}
