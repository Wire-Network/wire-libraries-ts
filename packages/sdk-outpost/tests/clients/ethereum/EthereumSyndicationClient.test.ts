import type {
  DepositManager,
  LiqEthToken,
  SyndicationPool
} from "@wireio/outpost-ethereum-artifacts"
import { JsonRpcProvider, Wallet } from "ethers"
import { EthereumSyndicationClient } from "@wireio/sdk-outpost/clients/ethereum/EthereumSyndicationClient"

const TokenAddress = "0x0000000000000000000000000000000000000011",
  PoolAddress = "0x0000000000000000000000000000000000000022",
  DepotUnit = 1_000_000_000n

/** Generated-contract doubles; no network or funded keys. */
function fixture() {
  const provider = new JsonRpcProvider("https://example.invalid"),
    wallet = Wallet.createRandom().connect(provider),
    deposit = {
      liqEth: jest.fn(async () => TokenAddress),
      minDeposit: jest.fn(async () => 10n * DepotUnit),
      procFee: jest.fn(async () => 2n * DepotUnit),
      deposit: jest.fn(async () => ({ hash: "deposit" }))
    },
    token = {
      getAddress: jest.fn(async () => TokenAddress),
      balanceOf: jest.fn(async () => 100n * DepotUnit),
      allowance: jest.fn(async () => 0n),
      decimals: jest.fn(async () => 18n),
      paused: jest.fn(async () => false),
      totalSupply: jest.fn(async () => 100n * DepotUnit),
      approve: jest.fn(async () => ({ hash: "approval" }))
    },
    minSyndication = jest.fn(async () => 0n),
    pool = {
      minSyndication,
      liqTokenPrecision: jest.fn(async () => 18n),
      getAddress: jest.fn(async () => PoolAddress),
      liqETH: jest.fn(async () => TokenAddress),
      maxSyndicationPerTransfer: jest.fn(async () => 80n * DepotUnit),
      paused: jest.fn(async () => false),
      syndicate: jest.fn(async () => ({ hash: "syndication" }))
    }
  jest.spyOn(provider, "getBalance").mockResolvedValue(200n * DepotUnit)
  const client = new EthereumSyndicationClient(
    deposit as unknown as DepositManager,
    token as unknown as LiqEthToken,
    pool as unknown as SyndicationPool,
    wallet
  )
  return { client, deposit, token, pool, wallet, minSyndication }
}

describe("Ethereum syndication", () => {
  it("quotes first mint without a fee and subsequent mint with the configured fee", async () => {
    const { client, token, deposit } = fixture()
    token.totalSupply.mockResolvedValueOnce(0n)
    await expect(client.quoteDeposit(20n * DepotUnit)).resolves.toBe(
      20n * DepotUnit
    )
    expect(deposit.procFee).not.toHaveBeenCalled()
    await expect(client.quoteDeposit(20n * DepotUnit)).resolves.toBe(
      18n * DepotUnit
    )
  })

  it("rejects invalid deposits and mismatched token custody before sending", async () => {
    const { client, deposit, pool } = fixture()
    for (const amount of [0n, 9n * DepotUnit, 200n * DepotUnit])
      await expect(client.deposit(amount)).rejects.toThrow()
    expect(deposit.deposit).not.toHaveBeenCalled()
    pool.liqETH.mockResolvedValue(PoolAddress)
    await expect(client.deposit(20n * DepotUnit)).rejects.toThrow(
      "do not match"
    )
  })

  it("submits the native value without waiting or silently signing another action", async () => {
    const { client, deposit, token, pool } = fixture()
    await expect(client.deposit(20n * DepotUnit)).resolves.toEqual({
      hash: "deposit"
    })
    expect(deposit.deposit).toHaveBeenCalledWith({ value: 20n * DepotUnit })
    expect(token.approve).not.toHaveBeenCalled()
    expect(pool.syndicate).not.toHaveBeenCalled()
  })

  it("keeps the pool's syndication pause separate from native deposits", async () => {
    const { client, deposit, token, pool, wallet } = fixture()
    pool.paused.mockResolvedValue(true)
    await expect(client.deposit(20n * DepotUnit)).resolves.toEqual({
      hash: "deposit"
    })
    await expect(
      client.syndicate(20n * DepotUnit, wallet.signingKey.compressedPublicKey)
    ).rejects.toThrow("Syndication is paused")
    token.paused.mockResolvedValue(true)
    await expect(client.deposit(20n * DepotUnit)).rejects.toThrow(
      "Liquid staking is paused"
    )
    expect(deposit.deposit).toHaveBeenCalledTimes(1)
    expect(pool.syndicate).not.toHaveBeenCalled()
  })

  it("converts the pool's credited depot minimum to external units and propagates read failures", async () => {
    const { client, wallet, pool, minSyndication } = fixture()
    minSyndication.mockResolvedValue(5_000_000n)
    const floor = 5_000_000_000_000_000n
    expect((await client.read(wallet.address)).minimumSyndication).toBe(floor)
    await expect(
      client.syndicate(floor - 1n, wallet.signingKey.compressedPublicKey)
    ).rejects.toThrow("minimum")
    expect(pool.syndicate).not.toHaveBeenCalled()
    minSyndication.mockRejectedValue(new Error("RPC unavailable"))
    await expect(client.read(wallet.address)).rejects.toThrow("RPC unavailable")
  })

  it("requires exact approval, wallet identity and configured limits", async () => {
    const { client, token, pool, wallet } = fixture()
    const key = wallet.signingKey.compressedPublicKey
    await expect(client.syndicate(20n * DepotUnit, key)).rejects.toThrow(
      "Approve"
    )
    await client.approve(20n * DepotUnit)
    expect(token.approve).toHaveBeenCalledWith(PoolAddress, 20n * DepotUnit)
    token.allowance.mockResolvedValue(20n * DepotUnit)
    await expect(
      client.syndicate(
        20n * DepotUnit,
        Wallet.createRandom().signingKey.compressedPublicKey
      )
    ).rejects.toThrow("does not match")
    await expect(client.syndicate(81n * DepotUnit, key)).rejects.toThrow(
      "limit"
    )
    await client.syndicate(20n * DepotUnit, key)
    expect(pool.syndicate).toHaveBeenCalledTimes(1)
    expect(pool.syndicate).toHaveBeenCalledWith(20n * DepotUnit, key)
  })
})
