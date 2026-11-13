import type { BAR } from "@wireio/outpost-ethereum-artifacts"
import { IERC1155__factory } from "@wireio/outpost-ethereum-artifacts"
import { KeyType, type Name, type PublicKey } from "@wireio/sdk-core"
import {
  ZeroAddress,
  computeAddress,
  getAddress,
  getBigInt,
  getBytes,
  hexlify,
  type BigNumberish,
  type BytesLike,
  type EventLog,
  type Log,
  type Provider,
  type Signer
} from "ethers"
import { match } from "ts-pattern"

import { assertEthereumSigner } from "./Connection.js"

const ConfirmationCount = 1,
  NodeCommittedEventName = "NodeCommitted",
  UncompressedPublicKeyByteLength = 65,
  UncompressedPublicKeyPrefix = 4,
  NodeOwnerAccountNameAlphabet = /^[a-z1-5]*$/

/** BAR WireKey numeric variants accepted for node-owner account authority. */
enum NodeOwnerWireKeyType {
  K1 = 1,
  R1 = 2,
  EM = 4,
  ED = 5
}

/** WireNodes ERC-1155 token ids accepted by BAR as node-owner tiers. */
export enum EthereumNodeOwnerTier {
  T1 = 1,
  T2 = 2,
  T3 = 3
}

const DefaultNodeOwnerTiers = [
  EthereumNodeOwnerTier.T1,
  EthereumNodeOwnerTier.T2,
  EthereumNodeOwnerTier.T3
] as const

/** Inclusive Wire account name length range for one node-owner tier. */
interface NodeOwnerAccountNameLengths {
  /** Fewest characters the depot accepts. */
  minimum: number
  /** Most characters the depot accepts. */
  maximum: number
}

/** Length bounds of `sysio.roa::valid_name_for_tier`: tier 1, then tiers 2 and 3. */
const T1AccountNameLengths: NodeOwnerAccountNameLengths = {
    minimum: 2,
    maximum: 6
  },
  T2T3AccountNameLengths: NodeOwnerAccountNameLengths = {
    minimum: 1,
    maximum: 12
  }

/** One owned WireNodes tier returned from the canonical ERC-1155 contract. */
export interface EthereumNodeOwnerSlotBalance {
  /** WireNodes token id and node-owner tier. */
  tokenId: EthereumNodeOwnerTier
  /** Number of units held by the queried owner. */
  balance: bigint
  /** Canonical WireNodes contract configured by BAR. */
  tokenContractAddress: string
}

/** Inputs required to escrow a WireNodes unit and register its owner. */
export interface EthereumNodeOwnerCommitRequest {
  /** WireNodes token id and node-owner tier to commit. */
  tokenId: EthereumNodeOwnerTier
  /**
   * Wire account name to create or register. It must satisfy the depot's
   * node-owner rule: only `a-z` and `1-5` (no `.`), 2 to 6 characters for tier
   * 1 and 1 to 12 for tiers 2 and 3.
   */
  wireAccountName: Name
  /** Wire account owner/active authority. */
  wirePublicKey: PublicKey
  /** Uncompressed SEC1 secp256k1 public key belonging to the EVM signer. */
  depositorPublicKey: BytesLike
}

/** Canonical `NodeCommitted` fields emitted by BAR. */
export interface EthereumNodeCommittedEvent {
  /** EVM owner that committed the token. */
  owner: string
  /** WireNodes token id and node-owner tier. */
  tokenId: EthereumNodeOwnerTier
  /** Canonical WireNodes contract from which BAR pulled custody. */
  tokenContractAddress: string
  /** Wire account submitted for registration. */
  wireAccountName: string
}

/** Confirmed node-owner registration submission. */
export interface EthereumNodeOwnerCommitSubmission {
  /** BAR commit transaction hash. */
  transactionId: string
  /** ERC-1155 approval transaction hash when approval was required. */
  approvalTransactionId?: string
  /** Confirmed BAR event proving the submitted registration. */
  committed: EthereumNodeCommittedEvent
}

/** Node-owner slot reads, approval, and registration for one verified outpost. */
export class EthereumNodeOwnerClient {
  /** Bind node-owner operations to a generated BAR contract. */
  constructor(
    private readonly bar: BAR,
    private readonly connection: Provider | Signer
  ) {}

  /** Resolve the governance-configured canonical WireNodes contract. */
  async canonicalTokenContractAddress(): Promise<string> {
    const address = getAddress(await this.bar.wireNodesContract())
    if (address === ZeroAddress) {
      throw new Error("BAR has no canonical WireNodes contract configured.")
    }
    return address
  }

  /** Return non-zero WireNodes balances for the requested owner and tiers. */
  async ownedSlots(
    owner: string,
    tokenIds: readonly EthereumNodeOwnerTier[] = DefaultNodeOwnerTiers
  ): Promise<EthereumNodeOwnerSlotBalance[]> {
    const normalizedOwner = getAddress(owner),
      tokenContractAddress = await this.canonicalTokenContractAddress(),
      token = IERC1155__factory.connect(tokenContractAddress, this.connection),
      balances = await Promise.all(
        tokenIds.map(async tokenId => ({
          tokenId,
          balance: getBigInt(await token.balanceOf(normalizedOwner, tokenId)),
          tokenContractAddress
        }))
      )

    return balances.filter(({ balance }) => balance > 0n)
  }

