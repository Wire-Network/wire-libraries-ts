import { UInt128, UInt64 } from "@wireio/sdk-core/chain/Integer"
import { BNPrecision, PowerUpState, Resources } from "@wireio/sdk-core"
import { PowerUpStateResourceCPU } from "@wireio/sdk-core/resources/powerup/Cpu"
import { PowerUpStateResourceNET } from "@wireio/sdk-core/resources/powerup/Net"
import { createSampleUsage } from "../support/resources"

/** Matches `PowerUpStateResource` default block CPU limit (μs). */
const DEFAULT_BLOCK_CPU_LIMIT = 200_000
/** Matches `PowerUpStateResource` default block net limit (bytes). */
const DEFAULT_BLOCK_NET_LIMIT = 1_048_576_000
/**
 * Day-window multiplier used by PowerUp `*_per_day` helpers:
 * `limit * 2 * 60 * 60 * 24`.
 */
const POWERUP_DAY_WINDOW = 2 * 60 * 60 * 24

/** Shared PowerUp resource fields for CPU/NET fixtures. */
function powerUpResourceFields(overrides: Record<string, unknown> = {}) {
  return {
    version: 0,
    weight: "100000000000000",
    weight_ratio: "10000000000000",
    assumed_stake_weight: "1",
    initial_weight_ratio: "100000000000000",
    target_weight_ratio: "10000000000000",
    initial_timestamp: "2020-01-01T00:00:00",
    target_timestamp: "2021-01-01T00:00:00",
    exponent: "2",
    decay_secs: 86_400,
    min_price: "0.0000 SYS",
    max_price: "1000.0000 SYS",
    utilization: "0",
    adjusted_utilization: "0",
    utilization_timestamp: "2020-01-01T00:00:00",
    ...overrides
  }
}

function createCpuState(overrides: Record<string, unknown> = {}) {
  return PowerUpStateResourceCPU.from(powerUpResourceFields(overrides))
}

function createNetState(overrides: Record<string, unknown> = {}) {
  return PowerUpStateResourceNET.from(powerUpResourceFields(overrides))
}

function createPowerUpState(
  overrides: Record<string, unknown> = {}
): InstanceType<typeof PowerUpState> {
  return PowerUpState.from({
    version: 0,
    net: powerUpResourceFields(),
    cpu: powerUpResourceFields(),
    powerup_days: 1,
    min_powerup_fee: "0.0001 SYS",
    ...overrides
  })
}

/** Mocked `Resources` parent that returns a fixed `powup.state` table row. */
function createPowerUpResources(state = createPowerUpState()) {
  const getTableRows = jest.fn(async () => ({
    rows: [state],
    more: false
  }))

  const resources = new Resources({
    api: {
      v1: {
        chain: {
          get_table_rows: getTableRows
        }
      }
    } as any
  })

  return { resources, getTableRows, state }
}

describe("PowerUpStateResourceCPU", () => {
  test("us_per_day uses the default block CPU limit", () => {
    expect(createCpuState().us_per_day()).toBe(
      DEFAULT_BLOCK_CPU_LIMIT * POWERUP_DAY_WINDOW
    )
  })

  test("us_per_day honors virtual_block_cpu_limit overrides", () => {
    expect(
      createCpuState().us_per_day({
        virtual_block_cpu_limit: UInt64.from(100_000)
      })
    ).toBe(100_000 * POWERUP_DAY_WINDOW)
  })

  test("ms_per_day and per_day derive from us_per_day", () => {
    const cpu = createCpuState()
    expect(cpu.ms_per_day()).toBe(cpu.us_per_day() / 1000)
    expect(cpu.per_day()).toBe(cpu.us_per_day())
  })

  test("weight_to_us and us_to_weight round-trip with BNPrecision", () => {
    const cpu = createCpuState()
    const sample = UInt128.from(100_000_000)
    const weight = BNPrecision.toNumber()
    const us = cpu.weight_to_us(sample, weight)
    expect(us).toBe(100_000_000)
    expect(cpu.us_to_weight(sample, us)).toBe(weight)
  })

  test("frac_by_ms multiplies microseconds by 1000", () => {
    const cpu = createCpuState()
    const sample = createSampleUsage()
    expect(cpu.frac_by_ms(sample, 1)).toBe(cpu.frac_by_us(sample, 1000))
  })

  test("price_per_us returns a finite non-negative fee", () => {
    const price = createCpuState().price_per_us(createSampleUsage(), 1000)
    expect(Number.isFinite(price)).toBe(true)
    expect(price).toBeGreaterThanOrEqual(0)
  })

  test("allocated reflects the weight_ratio shift toward PowerUp", () => {
    // 1 - (1e13 / 1e13 / 100) = 0.99
    expect(createCpuState().allocated).toBeCloseTo(0.99)
  })

  test("symbol comes from min_price", () => {
    expect(createCpuState().symbol.name).toBe("SYS")
  })
})

describe("PowerUpStateResourceNET", () => {
  test("bytes_per_day uses the default block net limit", () => {
    expect(createNetState().bytes_per_day()).toBe(
      DEFAULT_BLOCK_NET_LIMIT * POWERUP_DAY_WINDOW
    )
  })

  test("kb_per_day and per_day derive from bytes_per_day", () => {
    const net = createNetState()
    expect(net.kb_per_day()).toBe(net.bytes_per_day() / 1000)
    expect(net.per_day()).toBe(net.bytes_per_day())
  })

  test("weight_to_bytes and bytes_to_weight round-trip with BNPrecision", () => {
    const net = createNetState()
    const sample = UInt128.from(100_000_000)
    const weight = BNPrecision.toNumber()
    const bytes = net.weight_to_bytes(sample, weight)
    expect(bytes).toBe(100_000_000)
    expect(net.bytes_to_weight(sample, bytes)).toBe(weight)
  })

  test("frac_by_kb multiplies bytes by 1000", () => {
    const net = createNetState()
    const sample = createSampleUsage()
    expect(net.frac_by_kb(sample, 1)).toBe(net.frac_by_bytes(sample, 1000))
  })

  test("price_per_byte returns a finite non-negative fee", () => {
    const price = createNetState().price_per_byte(createSampleUsage(), 1000)
    expect(Number.isFinite(price)).toBe(true)
    expect(price).toBeGreaterThanOrEqual(0)
  })
})

describe("PowerUpAPI", () => {
  test("get_state reads sysio//powup.state and returns the first row", async () => {
    const { resources, getTableRows, state } = createPowerUpResources()
    const result = await resources.v1.powerup.get_state()

    expect(result).toBe(state)
    expect(result).toBeInstanceOf(PowerUpState)
    expect(getTableRows).toHaveBeenCalledWith({
      code: "sysio",
      scope: "",
      table: "powup.state",
      type: PowerUpState
    })
  })
})
