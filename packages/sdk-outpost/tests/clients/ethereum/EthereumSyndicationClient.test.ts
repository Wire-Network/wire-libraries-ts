import type {
  DepositManager,
  LiqEthToken,
  SyndicationPool
} from "@wireio/outpost-ethereum-artifacts"
import { JsonRpcProvider, Wallet } from "ethers"
import { EthereumSyndicationClient } from "@wireio/sdk-outpost"

const TokenAddress = "0x0000000000000000000000000000000000000011",
  PoolAddress = "0x0000000000000000000000000000000000000022"

/** Generated-contract doubles; no network or funded keys. */
function fixture() {
  const provider = new JsonRpcProvider("https://example.invalid"),
    wallet = Wallet.createRandom().connect(provider),
    deposit = {
      liqEth: jest.fn(async () => TokenAddress),
      minDeposit: jest.fn(async () => 10n),
      procFee: jest.fn(async () => 2n),
      deposit: jest.fn(async () => ({ hash: "deposit" }))
    },
    token = {
      getAddress: jest.fn(async () => TokenAddress),
      balanceOf: jest.fn(async () => 100n),
      allowance: jest.fn(async () => 0n),
      decimals: jest.fn(async () => 18n),
      paused: jest.fn(async () => false),
      totalSupply: jest.fn(async () => 100n),
      approve: jest.fn(async () => ({ hash: "approval" }))
    },
    pool = {
      getAddress: jest.fn(async () => PoolAddress),
      liqETH: jest.fn(async () => TokenAddress),
      maxSyndicationPerTransfer: jest.fn(async () => 80n),
      paused: jest.fn(async () => false),
      syndicate: jest.fn(async () => ({ hash: "syndication" }))
    }
  jest.spyOn(provider, "getBalance").mockResolvedValue(200n)
  const client = new EthereumSyndicationClient(
    deposit as unknown as DepositManager,
    token as unknown as LiqEthToken,
    pool as unknown as SyndicationPool,
    wallet
  )
  return { client, deposit, token, pool, wallet }
}

describe("Ethereum syndication", () => {
  it("quotes first mint without a fee and subsequent mint with the configured fee", async () => {
    const { client, token, deposit } = fixture()
    token.totalSupply.mockResolvedValueOnce(0n)
    await expect(client.quoteDeposit(20n)).resolves.toBe(20n)
    expect(deposit.procFee).not.toHaveBeenCalled()
    await expect(client.quoteDeposit(20n)).resolves.toBe(18n)
  })

  it("rejects invalid deposits and mismatched token custody before sending", async () => {
    const { client, deposit, pool } = fixture()
    for (const amount of [0n, 9n, 200n])
      await expect(client.deposit(amount)).rejects.toThrow()
    expect(deposit.deposit).not.toHaveBeenCalled()
    pool.liqETH.mockResolvedValue(PoolAddress)
    await expect(client.deposit(20n)).rejects.toThrow("do not match")
  })

  it("submits the native value without waiting or silently signing another action", async () => {
    const { client, deposit, token, pool } = fixture()
    await expect(client.deposit(20n)).resolves.toEqual({ hash: "deposit" })
    expect(deposit.deposit).toHaveBeenCalledWith({ value: 20n })
    expect(token.approve).not.toHaveBeenCalled()
    expect(pool.syndicate).not.toHaveBeenCalled()
  })

  it("requires exact approval, wallet identity and configured limits", async () => {
    const { client, token, pool, wallet } = fixture()
    const key = wallet.signingKey.compressedPublicKey
    await expect(client.syndicate(20n, key)).rejects.toThrow("Approve")
    await client.approve(20n)
    expect(token.approve).toHaveBeenCalledWith(PoolAddress, 20n)
    token.allowance.mockResolvedValue(20n)
    await expect(
      client.syndicate(
        20n,
        Wallet.createRandom().signingKey.compressedPublicKey
      )
    ).rejects.toThrow("does not match")
    await expect(client.syndicate(81n, key)).rejects.toThrow("limit")
    await client.syndicate(20n, key)
    expect(pool.syndicate).toHaveBeenCalledTimes(1)
    expect(pool.syndicate).toHaveBeenCalledWith(20n, key)
  })
})
