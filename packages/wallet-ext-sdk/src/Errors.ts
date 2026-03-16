export class WireWalletError extends Error {
  constructor(
    message: string,
    public code: number
  ) {
    super(message)
    this.name = "WireWalletError"
  }
}

export class WalletNotFoundError extends WireWalletError {
  constructor() {
    super("Wire Wallet extension not found. Please install it.", 4001)
    this.name = "WalletNotFoundError"
  }
}

export class WalletLockedError extends WireWalletError {
  constructor() {
    super("Wire Wallet is locked. Please unlock it first.", 4002)
    this.name = "WalletLockedError"
  }
}

export class UserRejectedError extends WireWalletError {
  constructor() {
    super("User rejected the request.", 4100)
    this.name = "UserRejectedError"
  }
}
