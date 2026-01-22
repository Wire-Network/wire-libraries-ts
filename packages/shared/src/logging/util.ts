import { isString } from "../guards/primitive.js"
import { LevelKind, LevelNames } from "./Level.js"

export function isLogLevelKind(o: any): o is LevelKind {
  return isString(o) && LevelNames.includes(o?.toLowerCase?.() as any)
}
