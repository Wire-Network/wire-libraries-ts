import type { OperatorRegistry } from "@wireio/outpost-ethereum-artifacts"
import { SystemContracts } from "@wireio/sdk-core"
import { Wallet } from "ethers"
import {
  EthereumCollateralClient,
  OperatorCollateralMaximum
} from "@wireio/sdk-outpost"

/** Observe custody writes without making network requests. */
function createCollateralFixture() {
  const signer = Wallet.createRandom(),
    wait = jest.fn(async () => ({ status: 1 })),
    createMethod = () =>
      Object.assign(
        jest.fn(async () => ({ hash: "0x1234", wait })),
        { staticCall: jest.fn(async (): Promise<void> => undefined) }
      ),
    registry = {
      nativeTokenCode: jest.fn(async () => 1n),
      deposit: createMethod(),
      withdraw: createMethod()
    },
    client = new EthereumCollateralClient(
      registry as unknown as OperatorRegistry,
      signer
    ),
    request = {
      operatorType:
        SystemContracts.SysioOpregOperatortype.OPERATOR_TYPE_PRODUCER,
      tokenCode: 1n,
      amount: 1_000_000_000_000_000_001n,
      depotBalance: 0n,
      publicKey: signer.signingKey.publicKey
    }
  return { signer, registry, client, request, wait }
}

describe("EthereumCollateralClient", () => {
  it("preserves raw wei, compresses the signer's key and records submission before confirmation", async () => {
    const { client, registry, request, wait, signer } =
        createCollateralFixture(),
      onSubmitted = jest.fn(() => expect(wait).not.toHaveBeenCalled())
    await expect(
      client.depositNative(request, { onSubmitted })
    ).resolves.toEqual({ transactionId: "0x1234" })
    expect(registry.deposit).toHaveBeenCalledWith(
      request.operatorType,
      signer.signingKey.compressedPublicKey,
      1n,
      request.amount,
      { value: request.amount }
    )
    expect(registry.deposit.staticCall).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledWith(1)
    expect(onSubmitted).toHaveBeenCalledWith({ transactionId: "0x1234" })
  })

  it("rejects token/key mismatches and aggregate overflow before custody moves", async () => {
    const { client, registry, request } = createCollateralFixture()
    await expect(
      client.depositNative({ ...request, tokenCode: 2n })
    ).rejects.toThrow("native collateral")
    await expect(
      client.depositNative({
        ...request,
        publicKey: Wallet.createRandom().signingKey.publicKey
      })
    ).rejects.toThrow("does not match")
    await expect(
      client.depositNative({
        ...request,
        depotBalance: OperatorCollateralMaximum
      })
    ).rejects.toThrow("remaining depot")
    expect(registry.deposit).not.toHaveBeenCalled()
  })

  it("sends a withdrawal request without presenting the source hash as a queue id", async () => {
    const { client, registry, request, signer } = createCollateralFixture()
    await expect(
      client.requestNativeWithdrawal({
        ...request,
        depotBalance: request.amount
      })
    ).resolves.toEqual({ transactionId: "0x1234" })
    expect(registry.withdraw).toHaveBeenCalledWith(
      signer.signingKey.compressedPublicKey,
      1n,
      request.amount
    )
    await expect(client.requestNativeWithdrawal(request)).rejects.toThrow(
      "exceeds the depot"
    )
  })

  it("retains the submitted hash even when confirmation fails", async () => {
    const { client, request, wait } = createCollateralFixture(),
      onSubmitted = jest.fn()
    wait.mockRejectedValueOnce(new Error("RPC lost"))
    await expect(
      client.depositNative(request, { onSubmitted })
    ).rejects.toThrow("RPC lost")
    expect(onSubmitted).toHaveBeenCalledWith({ transactionId: "0x1234" })
  })

  it("does not broadcast or report submission when preflight fails", async () => {
    const { client, registry, request } = createCollateralFixture(),
      onSubmitted = jest.fn()
    registry.deposit.staticCall.mockRejectedValueOnce(
      new Error("Route disabled")
    )
    await expect(
      client.depositNative(request, { onSubmitted })
    ).rejects.toThrow("Route disabled")
    expect(registry.deposit).not.toHaveBeenCalled()
    expect(onSubmitted).not.toHaveBeenCalled()
  })

  it("retains a withdrawal receipt when confirmation fails without duplicating the request", async () => {
    const { client, registry, request, wait } = createCollateralFixture(),
      onSubmitted = jest.fn()
    wait.mockRejectedValueOnce(new Error("RPC lost"))
    await expect(
      client.requestNativeWithdrawal(
        { ...request, depotBalance: request.amount },
        { onSubmitted }
      )
    ).rejects.toThrow("RPC lost")
    expect(onSubmitted).toHaveBeenCalledWith({ transactionId: "0x1234" })
    expect(registry.withdraw.staticCall).toHaveBeenCalledTimes(1)
    expect(registry.withdraw).toHaveBeenCalledTimes(1)
  })
})
