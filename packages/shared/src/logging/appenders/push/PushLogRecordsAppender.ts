/* eslint-disable typescript/no-explicit-any */
import EventEmitter3 from "eventemitter3"
import { Deferred } from "../../../helpers/index.js"
import { LogRecord } from "../../LogRecord.js"
import { Appender } from "../../Appender.js"

// Constants for tuning (adjustable in development)
const COOKIE_EXPIRATION_MS = 30 * 60 * 1000 // 30 minutes
const COOKIE_REFRESH_BUFFER_MS = 2 * 60 * 1000 // Refresh 2 minutes before expiration
const FLUSH_QUEUE_DEPTH = 100
const FLUSH_INTERVAL_MS = 10 * 1000 // 10 seconds
const LOG_QUEUE_MAX_RECORDS = 10000
const COOKIE_NAME = "wire_logs_id"

interface PushLogRecordsCredentialManagerEventMap {
  received: () => void
  expired: () => void
}

/**
 * Manages credential cookie for PushLogRecordsAppender.
 * Invokes the endpoint via POST to obtain a session cookie.
 */
export class PushLogRecordsCredentialManager extends EventEmitter3<PushLogRecordsCredentialManagerEventMap> {
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private credentialDeferred: Deferred<void> | null = null
  private cookieExpirationTime: number | null = null

  constructor(public readonly endpointUrl: string) {
    super()
  }

  /**
   * Check if valid credentials exist
   */
  hasCredentials(): boolean {
    if (!this.cookieExpirationTime) {
      return false
    }

    if (Date.now() >= this.cookieExpirationTime) {
      this.cookieExpirationTime = null
      this.emit("expired")
      return false
    }

    return this.hasCookie()
  }

  /**
   * Check if the cookie exists in the browser
   */
  private hasCookie(): boolean {
    if (typeof document === "undefined") {
      return false
    }

    return document.cookie.split(";").some((item) => item.trim().startsWith(`${COOKIE_NAME}=`))
  }

  /**
   * Get credentials, fetching them if necessary
   */
  async ensureCredentials(): Promise<boolean> {
    // If we have valid credentials, return immediately
    if (this.hasCredentials()) {
      return true
    }

    // If a fetch is already in progress, wait for it
    if (this.credentialDeferred && !this.credentialDeferred.isSettled()) {
      try {
        await this.credentialDeferred.promise
        return this.hasCredentials()
      } catch {
        return false
      }
    }

    // Fetch new credentials
    return this.fetchCredentials()
  }

  /**
   * Force refresh of credentials
   */
  forceRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }

    this.cookieExpirationTime = null

    if (this.credentialDeferred && !this.credentialDeferred.isSettled()) {
      this.credentialDeferred.reject(new Error("Force refresh requested"))
    }
    this.credentialDeferred = null

    this.fetchCredentials().catch(() => {
      // Ignore errors during force refresh, they'll be handled on next request
    })
  }

  /**
   * Fetch credentials from the endpoint
   */
  private async fetchCredentials(): Promise<boolean> {
    const deferred = (this.credentialDeferred = new Deferred<void>())

    try {
      const response = await fetch(this.endpointUrl, {
        method: "POST",
        mode: "cors",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        throw new Error(`Credential request failed with status ${response.status}`)
      }

      // Cookie is set by Set-Cookie header, we just need to track expiration
      this.cookieExpirationTime = Date.now() + COOKIE_EXPIRATION_MS

      // Schedule refresh before expiration
      this.scheduleRefresh()

      deferred.resolve()
      this.emit("received")

      return true
    } catch (err) {
      console.debug("Failed to fetch push log credentials", err)
      deferred.reject(err)
      this.credentialDeferred = null
      return false
    }
  }

  /**
   * Schedule a credential refresh before expiration
   */
  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }

    const refreshIn = COOKIE_EXPIRATION_MS - COOKIE_REFRESH_BUFFER_MS
    this.refreshTimer = setTimeout(() => {
      this.credentialDeferred = null
      this.fetchCredentials().catch(() => {
        // Log but don't throw - will retry on next request
        console.debug("Scheduled credential refresh failed")
      })
    }, refreshIn)
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }

    if (this.credentialDeferred && !this.credentialDeferred.isSettled()) {
      this.credentialDeferred.reject(new Error("Credential manager destroyed"))
    }

    this.credentialDeferred = null
    this.cookieExpirationTime = null
  }
}

