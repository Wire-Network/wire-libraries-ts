import { ConsoleAppender } from "./appenders/ConsoleAppender.js"
import { Level, LevelKind } from "./Level.js"
import type { Logger, LoggerOptions } from "./Logger.js"
import { getLoggingManager } from "./LoggingManager.js"

const INTERNAL_CATEGORY = "INTERNAL"

let internalLogger: Logger = null

export function getInternalLogger(): Logger {
  if (!internalLogger) {
    internalLogger = getLoggingManager().getLogger(INTERNAL_CATEGORY, {
      categoryInterpolator: (
        inCategory: string,
        options?: LoggerOptions
      ) => INTERNAL_CATEGORY,
      overrideAppenders: [new ConsoleAppender()]
    })
    internalLogger.setOverrideLevel(Level.fatal)
  }
  return internalLogger
}

export function setInternalLoggerThresholdLevel(level: LevelKind): void {
  getInternalLogger().setOverrideLevel(level)
}

if (typeof window !== "undefined"){
  ;(window as any).setInternalLoggerThresholdLevel = setInternalLoggerThresholdLevel
}