  /**
   * Refuse a name the depot would reject, approve BAR when needed, commit one
   * WireNodes unit, and return its event.
   */
  async commit(
    request: EthereumNodeOwnerCommitRequest
  ): Promise<EthereumNodeOwnerCommitSubmission> {
    const signer = this.assertSigner(),
      owner = getAddress(await signer.getAddress()),
      depositorPublicKey = this.assertDepositorPublicKey(
        request.depositorPublicKey,
        owner
      ),
      wireAccountName = this.assertAccountName(
        request.tokenId,
        request.wireAccountName.toString()
      ),
      tokenContractAddress = await this.canonicalTokenContractAddress(),
      token = IERC1155__factory.connect(tokenContractAddress, signer),
      barAddress = await this.bar.getAddress(),
      approved = await token.isApprovedForAll(owner, barAddress)

    let approvalTransactionId: string | undefined
    if (!approved) {
      const approval = await token.setApprovalForAll(barAddress, true)
      approvalTransactionId = approval.hash
      await approval.wait(ConfirmationCount)
    }

    const transaction = await this.bar.commitNode(
        request.tokenId,
        wireAccountName,
        this.wireKey(request.wirePublicKey),
        depositorPublicKey
      ),
      receipt = await transaction.wait(ConfirmationCount)

    return {
      transactionId: transaction.hash,
      approvalTransactionId,
      committed: EthereumNodeOwnerClient.committedEvent(receipt?.logs)
    }
  }

  /** Normalize the canonical `NodeCommitted` event from a BAR receipt. */
  static committedEvent(
    events: readonly (EventLog | Log)[] | undefined
  ): EthereumNodeCommittedEvent {
    const event = events?.find(
        candidate =>
          "eventName" in candidate &&
          candidate.eventName === NodeCommittedEventName
      ),
      arguments_ = event != null && "args" in event ? event.args : undefined,
      owner = arguments_?.[0],
      tokenId = arguments_?.[1],
      tokenContractAddress = arguments_?.[2],
      wireAccountName = arguments_?.[3]

    if (
      owner == null ||
      tokenId == null ||
      tokenContractAddress == null ||
      wireAccountName == null
    ) {
      throw new Error("Confirmed BAR transaction did not emit NodeCommitted.")
    }
    return {
      owner: getAddress(owner),
      tokenId: EthereumNodeOwnerClient.nodeOwnerTier(tokenId),
      tokenContractAddress: getAddress(tokenContractAddress),
      wireAccountName
    }
  }

  /** Require a connected EVM signer for node-owner writes. */
  private assertSigner(): Signer {
    return assertEthereumSigner(this.connection, "Ethereum node-owner commit")
  }

  /** Validate the depositor key shape and its relationship to the signer. */
  private assertDepositorPublicKey(
    value: BytesLike,
    owner: string
  ): Uint8Array {
    const publicKey = getBytes(value)
    if (
      publicKey.length !== UncompressedPublicKeyByteLength ||
      publicKey[0] !== UncompressedPublicKeyPrefix
    ) {
      throw new Error(
        "depositorPublicKey must be a 65-byte uncompressed SEC1 key."
      )
    }
    if (getAddress(computeAddress(hexlify(publicKey))) !== owner) {
      throw new Error("depositorPublicKey does not belong to the EVM signer.")
    }
    return publicKey
  }

  /**
   * Validate the claim name against `sysio.roa`'s node-owner rule. BAR escrows
   * the NFT before the depot checks the name and only an admin can release it,
   * so a name the depot would reject must never be sent.
   */
  private assertAccountName(
    tokenId: EthereumNodeOwnerTier,
    value: string
  ): string {
    if (!NodeOwnerAccountNameAlphabet.test(value)) {
      throw new Error(
        `wireAccountName "${value}" must use only a-z and 1-5; "." is not allowed in a node-owner account name.`
      )
    }
    const { minimum, maximum } = match(tokenId)
      .with(EthereumNodeOwnerTier.T1, () => T1AccountNameLengths)
      .with(
        EthereumNodeOwnerTier.T2,
        EthereumNodeOwnerTier.T3,
        () => T2T3AccountNameLengths
      )
      .otherwise(tier => {
        throw new Error(`${tier} is not a node-owner tier.`)
      })
    if (value.length < minimum || value.length > maximum) {
      throw new Error(
        `wireAccountName "${value}" must be ${minimum} to ${maximum} characters for tier ${EthereumNodeOwnerTier[tokenId]}.`
      )
    }
    return value
  }

  /** Convert an sdk-core public key into BAR's generated WireKey structure. */
  private wireKey(publicKey: PublicKey) {
    const keyType = match(publicKey.type)
      .with(KeyType.K1, () => NodeOwnerWireKeyType.K1)
      .with(KeyType.R1, () => NodeOwnerWireKeyType.R1)
      .with(KeyType.EM, () => NodeOwnerWireKeyType.EM)
      .with(KeyType.ED, () => NodeOwnerWireKeyType.ED)
      .otherwise(type => {
        throw new Error(`${type} is not a node-owner authority key type.`)
      })

    return { keyType, key: publicKey.data.array }
  }

  /** Normalize one emitted token id to BAR's supported node-owner tier. */
  private static nodeOwnerTier(value: BigNumberish): EthereumNodeOwnerTier {
    return match(Number(value.toString()))
      .with(EthereumNodeOwnerTier.T1, () => EthereumNodeOwnerTier.T1)
      .with(EthereumNodeOwnerTier.T2, () => EthereumNodeOwnerTier.T2)
      .with(EthereumNodeOwnerTier.T3, () => EthereumNodeOwnerTier.T3)
      .otherwise(tokenId => {
        throw new Error(`NodeCommitted emitted unsupported tier ${tokenId}.`)
      })
  }
}
