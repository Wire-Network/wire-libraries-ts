import {
  BigNumber,
  Contract,
  Signer,
  type BigNumberish,
  type providers
} from "ethers"

import type { ReserveManager } from "../../contracts/ethereum/index.js"
import type { ReserveManagerLib } from "../../contracts/ethereum/generated/ReserveManager.js"
import {
  assertReserveSwapRequest,
  type ReserveSwapRequest,
  type ReserveSwapSubmission
} from "../../reserves/index.js"

const BasisPointDenominator = 10_000,
  ConfirmationCount = 1,
  Erc20Interface = [
    "function allowance(address owner,address spender) view returns (uint256)",
    "function approve(address spender,uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)"
  ],
  SubmissionGasHeadroomBps = 2_500

/** Event fields required to extract a ReserveManager deposit id. */
interface EthereumReserveSwapEvent {
  event?: string
  args?: readonly BigNumberish[]
}

/** Reserve-swap writes and balance reads for one verified Ethereum outpost. */
export class EthereumReserveSwapClient {
  /** Create an Ethereum reserve-swap workflow bound to a verified deployment. */
  constructor(
    private readonly reserveManager: ReserveManager,
    private readonly connection: providers.Provider | Signer
  ) {}

  /** Escrow native ETH and return the confirmed protocol deposit id. */
  async requestNative(
    request: ReserveSwapRequest
  ): Promise<ReserveSwapSubmission> {
    assertReserveSwapRequest(request)
    this.assertSigner()
    const parameters = this.nativeParameters(request),
      overrides = { value: request.sourceAmount }

    await this.reserveManager.callStatic.requestSwap(...parameters, overrides)
    const estimatedGas = await this.reserveManager.estimateGas.requestSwap(
        ...parameters,
        overrides
      ),
      submissionOverrides = {
        ...overrides,
        gasLimit:
          EthereumReserveSwapClient.addSubmissionGasHeadroom(estimatedGas)
      }

    const transaction = await this.reserveManager.requestSwap(
        ...parameters,
        submissionOverrides
      ),
      receipt = await transaction.wait(ConfirmationCount)
    return {
      transactionId: transaction.hash,
      sourceRequestId: EthereumReserveSwapClient.parseSourceRequestId(
        receipt.events
      )
    }
  }

  /** Approve and escrow an ERC-20 source amount, then return its deposit id. */
  async requestErc20WithApproval(
    request: ReserveSwapRequest,
    tokenAddress: string
  ): Promise<ReserveSwapSubmission> {
    assertReserveSwapRequest(request)
    const signer = this.assertSigner(),
      owner = await signer.getAddress(),
      token = new Contract(tokenAddress, Erc20Interface, signer),
      allowance = await token.allowance(owner, this.reserveManager.address)

    await EthereumReserveSwapClient.approvalAmounts(
      allowance,
      request.sourceAmount
    ).reduce<Promise<void>>(async (previousApproval, amount) => {
      await previousApproval
      const approval = await token.approve(this.reserveManager.address, amount)
      await approval.wait(ConfirmationCount)
    }, Promise.resolve())

    const arguments_ = this.swapArguments(request)
    await this.reserveManager.callStatic.requestSwapErc20WithApproval(
      arguments_
    )
    const estimatedGas =
        await this.reserveManager.estimateGas.requestSwapErc20WithApproval(
          arguments_
        ),
      overrides = {
        gasLimit:
          EthereumReserveSwapClient.addSubmissionGasHeadroom(estimatedGas)
      }
    const transaction = await this.reserveManager.requestSwapErc20WithApproval(
        arguments_,
        overrides
      ),
      receipt = await transaction.wait(ConfirmationCount)
    return {
      transactionId: transaction.hash,
      sourceRequestId: EthereumReserveSwapClient.parseSourceRequestId(
        receipt.events
      )
    }
  }

  /** Read the native balance of an Ethereum account. */
  async nativeBalance(address: string): Promise<bigint> {
    const provider = Signer.isSigner(this.connection)
      ? this.connection.provider
      : this.connection
    if (provider == null) {
      throw new Error("Ethereum signer must be connected to a provider")
    }
    return (await provider.getBalance(address)).toBigInt()
  }

  /** Read the ERC-20 balance of an Ethereum account. */
  async erc20Balance(tokenAddress: string, address: string): Promise<bigint> {
    const token = new Contract(tokenAddress, Erc20Interface, this.connection)
    return (await token.balanceOf(address)).toBigInt()
  }

  private assertSigner(): Signer {
    if (!Signer.isSigner(this.connection)) {
      throw new Error("Ethereum reserve swap requires a connected signer.")
    }
    return this.connection
  }

  private nativeParameters(request: ReserveSwapRequest) {
    return [
      request.sourceTokenCode,
      request.sourceReserveCode,
      request.targetChainCode,
      request.targetTokenCode,
      request.targetReserveCode,
      request.targetRecipient,
      request.targetAmount,
      request.targetToleranceBps
    ] as const
  }

  private swapArguments(
    request: ReserveSwapRequest
  ): ReserveManagerLib.SwapArgsStruct {
    return {
      sourceTokenCode: request.sourceTokenCode,
      sourceReserveCode: request.sourceReserveCode,
      sourceAmount: request.sourceAmount,
      targetChainCode: request.targetChainCode,
      targetTokenCode: request.targetTokenCode,
      targetReserveCode: request.targetReserveCode,
      targetRecipient: request.targetRecipient,
      targetAmount: request.targetAmount,
      targetToleranceBps: request.targetToleranceBps
    }
  }

  /** Add bounded headroom to estimates that traverse OPP delegate calls. */
  static addSubmissionGasHeadroom(estimatedGas: BigNumberish): BigNumber {
    const gas = BigNumber.from(estimatedGas)
    return gas
      .mul(BasisPointDenominator + SubmissionGasHeadroomBps)
      .add(BasisPointDenominator - 1)
      .div(BasisPointDenominator)
  }

  /** Return the safe approval sequence for zero-first ERC-20 implementations. */
  static approvalAmounts(
    currentAllowance: BigNumberish,
    requiredAllowance: BigNumberish
  ): readonly BigNumber[] {
    const current = BigNumber.from(currentAllowance),
      required = BigNumber.from(requiredAllowance)
    if (current.gte(required)) return []
    return current.isZero() ? [required] : [BigNumber.from(0), required]
  }

  /** Parse the canonical deposit id emitted by `requestSwap*`. */
  static parseSourceRequestId(
    events: readonly EthereumReserveSwapEvent[] | undefined
  ): bigint {
    const event = events?.find(candidate => candidate.event === "SwapDeposit"),
      id = event?.args?.[0]
    if (id == null) {
      throw new Error(
        "Confirmed Ethereum reserve swap did not emit SwapDeposit."
      )
    }
    return BigInt(id.toString())
  }
}
