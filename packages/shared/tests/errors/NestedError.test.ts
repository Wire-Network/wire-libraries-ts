import { NestedError } from "@wireio/shared/errors/NestedError"

describe("NestedError", () => {
  it("sets message, name, and causes", () => {
    const cause = new Error("root cause")
    const error = new NestedError("wrapper", cause)

    expect(error.message).toBe("wrapper")
    expect(error.name).toBe("NestedError")
    expect(error.causes).toEqual([cause])
  })

  it("extends Error", () => {
    const error = new NestedError("wrapper")
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(NestedError)
  })

  it("flattens nested cause arrays", () => {
    const first = new Error("first")
    const second = new Error("second")
    const third = new Error("third")
    const error = new NestedError("wrapper", [first, second], third)

    expect(error.causes).toEqual([first, second, third])
  })

  it("accepts no causes", () => {
    const error = new NestedError("wrapper")

    expect(error.causes).toEqual([])
  })

  describe("create", () => {
    it("returns a NestedError with message and causes", () => {
      const cause = new Error("root cause")
      const error = NestedError.create("wrapper", cause)

      expect(error).toBeInstanceOf(NestedError)
      expect(error.message).toBe("wrapper")
      expect(error.causes).toEqual([cause])
    })
  })

  describe("throwError", () => {
    it("throws a NestedError with message and causes", () => {
      const cause = new Error("root cause")

      expect(() => NestedError.throwError("wrapper", cause)).toThrow(
        NestedError
      )
      expect(() => NestedError.throwError("wrapper", cause)).toThrow("wrapper")

      try {
        NestedError.throwError("wrapper", cause)
      } catch (error) {
        expect(error).toBeInstanceOf(NestedError)
        expect((error as NestedError).causes).toEqual([cause])
      }
    })
  })
})
