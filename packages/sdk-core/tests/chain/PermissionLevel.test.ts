import { PermissionLevel } from "@wireio/sdk-core/chain/PermissionLevel"
import { Name } from "@wireio/sdk-core/chain/Name"

describe("PermissionLevel", () => {
  describe("from string", () => {
    it("parses 'sysio@active' correctly", () => {
      const perm = PermissionLevel.from("sysio@active")
      expect(String(perm.actor)).toBe("sysio")
      expect(String(perm.permission)).toBe("active")
    })

    it("rejects malformed permission level strings", () => {
      for (const value of ["alice@@active", "alice@", "@active", "alice"]) {
        expect(() => PermissionLevel.from(value)).toThrow(
          "Invalid permission level string"
        )
      }
    })
  })

  describe("from object", () => {
    it("creates from actor/permission object", () => {
      const perm = PermissionLevel.from({
        actor: "sysio",
        permission: "active"
      })
      expect(String(perm.actor)).toBe("sysio")
      expect(String(perm.permission)).toBe("active")
    })

    it("rejects empty actor or permission object values", () => {
      expect(() =>
        PermissionLevel.from({ actor: "", permission: "active" })
      ).toThrow("Invalid permission level string")
      expect(() =>
        PermissionLevel.from({ actor: "alice", permission: "" })
      ).toThrow("Invalid permission level string")
    })
  })

  describe("field types", () => {
    it("actor and permission are Name instances", () => {
      const perm = PermissionLevel.from("sysio@active")
      expect(perm.actor).toBeInstanceOf(Name)
      expect(perm.permission).toBeInstanceOf(Name)
    })
  })

  describe("equals", () => {
    it("returns true for equal permission levels", () => {
      const a = PermissionLevel.from("sysio@active")
      const b = PermissionLevel.from("sysio@active")
      expect(a.equals(b)).toBe(true)
    })

    it("returns false for different permission levels", () => {
      const a = PermissionLevel.from("sysio@active")
      const b = PermissionLevel.from("sysio@owner")
      expect(a.equals(b)).toBe(false)
    })

    it("accepts string argument", () => {
      const perm = PermissionLevel.from("sysio@active")
      expect(perm.equals("sysio@active")).toBe(true)
    })
  })

  describe("toString", () => {
    it("returns 'sysio@active'", () => {
      const perm = PermissionLevel.from("sysio@active")
      expect(perm.toString()).toBe("sysio@active")
    })

    it("returns correct format for other values", () => {
      const perm = PermissionLevel.from("alice@owner")
      expect(perm.toString()).toBe("alice@owner")
    })
  })
})
