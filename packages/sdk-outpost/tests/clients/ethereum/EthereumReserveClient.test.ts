import type { ReserveManager } from "@wireio/outpost-ethereum-artifacts"
import {
  AbiCoder,
  AbstractSigner,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  ZeroHash,
  type Provider,
  type TransactionReceipt,
  type TransactionRequest,
  type TransactionResponse,
  type TypedDataDomain,
  type TypedDataField
} from "ethers"

import {
  EthereumReserveClient,
  OutpostReserveStatus,
  type EthereumReserveCreateRequest
} from "@wireio/sdk-outpost"

const ReserveTransactionHash = `0x${"11".repeat(32)}`,
  ApprovalTransactionHash = `0x${"22".repeat(32)}`,
  ReserveManagerAddress = "0x18E317A7D70d8fBf8e6E893616b52390EbBdb629",
  TokenAddress = "0x5c74c94173F05dA1720953407cbb920F3DF9f887",
  CreatorAddress = "0x7412BC256355ABD22dD53De3a38E8995b5d4c1D1",
  TransactionReceiptFixture = {
    logs: [],
    status: 1
  } as unknown as TransactionReceipt

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

/** Create one v6 transaction response fixture. */
function transactionFixture(
  hash = ReserveTransactionHash,
  wait: TransactionResponse["wait"] = jest.fn(
    async (): Promise<TransactionReceipt> => TransactionReceiptFixture
  )
): TransactionResponse {
  return { hash, wait } as unknown as TransactionResponse
}

/** Create one callable v6 contract method with a static preflight. */
function contractMethodFixture(transaction: TransactionResponse) {
  return Object.assign(
    jest.fn(async () => transaction),
    {
      staticCall: jest.fn(async (): Promise<void> => undefined)
    }
  )
}

/** Create the ReserveManager contract surface exercised by this client. */
function reserveManagerFixture(configuredTokenAddress = TokenAddress) {
  const transaction = transactionFixture(),
    createReserve = contractMethodFixture(transaction),
    createErc20WithApproval = contractMethodFixture(transaction),
    createErc20WithPermit = contractMethodFixture(transaction),
    reserveManager = {
      target: ReserveManagerAddress,
      getAddress: jest.fn(async () => ReserveManagerAddress),
      create_reserve: createReserve,
      requestReserveCreateErc20WithApproval: createErc20WithApproval,
      requestReserveCreateErc20WithPermit: createErc20WithPermit,
      cancel_create_reserve: jest.fn(async () => transaction),
      tokenAddressesByCode: jest.fn(async () => configuredTokenAddress),
      getReserve: jest.fn(async () => ({
        tokenCode: 1n,
        reserveCode: 2n,
        externalTokenAmount: 3n,
        requestedWireAmount: 4n,
        connectorWeightBps: 5_000n,
        status: 1n,
        creator: CreatorAddress,
        exists: true
      }))
    } as unknown as ReserveManager

  return { reserveManager, transaction }
}

/** Create a static v6 provider that confirms the mocked ERC-20 transaction. */
function erc20Provider(): JsonRpcProvider {
  const provider = new JsonRpcProvider(undefined, 31_337, {
    staticNetwork: true
  })
  jest
    .spyOn(provider, "getTransactionReceipt")
    .mockResolvedValue(TransactionReceiptFixture)
  return provider
}

/** Minimal ethers v6 signer used to observe ERC-20 calls and submissions. */
class Erc20Signer extends AbstractSigner<Provider> {
  readonly approval = transactionFixture(ApprovalTransactionHash)

  constructor(provider: Provider = erc20Provider()) {
    super(provider)
  }

  async getAddress(): Promise<string> {
    return CreatorAddress
  }

  async signMessage(): Promise<string> {
    return "0x"
  }

  async signTransaction(): Promise<string> {
    return "0x"
  }

  async signTypedData(
    _domain: TypedDataDomain,
    _types: Record<string, Array<TypedDataField>>,
    _value: Record<string, unknown>
  ): Promise<string> {
    return "0x"
  }

  connect(provider: Provider): Erc20Signer {
    return new Erc20Signer(provider)
  }

  async call(): Promise<string> {
    return AbiCoder.defaultAbiCoder().encode(["uint256"], [0])
  }

  async sendTransaction(
    _transaction: TransactionRequest
  ): Promise<TransactionResponse> {
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
    expect(reserveManager.create_reserve.staticCall).toHaveBeenCalledTimes(1)
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
    expect(signer.provider.getTransactionReceipt).toHaveBeenCalledWith(
      ApprovalTransactionHash
    )
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
        r: ZeroHash,
        s: ZeroHash
      })
    ).resolves.toEqual({ transactionId: ReserveTransactionHash })
    expect(
      reserveManager.requestReserveCreateErc20WithPermit.staticCall
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
      provider = new JsonRpcProvider(),
      providerClient = new EthereumReserveClient(reserveManager, provider)

    await expect(providerClient.createNative(request)).rejects.toThrow(
      "requires a connected signer"
    )

    const { reserveManager: unconfiguredReserveManager } =
        reserveManagerFixture(ZeroAddress),
      signerClient = new EthereumReserveClient(
        unconfiguredReserveManager,
        new Erc20Signer()
      )
    await expect(signerClient.createErc20WithApproval(request)).rejects.toThrow(
      "No ERC-20 address is configured"
    )
  })

  it("rejects an ERC-20 address that differs from the configured route", async () => {
    const { reserveManager } = reserveManagerFixture(),
      signer = new Erc20Signer(),
      client = new EthereumReserveClient(reserveManager, signer),
      differentTokenAddress = Wallet.createRandom().address

    await expect(
      client.createErc20WithApproval(request, differentTokenAddress)
    ).rejects.toThrow("does not match the configured route")
    expect(signer.provider.getTransactionReceipt).not.toHaveBeenCalled()
  })
})
