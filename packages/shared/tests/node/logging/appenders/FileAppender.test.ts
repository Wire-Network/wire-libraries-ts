import Fs = require("node:fs")
import Os from "node:os"
import Path from "node:path"
import { FileAppender } from "@wireio/shared/node/logging/appenders/FileAppender"
import { Level } from "@wireio/shared/logging/Level"
import type { LogRecord } from "@wireio/shared/logging/LogRecord"

/** Exercise shutdown with a real file and an explicitly held asynchronous write. */
describe("FileAppender shutdown", () => {
  let directory: string

  beforeEach(() => {
    directory = Fs.mkdtempSync(Path.join(Os.tmpdir(), "file-appender-"))
  })

  afterEach(() => {
    jest.restoreAllMocks()
    Fs.rmSync(directory, { recursive: true, force: true })
  })

  it("waits for the active write and queued records before closing once", async () => {
    const filename = Path.join(directory, "app.log"),
      appender = new FileAppender<LogRecord>({ filename, prettyPrint: false }),
      originalAppend = Fs.appendFile,
      originalClose = Fs.closeSync,
      descriptor = appender.file
    let releaseWrite: () => void
    let notifyStarted: () => void
    const started = new Promise<void>(resolve => {
      notifyStarted = resolve
    })
    const append = jest
      .spyOn(Fs, "appendFile")
      .mockImplementationOnce((...args: Parameters<typeof Fs.appendFile>) => {
        releaseWrite = () => originalAppend(...args)
        notifyStarted()
      })
    const close = jest.spyOn(Fs, "closeSync").mockImplementation(originalClose)
    const first: LogRecord = {
        timestamp: Date.now(),
        category: "test",
        level: Level.info,
        message: "first"
      },
      second: LogRecord = { ...first, message: "second" }
    appender.append(first)
    await started
    appender.append(second)
    const closing = appender.close()
    let settled = false
    void closing.then(() => {
      settled = true
    })
    try {
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(settled).toBe(false)
      expect(close).not.toHaveBeenCalled()
      expect(append).toHaveBeenCalledTimes(1)
      expect(appender.close()).toBe(closing)
    } finally {
      releaseWrite()
      await closing
    }
    expect(
      Fs.readFileSync(filename, "utf8")
        .trim()
        .split("\n")
        .map(line => JSON.parse(line).message)
    ).toEqual(["first", "second"])
    expect(
      close.mock.calls.filter(([file]) => file === descriptor)
    ).toHaveLength(1)
    expect(appender.isReady()).toBe(false)
    expect(() => appender.append(first)).toThrow("closing or closed")
  })

  it("closes an empty appender idempotently", async () => {
    const appender = new FileAppender<LogRecord>({
        filename: Path.join(directory, "empty.log")
      }),
      closing = appender.close()
    expect(appender.close()).toBe(closing)
    await closing
    await appender.close()
    expect(appender.isReady()).toBe(false)
  })
})
