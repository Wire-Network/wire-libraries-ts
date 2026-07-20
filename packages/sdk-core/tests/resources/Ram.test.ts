import { Asset } from "@wireio/sdk-core/chain/Asset"
import { Int64 } from "@wireio/sdk-core/chain/Integer"
import { Resources, RAMState } from "@wireio/sdk-core"

/** Canonical RAM market row used by `sysio.system` bancor pricing tests. */
function createRamState(
  overrides: Record<string, unknown> = {}
): InstanceType<typeof RAMState> {
  return RAMState.from({
    supply: "10000000000.0000 RAMCORE",
    base: {
      balance: "10000000000.0000 RAM",
      weight: "0.50000000000000000"
    },
    quote: {
      balance: "10000.0000 SYS",
      weight: "0.50000000000000000"
    },
    ...overrides
  })
}

/** Mocked `Resources` parent that returns a fixed `rammarket` table row. */
function createRamResources(state = createRamState()) {
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

describe("RAMState", () => {
  test("get_input ceil-divides quote * value by (base - value)", () => {
    const state = createRamState()
    // ceil((100 * 10) / (1000 - 10)) = ceil(1.0101...) = 2
    expect(
      Number(state.get_input(Int64.from(1000), Int64.from(100), Int64.from(10)))
    ).toBe(2)
  })

  test("price_per returns a SYS asset for the requested byte count", () => {
    const price = createRamState().price_per(1024)
    expect(price).toBeInstanceOf(Asset)
    expect(price.symbol.name).toBe("SYS")
    expect(price.units.value.gtn(0)).toBe(true)
  })

  test("price_per_kb prices one kilobyte as 1000 bytes", () => {
    const state = createRamState()
    expect(state.price_per_kb(1).equals(state.price_per(1000))).toBe(true)
  })

  test("price_per scales up for larger byte requests on a shallow market", () => {
    const state = createRamState({
      base: {
        balance: "100000.0000 RAM",
        weight: "0.50000000000000000"
      },
      quote: {
        balance: "10000.0000 SYS",
        weight: "0.50000000000000000"
      }
    })
    expect(
      state.price_per(20_000).units.value.gt(state.price_per(1_000).units.value)
    ).toBe(true)
  })
})

describe("RAMAPI", () => {
  test("get_state reads sysio/sysio/rammarket and returns the first row", async () => {
    const { resources, getTableRows, state } = createRamResources()
    const result = await resources.v1.ram.get_state()

    expect(result).toBe(state)
    expect(getTableRows).toHaveBeenCalledWith({
      code: "sysio",
      scope: "sysio",
      table: "rammarket",
      type: RAMState
    })
  })
})
