import { fromPairs, uniq } from "lodash"
import type { Level, LevelKind, LevelName } from "./Level"

export interface LogRecord<Data = any> {
  timestamp: number
  category: string
  level: LevelKind
  message: string
  args?: any[]
  data?: Data
  tags?: string[]
  url?: string
  env?: string
  event?: string
  errorMessage?: string
  errorStack?: string
}