/**
 * Appender that pushes log records to a remote endpoint via HTTP PUT.
 * Batches records and sends when queue reaches FLUSH_QUEUE_DEPTH or FLUSH_INTERVAL_MS has elapsed.
 */
export class PushLogRecordsAppender<Record extends LogRecord = LogRecord> implements Appender<Record> {
  private pendingRecords: LogRecord[] = []
  private flushDeferred: Deferred<void> | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  public readonly credentialManager: PushLogRecordsCredentialManager

  constructor(public readonly endpointUrl: string) {
    this.credentialManager = new PushLogRecordsCredentialManager(endpointUrl)

    this.credentialManager.on("received", () => {
      if (!this.pendingRecords.length || this.flushDeferred) {
        return
      }
      this.flush().catch(() => {
        // Errors handled in flush
      })
    })
  }

  /**
   * Append a log record to the queue
   */
  append(record: Record): void {
    // Enforce max queue size by removing oldest records
    const pendingCount = this.pendingRecords.length + 1
    const removeCount = pendingCount - LOG_QUEUE_MAX_RECORDS

    if (removeCount > 0) {
      this.pendingRecords.splice(0, removeCount)
    }

    // Add the record with enriched metadata
    this.pendingRecords.push({
      timestamp: Date.now(),
      ...record,
      app: record.app && record.app.length > 0 ? record.app : "UNKNOWN",
      env: record.env && record.env.length > 0 ? record.env : "UNKNOWN",
      url: typeof window === "undefined" ? "local://" : window.location.href,
    })

    // Check if we should flush immediately due to queue depth
    if (this.pendingRecords.length >= FLUSH_QUEUE_DEPTH) {
      this.flush().catch(() => {
        // Errors handled in flush
      })
    } else {
      // Schedule a flush if not already scheduled
      this.scheduleFlush()
    }
  }

  /**
   * Schedule a flush after the interval
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      return // Already scheduled
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush().catch(() => {
        // Errors handled in flush
      })
    }, FLUSH_INTERVAL_MS)
  }

  /**
   * Flush pending records to the endpoint
   */
  private async flush(): Promise<void> {
    // Prevent concurrent flushes
    if (this.flushDeferred) {
      return this.flushDeferred.promise
    }

    // Nothing to flush
    if (!this.pendingRecords.length) {
      return
    }

    // Ensure we have valid credentials
    const hasCredentials = await this.credentialManager.ensureCredentials()
    if (!hasCredentials) {
      console.debug("Failed to push log records", "No valid credentials available")
      return
    }

    const deferred = (this.flushDeferred = new Deferred<void>())

    try {
      // Take all pending records for this flush
      const records = this.pendingRecords.splice(0, this.pendingRecords.length)

      const response = await fetch(this.endpointUrl, {
        method: "PUT",
        mode: "cors",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(records),
      })

      if (!response.ok) {
        // Re-queue records on failure
        this.pendingRecords.unshift(...records)
        throw new Error(`Push failed with status ${response.status}`)
      }

      deferred.resolve()
    } catch (err) {
      console.debug("Failed to push log records", err)
      deferred.reject(err)
    } finally {
      this.flushDeferred = null

      // If more records accumulated during flush, schedule another
      if (this.pendingRecords.length > 0) {
        this.scheduleFlush()
      }
    }

    return deferred.promise
  }

  /**
   * Force an immediate flush
   */
  async forceFlush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    return this.flush()
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    this.credentialManager.destroy()

    if (this.flushDeferred && !this.flushDeferred.isSettled()) {
      this.flushDeferred.reject(new Error("Appender destroyed"))
    }

    this.flushDeferred = null
    this.pendingRecords = []
  }
}

export default PushLogRecordsAppender
