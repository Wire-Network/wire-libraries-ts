export class NestedError extends Error {
  readonly causes: Array<Error>

  constructor(message: string, ...causes: Array<Error | Error[]>) {
    super(message)
    this.name = "NestedError"
    this.causes = causes.flat()
  }
}

export namespace NestedError {
  export function create(
    message: string,
    ...causes: Array<Error | Error[]>
  ): NestedError {
    return new NestedError(message, ...causes)
  }

  export function throwError(
    message: string,
    ...causes: Array<Error | Error[]>
  ): never {
    throw create(message, ...causes)
  }
}

export default NestedError
