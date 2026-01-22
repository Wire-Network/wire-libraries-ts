import _isNil from 'lodash/isNil.js'
import _isObject from 'lodash/isObject.js'
import _isString from 'lodash/isString.js'
import _isNumber from 'lodash/isNumber.js'
import _isFunction from 'lodash/isFunction.js'
import { applyTypeGuardExtras } from "./applyTypeGuardExtras.js";


export type UndefinedOrNull = undefined|null



export function isNil(o:any):o is UndefinedOrNull {
	return _isNil(o)
}

/**
 * O is a valid object
 *
 * @param o
 */
export function isDefined<T>(o:any):o is Exclude<T, UndefinedOrNull>
export function isDefined(o:any):o is Exclude<any,UndefinedOrNull>
export function isDefined(o:any) {
	return !isNil(o)
}

export function isObject(o:any):o is Object {
	return !isNil(o) && _isObject(o)
}

export function isPromise(o:any):o is Promise<any> {
	return !isNil(o) && isObject(o) && (o instanceof Promise || isFunction(o.then))
}


export function isObjectType<T>(o:any,type:{new():T}):o is T {
	return !isNil(o) && (o instanceof type || o.$$clazz === type.name)
}

export function isString(o:any):o is string {
	return !isNil(o) && _isString(o)
}

export function isNumber(o:any):o is number {
	return !isNil(o) && _isNumber(o) && !isNaN(o)
}

export const isFunction = applyTypeGuardExtras<Function>(function isFunction(o:any):o is Function {
	return !isNil(o) && _isFunction(o)
})

export function isSymbol(o:any):o is Symbol {
	return !isNil(o) && typeof o === 'symbol'
}

export function isBoolean(o: any): o is boolean {
	return typeof o === "boolean"
}

export function isDate(o: any): o is Date {
	return o instanceof Date
}

export type Primitive = boolean | string | number

export type PrimitiveProducer<P extends Primitive = Primitive> = (...args: any[]) => P

export const PrimitiveProducers = Array<PrimitiveProducer>(String, Number, Boolean)

export function isPrimitiveProducer<P extends Primitive = Primitive>(o:any): o is PrimitiveProducer<P> {
	return PrimitiveProducers.includes(o)
}

export function isPrimitive(o:any): o is Primitive {
	return isBoolean(o) || isString(o) || isNumber(o)
}