import {
  getBytes,
  hexlify,
  Network,
  sha256,
  Wallet,
  zeroPadValue,
  type EventLog
} from "ethers"

import {
  EthereumContractName,
  EthereumReserveClient,
  EthereumReserveSwapClient,
  OutpostChainFamily,
  OutpostClient,
  type EthereumOutpostClient,
  type EthereumOutpostClientOptions,
  type ReserveSwapRequest
} from "@wireio/sdk-outpost"
import {
  createEthereumImplementationCode,
  createEthereumProviderFixture,
  createOutpostDeploymentProfileFixture
} from "../../Fixtures.js"

/** Create the Ethereum client through the package's only public facade. */
function createEthereumClient(
  options: EthereumOutpostClientOptions
): Promise<EthereumOutpostClient> {
  return OutpostClient.create({
    family: OutpostChainFamily.ethereum,
    options
  })
}

describe("EthereumOutpostClient", () => {
  it("submits native reserve swaps with estimated gas headroom", async () => {
    const request: ReserveSwapRequest = {
        sourceTokenCode: 1,
        sourceReserveCode: 2,
        sourceAmount: 3,
        targetChainCode: 4,
        targetTokenCode: 5,
        targetReserveCode: 6,
        targetRecipient: new Uint8Array([7]),
        targetAmount: 8,
        targetToleranceBps: 500
      },
      wait = jest.fn().mockResolvedValue({
        logs: [{ eventName: "SwapDeposit", args: [42n] } as unknown as EventLog]
      }),
      requestSwap = Object.assign(
        jest.fn().mockResolvedValue({ hash: "0xabc", wait }),
        {
          staticCall: jest.fn().mockResolvedValue(null),
          estimateGas: jest.fn().mockResolvedValue(100_000n)
        }
      ),
      reserveManager = {
        requestSwap
      } as unknown as ConstructorParameters<
        typeof EthereumReserveSwapClient
      >[0],
      client = new EthereumReserveSwapClient(
        reserveManager,
        Wallet.createRandom()
      )

    await expect(client.requestNative(request)).resolves.toEqual({
      transactionId: "0xabc",
      sourceRequestId: 42n
    })
    expect(requestSwap).toHaveBeenCalledWith(
      request.sourceTokenCode,
      request.sourceReserveCode,
      request.targetChainCode,
      request.targetTokenCode,
      request.targetReserveCode,
      request.targetRecipient,
      request.targetAmount,
      request.targetToleranceBps,
      {
        value: request.sourceAmount,
        gasLimit: 125_000n
      }
    )
    expect(wait).toHaveBeenCalledWith(1)
  })

  it("adds 25% gas headroom to reserve swap submissions", () => {
    expect(EthereumReserveSwapClient.addSubmissionGasHeadroom(789_767)).toEqual(
      987_209n
    )
    expect(EthereumReserveSwapClient.addSubmissionGasHeadroom(1)).toEqual(2n)
  })

  it("resets nonzero ERC-20 allowances before increasing them", () => {
    expect(EthereumReserveSwapClient.approvalAmounts(2, 3)).toEqual([0n, 3n])
    expect(EthereumReserveSwapClient.approvalAmounts(0, 3)).toEqual([3n])
    expect(EthereumReserveSwapClient.approvalAmounts(3, 3)).toEqual([])
  })

  it("verifies a profile and returns a generated contract type", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile),
      client = await createEthereumClient({
        profile,
        connection: provider
      }),
      reserveManager = client.contract(EthereumContractName.ReserveManager)

    expect(reserveManager.target).toBe(
      profile.ethereum.contracts[EthereumContractName.ReserveManager].address
    )
    expect(client.reserves).toBeInstanceOf(EthereumReserveClient)
    expect(client.swaps).toBeInstanceOf(EthereumReserveSwapClient)
    expect(provider.getCode).toHaveBeenCalledTimes(
      Object.values(EthereumContractName).length * 2
    )
    expect(provider.getStorage).toHaveBeenCalledTimes(
      Object.values(EthereumContractName).length
    )
  })

  it("keeps existing Ethereum clients usable when BAR is not deployed", async () => {
    const profile = createOutpostDeploymentProfileFixture()
    delete profile.ethereum.contracts[EthereumContractName.BAR]
    const provider = createEthereumProviderFixture(profile),
      client = await createEthereumClient({
        profile,
        connection: provider
      })

    expect(client.reserves).toBeInstanceOf(EthereumReserveClient)
    expect(client.swaps).toBeInstanceOf(EthereumReserveSwapClient)
    expect(() => client.nodeOwners).toThrow("has no BAR identity")
    expect(provider.getCode).toHaveBeenCalledTimes(
      (Object.values(EthereumContractName).length - 1) * 2
    )
  })

  it("parses the protocol deposit id from a confirmed receipt", () => {
    const events = [
      { eventName: "SwapDeposit", args: [42n] } as unknown as EventLog
    ]

    expect(EthereumReserveSwapClient.parseSourceRequestId(events)).toBe(42n)
    expect(() => EthereumReserveSwapClient.parseSourceRequestId([])).toThrow(
      "did not emit SwapDeposit"
    )
  })

  it("rejects the wrong Ethereum chain", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest
      .spyOn(provider, "getNetwork")
      .mockResolvedValue(Network.from({ chainId: 1, name: "mainnet" }))

    await expect(
      createEthereumClient({ profile, connection: provider })
    ).rejects.toThrow("Ethereum chain mismatch")
  })

  it("rejects a configured proxy without bytecode", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest.spyOn(provider, "getCode").mockResolvedValue("0x")

    await expect(
      createEthereumClient({ profile, connection: provider })
    ).rejects.toThrow("is not deployed")
  })

  it("rejects an implementation address mismatch", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest
      .spyOn(provider, "getStorage")
      .mockResolvedValue(zeroPadValue("0x01", 32))

    await expect(
      createEthereumClient({ profile, connection: provider })
    ).rejects.toThrow("implementation mismatch")
  })

  it("rejects an implementation code mismatch", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    profile.ethereum.contracts[
      EthereumContractName.ReserveManager
    ].implementationCodeSha256 = "f".repeat(64)

    await expect(
      createEthereumClient({ profile, connection: provider })
    ).rejects.toThrow("implementation code mismatch")
  })

  it("rejects live code from another producer runtime", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      contract = profile.ethereum.contracts[EthereumContractName.OPP],
      incompatibleCodeBytes = getBytes(
        createEthereumImplementationCode(EthereumContractName.OPP)
      )
    incompatibleCodeBytes[0] ^= 1
    const incompatibleCode = hexlify(incompatibleCodeBytes),
      incompatibleCodeSha256 = sha256(incompatibleCode).slice(2)
    contract.implementationCodeSha256 = incompatibleCodeSha256
    const provider = createEthereumProviderFixture(profile),
      getCode = (provider.getCode as jest.Mock).getMockImplementation()
    jest
      .spyOn(provider, "getCode")
      .mockImplementation(async address =>
        address === contract.implementationAddress
          ? incompatibleCode
          : getCode(address)
      )

    await expect(
      createEthereumClient({ profile, connection: provider })
    ).rejects.toThrow("artifact runtime")
  })
})
