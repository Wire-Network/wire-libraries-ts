import {
  WireWalletError,
  WalletNotFoundError,
  WalletLockedError,
  UserRejectedError,
} from "@wireio/wallet-ext-sdk"

describe("WireWalletError", () => {
  test("has correct name, message, and code", () => {
    const error = new WireWalletError("test message", 9999)
    expect(error.name).toBe("WireWalletError")
    expect(error.message).toBe("test message")
    expect(error.code).toBe(9999)
  })

  test("extends Error", () => {
    const error = new WireWalletError("test", 1)
    expect(error).toBeInstanceOf(Error)
  })
})

describe("WalletNotFoundError", () => {
  test("has code 4001", () => {
    const error = new WalletNotFoundError()
    expect(error.code).toBe(4001)
  })

  test("has correct name", () => {
    const error = new WalletNotFoundError()
    expect(error.name).toBe("WalletNotFoundError")
  })

  test("has descriptive message", () => {
    const error = new WalletNotFoundError()
    expect(error.message).toContain("not found")
  })

  test("extends WireWalletError", () => {
    const error = new WalletNotFoundError()
    expect(error).toBeInstanceOf(WireWalletError)
  })

  test("extends Error", () => {
    const error = new WalletNotFoundError()
    expect(error).toBeInstanceOf(Error)
  })
})

describe("WalletLockedError", () => {
  test("has code 4002", () => {
    const error = new WalletLockedError()
    expect(error.code).toBe(4002)
  })

  test("has correct name", () => {
    const error = new WalletLockedError()
    expect(error.name).toBe("WalletLockedError")
  })

  test("has descriptive message", () => {
    const error = new WalletLockedError()
    expect(error.message).toContain("locked")
  })

  test("extends WireWalletError", () => {
    const error = new WalletLockedError()
    expect(error).toBeInstanceOf(WireWalletError)
  })

  test("extends Error", () => {
    const error = new WalletLockedError()
    expect(error).toBeInstanceOf(Error)
  })
})

describe("UserRejectedError", () => {
  test("has code 4100", () => {
    const error = new UserRejectedError()
    expect(error.code).toBe(4100)
  })

  test("has correct name", () => {
    const error = new UserRejectedError()
    expect(error.name).toBe("UserRejectedError")
  })

  test("has descriptive message", () => {
    const error = new UserRejectedError()
    expect(error.message).toContain("rejected")
  })

  test("extends WireWalletError", () => {
    const error = new UserRejectedError()
    expect(error).toBeInstanceOf(WireWalletError)
  })

  test("extends Error", () => {
    const error = new UserRejectedError()
    expect(error).toBeInstanceOf(Error)
  })
})
