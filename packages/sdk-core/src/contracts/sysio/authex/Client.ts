import { APIClient } from "../../../api/Client.js"
import { ethers } from "../../../EthersCompat.js"
import type { TransactionExtraOptions } from "../../../api/Types.js"
import type { Action } from "../../../chain/Action.js"
import { Bytes } from "../../../chain/Bytes.js"
import { Checksum256 } from "../../../chain/Checksum.js"
import { KeyType } from "../../../chain/KeyType.js"
import { Name, type NameType } from "../../../chain/Name.js"
import { PublicKey, type PublicKeyType } from "../../../chain/PublicKey.js"
import { SysioAuthexChainkind } from "../../../types/SysioContractTypes.js"
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
import {
  AUTHEX_LINKS_BY_NAME_INDEX,
  AUTHEX_LINKS_BY_PUBLIC_KEY_INDEX,
  DEFAULT_AUTHEX_CONTRACT
} from "./Constants.js"
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
import type * as SysioContracts from "../../../types/SysioContractTypes.js"

function accountString(value: NameType): string {
  return Name.from(value).toString()
}

/** Canonicalizes EM keys to the compressed form used by the live bypubkey index. */
function canonicalExternalPublicKey(value: PublicKeyType): PublicKey {
  const key = PublicKey.from(value)
  if (key.type !== KeyType.EM) return key

  return new PublicKey(
    KeyType.EM,
    ethers.utils.arrayify(
      ethers.utils.computePublicKey(ethers.utils.hexlify(key.data.array), true)
    )
  )
}

/** Creates the deployed AuthEx bypubkey checksum for an external key. */
function publicKeyHash(value: PublicKeyType): Checksum256 {
  const key = canonicalExternalPublicKey(value)
  return Checksum256.hash(Bytes.from(key.toString(), "utf8"))
}

/** Encodes a wire-sysio KV secondary-index bound. */
function jsonIndexBound(indexName: string, value: string): string {
  return JSON.stringify({ [indexName]: value })
}

/** Compares external keys while tolerating compressed/uncompressed EM rendering. */
function externalPublicKeysEqual(
  left: PublicKeyType,
  right: PublicKeyType
): boolean {
  return canonicalExternalPublicKey(left).equals(
    canonicalExternalPublicKey(right)
  )
}

/** Normalizes a generated AuthEx enum name or number to its numeric value. */
function authExChainKindValue(
  value: SysioContracts.SysioAuthexLinksSType["chain_kind"]
): SysioContracts.SysioAuthexChainkind {
  return typeof value === "number" ? value : SysioAuthexChainkind[value]
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
  async createLink(
    options: CreateLinkWithSignerOptions
  ): Promise<CreateLinkActionResult> {
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
  async createlink(
    options: CreateLinkWithSignerOptions
  ): Promise<CreateLinkActionResult> {
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
  ): Promise<SysioContracts.SysioAuthexLinksSType[]> {
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
  ): Promise<SysioContracts.SysioAuthexLinksSType[]> {
    const name = accountString(account),
      nameValue = Name.from(account).value.toString(),
      result = await this.contractClient.tables.links.rows<string>({
        index_name: AUTHEX_LINKS_BY_NAME_INDEX,
        lower_bound: jsonIndexBound(AUTHEX_LINKS_BY_NAME_INDEX, nameValue),
        limit: options.limit || 100
      })

    return result.rows.filter(row => accountString(row.username) === name)
  }

  /** Reads the link for one Wire account and chain kind, when present. */
  async getLink(
    account: NameType,
    chainKind: SysioContracts.SysioAuthexChainkind
  ): Promise<SysioContracts.SysioAuthexLinksSType | null> {
    const links = await this.getLinks(account)
    return (
      links.find(row => authExChainKindValue(row.chain_kind) === chainKind) ||
      null
    )
  }

  /** Reads the first link matching an external public key using the `bypubkey` index. */
  async getLinkByPublicKey(
    publicKey: PublicKeyType
  ): Promise<SysioContracts.SysioAuthexLinksSType | null> {
    const key = PublicKey.from(publicKey),
      hash = publicKeyHash(key),
      result = await this.contractClient.tables.links.rows<string>({
        index_name: AUTHEX_LINKS_BY_PUBLIC_KEY_INDEX,
        lower_bound: jsonIndexBound(
          AUTHEX_LINKS_BY_PUBLIC_KEY_INDEX,
          hash.toString()
        ),
        limit: 5
      })

    return (
      result.rows.find(row => externalPublicKeysEqual(row.pub_key, key)) || null
    )
  }
}
