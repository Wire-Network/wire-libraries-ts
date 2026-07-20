import { UInt128 } from "@wireio/sdk-core/chain/Integer"
import { BNPrecision, Resources } from "@wireio/sdk-core"
import BN from "bn.js"

/** Account shape required by `Resources.getSampledUsage`. */
function createAccountObject(overrides: Record<string, unknown> = {}) {
  return {
    cpu_limit: { max: UInt128.from(200_000) },
    net_limit: { max: UInt128.from(1_048_576) },
    cpu_weight: UInt128.from(10_000),
    net_weight: UInt128.from(20_000),
    ...overrides
  }
}

describe("Resources", () => {
  test("throws when neither url nor api is provided", () => {
    expect(() => new Resources({} as any)).toThrow("Missing url or api client")
  })

  test("accepts an injected api client and default sample settings", () => {
    const api = { v1: { chain: {} } } as any
    const resources = new Resources({ api })

    expect(resources.api).toBe(api)
    expect(resources.sampleAccount).toBe("greymassfuel")
    expect(resources.symbol).toBe("4,SYS")
    expect(resources.v1.ram).toBeDefined()
    expect(resources.v1.rex).toBeDefined()
    expect(resources.v1.powerup).toBeDefined()
  })

  test("honors sampleAccount and symbol overrides", () => {
    const resources = new Resources({
      api: { v1: { chain: {} } } as any,
      sampleAccount: "fuel.sample",
      symbol: "4,WIRE"
    })

    expect(resources.sampleAccount).toBe("fuel.sample")
    expect(resources.symbol).toBe("4,WIRE")
  })

  test("BNPrecision is 1e8", () => {
    expect(BNPrecision.eq(new BN(100_000_000))).toBe(true)
  })

  test("getSampledUsage samples the configured account and ceil-divides weights", async () => {
    const account = createAccountObject()
    const getAccount = jest.fn(async () => account)
    const resources = new Resources({
      api: {
        v1: {
          chain: {
            get_account: getAccount
          }
        }
      } as any,
      sampleAccount: "fuel.sample"
    })

    const sample = await resources.getSampledUsage()

    expect(getAccount).toHaveBeenCalledWith("fuel.sample")
    expect(sample.account).toBe(account)
    expect(sample.cpu).toBeInstanceOf(UInt128)
    expect(sample.net).toBeInstanceOf(UInt128)

    // Mirror Resources.divCeil: (limit * BNPrecision) / weight, then
    // subtract one when there is a remainder and the quotient is > 1.
    const expectedCpu = divCeilSample(
      account.cpu_limit.max.value,
      account.cpu_weight.value
    )
    const expectedNet = divCeilSample(
      account.net_limit.max.value,
      account.net_weight.value
    )

    expect(Number(sample.cpu)).toBe(Number(expectedCpu))
    expect(Number(sample.net)).toBe(Number(expectedNet))
  })
})

/** Local copy of `Resources` sampling math for assertion expected values. */
function divCeilSample(limit: BN, weight: BN): BN {
  const num = limit.mul(BNPrecision)
  let quotient = num.div(weight)
  if (num.mod(weight).gtn(0) && quotient.gtn(1)) {
    quotient = quotient.subn(1)
  }
  return quotient
}
