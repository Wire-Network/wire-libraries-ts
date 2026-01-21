import { isFunction, isString } from "./primitive.js"

export interface AssertOptions {
  logErrorsToConsole: boolean
}

export const DefaultAssertOptions:AssertOptions = {
  logErrorsToConsole: false
}

let assertOptions:AssertOptions = {...DefaultAssertOptions}

export function getAssertOptions() {
  return {...assertOptions}
}

export function setGlobalAssertOptions(options: AssertOptions) {
  assertOptions = {...assertOptions, ...options}
}

export class AssertError extends Error {
  
  
  
  constructor(message: string,  public readonly cause?: Error) {
    super(message)
  }
}


const assertLift:AssertLift = <T>(test: (value:T) => boolean, messageProvider: string | ((value: T) => string)) => {
  return (nextValue: T) => {
    const ok = test(nextValue)
    if (!ok) {
      const message = isFunction(messageProvider) ? messageProvider(nextValue) : messageProvider ?? "no message"
      throw new AssertError(message)
    }
  }
}

export type AssertLift = <T>(test: (value:T) => boolean, message: string | ((value: T) => string)) =>
  (nextValue: T) => void | never

export interface Assert {
  (
    test: (() => boolean) | boolean,
    msg?: null | ((err?: Error) => Error | string) | Error | string | undefined,
    overrideOptions?: Partial<AssertOptions>
  ): void | never
  
  lift: AssertLift
}


export const assert: Assert = Object.assign((
  test: (() => boolean) | boolean,
  msg?: null | ((err?: Error) => Error | string) | Error | string | undefined,
  overrideOptions: Partial<AssertOptions> = {}
): void | never => {
  const options = {...assertOptions, ...overrideOptions}
  let result: boolean = false
  let error: Error = undefined
  
  try {
    result = isFunction(test) ? test() : test
  } catch (err) {
    error = err
    if (options.logErrorsToConsole) {
      console.error(`Assert failed: "${test}"`, err)
    }
  }
  
  if (!result || !!error) {
    const errOut = !msg ? (error?.message ?? "unknown") :
      isFunction(msg) ? msg(error) :
        msg
    throw isString(errOut) ? new AssertError(errOut, error) : errOut
  }
}, {
  lift: assertLift
})


