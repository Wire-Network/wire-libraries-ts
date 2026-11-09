import { Logger } from "@wireio/shared/logging/Logger"
import { LoggingManager } from "@wireio/shared/logging/LoggingManager"
import { Level } from "@wireio/shared/logging/Level"
import type { LogRecord } from "@wireio/shared/logging/LogRecord"
import { getInternalLogger } from "@wireio/shared/logging/InternalLogger"

describe("Logger", () => {
  let manager: LoggingManager
  let records: LogRecord[]
  const mockAppender = {
    append: (record: LogRecord) => {
      records.push(record)
    }
  }

  beforeEach(() => {
    records = []
    manager = LoggingManager.get()
    manager.setRootLevel(Level.trace)
    manager.setAppenders(mockAppender)
  })

  it("can be created from a LoggingManager", () => {
    const logger = manager.getLogger("test")
    expect(logger).toBeInstanceOf(Logger)
  })

  it("respects root level - info messages do not fire when root is warn", () => {
    manager.setRootLevel(Level.warn)
    const logger = manager.getLogger("test-root-level")
    logger.info("should not appear")
    expect(records).toHaveLength(0)
  })

  it("fires appender for messages at or above threshold", () => {
    manager.setRootLevel(Level.warn)
    const logger = manager.getLogger("test-threshold")
    logger.warn("warning message")
    logger.error("error message")
    expect(records).toHaveLength(2)
  })

  describe("level methods create correct records", () => {
    it("trace creates a record with level trace", () => {
      const logger = manager.getLogger("test-trace")
      logger.trace("trace msg")
      expect(records[0].level).toBe("trace")
      expect(records[0].message).toBe("trace msg")
    })

    it("debug creates a record with level debug", () => {
      const logger = manager.getLogger("test-debug")
      logger.debug("debug msg")
      expect(records[0].level).toBe("debug")
      expect(records[0].message).toBe("debug msg")
    })

    it("info creates a record with level info", () => {
      const logger = manager.getLogger("test-info")
      logger.info("info msg")
      expect(records[0].level).toBe("info")
      expect(records[0].message).toBe("info msg")
    })

    it("warn creates a record with level warn", () => {
      const logger = manager.getLogger("test-warn")
      logger.warn("warn msg")
      expect(records[0].level).toBe("warn")
      expect(records[0].message).toBe("warn msg")
    })

    it("error creates a record with level error", () => {
      const logger = manager.getLogger("test-error")
      logger.error("error msg")
      expect(records[0].level).toBe("error")
      expect(records[0].message).toBe("error msg")
    })

    it("fatal creates a record with level fatal", () => {
      const logger = manager.getLogger("test-fatal")
      logger.fatal("fatal msg")
      expect(records[0].level).toBe("fatal")
      expect(records[0].message).toBe("fatal msg")
    })
  })

  describe("isXxxEnabled methods", () => {
    it("reflects current threshold", () => {
      manager.setRootLevel(Level.warn)
      const logger = manager.getLogger("test-enabled")
      expect(logger.isTraceEnabled()).toBe(false)
      expect(logger.isDebugEnabled()).toBe(false)
      expect(logger.isInfoEnabled()).toBe(false)
      expect(logger.isWarnEnabled()).toBe(true)
      expect(logger.isErrorEnabled()).toBe(true)
      expect(logger.isFatalEnabled()).toBe(true)
    })

    it("all enabled when root level is trace", () => {
      manager.setRootLevel(Level.trace)
      const logger = manager.getLogger("test-all-enabled")
      expect(logger.isTraceEnabled()).toBe(true)
      expect(logger.isDebugEnabled()).toBe(true)
      expect(logger.isInfoEnabled()).toBe(true)
      expect(logger.isWarnEnabled()).toBe(true)
      expect(logger.isErrorEnabled()).toBe(true)
      expect(logger.isFatalEnabled()).toBe(true)
    })
  })

  describe("setOverrideLevel", () => {
    it("changes the logger individual threshold", () => {
      manager.setRootLevel(Level.error)
      const logger = manager.getLogger("test-override")
      expect(logger.isDebugEnabled()).toBe(false)
      logger.setOverrideLevel(Level.debug)
      expect(logger.isDebugEnabled()).toBe(true)
    })
  })

  describe("assert", () => {
    it("does not log when test is true", () => {
      const logger = manager.getLogger("test-assert-true")
      logger.assert(true, "should not log")
      expect(records).toHaveLength(0)
    })

    it("logs an error when test is false", () => {
      const logger = manager.getLogger("test-assert-false")
      logger.assert(false, "assertion failed")
      expect(records).toHaveLength(1)
      expect(records[0].level).toBe("error")
      expect(records[0].message).toBe("assertion failed")
    })
  })

  it("reports a fatal assertion without a Node process in a browser", () => {
    const logger = manager.getLogger("test-browser-fatal"),
      nodeProcess = globalThis.process,
      fallback = jest
        .spyOn(getInternalLogger(), "fatal")
        .mockImplementation(() => {})
    try {
      globalThis.process = undefined
      logger.assertFatal(false, "assertion failed")
    } finally {
      globalThis.process = nodeProcess
    }
    expect(records[0].level).toBe(Level.fatal)
    expect(fallback).toHaveBeenCalledWith(
      "FATAL ASSERTION: `process` is not defined, probably in a web browser"
    )
    fallback.mockRestore()
  })
})
