import "source-map-support/register"
import "jest"
import { Struct } from "@wireio/sdk-core/chain/Struct"
import { Name } from "@wireio/sdk-core/chain/Name"
import { UInt64 } from "@wireio/sdk-core/chain/Integer"

@Struct.type("transfer")
class Transfer extends Struct {
  @Struct.field("name") declare from: Name
  @Struct.field("name") declare to: Name
  @Struct.field("uint64") declare amount: UInt64
}

describe("Struct", () => {
  describe("from", () => {
    it("creates an instance from a plain object", () => {
      const transfer = Transfer.from({
        from: "alice",
        to: "bob",
        amount: 100
      })
      expect(transfer).toBeInstanceOf(Transfer)
    })

    it("has correctly typed fields", () => {
      const transfer = Transfer.from({
        from: "alice",
        to: "bob",
        amount: 100
      })
      expect(transfer.from).toBeInstanceOf(Name)
      expect(transfer.to).toBeInstanceOf(Name)
      expect(String(transfer.from)).toBe("alice")
      expect(String(transfer.to)).toBe("bob")
    })
  })

  describe("equals", () => {
    it("returns true for equal structs", () => {
      const a = Transfer.from({ from: "alice", to: "bob", amount: 100 })
      const b = Transfer.from({ from: "alice", to: "bob", amount: 100 })
      expect(a.equals(b)).toBe(true)
    })

    it("returns false for different structs", () => {
      const a = Transfer.from({ from: "alice", to: "bob", amount: 100 })
      const b = Transfer.from({ from: "alice", to: "bob", amount: 200 })
      expect(a.equals(b)).toBe(false)
    })
  })

  describe("decorators", () => {
    it("registers ABI name via Struct.type", () => {
      expect((Transfer as any).abiName).toBe("transfer")
    })

    it("registers ABI fields via Struct.field", () => {
      const fields = (Transfer as any).structFields
      expect(fields).toBeDefined()
      expect(fields.length).toBe(3)
      expect(fields[0].name).toBe("from")
      expect(fields[1].name).toBe("to")
      expect(fields[2].name).toBe("amount")
    })
  })
})
