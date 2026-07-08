import { APIClient } from "../../../api/Client.js"
import type { TransactionExtraOptions } from "../../../api/Types.js"
import type { Action } from "../../../chain/Action.js"
import { Bytes } from "../../../chain/Bytes.js"
import { Checksum256 } from "../../../chain/Checksum.js"
import { Name, type NameType } from "../../../chain/Name.js"
import { PublicKey, type PublicKeyType } from "../../../chain/PublicKey.js"
import {
  ContractClient,
  createContractClient,
  type ContractTableRowsOptions
} from "../../Contract.js"

import {
  buildClearLinksAction,
  buildCreateLinkAction,
  buildRecordLinkAction
} from "./Actions.js"
import { DEFAULT_AUTHEX_CONTRACT } from "./Constants.js"
import {
  descriptor,
  type SysioAuthexActionData,
  type SysioAuthexTableRows
} from "./Descriptor.js"
import { signCreateLink } from "./Signing.js"
import type {
  AuthexClientOptions,
  BuildClearLinksActionOptions,
  BuildCreateLinkActionOptions,
  BuildRecordLinkActionOptions,
  CreateLinkActionResult,
  CreateLinkWithSignerOptions,
  ListLinksOptions,
  PushCreateLinkOptions
} from "./Types.js"
import type * as SystemContracts from "../../../types/SystemContractTypes.js"

function accountString(value: NameType): string {
  return Name.from(value).toString()
}

function publicKeyHash(value: PublicKeyType): Checksum256 {
  return Checksum256.hash(Bytes.from(PublicKey.from(value).toString(), "utf8"))
}

/** UI-neutral client for reading and building `sysio.authex` link actions. */
export class AuthexClient {
  /** Chain API client used for RPC calls. */
  readonly client: APIClient

  /** AuthEx contract account. */
  readonly contract: NameType

  /** Generic typed contract client for direct action/table access. */
  readonly contractClient: ContractClient<
    SysioAuthexActionData,
    SysioAuthexTableRows
  >

  /** Creates an AuthEx client. */
  constructor(config: AuthexClientOptions) {
    this.client = config.client
    this.contract = config.contract || DEFAULT_AUTHEX_CONTRACT
    this.contractClient = createContractClient({
      client: config.client,
      contract: this.contract,
      descriptor
    })
  }

  /** Builds an unsigned `sysio.authex::createlink` action from a completed proof. */
  buildCreateLinkAction(options: BuildCreateLinkActionOptions): Action {
    return buildCreateLinkAction({
      contract: this.contract,
      ...options
    })
  }

  /** Signs the external-wallet proof and builds an unsigned Wire create-link action. */
  async createLink(options: CreateLinkWithSignerOptions): Promise<CreateLinkActionResult> {
    const proof = await signCreateLink(options),
      action = this.buildCreateLinkAction({
        account: proof.account,
        chainKind: proof.chainKind,
        signature: proof.signature,
        publicKey: proof.publicKey,
        nonce: proof.nonce,
        permission: options.permission,
        contract: options.contract || this.contract
      })

    return { proof, action }
  }

  /** Lowercase alias matching the contract action spelling. */
  async createlink(options: CreateLinkWithSignerOptions): Promise<CreateLinkActionResult> {
    return this.createLink(options)
  }

  /** Signs the external-wallet proof, builds the action, and pushes it with this client's signer. */
  async pushCreateLink(
    options: PushCreateLinkOptions,
    pushOptions: TransactionExtraOptions = options.pushOptions || {}
  ): Promise<Awaited<ReturnType<APIClient["pushTransaction"]>>> {
    const result = await this.createLink(options)
    return this.client.pushTransaction(result.action, pushOptions)
  }

  /** Lowercase push alias matching the contract action spelling. */
  async pushCreatelink(
    options: PushCreateLinkOptions,
    pushOptions: TransactionExtraOptions = options.pushOptions || {}
  ): Promise<Awaited<ReturnType<APIClient["pushTransaction"]>>> {
    return this.pushCreateLink(options, pushOptions)
  }

  /** Builds an unsigned trusted `sysio.authex::recordlink` action. */
  buildRecordLinkAction(options: BuildRecordLinkActionOptions): Action {
    return buildRecordLinkAction({
      contract: this.contract,
      ...options
    })
  }

  /** Builds an unsigned testing-only `sysio.authex::clearlinks` action. */
  buildClearLinksAction(options: BuildClearLinksActionOptions = {}): Action {
    return buildClearLinksAction({
      contract: this.contract,
      ...options
    })
  }

  /** Lists AuthEx link rows. */
  async listLinks(
    options: ContractTableRowsOptions = {}
  ): Promise<SystemContracts.SysioAuthexLinksSType[]> {
    const result = await this.contractClient.tables.links.rows({
      limit: 100,
      ...options
    })

    return result.rows
  }

  /** Reads all links for one Wire account using the `byname` secondary index. */
  async getLinks(
    account: NameType,
    options: ListLinksOptions = {}
  ): Promise<SystemContracts.SysioAuthexLinksSType[]> {
    const name = accountString(account),
      result = await this.contractClient.tables.links.rows<string>({
        index_position: "tertiary",
        key_type: "name",
        lower_bound: name,
        limit: options.limit || 20
      } as any)

    return result.rows.filter(row => accountString(row.username) === name)
  }

  /** Reads the link for one Wire account and chain kind, when present. */
  async getLink(
    account: NameType,
    chainKind: SystemContracts.SysioAuthexChainkind
  ): Promise<SystemContracts.SysioAuthexLinksSType | null> {
    const links = await this.getLinks(account)
    return links.find(row => row.chain_kind === chainKind) || null
  }

  /** Reads the first link matching an external public key using the `bypubkey` index. */
  async getLinkByPublicKey(
    publicKey: PublicKeyType
  ): Promise<SystemContracts.SysioAuthexLinksSType | null> {
    const key = PublicKey.from(publicKey),
      hash = publicKeyHash(key),
      result = await this.contractClient.tables.links.rows<Checksum256>({
        index_position: "fourth",
        key_type: "sha256",
        lower_bound: hash,
        limit: 5
      } as any)

    return result.rows.find(row => PublicKey.from(row.pub_key).equals(key)) || null
  }
}
