import type { OperatorRegistry } from "@wireio/outpost-ethereum-artifacts"
import {
  computeAddress,
  getAddress,
  SigningKey,
  type Provider,
  type Signer
} from "ethers"
import {
  assertOperatorCollateralRequest,
  type OperatorCollateralRequest,
  type OperatorCollateralSubmission,
  type OperatorCollateralSubmissionOptions
} from "../../collateral/index.js"
import { assertEthereumSigner } from "./Connection.js"

const Confirmations = 1

/** Native operator collateral on a verified Ethereum outpost; no arbitrary ERC20 ingress. */
export class EthereumCollateralClient {
  /** Bind to the generated registry and the verified caller-owned connection. */
  constructor(
    private readonly registry: OperatorRegistry,
    private readonly connection: Provider | Signer
  ) {}

  /** Producer suite capability, independent of role admission and live funding. */
  readonly capabilities = Object.freeze({
    nativeDeposit: true,
    nativeWithdrawal: true
  })

  /** Read the registry's configured native code instead of guessing a token identity. */
  async nativeTokenCode(): Promise<bigint> {
    return this.registry.nativeTokenCode()
  }

  /** Escrow raw native units; the caller must separately observe depot credit or refund. */
  async depositNative(
    request: OperatorCollateralRequest,
    options: OperatorCollateralSubmissionOptions = {}
  ): Promise<OperatorCollateralSubmission> {
    assertOperatorCollateralRequest(request)
    const publicKey = await this.assertIdentity(request)
    await this.registry.deposit.staticCall(
      request.operatorType,
      publicKey,
      request.tokenCode,
      request.amount,
      { value: request.amount }
    )
    const transaction = await this.registry.deposit(
        request.operatorType,
        publicKey,
        request.tokenCode,
        request.amount,
        { value: request.amount }
      ),
      submission = { transactionId: transaction.hash }
    options.onSubmitted?.(submission)
    await transaction.wait(Confirmations)
    return submission
  }

  /** Enqueue a native withdrawal; this is not an immediate payout or a depot request id. */
  async requestNativeWithdrawal(
    request: OperatorCollateralRequest,
    options: OperatorCollateralSubmissionOptions = {}
  ): Promise<OperatorCollateralSubmission> {
    assertOperatorCollateralRequest(request, false)
    const publicKey = await this.assertIdentity(request)
    await this.registry.withdraw.staticCall(
      publicKey,
      request.tokenCode,
      request.amount
    )
    const transaction = await this.registry.withdraw(
        publicKey,
        request.tokenCode,
        request.amount
      ),
      submission = { transactionId: transaction.hash }
    options.onSubmitted?.(submission)
    await transaction.wait(Confirmations)
    return submission
  }

  /** Match both the native token and the SEC1 public key to the live signer. */
  private async assertIdentity(
    request: OperatorCollateralRequest
  ): Promise<string> {
    const signer = assertEthereumSigner(this.connection, "Operator collateral"),
      nativeCode = await this.nativeTokenCode()
    if (nativeCode === 0n || request.tokenCode !== nativeCode) {
      throw new Error(
        "Only the configured native collateral asset is supported."
      )
    }
    if (!request.publicKey)
      throw new Error("The depositor public key is required.")
    const publicKey = SigningKey.computePublicKey(request.publicKey, true)
    if (
      getAddress(computeAddress(publicKey)) !==
      getAddress(await signer.getAddress())
    ) {
      throw new Error(
        "The collateral public key does not match the connected wallet."
      )
    }
    return publicKey
  }
}
