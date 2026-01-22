import { isDefined, isPromise } from "../guards/index.js"

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
  resolve: (result?:T) => void
  reject: (err:any) => void
  isSettled: boolean
  isCancelled: boolean
  isRejected: boolean
  isFulfilled: boolean
  result:T | null
  err: Error | null
}

/**
 * A deferred promise that can be resolved or rejected
 * externally, ideal for functions like a promise timeout
 */
export class Deferred<T> {
  

  static async delay(millis:number) {
    const deferred = new Deferred<void>()
    setTimeout(() => deferred.resolve(),millis)
    await deferred.promise
  }
  
  static resolve<T>(value?:T): Deferred<T> {
    const deferred = new Deferred<T>()
    deferred.resolve(value)
    return deferred
  }
  
  private readonly state:DeferredState<T>
  
  readonly promise:Promise<T>

  
  constructor(promise?:Promise<T> | undefined) {
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
        promise
          .then(this.state.resolve)
          .catch(this.state.reject)
      } else {
        throw Error(`An existing promise was provided to Deferred constructor, but it wasn't a valid promise`)
      }
    }
  }
  
  isFulfilled(): boolean {
    return this.state.isFulfilled
  }
  
  isRejected(): boolean {
    return this.state.isRejected
  }
  
  isSettled(): boolean {
    return this.state.isSettled
  }
  
  isCancelled(): boolean {
    return this.state.isCancelled
  }
  
  status(): DeferredStatus {
    return this.isCancelled() ? DeferredStatus.CANCELED : this.isSettled() ? this.isFulfilled() ? DeferredStatus.FULFILLED : DeferredStatus.REJECTED : DeferredStatus.PENDING
  }
  
  cancel(): void {
    this.state.isSettled = true
    this.state.isCancelled = true
  }
  
  resolve(result?:T): void {
    if (!this.state.isSettled && !this.state.isCancelled) {
      Object.assign(this.state, {
        result: result,
        isSettled: true,
        isFulfilled: true
      })
      this.state.resolve(result)
    }
  }
  
  reject(err:any): void {
    if (!this.state.isSettled && !this.state.isCancelled) {
      Object.assign(this.state, {
        isSettled: true,
        isRejected: true,
        err
      })
      
      
      
      this.state.reject(err)
    }
  }
  
  get error() {
    return this.getError()
  }
  
  get value() {
    return this.getResult()
  }
  
  getError(): Error | undefined {
    if(!this.isSettled())
      throw Error("Deferred promise is not settled, result is not available")
    return this.state.err
  }
  
  getResult():T {
    if(!this.isSettled())
      throw Error("Deferred promise is not settled, result is not available")
    return this.state.result
  }
}

export default Deferred
