import type { APIClient } from "../../api/Client.js"
import type { NameType } from "../../chain/Name.js"
import {
  ContractClient,
  createContractClient,
  type ContractDescriptor
} from "../Contract.js"
import { descriptor as authexDescriptor } from "./authex/Descriptor.js"
import { descriptor as msigDescriptor } from "./msig/Descriptor.js"
import { descriptor as reservDescriptor } from "./reserv/Descriptor.js"

export * as authex from "./authex/index.js"
export * as msig from "./msig/index.js"
export * as reserv from "./reserv/index.js"

/** System contract descriptors available to the generic client factory. */
export const descriptors = {
  authex: authexDescriptor,
  msig: msigDescriptor,
  reserv: reservDescriptor
} as const

/** Friendly system contract names registered with this package. */
export type SystemContractName = keyof typeof descriptors

/** Descriptor registered for a friendly system contract name. */
export type SystemContractDescriptor<TName extends SystemContractName> =
  (typeof descriptors)[TName]

/** Typed client derived from a registered system contract descriptor. */
export type SystemContractClient<TName extends SystemContractName> =
  SystemContractDescriptor<TName> extends ContractDescriptor<
    infer TActions,
    infer TTables
  >
    ? ContractClient<TActions, TTables>
    : never

/** Options for creating a registered system contract client. */
export interface SystemContractClientOptions<TName extends SystemContractName> {
  /** Chain API client used for RPC reads. */
  client: APIClient
  /** Friendly system contract name. */
  name: TName
  /** Optional account override for deployments that do not use the default system account. */
  contract?: NameType
}

/** Creates a typed client for a registered system contract descriptor. */
export function createClient<TName extends SystemContractName>(
  options: SystemContractClientOptions<TName>
): SystemContractClient<TName> {
  return createContractClient({
    client: options.client,
    contract: options.contract,
    descriptor: descriptors[options.name]
  } as any) as SystemContractClient<TName>
}
