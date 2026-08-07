import {
  BigNumber,
  Signer,
  Wallet,
  constants as ethersConstants,
  providers,
  utils as ethersUtils
} from "ethers"

import {
  EthereumReserveClient,
  OutpostReserveStatus,
  type EthereumReserveCreateRequest,
  type ReserveManager
} from "@wireio/sdk-outpost"

const ReserveTransactionHash = `0x${"11".repeat(32)}`,
  ApprovalTransactionHash = `0x${"22".repeat(32)}`,
  TokenAddress = "0x5c74c94173F05dA1720953407cbb920F3DF9f887",
  CreatorAddress = "0x7412BC256355ABD22dD53De3a38E8995b5d4c1D1",
  TransactionReceipt = {
    logs: [],
    status: 1
  } as unknown as providers.TransactionReceipt

const request: EthereumReserveCreateRequest = {
  tokenCode: 1,
  reserveCode: 2,
  externalTokenAmount: 3,
  requestedWireAmount: 4,
  connectorWeightBps: 5_000,
  name: "Private ETH reserve",
  description: "Same-owner external routing",
  isPrivate: true,
  creatorPubKey: `0x02${"11".repeat(32)}`
}

function transactionFixture(
  hash = ReserveTransactionHash,
  wait: providers.TransactionResponse["wait"] = jest.fn(
    async (): Promise<providers.TransactionReceipt> => TransactionReceipt
  )
) {
  return {
    hash,
    wait
  } as unknown as providers.TransactionResponse
}

function reserveManagerFixture() {
  const transaction = transactionFixture(),
    reserveManager = {
      address: "0x18E317A7D70d8fBf8e6E893616b52390EbBdb629",
      callStatic: {
        create_reserve: jest.fn(async (): Promise<void> => undefined),
        requestReserveCreateErc20WithApproval: jest.fn(
          async (): Promise<void> => undefined
        ),
        requestReserveCreateErc20WithPermit: jest.fn(
          async (): Promise<void> => undefined
        )
      },
      create_reserve: jest.fn(async () => transaction),
      requestReserveCreateErc20WithApproval: jest.fn(async () => transaction),
      requestReserveCreateErc20WithPermit: jest.fn(async () => transaction),
      cancel_create_reserve: jest.fn(async () => transaction),
      tokenAddressesByCode: jest.fn(async () => TokenAddress),
      getReserve: jest.fn(async () => ({
        tokenCode: BigNumber.from(1),
        reserveCode: BigNumber.from(2),
        externalTokenAmount: BigNumber.from(3),
        requestedWireAmount: BigNumber.from(4),
        connectorWeightBps: 5_000,
        status: 1,
        creator: CreatorAddress,
        exists: true
      }))
    } as unknown as ReserveManager

  return { reserveManager, transaction }
}

class Erc20Signer extends Signer {
  readonly provider = new providers.JsonRpcProvider()
  readonly approvalWait = jest.fn(
    async (): Promise<providers.TransactionReceipt> => TransactionReceipt
  )
  readonly approval = transactionFixture(
    ApprovalTransactionHash,
    this.approvalWait
  )

  async getAddress(): Promise<string> {
    return CreatorAddress
  }

  async signMessage(): Promise<string> {
    return "0x"
  }

  async signTransaction(): Promise<string> {
    return "0x"
  }

  connect(): Signer {
    return this
  }

  async call(): Promise<string> {
    return ethersUtils.defaultAbiCoder.encode(["uint256"], [0])
  }

  async sendTransaction(): Promise<providers.TransactionResponse> {
    return this.approval
  }
}

describe("EthereumReserveClient", () => {
  it("creates a native pending reserve after static preflight", async () => {
    const { reserveManager, transaction } = reserveManagerFixture(),
      client = new EthereumReserveClient(reserveManager, Wallet.createRandom())

    await expect(client.createNative(request)).resolves.toEqual({
      transactionId: ReserveTransactionHash
    })
    expect(reserveManager.callStatic.create_reserve).toHaveBeenCalledTimes(1)
    expect(reserveManager.create_reserve).toHaveBeenCalledTimes(1)
    expect(transaction.wait).toHaveBeenCalledWith(1)
  })

  it("approves an ERC-20 before creating its pending reserve", async () => {
    const { reserveManager } = reserveManagerFixture(),
      signer = new Erc20Signer(),
      client = new EthereumReserveClient(reserveManager, signer)

    const submission = await client.createErc20WithApproval(
      request,
      TokenAddress
    )
    expect(submission).toEqual({ transactionId: ReserveTransactionHash })
    expect(signer.approvalWait).toHaveBeenCalledWith(1)
    expect(
      reserveManager.requestReserveCreateErc20WithApproval
    ).toHaveBeenCalledTimes(1)
  })

  it("creates an ERC-20 reserve with a supplied permit", async () => {
    const { reserveManager } = reserveManagerFixture(),
      client = new EthereumReserveClient(reserveManager, Wallet.createRandom())

    await expect(
      client.createErc20WithPermit(request, {
        deadline: 100,
        v: 27,
        r: ethersConstants.HashZero,
        s: ethersConstants.HashZero
      })
    ).resolves.toEqual({ transactionId: ReserveTransactionHash })
    expect(
      reserveManager.callStatic.requestReserveCreateErc20WithPermit
    ).toHaveBeenCalledTimes(1)
  })

  it("cancels a pending reserve and normalizes active local state", async () => {
    const { reserveManager } = reserveManagerFixture(),
      client = new EthereumReserveClient(reserveManager, Wallet.createRandom())

    await expect(
      client.cancel({ tokenCode: 1, reserveCode: 2 })
    ).resolves.toEqual({ transactionId: ReserveTransactionHash })
    await expect(client.get({ tokenCode: 1, reserveCode: 2 })).resolves.toEqual(
      expect.objectContaining({
        tokenCode: 1n,
        reserveCode: 2n,
        status: OutpostReserveStatus.active,
        creator: CreatorAddress,
        exists: true
      })
    )
  })

  it("requires a signer and a configured ERC-20 route", async () => {
    const { reserveManager } = reserveManagerFixture(),
      provider = new providers.JsonRpcProvider(),
      providerClient = new EthereumReserveClient(reserveManager, provider)

    await expect(providerClient.createNative(request)).rejects.toThrow(
      "requires a connected signer"
    )

    reserveManager.tokenAddressesByCode = jest.fn(
      async () => ethersConstants.AddressZero
    )
    const signerClient = new EthereumReserveClient(
      reserveManager,
      new Erc20Signer()
    )
    await expect(signerClient.createErc20WithApproval(request)).rejects.toThrow(
      "No ERC-20 address is configured"
    )
  })
})
