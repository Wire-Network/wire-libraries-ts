import { contracts, SysioContracts } from "@wireio/sdk-core"

const { quoteSwap, SwapQuoteConstants } = contracts.sysio.swap

/** Fixed nine-decimal depot pool, independent of a live endpoint or deployment. */
function pool(
  overrides: Partial<SysioContracts.SysioSwapCurrencyStatsType> = {}
): SysioContracts.SysioSwapCurrencyStatsType {
  return {
    supply: "10.000000000 LIQETHP",
    max_supply: "1000000.000000000 LIQETHP",
    issuer: "sysio.swap",
    pool1: { contract: "sysio.liq", quantity: "10.000000000 LIQETH" },
    pool2: { contract: "sysio.token", quantity: "20.000000000 WIRE" },
    fee: 30,
    fee_authority: "sysio",
    locked_shares: "0.000000000 LIQETHP",
    conversion_horizon_sec: 30,
    depth_cap_bps: 3000,
    clip_floor: 1000,
    last_tick_depth: 0,
    last_tick: "2026-10-07T00:00:00",
    ...overrides
  }
}

/** One LIQ input; callers own tolerance and all public state. */
function options(): contracts.sysio.swap.SwapQuoteOptions {
  return {
    pool: pool(),
    input: { contract: "sysio.liq", quantity: "1.000000000 LIQETH" },
    slippageBps: 50
  }
}

/** Pool holder includes deposits in addition to the pool's reserve. */
function yieldState(): contracts.sysio.swap.SwapYieldSnapshot {
  return {
    account: {
      balance: "12.000000000 LIQETH",
      index_checkpoint: "1000000000000",
      owed_wire: "1000000000"
    },
    index: { index: "1500000000000", pot: "7000000000", carry: 0 }
  }
}

