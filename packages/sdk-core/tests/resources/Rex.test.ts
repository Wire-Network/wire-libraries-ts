import { Asset } from "@wireio/sdk-core/chain/Asset"
import { Resources, REXState } from "@wireio/sdk-core"
import { createSampleUsage } from "../support/resources"

/** Canonical REX pool row for pricing and exchange helpers. */
function createRexState(
  overrides: Record<string, unknown> = {}
): InstanceType<typeof REXState> {
  return REXState.from({
    version: 0,
    total_lent: "1000.0000 SYS",
    total_unlent: "9000.0000 SYS",
    total_rent: "100.0000 SYS",
    total_lendable: "10000.0000 SYS",
    total_rex: "10000.0000 REX",
    namebid_proceeds: "0.0000 SYS",
    loan_num: 1,
    ...overrides
  })
}

/** Mocked `Resources` parent that returns a fixed `rexpool` table row. */
function createRexResources(state = createRexState()) {
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

describe("REXState", () => {
  test("reserved is the lent / lendable ratio", () => {
    expect(createRexState().reserved).toBe(0.1)
  })

  test("symbol and precision come from total_lent", () => {
    const state = createRexState()
    expect(state.symbol.name).toBe("SYS")
    expect(state.precision).toBe(4)
  })

  test("value is (lent + unlent) / total_rex in units", () => {
    // (10000000 + 90000000) / 100000000 = 1
    expect(createRexState().value).toBe(1)
  })

  test("exchange converts REX into system tokens at the pool rate", () => {
    const exchanged = createRexState().exchange(Asset.from("1.0000 REX"))
    expect(exchanged.toString()).toBe("1.0000 SYS")
  })

  test("price_per returns a positive SYS fee for sampled CPU", () => {
    const price = createRexState().price_per(createSampleUsage(), 1000)
    expect(typeof price).toBe("number")
    expect(price).toBeGreaterThan(0)
  })

  test("price_per scales linearly with the requested unit count", () => {
    const state = createRexState()
    const sample = createSampleUsage()
    expect(state.price_per(sample, 2000)).toBeCloseTo(
      state.price_per(sample, 1000) * 2,
      8
    )
  })
})

describe("REXAPI", () => {
  test("get_state reads sysio/sysio/rexpool and returns the first row", async () => {
    const { resources, getTableRows, state } = createRexResources()
    const result = await resources.v1.rex.get_state()

    expect(result).toBe(state)
    expect(getTableRows).toHaveBeenCalledWith({
      code: "sysio",
      scope: "sysio",
      table: "rexpool",
      type: REXState
    })
  })
})
