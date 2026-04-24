export enum Level {
  trace = "trace",
  debug = "debug",
  info = "info",
  warn = "warn",
  error = "error",
  fatal = "fatal"
}

export type LevelName = `${Level}`
export type LevelKind = LevelName | Level

export const LevelNames: Array<LevelName> = Object.values(Level)
export const LevelThresholds = Object.fromEntries(
  LevelNames.map((level, i) => [level, i])
) as Record<LevelKind, number>
export type LevelEnableFnName = `is${Capitalize<LevelName>}Enabled`
