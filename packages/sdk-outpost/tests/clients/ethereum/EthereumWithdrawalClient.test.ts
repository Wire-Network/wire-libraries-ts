import { JsonRpcProvider, Wallet } from "ethers"
import type {
  DepositManager,
  LiqEthToken
} from "@wireio/outpost-ethereum-artifacts"
import type { WithdrawalQueue } from "@wireio/outpost-ethereum-artifacts"
import { EthereumWithdrawalClient } from "@wireio/sdk-outpost/clients/ethereum/EthereumWithdrawalClient"

const QueueAddress = "0x0000000000000000000000000000000000000011",
  PayerAddress = "0x0000000000000000000000000000000000000022",
  ReceiptId = (1n << 200n) + 1n

/** Producer-contract doubles retaining named ABI returns and exact uint256 IDs. */
function fixture() {
  const provider = new JsonRpcProvider("https://example.invalid"),
    wallet = Wallet.createRandom().connect(provider),
    token = {
      _withdrawalQueue: jest.fn(async () => QueueAddress),
      balanceOf: jest.fn(async () => 100n),
      decimals: jest.fn(async () => 18n),
      paused: jest.fn(async () => false),
      safeBurn: Object.assign(
        jest.fn(async () => ({ hash: "request" })),
        { staticCall: jest.fn(async () => 9n) }
      )
    },
    queue = {
      getAddress: jest.fn(async () => QueueAddress),
      balanceOf: jest.fn(async () => 1n),
      tokenOfOwnerByIndex: jest.fn(async () => ReceiptId),
      ownerOf: jest.fn(async () => wallet.address),
      info: jest.fn(async () => ({ ethAmount: 10n, readyAt: 900n })),
      withdrawDelay: jest.fn(async () => 120n),
      claim: jest.fn(async () => ({ hash: "queue-claim" }))
    },
    payer = {
      getAddress: jest.fn(async () => PayerAddress),
      withdrawalQueue: jest.fn(async () => QueueAddress),
      paused: jest.fn(async () => false),
      claim: jest.fn(async () => ({ hash: "deposit-claim" }))
    }
  jest
    .spyOn(provider, "getBlock")
    .mockResolvedValue({ number: 42, timestamp: 1000 } as never)
  jest.spyOn(provider, "getBalance").mockResolvedValue(200n)
  const client = new EthereumWithdrawalClient(
    token as unknown as LiqEthToken,
    queue as unknown as WithdrawalQueue,
    payer as unknown as DepositManager,
    wallet
  )
  return { client, provider, wallet, token, queue, payer }
}

describe("Ethereum native withdrawals", () => {
  it("reads all receipt data, ownership, funding and time at one chain block", async () => {
    const { client, wallet, queue, provider } = fixture(),
      state = await client.read(wallet.address)
    expect(state.receipts).toEqual([
      {
        id: ReceiptId,
        amount: 10n,
        readyAt: 900n,
        ready: true,
        funded: true,
        claimable: true
      }
    ])
    expect(queue.info).toHaveBeenCalledWith(ReceiptId, { blockTag: 42 })
    expect(provider.getBalance).toHaveBeenCalledWith(PayerAddress, 42)
    expect(state.timestamp).toBe(1000n)
  })

  it("submits a reviewed burn only after fresh balance, pause and share validation", async () => {
    const { client, token, wallet } = fixture()
    await expect(client.request(20n)).resolves.toEqual({ hash: "request" })
    expect(token.safeBurn).toHaveBeenCalledWith(wallet.address, 20n)
    token.safeBurn.mockClear()
    token.paused.mockResolvedValue(true)
    await expect(client.request(20n)).rejects.toThrow("paused")
    token.paused.mockResolvedValue(false)
    for (const amount of [0n, -1n, 101n])
      await expect(client.request(amount)).rejects.toThrow("balance")
    token.safeBurn.staticCall.mockResolvedValue(0n)
    await expect(client.request(1n)).rejects.toThrow("one liquid-token share")
    expect(token.safeBurn).not.toHaveBeenCalled()
  })

  it("uses DepositManager for v1 claims and never calls the queue's nonexistent claim", async () => {
    const { client, payer, queue } = fixture()
    await expect(client.claim(ReceiptId)).resolves.toEqual({
      hash: "deposit-claim"
    })
    expect(payer.claim).toHaveBeenCalledWith(ReceiptId)
    expect(queue.claim).not.toHaveBeenCalled()
  })

  it("distinguishes waiting for time, waiting for funding, pauses and missing ownership", async () => {
    const { client, queue, payer, provider } = fixture()
    queue.info.mockResolvedValue({ ethAmount: 10n, readyAt: 1001n })
    await expect(client.claim(ReceiptId)).rejects.toThrow("delay")
    queue.info.mockResolvedValue({ ethAmount: 10n, readyAt: 900n })
    jest.spyOn(provider, "getBalance").mockResolvedValue(9n)
    await expect(client.claim(ReceiptId)).rejects.toThrow("funding")
    jest.spyOn(provider, "getBalance").mockResolvedValue(200n)
    payer.paused.mockResolvedValue(true)
    await expect(client.claim(ReceiptId)).rejects.toThrow("paused")
    payer.paused.mockResolvedValue(false)
    queue.balanceOf.mockResolvedValue(0n)
    await expect(client.claim(ReceiptId)).rejects.toThrow("not owned")
    expect(payer.claim).not.toHaveBeenCalled()
  })

  it("fails closed on token/queue wiring, changing ownership and excessive enumeration", async () => {
    const { client, token, queue, payer, wallet } = fixture()
    token._withdrawalQueue.mockResolvedValue(PayerAddress)
    await expect(client.read(wallet.address)).rejects.toThrow(
      "token does not use"
    )
    token._withdrawalQueue.mockResolvedValue(QueueAddress)
    payer.withdrawalQueue.mockResolvedValue(PayerAddress)
    await expect(client.read(wallet.address)).rejects.toThrow(
      "manager does not use"
    )
    payer.withdrawalQueue.mockResolvedValue(QueueAddress)
    queue.ownerOf.mockResolvedValue(Wallet.createRandom().address)
    await expect(client.read(wallet.address)).rejects.toThrow("owner changed")
    queue.balanceOf.mockResolvedValue(10001n)
    await expect(client.read(wallet.address)).rejects.toThrow("enumeration")
  })
})
