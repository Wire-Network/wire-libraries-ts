import { FirehoseClient, PutRecordBatchCommand } from "@aws-sdk/client-firehose"
import { Deferred } from "../../../helpers/index.js"
import { getInternalLogger } from "../../InternalLogger.js"
import EventEmitter3 from "eventemitter3"

const API_BASE = "https://log-ingest.shared.wire-dev.com"
const CRED_BUFFER_PADDING_MS = 3 * 60 * 1000 // 3 minutes

const log = getInternalLogger(import.meta.filename)

export interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  streamName: string
  region: string
  expiration: string
}

export interface AWSFirehoseCredentialManagerEventMap {
  received: (creds: AWSCredentials) => void
  expired: () => void
}

export class AWSFirehoseCredentialManager extends EventEmitter3<AWSFirehoseCredentialManagerEventMap> {

  private refreshTimer: ReturnType<typeof setTimeout> = null;
  private loadDeferred: Deferred<AWSCredentials> = null;

  forceUpdateCredentials(): void {
    if (this.loadDeferred && !this.loadDeferred.isSettled()) {
      this.loadDeferred.reject(new Error("force update"))
    }

    this.loadDeferred = null
    this.scheduleRefresh(1)
  }

  getCredentials(): AWSCredentials {
    if (this.loadDeferred && this.loadDeferred.isFulfilled()) {
      const creds = this.loadDeferred.getResult(),
        expMs = Date.parse(creds.expiration)

      if (expMs <= Date.now()) {
        log.info("Credentials expired")
        this.loadDeferred = null
        this.scheduleRefresh(1)
        this.emit("expired")
        return null
      }
      return creds
    }

    this.scheduleRefresh(1)
    return null
  }

  hasCredentials(): boolean {
    return this.getCredentials() != null
  }

  private async load(): Promise<AWSCredentials> {
    if (this.loadDeferred && !this.loadDeferred.isRejected())
      return this.loadDeferred.promise

    const deferred = this.loadDeferred = new Deferred<AWSCredentials>()
    try {
      const r = await fetch(API_BASE + "/creds", {
        method: "GET",
        credentials: "include",
      })
      if (!r.ok) throw new Error(`creds http ${r.status}`)
      const creds: AWSCredentials = await r.json()


      this.scheduleRefresh(creds)
      log.info(`Got creds, expire=${creds.expiration}, stream=${creds.streamName}, region=${creds.region}`)
      deferred.resolve(creds)
      this.emit("received", creds)
      return deferred.promise
    } catch (e) {
      deferred.reject(e)
      this.loadDeferred = null
      throw e
    }
  }
  scheduleRefresh(credsOrMillis: AWSCredentials | number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    if (!credsOrMillis)
      return

    let refreshInMs: number
    if (typeof credsOrMillis === "number") {
      refreshInMs = credsOrMillis
    } else {
      const
        creds = credsOrMillis,
        expMs = Date.parse(creds.expiration)

      refreshInMs = expMs - Date.now() - CRED_BUFFER_PADDING_MS

    }

    refreshInMs = Math.max(100, refreshInMs)

    this.refreshTimer = setTimeout(() => {
      this.loadDeferred = null
      this.load().catch((e: Error) => log.error(`refresh failed: ${e.message}`, e))
    }, refreshInMs)
  }

  getStreamName(): string {
    return this.getCredentials()?.streamName
  }

  getRegion(): string {
    return this.getCredentials()?.region
  }

  destroy(): void {
    this.scheduleRefresh(null)
    if (!this.loadDeferred.isSettled())
      this.loadDeferred.reject(new Error("destroyed"))
    this.loadDeferred = null
  }
}


export default AWSFirehoseCredentialManager
