import type {
  FirehoseClient,
  PutRecordBatchInput
} from "@aws-sdk/client-firehose"
import { Level } from "../../Level.js"

import AWSFirehoseCredentialManager, {
  type AWSCredentials
} from "./AWSFirehoseCredentialManager.js"
import { getInternalLogger } from "../../InternalLogger.js"
import { pick } from "lodash"
import { Deferred } from "../../../helpers/index.js"
import { LogRecord } from "../../LogRecord.js"
import { Appender } from "../../Appender.js"

const LogQueueMaxRecords = 10000
const ExpiredTokenExceptionCode = "ExpiredTokenException"

const log = getInternalLogger()
let firehoseModule: Promise<typeof import("@aws-sdk/client-firehose")> = null

function getFirehoseModule() {
  if (!firehoseModule) {
    firehoseModule = import("@aws-sdk/client-firehose").catch(err => {
      firehoseModule = null
      throw err
    })
  }

  return firehoseModule
}

export class AWSFirehoseAppender<
  Record extends LogRecord = LogRecord
> implements Appender<Record> {
  private pendingRecords = Array<LogRecord>()
  private flushDeferred: Deferred<void>
  private flushIntervalMs = 1000

  public readonly credentialManager: AWSFirehoseCredentialManager

  constructor(public readonly credentialEndpointUrl: string) {
    this.credentialManager = new AWSFirehoseCredentialManager(
      credentialEndpointUrl
    )
    this.credentialManager.on("received", () => {
      log.info("Credentials received, initializing firehose client")
      if (!this.pendingRecords.length || !!this.flushDeferred) {
        log.debug(
          "Nothing to flush upon credential receipt OR flush already in progress"
        )
        return
      }
      this.flush().catch((e: Error) => {
        log.error(
          `Error flushing logs after credential receipt: ${e.message}`,
          e
        )
      })
    })
  }
  append(record: Record): void {
    const pendingCount = this.pendingRecords.length + 1,
      removeCount = LogQueueMaxRecords - pendingCount

    if (removeCount < 0) {
      this.pendingRecords.splice(0, Math.abs(removeCount))
    }

    this.pendingRecords.push({
      timestamp: Date.now(),
      ...record,
      app: record.app?.length > 0 ? record.app : "UNKNOWN",
      env: record.env?.length > 0 ? record.env : "UNKNOWN",
      url: typeof window === "undefined" ? "local://" : window.location.href
    })

    this.flush()
  }

  /**
   * Create the Firehose client for a loaded credential set.
   * @param creds Loaded Firehose credentials.
   * @returns Firehose client.
   */
  private async getFirehose(creds: AWSCredentials): Promise<FirehoseClient> {
    const { region, streamName } = creds

    if (!region || !streamName) {
      throw new Error("Region or stream name not available")
    }

    const { FirehoseClient } = await getFirehoseModule()
    const client = new FirehoseClient({
      region: creds.region,
      credentials: pick(creds, "accessKeyId", "secretAccessKey", "sessionToken")
    })

    return client
  }

  /**
   * Flush pending records
   *
   * @returns {Promise<void>}
   */
  private async flush(): Promise<void> {
    if (!!this.flushDeferred) {
      log.debug("Flush already in progress, skipping")
      return
    }

    if (!this.pendingRecords.length) {
      log.debug("No pending records to flush")
      return
    }
    const creds = this.credentialManager.getCredentials()
    if (!creds) {
      log.warn("No credentials available for flush")
      return
    }

    const deferred = (this.flushDeferred = new Deferred<void>())
    try {
      const { streamName } = creds,
        client = await this.getFirehose(creds),
        { PutRecordBatchCommand } = await getFirehoseModule()

      while (this.pendingRecords.length) {
        const chunkSize = Math.min(this.pendingRecords.length, 10),
          records = this.pendingRecords.splice(0, chunkSize),
          recordJsons = records.map(record => JSON.stringify(record))

        if (log.isDebugEnabled()) log.debug("Records", records)

        const textEncoder = new TextEncoder(),
          batch: PutRecordBatchInput["Records"] = recordJsons.map(jsonStr => ({
            Data: textEncoder.encode(jsonStr)
          }))

        log.info(`Pushing ${records.length} records to firehose`)

        const cmd = new PutRecordBatchCommand({
          DeliveryStreamName: streamName,
          Records: batch
        })

        const resp = await client.send(cmd)
        const failed = resp.FailedPutCount || 0
        if (failed) {
          const rr = resp.RequestResponses || []
          for (let i = 0; i < rr.length; i++) {
            if (rr[i].ErrorCode) {
              log.warn(
                `Record failed: ${rr[i].ErrorCode} ${rr[i].ErrorMessage}`
              )
              //this.pendingRecords.unshift(records[i])
            }
          }
          log.info(`PutRecordBatch failed=${failed}; requeued failed records`)
        } else {
          log.info(`PutRecordBatch ok count=${records.length}`)
        }
      }
      deferred.resolve()
    } catch (err) {
      log.error("Failed to push logs", err)
      if (err.name === ExpiredTokenExceptionCode) {
        this.credentialManager.forceUpdateCredentials()
      }
      deferred.reject(err)
    } finally {
      this.flushDeferred = null

      // if (this.pendingRecords.length)
      //   this.flush()
    }

    return deferred.promise
  }
}

export default AWSFirehoseAppender
