import { Asset, contracts } from "@wireio/sdk-core"

const { quoteAddLiquidity, quoteRemoveLiquidity } = contracts.sysio.swap

/** Mixed-precision pool, deliberately indivisible share ratios. */
function options(): contracts.sysio.swap.LiquidityQuoteOptions {
  return {
    shares: "0.01 LP",
    slippageBps: 50,
    pool: {
      supply: "0.03 LP",
      max_supply: "100.00 LP",
      locked_shares: "0.01 LP",
      issuer: "sysio.swap",
      pool1: { contract: "sysio.liq", quantity: "0.0010 LIQETH" },
      pool2: { contract: "sysio.token", quantity: "0.000020 WIRE" },
      fee: 30,
      fee_authority: "sysio",
      conversion_horizon_sec: 0,
      depth_cap_bps: 0,
      clip_floor: 0,
      last_tick_depth: 0,
      last_tick: "2026-10-20T00:00:00"
    }
  }
}

describe("depot liquidity quotes", () => {
  it("ceil rounds both mint inputs, the one-bps fee and maximums independently", () => {
    const input = options(),
      before = JSON.stringify(input),
      quote = quoteAddLiquidity(input)
    expect(quote.input1.quantity).toBe("0.0005 LIQETH") // ceil(10/3) + ceil(4/10000)
    expect(quote.input2.quantity).toBe("0.000008 WIRE")
    expect(quote.maximum1.quantity).toBe("0.0006 LIQETH")
    expect(quote.maximum2.quantity).toBe("0.000009 WIRE")
    expect(quote.fee1.quantity).toBe("0.0001 LIQETH")
    expect(quote.input2.contract).toBe("sysio.token")
    expect(JSON.stringify(input)).toBe(before)
  })

  it("floors burn outputs and minimums with no removal fee", () => {
    const quote = quoteRemoveLiquidity(options())
    expect(quote.output1.quantity).toBe("0.0003 LIQETH")
    expect(quote.output2.quantity).toBe("0.000006 WIRE")
    expect(quote.minimum1.quantity).toBe("0.0002 LIQETH")
    expect(quote.minimum2.quantity).toBe("0.000005 WIRE")
  })

  it("settles shadow yield before pricing either direction, including owed WIRE", () => {
    const input = options()
    input.pool.yield_leg = { contract: "sysio.liq", sym: "4,LIQETH" }
    expect(() => quoteAddLiquidity(input)).toThrow("holder and index")
    input.yield = {
      account: {
        balance: "0.0012 LIQETH",
        index_checkpoint: "1000000000000",
        owed_wire: "10"
      },
      index: { index: "2000000000000", pot: "100", carry: 0 }
    }
    const add = quoteAddLiquidity(input),
      remove = quoteRemoveLiquidity(input)
    expect(add.accruedYield.quantity).toBe("0.000022 WIRE")
    expect(add.input2.quantity).toBe("0.000015 WIRE")
    expect(remove.output2.quantity).toBe("0.000014 WIRE")
  })

  it.each(["0.00 LP", "-0.01 LP", "0.010 LP", "0.01 OTHER"])(
    "rejects invalid exact shares %s",
    shares => {
      expect(() => quoteAddLiquidity({ ...options(), shares })).toThrow()
      expect(() => quoteRemoveLiquidity({ ...options(), shares })).toThrow()
    }
  )

  it("permits exactly the locked floor but rejects draining or burning locked shares", () => {
    expect(() =>
      quoteRemoveLiquidity({ ...options(), shares: "0.02 LP" })
    ).not.toThrow()
    expect(() =>
      quoteRemoveLiquidity({ ...options(), shares: "0.03 LP" })
    ).toThrow("locked shares")
    const input = options()
    input.pool.locked_shares = "0.02 LP"
    expect(() => quoteRemoveLiquidity({ ...input, shares: "0.02 LP" })).toThrow(
      "locked shares"
    )
    input.pool.max_supply = "0.03 LP"
    expect(() => quoteAddLiquidity(input)).toThrow("maximum supply")
  })

  it.each([-1, 0.5, 10000, NaN])(
    "rejects invalid tolerance %s",
    slippageBps => {
      expect(() => quoteAddLiquidity({ ...options(), slippageBps })).toThrow(
        "tolerance"
      )
      expect(() => quoteRemoveLiquidity({ ...options(), slippageBps })).toThrow(
        "tolerance"
      )
    }
  )

  it("handles precision and quantities above Number.MAX_SAFE_INTEGER exactly", () => {
    const input = options()
    input.pool.supply = "100000000.000000000 LP"
    input.pool.max_supply = "1000000000.000000000 LP"
    input.pool.locked_shares = "0.000000001 LP"
    input.pool.pool1.quantity = "100000000.000000001 LIQETH"
    input.pool.pool2.quantity = "200000000.000000001 WIRE"
    input.shares = "10000000.000000000 LP"
    const add = quoteAddLiquidity(input),
      remove = quoteRemoveLiquidity(input)
    expect(add.input1.quantity).toBe("10001000.000000002 LIQETH")
    expect(remove.output1.quantity).toBe("10000000.000000000 LIQETH")
    expect(
      BigInt(Asset.from(add.input1.quantity).units.toString())
    ).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER))
  })

  it("rejects malformed pool supply, reserves and yield state", () => {
    const input = options()
    input.pool.locked_shares = "0.04 LP"
    expect(() => quoteAddLiquidity(input)).toThrow("supply bounds")
    input.pool.locked_shares = "0.01 OTHER"
    expect(() => quoteRemoveLiquidity(input)).toThrow("symbol mismatch")
    input.pool.locked_shares = "0.01 LP"
    input.pool.pool1.quantity = "0.0000 LIQETH"
    expect(() => quoteAddLiquidity(input)).toThrow("positive")
    input.pool.pool1.quantity = "0.0010 LIQETH"
    input.pool.yield_leg = { contract: "sysio.liq", sym: "4,LIQETH" }
    input.yield = {
      account: null,
      index: null
    }
    expect(quoteAddLiquidity(input).accruedYield.quantity).toBe("0.000000 WIRE")
    input.pool.yield_leg = { contract: "sysio.token", sym: "6,WIRE" }
    expect(() => quoteRemoveLiquidity(input)).toThrow("first pool leg")
  })

  it("keeps zero-tolerance bounds exact and makes dust outputs explicit", () => {
    const input = options()
    input.slippageBps = 0
    const add = quoteAddLiquidity(input),
      remove = quoteRemoveLiquidity(input)
    expect(add.maximum1).toEqual(add.input1)
    expect(add.maximum2).toEqual(add.input2)
    expect(remove.minimum1).toEqual(remove.output1)
    expect(remove.minimum2).toEqual(remove.output2)
    input.pool.pool1.quantity = "0.0001 LIQETH"
    expect(quoteRemoveLiquidity(input).output1.quantity).toBe("0.0000 LIQETH")
  })

  it("rejects deposits or tolerance bounds outside the asset range", () => {
    const input = options()
    input.pool.pool1.quantity = "4611686018427387903 LIQETH"
    expect(() => quoteAddLiquidity(input)).toThrow("asset range")
    input.pool.pool1.quantity = "4611686018427387904 LIQETH"
    expect(() => quoteRemoveLiquidity(input)).toThrow("integer range")
  })
})
