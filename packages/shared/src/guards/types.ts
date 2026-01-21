export type TypeGuard<T> = (o:any) => o is T

export type ClassConstructor<T> = new (...args:any[]) => T

export type LiftTypeGuard<T> = () => boolean

export type TypeGuardExtras<T> = TypeGuard<T> & {
  lift: (o:any) => LiftTypeGuard<T>
}