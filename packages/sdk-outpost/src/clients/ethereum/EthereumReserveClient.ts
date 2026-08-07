import {
  constants as ethersConstants,
  Contract,
  Signer,
  type providers
} from "ethers"
import { match } from "ts-pattern"

import type { ReserveManager } from "../../contracts/ethereum/index.js"
import type { ReserveManagerLib } from "../../contracts/ethereum/generated/ReserveManager.js"
import {
  assertEthereumReserveCreateRequest,
  assertReserveUnsigned64,
  OutpostReserveStatus,
  type EthereumReserveCreateRequest,
  type EthereumReservePermitSignature,
  type EthereumReserveRecord,
  type OutpostReserveIdentity,
  type OutpostReserveSubmission
} from "../../reserves/index.js"

const ConfirmationCount = 1,
  EthereumLocalReserveStatus = {
    pending: 0,
    active: 1,
    cancelled: 2
  } as const,
  Erc20Interface = [
    "function allowance(address owner,address spender) view returns (uint256)",
    "function approve(address spender,uint256 amount) returns (bool)"
  ]

/** Reserve creation, cancellation, and reads for one verified Ethereum outpost. */
export class EthereumReserveClient {
  /** Bind reserve lifecycle operations to a generated ReserveManager client. */
  constructor(
    private readonly reserveManager: ReserveManager,
    private readonly connection: providers.Provider | Signer
  ) {}

  /** Create a pending native-token reserve. */
  async createNative(
    request: EthereumReserveCreateRequest
  ): Promise<OutpostReserveSubmission> {
    assertEthereumReserveCreateRequest(request)
    this.assertSigner()
    const parameters = this.nativeParameters(request),
      overrides = { value: request.externalTokenAmount }

    await this.reserveManager.callStatic.create_reserve(
      ...parameters,
      overrides
    )
    const transaction = await this.reserveManager.create_reserve(
      ...parameters,
      overrides
    )
    await transaction.wait(ConfirmationCount)
    return { transactionId: transaction.hash }
  }

  /** Approve and create a pending ERC-20 reserve. */
  async createErc20WithApproval(
    request: EthereumReserveCreateRequest,
    tokenAddress?: string
  ): Promise<OutpostReserveSubmission> {
    assertEthereumReserveCreateRequest(request)
    const signer = this.assertSigner(),
      owner = await signer.getAddress(),
      resolvedTokenAddress =
        tokenAddress ??
        (await this.reserveManager.tokenAddressesByCode(request.tokenCode))

    if (resolvedTokenAddress === ethersConstants.AddressZero) {
      throw new Error(
        `No ERC-20 address is configured for tokenCode ${request.tokenCode.toString()}.`
      )
    }

    const token = new Contract(resolvedTokenAddress, Erc20Interface, signer),
      allowance = await token.allowance(owner, this.reserveManager.address)
    if (allowance.lt(request.externalTokenAmount)) {
      const approval = await token.approve(
        this.reserveManager.address,
        request.externalTokenAmount
      )
      await approval.wait(ConfirmationCount)
    }

    const arguments_ = this.createArguments(request)
    await this.reserveManager.callStatic.requestReserveCreateErc20WithApproval(
      arguments_
    )
    const transaction =
      await this.reserveManager.requestReserveCreateErc20WithApproval(arguments_)
    await transaction.wait(ConfirmationCount)
    return { transactionId: transaction.hash }
  }

  /** Create a pending ERC-20 reserve using an EIP-2612 permit. */
  async createErc20WithPermit(
    request: EthereumReserveCreateRequest,
    permitSignature: EthereumReservePermitSignature
  ): Promise<OutpostReserveSubmission> {
    assertEthereumReserveCreateRequest(request)
    this.assertSigner()
    const arguments_ = this.createArguments(request)

    await this.reserveManager.callStatic.requestReserveCreateErc20WithPermit(
      arguments_,
      permitSignature
    )
    const transaction =
      await this.reserveManager.requestReserveCreateErc20WithPermit(
        arguments_,
        permitSignature
      )
    await transaction.wait(ConfirmationCount)
    return { transactionId: transaction.hash }
  }

  /** Request cancellation and refund of a pending reserve. */
  async cancel(
    identity: OutpostReserveIdentity
  ): Promise<OutpostReserveSubmission> {
    this.assertSigner()
    assertReserveUnsigned64(identity.tokenCode, "tokenCode")
    assertReserveUnsigned64(identity.reserveCode, "reserveCode")
    const transaction = await this.reserveManager.cancel_create_reserve(
      identity.tokenCode,
      identity.reserveCode
    )
    await transaction.wait(ConfirmationCount)
    return { transactionId: transaction.hash }
  }

  /** Read and normalize one local ReserveManager record. */
  async get(identity: OutpostReserveIdentity): Promise<EthereumReserveRecord> {
    assertReserveUnsigned64(identity.tokenCode, "tokenCode")
    assertReserveUnsigned64(identity.reserveCode, "reserveCode")
    const reserve = await this.reserveManager.getReserve(
      identity.tokenCode,
      identity.reserveCode
    )
    return {
      tokenCode: reserve.tokenCode.toBigInt(),
      reserveCode: reserve.reserveCode.toBigInt(),
      externalTokenAmount: reserve.externalTokenAmount.toBigInt(),
      requestedWireAmount: reserve.requestedWireAmount.toBigInt(),
      connectorWeightBps: reserve.connectorWeightBps,
      status: match(reserve.status)
        .with(
          EthereumLocalReserveStatus.pending,
          () => OutpostReserveStatus.pending
        )
        .with(
          EthereumLocalReserveStatus.active,
          () => OutpostReserveStatus.active
        )
        .with(
          EthereumLocalReserveStatus.cancelled,
          () => OutpostReserveStatus.cancelled
        )
        .otherwise(value => {
          throw new Error(`Unsupported Ethereum reserve status ${value}.`)
        }),
      creator: reserve.creator,
      exists: reserve.exists
    }
  }

  private assertSigner(): Signer {
    if (!Signer.isSigner(this.connection)) {
      throw new Error("Ethereum reserve operation requires a connected signer.")
    }
    return this.connection
  }

  private createArguments(
    request: EthereumReserveCreateRequest
  ): ReserveManagerLib.ReserveCreateArgsStruct {
    return {
      tokenCode: request.tokenCode,
      reserveCode: request.reserveCode,
      externalTokenAmount: request.externalTokenAmount,
      requestedWireAmount: request.requestedWireAmount,
      connectorWeightBps: request.connectorWeightBps,
      name: request.name,
      description: request.description,
      isPrivate: request.isPrivate,
      creatorPubKey: request.creatorPubKey
    }
  }

  private nativeParameters(request: EthereumReserveCreateRequest) {
    return [
      request.tokenCode,
      request.reserveCode,
      request.externalTokenAmount,
      request.requestedWireAmount,
      request.connectorWeightBps,
      request.name,
      request.description,
      request.isPrivate,
      request.creatorPubKey
    ] as const
  }
}
