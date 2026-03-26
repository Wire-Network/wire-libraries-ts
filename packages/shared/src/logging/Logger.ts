import {
  assert,
  getValue,
  isString,
  isDefined,
  isFunction,
  isNumber
} from "../guards/index.js"
import { Option } from "@3fv/prelude-ts"
import { cloneDeep, isObject, pick } from "lodash"
import { LevelKind, LevelThresholds } from "./Level.js"
import type { LoggingManager } from "./LoggingManager.js"
import type { LogMetadata, LogRecord } from "./LogRecord.js"
import { isLogLevelKind } from "./util.js"
import type { Appender } from "./Appender.js"

export interface LoggerOptions {
  categoryInterpolator: CategoryInterpolator
  overrideAppenders: Array<Appender<LogRecord>>
}

export type CategoryInterpolator = (
  inCategory: string,
  options?: LoggerOptions
) => string

export const filenameCategoryInterpolator: CategoryInterpolator = (
  filename: string
) => {
  const allParts = filename.replaceAll("\\", "/").split("/")
  const rootIndex = Math.max(
    ...["src", "lib"].map(name => allParts.indexOf(name))
  )
  const parts =
    rootIndex === -1 ? [allParts.pop()] : allParts.slice(rootIndex + 1)
  const category = Option.of(parts.join(":"))
    .flatMap(cat =>
      Option.of(cat.lastIndexOf(".")).map(index =>
        index === -1 ? cat : cat.slice(0, index)
      )
    )
    .getOrElse("unknown")
  return category
}

export const defaultLoggerOptions: LoggerOptions = {
  categoryInterpolator: filenameCategoryInterpolator,
  overrideAppenders: []
}

export function toLogRecord(
  logger: Logger,
  levelOrRecord: LevelKind | LogRecord,
  args: any[]
) {
  const globalMetadata = logger.manager.globalMetadata
  let metadata: LogMetadata = {
    ...globalMetadata
  }
  if (isString(levelOrRecord) && isObject(args[0])) {
    metadata = { ...metadata, ...args.shift() }
  }

  if (globalMetadata?.data)
    metadata.data = {
      ...globalMetadata.data,
      ...metadata.data
    }

  const errRecord = Option.ofNullable(
    args.find(
      arg => (isString(arg?.message) && !!arg.stack) || arg instanceof Error
    )
  ).match({
    Some: err => ({
      errorMessage: getValue(() => err.message),
      errorStack: getValue(() => err.stack)
    }),
    None: () => ({})
  })

  const recordBase = isString(levelOrRecord)
    ? ({
        ...pick(logger, ["category"]),
        timestamp: Date.now(),
        message: args[0],
        level: levelOrRecord,
        args: args.slice(1)
      } as LogRecord)
    : levelOrRecord

  const record = {
    ...recordBase,
    ...errRecord,
    ...metadata,
    timestamp:
      isNumber(recordBase.timestamp) && recordBase.timestamp > 0
        ? recordBase.timestamp
        : Date.now()
  }

  if (metadata.data) {
    record.data = {
      ...metadata.data,
      ...(recordBase.data ?? {})
    }
  }

  return record
}

export interface LoggerState {
  overrideLevel?: LevelKind
}

export class Logger {
  readonly state: LoggerState = {
    overrideLevel: null
  }

  get overrideLevel(): LevelKind {
    return Option.ofNullable(this.state.overrideLevel)
      .filter(isLogLevelKind) //Predicate.of<LevelKind>(isString).and(isLogLevelKind))
      .getOrNull()
  }

  get overrideThreshold() {
    return Option.ofNullable(this.overrideLevel)
      .map(level => LevelThresholds[level])
      .getOrNull()
  }

