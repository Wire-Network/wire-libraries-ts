import { contracts, SysioContracts } from "@wireio/sdk-core"
import { createSwapPool } from "../../../support/swap.js"

const { getPoolTwap } = contracts.sysio.swap,
  PriceOne = 1n << 64n,
  LimbSize = 1n << 128n,
  SecondUs = 1_000_000n,
  StartTime = "2026-11-09T00:00:00.000",
  EndTime = "2026-11-09T00:00:10.000"

/** Encode a test accumulator in the producer's two uint128 limbs. */
function accumulator(
  value: bigint
): SysioContracts.SysioSwapCumulativePriceType {
  return {
    lo: (value % LimbSize).toString(),
    hi: (value / LimbSize).toString()
  }
}

/** Fixed-chain observation whose pool has ten LIQ and twenty WIRE. */
function observation(
  observedAt = StartTime
): contracts.sysio.swap.PoolPriceObservation {
  return {
    chainId: "ab".repeat(32),
    pool: createSwapPool(),
    observedAt,
    accumulator: {
      price1: accumulator(0n),
      price2: accumulator(0n),
      last_update: StartTime
    }
  }
}

describe("pool time-weighted prices", () => {
  test("projects idle pools locally, with no sync or invented zero history", () => {
    const start = observation("2026-11-09T00:00:05.000"),
      end = observation(EndTime),
      before = JSON.stringify({ start, end })
    expect(getPoolTwap({ start, end })).toEqual({
      pool1InPool2: "2",
      pool2InPool1: "0.5",
      elapsedUs: "5000000"
    })
    expect(JSON.stringify({ start, end })).toBe(before)
  })

  test("averages each direction independently across a reserve change", () => {
    const start = observation(),
      end = observation(EndTime)
    // Five seconds at 2 WIRE/LIQ, then five at 4; inverse mean is 0.375, not 1/3.
    end.pool.pool2.quantity = "40.000000000 WIRE"
    end.accumulator = {
      price1: accumulator(2n * PriceOne * 5n * SecondUs),
      price2: accumulator((PriceOne / 2n) * 5n * SecondUs),
      last_update: "2026-11-09T00:00:05.000"
    }
    expect(getPoolTwap({ start, end })).toEqual({
      pool1InPool2: "3",
      pool2InPool1: "0.375",
      elapsedUs: "10000000"
    })
  })

  test("normalizes atomic-unit accumulators to whole-token prices", () => {
    // Producer twap.hpp yields reverse Q64.64 = 92233720368547, before decimal normalization.
    const start = observation(),
      end = observation(EndTime)
    ;[start, end].forEach(value => {
      value.pool.pool1.quantity = "10.0000 LIQETH"
    })
    expect(getPoolTwap({ start, end })).toEqual({
      pool1InPool2: "2",
      pool2InPool1: "0.49999999999999589",
      elapsedUs: "10000000"
    })
  })

  test("preserves microsecond windows, limb carries and Q64.64 rounding", () => {
    const start = observation("2026-11-09T00:00:00.000001"),
      end = observation("2026-11-09T00:00:00.000003Z")
    ;[start, end].forEach(value => {
      value.accumulator.price1 = accumulator(LimbSize - 1n)
      value.accumulator.price2 = accumulator(LimbSize - 1n)
      value.accumulator.last_update = "2026-11-09T00:00:00.000001"
    })
    expect(getPoolTwap({ start, end })).toEqual({
      pool1InPool2: "2",
      pool2InPool1: "0.5",
      elapsedUs: "2"
    })
    start.pool.pool2.quantity = "30.000000000 WIRE"
    end.pool.pool2.quantity = "30.000000000 WIRE"
    expect(getPoolTwap({ start, end }).pool2InPool1).toBe(
      "0.333333333333333333"
    )
  })

  test("never retroactively includes pending yield in historical prices", () => {
    const start = observation(),
      end = observation(EndTime)
    ;[start, end].forEach(value => {
      value.pool.yield_leg = { contract: "sysio.liq", sym: "9,LIQETH" }
    })
    expect(getPoolTwap({ start, end }).pool1InPool2).toBe("2")
  })

  test("subtracts across a uint128 limb boundary", () => {
    const start = observation(),
      end = observation(EndTime)
    start.accumulator.price1 = accumulator(LimbSize - 1n)
    start.accumulator.price2 = accumulator(LimbSize - 1n)
    end.accumulator = {
      last_update: EndTime,
      price1: accumulator(LimbSize - 1n + 2n * PriceOne * 10n * SecondUs),
      price2: accumulator(LimbSize - 1n + (PriceOne / 2n) * 10n * SecondUs)
    }
    expect(getPoolTwap({ start, end }).pool1InPool2).toBe("2")
    expect(getPoolTwap({ start, end }).pool2InPool1).toBe("0.5")
  })

  test("rejects a different chain, issuer, LP symbol, contract, orientation or precision", () => {
    const start = observation()
    const changed = [
      { ...observation(EndTime), chainId: "cd".repeat(32) },
      { ...observation(EndTime), pool: createSwapPool({ issuer: "other" }) },
      {
        ...observation(EndTime),
        pool: createSwapPool({ supply: "10.000000000 OTHER" })
      },
      {
        ...observation(EndTime),
        pool: createSwapPool({
          pool1: { contract: "other", quantity: "10.000000000 LIQETH" }
        })
      },
      {
        ...observation(EndTime),
        pool: createSwapPool({
          pool1: { contract: "sysio.liq", quantity: "10.0000 LIQETH" }
        })
      },
      {
        ...observation(EndTime),
        pool: createSwapPool({
          pool1: start.pool.pool2,
          pool2: start.pool.pool1
        })
      }
    ]
    changed.forEach(end =>
      expect(() => getPoolTwap({ start, end })).toThrow(/same chain and pool/)
    )
  })

  test("rejects future updates, nonpositive windows, malformed times and regressing accumulators", () => {
    const start = observation(),
      end = observation(EndTime)
    expect(() => getPoolTwap({ start, end: start })).toThrow(/positive/)
    expect(() => getPoolTwap({ start: end, end: start })).toThrow(/positive/)
    end.observedAt = "not a chain time"
    expect(() => getPoolTwap({ start, end })).toThrow(/time/)
    end.observedAt = "2026-11-09T00:00:00.0000001"
    expect(() => getPoolTwap({ start, end })).toThrow(/time/)
    end.observedAt = EndTime
    end.accumulator.last_update = "2026-11-09T00:00:11.000"
    expect(() => getPoolTwap({ start, end })).toThrow(/precedes/)
    end.accumulator.last_update = "2026-11-08T23:59:59.000"
    expect(() => getPoolTwap({ start, end })).toThrow(/backwards/)
    end.accumulator.last_update = EndTime
    start.accumulator.price1 = accumulator(1n)
    expect(() => getPoolTwap({ start, end })).toThrow(/backwards/)
  })

  test("rejects invalid accumulator limbs, zero or impossible averages", () => {
    const start = observation(),
      end = observation(EndTime)
    end.accumulator.price1.lo = LimbSize.toString()
    expect(() => getPoolTwap({ start, end })).toThrow(/range/)
    end.accumulator.price1.lo = "-1"
    expect(() => getPoolTwap({ start, end })).toThrow(/integer/)
    end.accumulator.price1 = accumulator(0n)
    end.accumulator.last_update = EndTime
    expect(() => getPoolTwap({ start, end })).toThrow(/interval/)
    end.accumulator.price1 = accumulator(LimbSize * 10n * SecondUs)
    expect(() => getPoolTwap({ start, end })).toThrow(/interval/)
  })
})
