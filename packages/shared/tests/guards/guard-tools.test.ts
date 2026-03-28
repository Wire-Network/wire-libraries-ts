import {
  getValue,
  guard,
  setGuardErrorHandler
} from "@wireio/shared/guards/guard-tools"

describe("getValue", () => {
  afterEach(() => {
    setGuardErrorHandler(null)
  })

  it("returns the value from the function", () => {
    expect(getValue(() => 42)).toBe(42)
  })

  it("returns default value when function throws", () => {
    expect(
      getValue(
        () => {
          throw new Error()
        },
        "default" as any as never
      )
    ).toBe("default")
  })

  it("returns default value when function returns null", () => {
    expect(getValue(() => null, "default")).toBe("default")
  })

  it("returns promise resolving to value", async () => {
    const result = getValue(() => Promise.resolve(42))
    await expect(result).resolves.toBe(42)
  })

  it("returns promise resolving to default on rejection", async () => {
    const result = getValue(
      () => Promise.reject(new Error()),
      "default" as any as never
    )
    await expect(result).resolves.toBe("default")
  })
})

describe("guard", () => {
  afterEach(() => {
    setGuardErrorHandler(null)
  })

  it("does not throw for no-op function", () => {
    expect(() => guard(() => {})).not.toThrow()
  })

  it("does not throw when function throws", () => {
    expect(() =>
      guard(() => {
        throw new Error("fail")
      })
    ).not.toThrow()
  })
})

describe("setGuardErrorHandler", () => {
  afterEach(() => {
    setGuardErrorHandler(null)
  })

  it("sets global handler that receives errors", () => {
    const errors: Error[] = []
    setGuardErrorHandler(err => {
      errors.push(err)
    })

    getValue(() => {
      throw new Error("caught")
    }, undefined as never)

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("caught")
  })

  it("can be reset to null", () => {
    const errors: Error[] = []
    setGuardErrorHandler(err => {
      errors.push(err)
    })
    setGuardErrorHandler(null)

    getValue(() => {
      throw new Error("not caught")
    }, undefined as never)

    expect(errors).toHaveLength(0)
  })
})