  setOverrideLevel(inOverrideLevel: LevelKind) {
    const overrideLevel = (
      !inOverrideLevel ? null : inOverrideLevel.toLocaleLowerCase()
    ) as LevelKind

    assert(
      !isDefined(overrideLevel) || isLogLevelKind(overrideLevel),
      `Invalid override level, must be a log level, all lower case`
    )

    Object.assign(this.state, {
      overrideLevel
    })

    return this
  }

  /**
   * Base logging function
   *
   * @param record
   */
  log(record: LogRecord): void
  log(level: LevelKind, message: string, ...args: any[]): void
  log(
    level: LevelKind,
    metadata: LogMetadata,
    message: string,
    ...args: any[]
  ): void
  log(levelOrRecord: LevelKind | LogRecord, ...args: any[]) {
    const record = toLogRecord(this, levelOrRecord, args)
    if (this.options.overrideAppenders.length) {
      this.options.overrideAppenders.forEach(appender =>
        appender.append(record)
      )
    } else {
      this.manager.fire(record)
    }
  }

  /**
   * Factory for the log
   * level functions
   *
   * @param {LevelKind} level
   * @returns {(message: string, ...args: any[]) => void}
   * @private
   */
  private createLevelLogger(
    level: LevelKind
  ): (message: string, ...args: any[]) => void {
    const isEnabled = this.createLevelEnabled(level)
    return (message: string, ...args: any[]) => {
      if (isEnabled()) {
        this.log(level, message, ...args)
      }
    }
  }

  /**
   * Factory for is<Level>Enabled
   *
   * @param {LevelKind} level
   * @returns {() => boolean}
   * @private
   */
  private createLevelEnabled(level: LevelKind): () => boolean {
    return () => {
      const { rootThreshold } = this.manager

      const globalOverrideThreshold = this.manager.determineThresholdOverride(
        this.category
      )
      const categoryThresholds = isNumber(this.overrideThreshold)
        ? [this.overrideThreshold]
        : [globalOverrideThreshold, rootThreshold].filter(isNumber)

      const categoryThreshold = Math.min(...categoryThresholds)

      const recordThreshold = LevelThresholds[level]

      return recordThreshold >= categoryThreshold
    }
  }

  readonly trace = this.createLevelLogger("trace")
  readonly debug = this.createLevelLogger("debug")
  readonly info = this.createLevelLogger("info")
  readonly warn = this.createLevelLogger("warn")
  readonly error = this.createLevelLogger("error")
  readonly fatal = this.createLevelLogger("fatal")

  readonly isTraceEnabled = this.createLevelEnabled("trace")
  readonly isDebugEnabled = this.createLevelEnabled("debug")
  readonly isInfoEnabled = this.createLevelEnabled("info")
  readonly isWarnEnabled = this.createLevelEnabled("warn")
  readonly isErrorEnabled = this.createLevelEnabled("error")
  readonly isFatalEnabled = this.createLevelEnabled("fatal")

  assert(test: boolean | (() => boolean), message: string, ...args: any[]) {
    const isTruthy = isFunction(test) ? test() : test
    if (isTruthy) {
      return
    }

    this.error(message, ...args)
  }

  assertFatal(
    test: boolean | (() => boolean),
    message: string,
    exitCode: number = 1
  ) {
    const isTruthy = isFunction(test) ? test() : test
    if (isTruthy) {
      return
    }

    this.fatal("FATAL ASSERTION: ", message)
    if (typeof process !== "undefined") {
      process.exit(exitCode)
    } else {
      console.error(
        "FATAL ASSERTION: `process` is not defined, probably in a web browser"
      )
    }
  }

  constructor(
    readonly manager: LoggingManager,
    readonly category: string,
    readonly options: LoggerOptions
  ) {}

  static hydrateOptions(options: Partial<LoggerOptions> = {}): LoggerOptions {
    return {
      ...defaultLoggerOptions,
      ...options
    }
  }

  static interoplateCategory(category: string, options: LoggerOptions) {
    options = {
      ...defaultLoggerOptions,
      ...options
    }
    return options.categoryInterpolator(category, options)
  }
}