describe("depot swap quote", () => {
  test("floors the constant product, output fee and minimum separately", () => {
    const input = options(),
      before = JSON.stringify(input),
      result = quoteSwap(input)
    expect(result).toEqual({
      grossOutput: { contract: "sysio.token", quantity: "1.818181818 WIRE" },
      fee: { contract: "sysio.token", quantity: "0.005454545 WIRE" },
      output: { contract: "sysio.token", quantity: "1.812727273 WIRE" },
      minimumOutput: { contract: "sysio.token", quantity: "1.803663636 WIRE" },
      accruedYield: { contract: "sysio.token", quantity: "0.000000000 WIRE" }
    })
    expect(JSON.stringify(input)).toBe(before)
  })

  test("quotes the reverse direction in the output token's own precision", () => {
    const result = quoteSwap({
      ...options(),
      input: { contract: "sysio.token", quantity: "1.000000000 WIRE" }
    })
    expect(result.grossOutput.quantity).toBe("0.476190476 LIQETH")
    expect(result.output).toEqual({
      contract: "sysio.liq",
      quantity: "0.474761905 LIQETH"
    })
  })

  test("accrues the whole swap holder's pending and banked yield before pricing either direction", () => {
    const input = options()
    input.pool.yield_leg = { contract: "sysio.liq", sym: "9,LIQETH" }
    input.yield = yieldState()
    expect(quoteSwap(input).accruedYield.quantity).toBe("7.000000000 WIRE")
    expect(quoteSwap(input).grossOutput.quantity).toBe("2.454545454 WIRE")
    input.input = { contract: "sysio.token", quantity: "1.000000000 WIRE" }
    expect(quoteSwap(input).grossOutput.quantity).toBe("0.357142857 LIQETH")
  })

  test.each([null, { index: "0", pot: 0, carry: 0 }])(
    "matches the contract's absent/zero index short circuit",
    index => {
      const input = options()
      input.pool.yield_leg = { contract: "sysio.liq", sym: "9,LIQETH" }
      input.yield = { ...yieldState(), index }
      expect(quoteSwap(input).accruedYield.quantity).toBe("0.000000000 WIRE")
    }
  )

  test("requires an explicit yield snapshot and accepts a verified absent holder", () => {
    const input = options()
    input.pool.yield_leg = { contract: "sysio.liq", sym: "9,LIQETH" }
    expect(() => quoteSwap(input)).toThrow(/snapshot/)
    input.yield = { account: null, index: yieldState().index }
    expect(quoteSwap(input).accruedYield.quantity).toBe("0.000000000 WIRE")
  })

  test.each([0, 1, 30, 9999])(
    "honors the one-unit fee floor for fee %s with zero-precision tokens",
    fee => {
      const input = options()
      input.pool = pool({
        pool1: { contract: "sysio.liq", quantity: "10 LIQETH" },
        pool2: { contract: "sysio.token", quantity: "20 WIRE" },
        fee
      })
      input.input.quantity = "1 LIQETH"
      const result = quoteSwap(input)
      expect(result.grossOutput.quantity).toBe("1 WIRE")
      expect(result.fee.quantity).toBe(fee ? "1 WIRE" : "0 WIRE")
      expect(result.output.quantity).toBe(fee ? "0 WIRE" : "1 WIRE")
    }
  )

  test("keeps zero output and zero minimum explicit for dust", () => {
    const input = options()
    input.input = { contract: "sysio.token", quantity: "0.000000001 WIRE" }
    expect(quoteSwap(input).output.quantity).toBe("0.000000000 LIQETH")
    expect(quoteSwap(input).minimumOutput.quantity).toBe("0.000000000 LIQETH")
  })

  test("preserves units above Number.MAX_SAFE_INTEGER", () => {
    const input = options()
    input.pool = pool({
      pool1: { contract: "sysio.liq", quantity: "10000000.000000000 LIQETH" },
      pool2: { contract: "sysio.token", quantity: "10000000.000000000 WIRE" },
      fee: 0
    })
    input.input.quantity = "9007199.254740993 LIQETH"
    expect(quoteSwap(input).grossOutput.quantity).toBe("4738835.603301372 WIRE")
  })

  test.each([-1, 10000, 0.5, NaN])(
    "rejects invalid fee/tolerance %s",
    value => {
      const input = options()
      expect(() => quoteSwap({ ...input, slippageBps: value })).toThrow(
        /tolerance/
      )
      expect(() => quoteSwap({ ...input, pool: pool({ fee: value }) })).toThrow(
        /fee/
      )
    }
  )

  test.each([
    { contract: "sysio.token", quantity: "1.000000000 LIQETH" },
    { contract: "sysio.liq", quantity: "1.0000 LIQETH" },
    { contract: "sysio.liq", quantity: "0.000000000 LIQETH" },
    { contract: "sysio.liq", quantity: "-1.000000000 LIQETH" }
  ])("rejects mismatched or nonpositive input %s", input => {
    expect(() => quoteSwap({ ...options(), input })).toThrow()
  })

  test("rejects duplicate legs, empty reserves and asset overflow", () => {
    const input = options()
    expect(() =>
      quoteSwap({ ...input, pool: pool({ pool2: input.pool.pool1 }) })
    ).toThrow(/exactly one/)
    expect(() =>
      quoteSwap({
        ...input,
        pool: pool({
          pool2: { contract: "sysio.token", quantity: "0.000000000 WIRE" }
        })
      })
    ).toThrow(/positive/)
    input.pool.pool1.quantity = "4611686018.427387903 LIQETH"
    expect(() => quoteSwap(input)).toThrow(/asset range/)
  })

  test("rejects invalid shadow state rather than silently pricing without yield", () => {
    const input = options()
    input.pool.yield_leg = { contract: "sysio.liq", sym: "9,LIQETH" }
    input.yield = yieldState()
    input.yield.account.owed_wire = Number.MAX_SAFE_INTEGER + 1
    expect(() => quoteSwap(input)).toThrow(/unsafe integer/)
    input.yield = yieldState()
    input.yield.account.index_checkpoint = "2000000000000"
    expect(() => quoteSwap(input)).toThrow(/precedes/)
    input.yield = yieldState()
    input.yield.account.balance = "12.000000000 LIQSOL"
    expect(() => quoteSwap(input)).toThrow(/symbol mismatch/)
    input.yield = yieldState()
    input.yield.index.index = SwapQuoteConstants.MaxYieldIndex.toString()
    expect(() => quoteSwap(input)).toThrow(/uint128/)
    input.yield.index.index = (SwapQuoteConstants.MaxYieldIndex + 1n).toString()
    expect(() => quoteSwap(input)).toThrow(/integer range/)
  })
})
