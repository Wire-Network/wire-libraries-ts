import { UInt128 } from "@wireio/sdk-core/chain/Integer"
import { SampleUsage } from "@wireio/sdk-core"

/** Minimal sampled usage used by REX / PowerUp pricing helpers. */
export function createSampleUsage(
  overrides: Partial<SampleUsage> = {}
): SampleUsage {
  return {
    account: {} as SampleUsage["account"],
    cpu: UInt128.from(100_000_000),
    net: UInt128.from(100_000_000),
    ...overrides
  }
}
