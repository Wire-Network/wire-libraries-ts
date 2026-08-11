import { BigNumber, utils as ethersUtils, Wallet } from "ethers"

import {
  EthereumContractName,
  EthereumOutpostClient,
  EthereumReserveSwapClient,
  type ReserveSwapRequest
} from "@wireio/sdk-outpost"
import {
  createEthereumImplementationCode,
  createEthereumProviderFixture,
  createOutpostDeploymentProfileFixture
} from "../../Fixtures.js"

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
        events: [{ event: "SwapDeposit", args: [BigNumber.from(42)] }]
      }),
      requestSwap = jest.fn().mockResolvedValue({ hash: "0xabc", wait }),
      reserveManager = {
        callStatic: { requestSwap: jest.fn().mockResolvedValue(null) },
        estimateGas: {
          requestSwap: jest.fn().mockResolvedValue(BigNumber.from(100_000))
        },
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
        gasLimit: BigNumber.from(125_000)
      }
    )
    expect(wait).toHaveBeenCalledWith(1)
  })

  it("adds 25% gas headroom to reserve swap submissions", () => {
    expect(EthereumReserveSwapClient.addSubmissionGasHeadroom(789_767)).toEqual(
      BigNumber.from(987_209)
    )
    expect(EthereumReserveSwapClient.addSubmissionGasHeadroom(1)).toEqual(
      BigNumber.from(2)
    )
  })

  it("resets nonzero ERC-20 allowances before increasing them", () => {
    expect(
      EthereumReserveSwapClient.approvalAmounts(2, 3).map(amount =>
        amount.toNumber()
      )
    ).toEqual([0, 3])
    expect(
      EthereumReserveSwapClient.approvalAmounts(0, 3).map(amount =>
        amount.toNumber()
      )
    ).toEqual([3])
    expect(EthereumReserveSwapClient.approvalAmounts(3, 3)).toEqual([])
  })

  it("verifies a profile and returns a generated contract type", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile),
      client = await EthereumOutpostClient.create({
        profile,
        connection: provider
      }),
      reserveManager = client.contract(EthereumContractName.ReserveManager)

    expect(reserveManager.address).toBe(
      profile.ethereum.contracts[EthereumContractName.ReserveManager].address
    )
    expect(client.swaps).toBeInstanceOf(EthereumReserveSwapClient)
    expect(provider.getCode).toHaveBeenCalledTimes(
      Object.values(EthereumContractName).length * 2
    )
    expect(provider.getStorageAt).toHaveBeenCalledTimes(
      Object.values(EthereumContractName).length
    )
  })

  it("parses the protocol deposit id from a confirmed receipt", () => {
    const events = [{ event: "SwapDeposit", args: [BigNumber.from(42)] }]

    expect(EthereumReserveSwapClient.parseSourceRequestId(events)).toBe(42n)
    expect(() => EthereumReserveSwapClient.parseSourceRequestId([])).toThrow(
      "did not emit SwapDeposit"
    )
  })

  it("rejects the wrong Ethereum chain", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest.spyOn(provider, "getNetwork").mockResolvedValue({
      chainId: 1,
      name: "mainnet"
    })

    await expect(
      EthereumOutpostClient.create({ profile, connection: provider })
    ).rejects.toThrow("Ethereum chain mismatch")
  })

  it("rejects a configured proxy without bytecode", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest.spyOn(provider, "getCode").mockResolvedValue("0x")

    await expect(
      EthereumOutpostClient.create({ profile, connection: provider })
    ).rejects.toThrow("is not deployed")
  })

  it("rejects an implementation address mismatch", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest
      .spyOn(provider, "getStorageAt")
      .mockResolvedValue(ethersUtils.hexZeroPad("0x01", 32))

    await expect(
      EthereumOutpostClient.create({ profile, connection: provider })
    ).rejects.toThrow("implementation mismatch")
  })

  it("rejects an implementation code mismatch", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    profile.ethereum.contracts[
      EthereumContractName.ReserveManager
    ].implementationCodeSha256 = "f".repeat(64)

    await expect(
      EthereumOutpostClient.create({ profile, connection: provider })
    ).rejects.toThrow("implementation code mismatch")
  })

  it("rejects live code from another producer runtime", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      contract = profile.ethereum.contracts[EthereumContractName.OPP],
      incompatibleCodeBytes = ethersUtils.arrayify(
        createEthereumImplementationCode(EthereumContractName.OPP)
      )
    incompatibleCodeBytes[0] ^= 1
    const incompatibleCode = ethersUtils.hexlify(incompatibleCodeBytes),
      incompatibleCodeSha256 = ethersUtils.sha256(incompatibleCode).slice(2)
    contract.implementationCodeSha256 = incompatibleCodeSha256
    const provider = createEthereumProviderFixture(profile),
      getCode = (provider.getCode as jest.Mock).getMockImplementation()
    jest.spyOn(provider, "getCode").mockImplementation(async address =>
      address === contract.implementationAddress
        ? incompatibleCode
        : getCode(address)
    )

    await expect(
      EthereumOutpostClient.create({ profile, connection: provider })
    ).rejects.toThrow("artifact runtime")
  })
})
