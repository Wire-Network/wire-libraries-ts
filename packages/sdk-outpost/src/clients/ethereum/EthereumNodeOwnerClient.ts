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
  UncompressedPublicKeyPrefix = 4

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
  /** Canonical Wire account name to create or register. */
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

  /** Approve BAR when needed, commit one WireNodes unit, and return its event. */
  async commit(
    request: EthereumNodeOwnerCommitRequest
  ): Promise<EthereumNodeOwnerCommitSubmission> {
    const signer = this.assertSigner(),
      owner = getAddress(await signer.getAddress()),
      depositorPublicKey = this.assertDepositorPublicKey(
        request.depositorPublicKey,
        owner
      ),
      wireAccountName = this.canonicalAccountName(
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

  /** Validate and canonicalize the non-empty Wire account name. */
  private canonicalAccountName(value: string): string {
    if (value.length === 0) {
      throw new Error("wireAccountName must not be empty.")
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
