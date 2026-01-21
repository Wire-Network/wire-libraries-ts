import type { LogRecord } from "../LogRecord"
import type { Appender } from "../Appender"
import type { LevelKind } from "../Level"
import Debug from "debug"
import {
  ConsoleAppender, ConsoleAppenderConfig, kDefaultConsoleAppenderConfig
} from "./ConsoleAppender.js"
import type { Formatter } from "../Formatter"
import { isEmpty, negate } from "lodash"


// let chalk: any = null
// if (
//   typeof process !== "undefined" &&
//   (process as any).type !== "renderer" &&
//   (process as any).browser !== true
// ) {
//   chalk = require("chalk")
// }

const useColors = false

const makeColorFn = (fn: (chalk: any, s: string) => string) => {
  // if (!useColors) {
  //   return (s: string) => s
  // }
  //
  // return (s: string) => fn(chalk, s)
  return (s: string) => s
}

const colorFns: Record<LevelKind, (s: string) => string> = {
  debug: makeColorFn((c, s) => c.green(s)),
  error: makeColorFn((c, s) => c.red(s)),
  fatal: makeColorFn((c, s) => c.bgRed.black(s)),
  info: makeColorFn((c, s) => c.blue(s)),
  trace: makeColorFn((c, s) => c.gray(s)),
  warn: makeColorFn((c, s) => c.yellow(s))
}

/**
 * DebugAppender Configuration
 */
export interface DebugAppenderConfig extends ConsoleAppenderConfig {
  hideDate: boolean
  timeOnly: boolean
  useConsole: boolean
  useStdout: boolean
  categoryPrefix: string
}

/**
 * Partial of config, used for shortening instead of Partial<...>
 */
export type DebugAppenderOptions = Partial<DebugAppenderConfig>

const debuggers = new Map<string, Debug.Debugger>()

//const debugAppPrefix = "app"

function getDebug({categoryPrefix}: DebugAppenderConfig, cat: string) {
  let debug = debuggers.get(cat)
  if (!debug) {
    debug = Debug([categoryPrefix, cat].filter(negate(isEmpty)).join(":"))
    debuggers.set(cat, debug)
  }

  return debug
}

// const timeFormatter = new Intl.DateTimeFormat('en-US', {
//   timeStyle: "short"
// })

/**
 *
 * Get ISO date if `hideDate !== true`
 *
 * @param {DebugFormatterContext}
 * @returns
 */
function getDate({ debugConfig: config }: DebugFormatterContext) {
  if (config.hideDate) {
    return ""
  }

  const date = new Date()
  return config.timeOnly
    ? date.toLocaleTimeString("default", {
        hour12: false
      })
    : date.toISOString()
}

/**
 *
 * Formats args for output, directly based on Debug.formatArgs
 *
 * @param {DebugFormatterContext} context
 * @param {any[]} args
 */
function formatArgs(
  context: DebugFormatterContext,
  record: LogRecord,
  args: any[]
) {
  const { debug } = context
  const { namespace: name } = debug as any

  const prefix = colorFns[record.level](
    [
      getDate(context),
      Debug.humanize(debug.diff),
      `(` + record.level.toUpperCase() + `)`,
      `[${name}]`
    ]
      .filter(negate(isEmpty))
      .join(" ")
  )
  const msg = [prefix, args[0]].filter(negate(isEmpty)).join(" ")

  args[0] = msg
}

/**
 * Context for using `debugFormatter`
 */
export type DebugFormatterContext = {
  debugConfig: DebugAppenderConfig
  debug: Debug.Debugger
}

/**
 * Uses `debug` package for logging, very useful
 *
 * @param {LogRecord} record to format
 * @param {DebugFormatterContext} context for this formatter
 * @returns
 */
export const debugFormatter: Formatter<Array<any>, DebugFormatterContext> = (
  record,
  { debug, debugConfig: config }
): any[] => {
  const { level, message, data, args: argsIn, category, timestamp } = record
  const args = [message, ...argsIn]
  args[0] = Debug.coerce(args[0])

  if (typeof args[0] !== "string") {
    // Anything else let's inspect with %O
    args.unshift("%O")
  }

  // Apply any `formatters` transformations
  let index = 0
  args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
    // If we encounter an escaped % then don't increase the array index
    if (match === "%%") {
      return "%"
    }
    index++
    const formatter = Debug.formatters[format]
    if (typeof formatter === "function") {
      const val = args[index]
      match = formatter.call(debug, val)

      // Now we need to remove `args[index]` since it's inlined in the `format`
      args.splice(index, 1)
      index--
    }
    return match
  })

  // Apply env-specific formatting (colors, etc.)
  formatArgs({ debug, debugConfig: config }, record, args)

  return args
}
// [
//   `[${category}]  (${level})  ${message}`,
//   ...(Array.isArray(args) ? args : [args])
// ]

/**
 * Default console config
 * @type {DebugAppenderConfig}
 */
const defaultConfig: DebugAppenderConfig = {
  hideDate: false,
  timeOnly: true,
  useConsole: false,
  useStdout: true,
  categoryPrefix: null,
  ...kDefaultConsoleAppenderConfig,
  formatter: debugFormatter
}
/**
 * Debug appender, the simple default appender used
 * everywhere OOB
 */
export class DebugAppender<Record extends LogRecord>
  extends ConsoleAppender<Record>
  implements Appender<Record>
{
  readonly debugConfig: DebugAppenderConfig


  /**
   * Handle log records, transform, push to ES
   *
   * @param record
   */
  append(record: Record): void {
    const { level, message, args: argsIn, category } = record

    // if (!this.levels.includes(level)) {
    //   super.append(record)
    //   return
    // }

    const debug = getDebug(this.debugConfig, category) as any
    let prevTime = debug.prevTime
    // Set `diff` timestamp
    const curr = Number(new Date())
    const ms = curr - (prevTime || curr)
    debug.diff = ms
    debug.prev = prevTime
    debug.curr = curr
    debug.prevTime = curr
    const logFn = debug.log || Debug.log
    const args = debugFormatter!(record, { debug, debugConfig: this.debugConfig })
    
    if (this.debugConfig.useConsole) {
      super.write(level, ...args)
    }

    if (this.debugConfig.useStdout) {
      logFn.apply(debug, args) 
    }
  }

  /**
   *
   * @param {Partial<DebugAppenderOptions>} options
   */
  constructor(options: Partial<Omit<DebugAppenderOptions, "formatter">> = {}) {
    super({
      ...defaultConfig,
      ...options,
      formatter: debugFormatter
    })

    this.debugConfig = this.config as DebugAppenderConfig
  }
}
