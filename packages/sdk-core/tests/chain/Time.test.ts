import { TimePoint, TimePointSec, BlockTimestamp } from "@wireio/sdk-core/chain/Time"
import { BLOCK_TIMESTAMP_EPOCH_MS, BLOCK_TIMESTAMP_INTERVAL_MS } from "@wireio/sdk-core/chain/constants"

describe("Time", () => {
  describe("TimePointSec", () => {
    test("from ISO string creates a valid instance", () => {
      const tp = TimePointSec.from("2024-01-01T00:00:00")
      expect(tp).toBeInstanceOf(TimePointSec)
    })

    test("toDate roundtrips from ISO string", () => {
      const tp = TimePointSec.from("2024-01-01T00:00:00")
      const date = tp.toDate()
      expect(date.toISOString()).toBe("2024-01-01T00:00:00.000Z")
    })

    test("toMilliseconds returns correct ms", () => {
      const tp = TimePointSec.from("2024-01-01T00:00:00")
      const expected = Date.parse("2024-01-01T00:00:00Z")
      expect(tp.toMilliseconds()).toBe(expected)
    })

    test("toString returns ISO string without milliseconds", () => {
      const tp = TimePointSec.from("2024-01-01T00:00:00")
      expect(tp.toString()).toBe("2024-01-01T00:00:00")
    })

    test("equals method works correctly", () => {
      const tp1 = TimePointSec.from("2024-01-01T00:00:00")
      const tp2 = TimePointSec.from("2024-01-01T00:00:00")
      expect(tp1.equals(tp2)).toBe(true)
    })

    test("equals returns false for different times", () => {
      const tp1 = TimePointSec.from("2024-01-01T00:00:00")
      const tp2 = TimePointSec.from("2024-06-15T12:00:00")
      expect(tp1.equals(tp2)).toBe(false)
    })
  })

  describe("TimePoint", () => {
    test("fromMilliseconds roundtrips", () => {
      const tp = TimePoint.fromMilliseconds(1000)
      expect(tp.toMilliseconds()).toBe(1000)
    })

    test("fromMilliseconds with larger value", () => {
      const ms = 1704067200000
      const tp = TimePoint.fromMilliseconds(ms)
      expect(tp.toMilliseconds()).toBe(ms)
    })
  })

  describe("BlockTimestamp", () => {
    test("from string creates a valid instance", () => {
      const bt = BlockTimestamp.from("2025-01-01T00:00:00")
      expect(bt).toBeInstanceOf(BlockTimestamp)
    })

    test("epoch date produces slot 0", () => {
      const epochDate = new Date(BLOCK_TIMESTAMP_EPOCH_MS)
      const bt = BlockTimestamp.fromMilliseconds(epochDate.getTime())
      expect(bt.toMilliseconds()).toBe(BLOCK_TIMESTAMP_EPOCH_MS)
    })

    test("epoch + one interval produces slot 1", () => {
      const bt = BlockTimestamp.fromMilliseconds(BLOCK_TIMESTAMP_EPOCH_MS + BLOCK_TIMESTAMP_INTERVAL_MS)
      expect(bt.toMilliseconds()).toBe(BLOCK_TIMESTAMP_EPOCH_MS + BLOCK_TIMESTAMP_INTERVAL_MS)
    })

    test("roundtrips through toDate", () => {
      const bt = BlockTimestamp.from("2025-01-01T00:00:00")
      const date = bt.toDate()
      expect(date.getUTCFullYear()).toBe(2025)
      expect(date.getUTCMonth()).toBe(0)
      expect(date.getUTCDate()).toBe(1)
    })

    test("fromMilliseconds and toMilliseconds roundtrip", () => {
      const ms = BLOCK_TIMESTAMP_EPOCH_MS + 5000 // epoch + 5 seconds
      const bt = BlockTimestamp.fromMilliseconds(ms)
      expect(bt.toMilliseconds()).toBe(ms)
    })

    test("uses correct epoch (Jan 1, 2025)", () => {
      const jan1_2025 = Date.parse("2025-01-01T00:00:00Z")
      expect(BLOCK_TIMESTAMP_EPOCH_MS).toBe(jan1_2025)
    })

    test("uses 500ms interval", () => {
      expect(BLOCK_TIMESTAMP_INTERVAL_MS).toBe(500)
    })

    test("equals method works correctly", () => {
      const bt1 = BlockTimestamp.from("2025-01-01T00:00:00")
      const bt2 = BlockTimestamp.from("2025-01-01T00:00:00")
      expect(bt1.equals(bt2)).toBe(true)
    })

    test("equals returns false for different times", () => {
      const bt1 = BlockTimestamp.from("2025-01-01T00:00:00")
      const bt2 = BlockTimestamp.from("2025-06-15T12:00:00")
      expect(bt1.equals(bt2)).toBe(false)
    })

    test("toString returns ISO-like string", () => {
      const bt = BlockTimestamp.from("2025-01-01T00:00:00")
      expect(bt.toString()).toContain("2025-01-01")
    })

    test("slot calculation matches formula: (ms - epoch) / interval", () => {
      const ms = BLOCK_TIMESTAMP_EPOCH_MS + 10000 // 10 seconds past epoch
      const bt = BlockTimestamp.fromMilliseconds(ms)
      const expectedSlot = Math.round((ms - BLOCK_TIMESTAMP_EPOCH_MS) / BLOCK_TIMESTAMP_INTERVAL_MS)
      expect(Number(bt.value)).toBe(expectedSlot)
    })
  })
})
