import type { TypeGuard, TypeGuardExtras } from "./types.js"


export function applyTypeGuardExtras<T>(fn:TypeGuard<T>):TypeGuardExtras<T> {
  (
    fn as TypeGuardExtras<T>
  ).lift = (o:any) => () => fn(o)
  return fn as TypeGuardExtras<T>
}