import { NestedError } from "@wireio/shared/errors/NestedError"

describe("NestedError", () => {
  it("keeps the new message and preserves the caught error as cause", () => {
    const cause = new Error("root boom")
    const error = new NestedError("wrapper failed", { cause })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("NestedError")
    expect(error.message).toBe("wrapper failed")
    // The real Error object is retained — native `.cause` AND `.causes` — so its
    // stack trace and message survive intact.
    expect(error.cause).toBe(cause)
    expect(error.causes).toEqual([cause])
    expect(error.causes[0].message).toBe("root boom")
    expect(error.causes[0].stack).toBe(cause.stack)
  })

  it("makes each cause's stack + message visible in .stack (nested-exception style)", () => {
    const inner = new Error("inner detail")
    const error = new NestedError("outer failed", { cause: inner })

    expect(error.stack).toContain("outer failed")
    expect(error.stack).toContain(NestedError.CausedByPrefix)
    // The cause's stack begins with `Error: inner detail`, so its message is kept too.
    expect(error.stack).toContain("inner detail")
    expect(error.stack).toContain(inner.stack)
  })

  it("retains every cause when given an array of causes", () => {
    const first = new Error("first")
    const second = new Error("second")
    const error = new NestedError("multi", { cause: [first, second] })

    expect(error.causes).toEqual([first, second])
    // The first is the native `.cause`; both show in the composed stack.
    expect(error.cause).toBe(first)
    expect(error.stack).toContain("first")
    expect(error.stack).toContain("second")
  })

  it("coerces a non-Error thrown value into a retained Error cause", () => {
    const error = new NestedError("boom", { cause: "a plain string throw" })

    expect(error.causes).toHaveLength(1)
    expect(error.causes[0]).toBeInstanceOf(Error)
    expect(error.causes[0].message).toBe("a plain string throw")
    expect(error.cause).toBe(error.causes[0])
  })

  it("captures structured context AND folds a summary into the message", () => {
    const error = new NestedError("invalid JSON", {
      context: { text: "{bad", schemaName: "ClusterConfig" }
    })

    expect(error.context).toEqual({ text: "{bad", schemaName: "ClusterConfig" })
    expect(error.message).toContain("text={bad")
    expect(error.message).toContain("schemaName=ClusterConfig")
  })

  it("truncates a long folded context value", () => {
    const long = "x".repeat(NestedError.ContextPreviewMaxChars + 50)
    const error = new NestedError("big", { context: { text: long } })

    expect(error.message).toContain(NestedError.TruncationSuffix)
    // The folded preview is bounded regardless of the source length.
    expect(error.message.length).toBeLessThan(
      long.length + NestedError.ContextPreviewMaxChars
    )
    // The full untruncated value is still on the structured property.
    expect(error.context.text).toBe(long)
  })

  it("renders a bigint context value without throwing (JSON.stringify would)", () => {
    const error = new NestedError("amount", { context: { amount: 5n } })
    expect(error.message).toContain("amount=5")
  })

  it("has no cause chain and an empty context when none are supplied", () => {
    const error = new NestedError("standalone")
    expect(error.causes).toEqual([])
    expect(error.cause).toBeUndefined()
    expect(error.context).toEqual({})
    expect(error.message).toBe("standalone")
  })

  it("create returns an instance; throwError throws one", () => {
    const cause = new Error("x")
    expect(NestedError.create("made", { cause })).toBeInstanceOf(NestedError)
    expect(() => NestedError.throwError("thrown", { cause })).toThrow(NestedError)
    try {
      NestedError.throwError("thrown", { cause })
    } catch (error) {
      expect((error as NestedError).causes).toEqual([cause])
    }
  })

  it("toError passes Errors through and wraps non-Errors", () => {
    const real = new Error("real")
    expect(NestedError.toError(real)).toBe(real)
    expect(NestedError.toError("str")).toBeInstanceOf(Error)
    expect(NestedError.toError("str").message).toBe("str")
  })

  it("toErrors flattens and coerces; nullish yields an empty chain", () => {
    const a = new Error("a")
    expect(NestedError.toErrors([a, "b"]).map(error => error.message)).toEqual([
      "a",
      "b"
    ])
    expect(NestedError.toErrors(null)).toEqual([])
    expect(NestedError.toErrors(a)).toEqual([a])
  })
})
