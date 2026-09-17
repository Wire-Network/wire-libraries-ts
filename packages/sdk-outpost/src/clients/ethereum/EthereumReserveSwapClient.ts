import type {
  ReserveManager,
  ReserveManagerLib
} from "@wireio/outpost-ethereum-artifacts"
import {
  Contract,
  getBigInt,
  type BigNumberish,
  type EventLog,
  type Log,
  type Provider,
  type Signer
} from "ethers"

import {
  assertReserveSwapRequest,
  type ReserveSwapRequest,
  type ReserveSwapSubmission
} from "../../reserves/index.js"
import { assertEthereumSigner, ethereumProvider } from "./Connection.js"

const BasisPointDenominator = 10_000,
  ConfirmationCount = 1,
  Erc20Interface = [
    "function allowance(address owner,address spender) view returns (uint256)",
    "function approve(address spender,uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)"
  ],
  SubmissionGasHeadroomBps = 2_500

/** Reserve-swap writes and balance reads for one verified Ethereum outpost. */
export class EthereumReserveSwapClient {
  /** Create an Ethereum reserve-swap workflow bound to a verified deployment. */
  constructor(
    private readonly reserveManager: ReserveManager,
    private readonly connection: Provider | Signer
  ) {}

  /** Escrow native ETH and return the confirmed protocol deposit id. */
  async requestNative(
    request: ReserveSwapRequest
  ): Promise<ReserveSwapSubmission> {
    assertReserveSwapRequest(request)
    this.assertSigner()
    const parameters = this.nativeParameters(request),
      overrides = { value: request.sourceAmount }

    await this.reserveManager.requestSwap.staticCall(...parameters, overrides)
    const estimatedGas = await this.reserveManager.requestSwap.estimateGas(
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
        receipt?.logs
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
      reserveManagerAddress = await this.reserveManager.getAddress(),
      allowance = await token.allowance(owner, reserveManagerAddress)

    await EthereumReserveSwapClient.approvalAmounts(
      allowance,
      request.sourceAmount
    ).reduce<Promise<void>>(async (previousApproval, amount) => {
      await previousApproval
      const approval = await token.approve(reserveManagerAddress, amount)
      await approval.wait(ConfirmationCount)
    }, Promise.resolve())

    const arguments_ = this.swapArguments(request)
    await this.reserveManager.requestSwapErc20WithApproval.staticCall(
      arguments_
    )
    const estimatedGas =
        await this.reserveManager.requestSwapErc20WithApproval.estimateGas(
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
        receipt?.logs
      )
    }
  }

  /** Read the native balance of an Ethereum account. */
  async nativeBalance(address: string): Promise<bigint> {
    return ethereumProvider(this.connection).getBalance(address)
  }

  /** Read the ERC-20 balance of an Ethereum account. */
  async erc20Balance(tokenAddress: string, address: string): Promise<bigint> {
    const token = new Contract(tokenAddress, Erc20Interface, this.connection)
    return getBigInt(await token.balanceOf(address))
  }

  private assertSigner(): Signer {
    return assertEthereumSigner(this.connection, "Ethereum reserve swap")
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
  static addSubmissionGasHeadroom(estimatedGas: BigNumberish): bigint {
    const gas = getBigInt(estimatedGas),
      denominator = BigInt(BasisPointDenominator)
    return (
      (gas * BigInt(BasisPointDenominator + SubmissionGasHeadroomBps) +
        denominator -
        1n) /
      denominator
    )
  }

  /** Return the safe approval sequence for zero-first ERC-20 implementations. */
  static approvalAmounts(
    currentAllowance: BigNumberish,
    requiredAllowance: BigNumberish
  ): readonly bigint[] {
    const current = getBigInt(currentAllowance),
      required = getBigInt(requiredAllowance)
    if (current >= required) return []
    return current === 0n ? [required] : [0n, required]
  }

  /** Parse the canonical deposit id emitted by `requestSwap*`. */
  static parseSourceRequestId(
    events: readonly (EventLog | Log)[] | undefined
  ): bigint {
    const event = events?.find(
        candidate =>
          "eventName" in candidate && candidate.eventName === "SwapDeposit"
      ),
      id = event != null && "args" in event ? event.args[0] : null
    if (id == null) {
      throw new Error(
        "Confirmed Ethereum reserve swap did not emit SwapDeposit."
      )
    }
    return BigInt(id.toString())
  }
}
