import type { LevelKind } from "./Level.js"


export interface LogMetadata<Data extends {} = any> {
  url?: string
  env?: string
  app?: string
  data?: Data
}

export interface LogRecord<Data extends {} = any> extends LogMetadata<Data> {
  timestamp: number
  category: string
  level: LevelKind
  message: string
  args?: any[]
  tags?: string[]
  event?: string
  errorMessage?: string
  errorStack?: string
}

