import { Name } from "@wireio/sdk-core/chain/Name"
import { UInt64 } from "@wireio/sdk-core/chain/Integer"
import { Transaction } from "@wireio/sdk-core/chain/Transaction"

describe("Name", () => {
  test("Name.from creates a valid name", () => {
    const name = Name.from("sysio")
    expect(name).toBeInstanceOf(Name)
  })

  test("toString returns the name string", () => {
    expect(Name.from("sysio").toString()).toBe("sysio")
  })

  test("equals returns true for matching string", () => {
    expect(Name.from("sysio").equals("sysio")).toBe(true)
  })

  test("equals returns true for matching Name instance", () => {
    expect(Name.from("sysio").equals(Name.from("sysio"))).toBe(true)
  })

  test("equals returns false for different name", () => {
    expect(Name.from("sysio").equals("other")).toBe(false)
  })

  test("empty name has empty toString", () => {
    const name = Name.from("")
    expect(name.toString()).toBe("")
  })

  test("valid name patterns", () => {
    expect(Name.from("a").toString()).toBe("a")
    expect(Name.from("abcde12345").toString()).toBe("abcde12345")
    expect(Name.from("a.b.c").toString()).toBe("a.b.c")
    expect(Name.from("abcdefghijkl1").toString()).toBe("abcdefghijkl1")
    expect(Name.from("............1").toString()).toBe("............1")
  })

  test("Name.from with UInt64 numeric value", () => {
    const original = Name.from("sysio")
    const fromUint = Name.from(original.value)
    expect(fromUint.toString()).toBe("sysio")
  })

  test("Name.from with UInt64.from(0) creates empty name", () => {
    const name = Name.from(UInt64.from(0))
    expect(name.toString()).toBe("")
  })

  test("isValid rejects names that would be rewritten by packing", () => {
    expect(Name.isValid("sysio.token")).toBe(true)
    expect(Name.isValid("abc!")).toBe(false)
    expect(Name.isValid("wire.tokenX")).toBe(false)
    expect(Name.isValid("abcdefghijklmn")).toBe(false)
    expect(Name.isValid("..............")).toBe(false)
    expect(Name.isValid("abc.")).toBe(false)
    expect(Name.isValid("abcdefghijklm")).toBe(false)
  })

  test("Name.from rejects non-canonical strings before packing", () => {
    for (const value of [
      "abc!",
      "wire.tokenX",
      "abcdefghijklmn",
      "..............",
      "abc.",
      "abcdefghijklm"
    ]) {
      expect(() => Name.from(value)).toThrow("Invalid name")
    }
  })

  test("Transaction.from rejects invalid action and authorization names", () => {
    const action = {
      account: "sysio.token",
      name: "transfer",
      authorization: [{ actor: "alice", permission: "active" }],
      data: ""
    }
    const transaction = {
      expiration: "1970-01-01T00:00:00.000",
      ref_block_num: 0,
      ref_block_prefix: 0,
      actions: [action]
    }

    for (const invalidAction of [
      { ...action, account: "abc!" },
      { ...action, name: "transfer." },
      {
        ...action,
        authorization: [{ actor: "alice.", permission: "active" }]
      },
      {
        ...action,
        authorization: [{ actor: "alice", permission: "active." }]
      }
    ]) {
      expect(() =>
        Transaction.from({ ...transaction, actions: [invalidAction] })
      ).toThrow("Invalid name")
    }
  })
})
