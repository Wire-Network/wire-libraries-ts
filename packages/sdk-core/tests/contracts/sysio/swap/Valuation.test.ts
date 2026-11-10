import { contracts } from "@wireio/sdk-core"
import {
  createSwapPool,
  createSwapYieldSnapshot
} from "../../../support/swap.js"

const { getPoolValuation, quoteSwap, PoolPriceSource } = contracts.sysio.swap

/** Opening-pool example with a deliberately explicit external USD anchor. */
function options(): contracts.sysio.swap.PoolValuationOptions {
  return {
    pool: createSwapPool({
      pool2: { contract: "sysio.token", quantity: "60000.000000000 WIRE" },
      supply: "100.0000 LIQETHP",
      locked_shares: "20.0000 LIQETHP"
    }),
    prices: [{ token: { contract: "sysio.liq", sym: "9,LIQETH" }, usd: "3000" }]
  }
}

describe("pool valuation", () => {
  test("derives WIRE, TVL and LP value without a hardcoded WIRE price", () => {
    const input = options(),
      before = JSON.stringify(input),
      result = getPoolValuation(input)
    expect(result).toEqual({
      pool1: {
        reserve: input.pool.pool1,
        priceUsd: "3000",
        valueUsd: "30000",
        priceSource: PoolPriceSource.reference
      },
      pool2: {
        reserve: input.pool.pool2,
        priceUsd: "0.5",
        valueUsd: "30000",
        priceSource: PoolPriceSource.pool
      },
      pool1InPool2: "6000",
      pool2InPool1: "0.000166666666666666",
      accruedYield: { contract: "sysio.token", quantity: "0.000000000 WIRE" },
      tvlUsd: "60000",
      lpTokenUsd: "600"
    })
    expect(JSON.stringify(input)).toBe(before)
  })

  test("accepts either leg as the reference and respects two independent references", () => {
    const input = options()
    input.prices = [
      { token: { contract: "sysio.token", sym: "9,WIRE" }, usd: "0.5" }
    ]
    expect(getPoolValuation(input).pool1.priceUsd).toBe("3000")
    expect(getPoolValuation(input).pool1.priceSource).toBe(PoolPriceSource.pool)
    input.prices = [
      ...options().prices,
      { token: { contract: "sysio.token", sym: "9,WIRE" }, usd: "1" }
    ]
    const result = getPoolValuation(input)
    expect(result.pool2.priceUsd).toBe("1")
    expect(result.pool2.priceSource).toBe(PoolPriceSource.reference)
    expect(result.tvlUsd).toBe("90000")
    expect(result.lpTokenUsd).toBe("900")
    expect(result.pool1InPool2).toBe("6000")
  })

  test("normalizes different token and LP precisions", () => {
    const input = options()
    input.pool.pool1.quantity = "10.0000 LIQETH"
    input.pool.pool2.quantity = "60000.00000000 WIRE"
    input.prices = [
      { token: { contract: "sysio.liq", sym: "4,LIQETH" }, usd: "3000" }
    ]
    const result = getPoolValuation(input)
    expect(result.pool1InPool2).toBe("6000")
    expect(result.pool2.priceUsd).toBe("0.5")
    expect(result.tvlUsd).toBe("60000")
    expect(result.lpTokenUsd).toBe("600")
  })

  test("uses quote accrual on the entire swap holding without adding that holding to TVL", () => {
    const input = options()
    input.pool = createSwapPool({
      yield_leg: { contract: "sysio.liq", sym: "9,LIQETH" }
    })
    input.yield = createSwapYieldSnapshot()
    input.prices = [{ token: input.pool.yield_leg!, usd: "270" }]
    const result = getPoolValuation(input)
    expect(result.accruedYield).toEqual(
      quoteSwap({
        ...input,
        input: { contract: "sysio.liq", quantity: "1.000000000 LIQETH" },
        slippageBps: 0
      }).accruedYield
    )
    expect(result.pool2.reserve.quantity).toBe("27.000000000 WIRE")
    expect(result.pool2.priceUsd).toBe("100")
    expect(result.tvlUsd).toBe("5400")
    expect(result.lpTokenUsd).toBe("540")
    delete input.yield
    expect(() => getPoolValuation(input)).toThrow(/holder and index/)
    input.yield = { account: null, index: null }
    expect(getPoolValuation(input).accruedYield.quantity).toBe(
      "0.000000000 WIRE"
    )
  })

  test("rounds only at display boundaries, not while computing TVL or LP value", () => {
    const result = getPoolValuation({
      pool: createSwapPool({
        pool1: { contract: "sysio.liq", quantity: "1 LIQETH" },
        pool2: { contract: "sysio.token", quantity: "3 WIRE" },
        supply: "3 LP"
      }),
      prices: [{ token: { contract: "sysio.liq", sym: "0,LIQETH" }, usd: "1" }]
    })
    expect(result.pool2.priceUsd).toBe("0.333333333333333333")
    expect(result.pool2.valueUsd).toBe("1")
    expect(result.tvlUsd).toBe("2")
    expect(result.lpTokenUsd).toBe("0.666666666666666666")
  })

  test("preserves amounts above the safe JS integer limit", () => {
    const input = options()
    input.pool.pool1.quantity = "9007199.254740993 LIQETH"
    input.pool.pool2.quantity = "9007199.254740993 WIRE"
    input.prices = [{ ...input.prices[0], usd: "1" }]
    expect(getPoolValuation(input).pool2.priceUsd).toBe("1")
    expect(getPoolValuation(input).tvlUsd).toBe("18014398.509481986")
  })

  test.each(["0", "-1", "NaN", "Infinity", "1e3", "0.0000000000000000001", 1])(
    "rejects invalid USD reference %s",
    usd => {
      const input = options()
      input.prices = [{ ...input.prices[0], usd: usd as string }]
      expect(() => getPoolValuation(input)).toThrow()
    }
  )

  test("rejects missing, duplicate, wrong-contract or wrong-precision reference prices", () => {
    const input = options(),
      price = input.prices[0]
    expect(() => getPoolValuation({ ...input, prices: [] })).toThrow(
      /one or two/
    )
    expect(() =>
      getPoolValuation({ ...input, prices: [price, price] })
    ).toThrow(/Duplicate/)
    expect(() =>
      getPoolValuation({ ...input, prices: [price, price, price] })
    ).toThrow(/one or two/)
    expect(() =>
      getPoolValuation({
        ...input,
        prices: [{ ...price, token: { ...price.token, contract: "other" } }]
      })
    ).toThrow(/match/)
    expect(() =>
      getPoolValuation({
        ...input,
        prices: [{ ...price, token: { ...price.token, sym: "4,LIQETH" } }]
      })
    ).toThrow(/match/)
  })

  test("rejects empty/negative/duplicate reserves and zero supply instead of inventing a price", () => {
    const input = options()
    input.pool.pool1.quantity = "0.000000000 LIQETH"
    expect(() => getPoolValuation(input)).toThrow(/positive/)
    input.pool.pool1.quantity = "-1.000000000 LIQETH"
    expect(() => getPoolValuation(input)).toThrow(/integer/)
    input.pool.pool1 = input.pool.pool2
    expect(() => getPoolValuation(input)).toThrow(/distinct/)
    input.pool = createSwapPool({ supply: "0.000000000 LIQETHP" })
    expect(() => getPoolValuation(input)).toThrow(/supply/)
  })
})
