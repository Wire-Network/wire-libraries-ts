import { isDefined, isPromise } from "../guards/index.js"

/**
 * Represents the current state of a Deferred promise.
 */
export enum DeferredStatus {
  PENDING = "PENDING",
  FULFILLED = "FULFILLED",
  REJECTED = "REJECTED",
  CANCELED = "CANCELED"
}

/**
 * Internal deferred state
 */
interface DeferredState<T> {
  resolve: (result?: T) => void
  reject: (err: any) => void
  isSettled: boolean
  isCancelled: boolean
  isRejected: boolean
  isFulfilled: boolean
  result: T | null
  err: Error | null
}

/**
 * A deferred promise that can be resolved or rejected
 * externally, ideal for functions like a promise timeout
 */
export class Deferred<T> {
  /**
   * Creates a deferred promise that resolves after the specified delay.
   * @param millis - The number of milliseconds to wait before resolving
   * @returns A promise that resolves after the delay
   */
  static async delay(millis: number) {
    const deferred = new Deferred<void>()
    setTimeout(() => deferred.resolve(), millis)
    await deferred.promise
  }

  /**
   * Creates a deferred promise that is immediately resolved with the given value.
   * @param value - The value to resolve the deferred promise with
   * @returns A resolved Deferred instance
   */
  static resolve<T>(value?: T): Deferred<T> {
    const deferred = new Deferred<T>()
    deferred.resolve(value)
    return deferred
  }

  /**
   * Creates a deferred promise and passes it to a callback function for external control.
   * @param callback - A function that receives the deferred instance and can resolve or reject it
   * @returns The created Deferred instance
   */
  static useCallback<T>(
    callback: (deferred: Deferred<T>) => unknown
  ): Deferred<T> {
    const deferred = new Deferred<T>()
    callback(deferred)
    return deferred
  }

  private readonly state: DeferredState<T>

  /**
   * The underlying promise that will be resolved or rejected.
   */
  readonly promise: Promise<T>

  /**
   * Creates a new Deferred instance, optionally wrapping an existing promise.
   * @param promise - An optional existing promise to wrap
   * @throws Error if the provided promise is not a valid promise
   */
  constructor(promise?: Promise<T> | undefined) {
    this.state = {
      resolve: null,
      reject: null,
      isSettled: false,
      isCancelled: false,
      isRejected: false,
      isFulfilled: false,
      result: null,
      err: null
    }

    this.promise = new Promise<T>((resolve, reject) => {
      Object.assign(this.state, {
        resolve,
        reject
      })
    })

    if (isDefined(promise)) {
      if (promise instanceof Promise || isPromise(promise)) {
        promise.then(this.state.resolve).catch(this.state.reject)
      } else {
        throw Error(
          `An existing promise was provided to Deferred constructor, but it wasn't a valid promise`
        )
      }
    }
  }

  /**
   * Checks if the deferred promise has been fulfilled.
   * @returns True if the promise has been fulfilled, false otherwise
   */
  isFulfilled(): boolean {
    return this.state.isFulfilled
  }

  /**
   * Checks if the deferred promise has been rejected.
   * @returns True if the promise has been rejected, false otherwise
   */
  isRejected(): boolean {
    return this.state.isRejected
  }

  /**
   * Checks if the deferred promise has been settled (either fulfilled or rejected).
   * @returns True if the promise has been settled, false otherwise
   */
  isSettled(): boolean {
    return this.state.isSettled
  }

  /**
   * Checks if the deferred promise has been cancelled.
   * @returns True if the promise has been cancelled, false otherwise
   */
  isCancelled(): boolean {
    return this.state.isCancelled
  }

  /**
   * Gets the current status of the deferred promise.
   * @returns The current DeferredStatus
   */
  status(): DeferredStatus {
    return this.isCancelled()
      ? DeferredStatus.CANCELED
      : this.isSettled()
        ? this.isFulfilled()
          ? DeferredStatus.FULFILLED
          : DeferredStatus.REJECTED
        : DeferredStatus.PENDING
  }

  /**
   * Cancels the deferred promise, preventing it from being resolved or rejected.
   */
  cancel(): void {
    this.state.isSettled = true
    this.state.isCancelled = true
  }

  /**
   * Resolves the deferred promise with the given result only if it hasn't been settled yet.
   * @param result - The value to resolve the promise with
   */
  resolveIfUnsettled(result?: T): void {
    if (!this.isSettled()) this.resolve(result)
  }

  /**
   * Resolves the deferred promise with the given result.
   * @param result - The value to resolve the promise with
   */
  resolve(result?: T): void {
    if (!this.state.isSettled && !this.state.isCancelled) {
      Object.assign(this.state, {
        result: result,
        isSettled: true,
        isFulfilled: true
      })
      this.state.resolve(result)
    }
  }

  /**
   * Rejects the deferred promise with the given error only if it hasn't been settled yet.
   * @param err - The error to reject the promise with
   */
  rejectIfUnsettled(err: any): void {
    if (!this.isSettled()) this.reject(err)
  }

  /**
   * Rejects the deferred promise with the given error.
   * @param err - The error to reject the promise with
   */
  reject(err: any): void {
    if (!this.state.isSettled && !this.state.isCancelled) {
      Object.assign(this.state, {
        isSettled: true,
        isRejected: true,
        err
      })

      this.state.reject(err)
    }
  }

  /**
   * Gets the error that caused the promise to be rejected.
   * @throws Error if the promise is not settled
   */
  get error() {
    return this.getError()
  }

  /**
   * Gets the result value of the fulfilled promise.
   * @throws Error if the promise is not settled
   */
  get value() {
    return this.getResult()
  }

  /**
   * Gets the error that caused the promise to be rejected.
   * @returns The error, or undefined if the promise was not rejected
   * @throws Error if the promise is not settled
   */
  getError(): Error | undefined {
    if (!this.isSettled())
      throw Error("Deferred promise is not settled, result is not available")
    return this.state.err
  }

  getResult(): T {
    if (!this.isSettled())
      throw Error("Deferred promise is not settled, result is not available")
    return this.state.result
  }
}

export default Deferred
