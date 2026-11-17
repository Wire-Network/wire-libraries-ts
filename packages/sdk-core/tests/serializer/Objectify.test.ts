import { Name } from "@wireio/sdk-core/chain/Name"
import { Serializer } from "@wireio/sdk-core/serializer"

const ACCOUNT_NAME = "alice"
const NUMBER_VALUE = 42
const STRING_VALUE = "memo"

describe("Serializer.objectify", () => {
  it.each([true, false, NUMBER_VALUE, STRING_VALUE, null])(
    "keeps %p as is",
    value => {
      expect(Serializer.objectify(value as any)).toBe(value)
    }
  )

  it("replaces values with toJSON by their JSON form", () => {
    expect(Serializer.objectify(Name.from(ACCOUNT_NAME))).toBe(ACCOUNT_NAME)
  })

  it("walks arrays and nested objects", () => {
    expect(
      Serializer.objectify({
        names: [Name.from(ACCOUNT_NAME)],
        nested: { count: NUMBER_VALUE, flag: true, memo: STRING_VALUE }
      } as any)
    ).toEqual({
      names: [ACCOUNT_NAME],
      nested: { count: NUMBER_VALUE, flag: true, memo: STRING_VALUE }
    })
  })

  it("maps values with no JSON form to undefined", () => {
    expect(
      Serializer.objectify({ callback: () => NUMBER_VALUE } as any)
    ).toEqual({ callback: undefined })
  })
})
