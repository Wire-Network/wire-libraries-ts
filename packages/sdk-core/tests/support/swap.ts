import { contracts, SysioContracts } from "@wireio/sdk-core"

/** Fixed nine-decimal depot pool, independent of a live endpoint or deployment. */
export function createSwapPool(
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

/** Pool holder includes deposits in addition to the pool's reserve. */
export function createSwapYieldSnapshot(): contracts.sysio.swap.SwapYieldSnapshot {
  return {
    account: {
      balance: "12.000000000 LIQETH",
      index_checkpoint: "1000000000000",
      owed_wire: "1000000000"
    },
    index: { index: "1500000000000", pot: "7000000000", carry: 0 }
  }
}
