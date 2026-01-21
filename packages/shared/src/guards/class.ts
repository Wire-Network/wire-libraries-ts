/**
 * Is ES6+ class
 *
 * @see https://stackoverflow.com/questions/29093396/how-do-you-check-the-difference-between-an-ecmascript-6-class-and-function/49510834
 *
 * @param {any} value
 * @returns {boolean}
 */
import type { ClassConstructor, TypeGuard } from "./types"

export function isNativeClass <T = any>(value:any): value is ClassConstructor<T> {
  return typeof value === 'function' && value.toString().indexOf('class') === 0
}

// Character positions
const INDEX_OF_FUNCTION_NAME = 9  // "function X", X is at index 9
const FIRST_UPPERCASE_INDEX_IN_ASCII = 65  // A is at index 65 in ASCII
const LAST_UPPERCASE_INDEX_IN_ASCII = 90   // Z is at index 90 in ASCII

/**
 * Is Conventional Class
 * Looks for function with capital first letter MyClass
 * First letter is the 9th character
 * If changed, isClass must also be updated
 * @param {any} value
 * @returns {boolean}
 */
export function isConventionalClass <T = any>(value:any): value is ClassConstructor<T> {
  if ( typeof value !== 'function' )  return false
  const c = value.toString().charCodeAt(INDEX_OF_FUNCTION_NAME)
  return c >= FIRST_UPPERCASE_INDEX_IN_ASCII && c <= LAST_UPPERCASE_INDEX_IN_ASCII
}


export function isClass<T = any>(value: any, includeConventional: boolean = true): value is ClassConstructor<T> {
  return isNativeClass<T>(value) || (includeConventional && isConventionalClass<T>(value))
}





export function createInstanceOfGuard<T, Ctor extends ClassConstructor<T>>(ctor: Ctor): ((o: any) => o is T) {
  return (o: any): o is T => o instanceof ctor
}

export function instanceOf<T extends {}, Ctor extends ClassConstructor<T>>(ctor: Ctor) {
  return createInstanceOfGuard<T,Ctor>(ctor)
} 

export function createGenericGuard<T>(tester: (val:any) => val is T):TypeGuard<T>
export function createGenericGuard<T>(type:{new():T}, tester: (val:any) => val is T):TypeGuard<T>
export function createGenericGuard<T>(typeOrTest: ({new():T} | ((val:any) => val is T)), tester?: (val:any) => val is T) {
  return tester as TypeGuard<T>
}

