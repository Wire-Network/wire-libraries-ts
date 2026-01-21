import type { Logger, LoggerOptions } from "./Logger"
import { getLoggingManager } from "./LoggingManager.js"

export function getLogger(
  category: string,
  options: Partial<LoggerOptions> = {}
): Logger {
  return getLoggingManager().getLogger(category, options)
}
