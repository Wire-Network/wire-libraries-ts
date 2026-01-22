/* eslint-disable typescript/no-explicit-any */
import { isString } from '../../../guards/primitive.js'
import { FirehoseClient, PutRecordBatchCommand, PutRecordBatchInput } from "@aws-sdk/client-firehose"
import {
  Credentials as IAWSTemporaryCredentials,
  ExpiredTokenException,
} from "@aws-sdk/client-sts"
import { Level } from "../../Level.js"

import AWSFirehoseCredentialManager from "./AWSFirehoseCredentialManager.js"
import { getInternalLogger } from "../../InternalLogger.js"
import { getValue, guard } from "../../../guards/index.js"
import { pick } from "lodash"
import { Deferred } from "../../../helpers/index.js"
import { LogRecord } from "../../LogRecord.js"
import { Appender } from "../../Appender.js"

const LogQueueMaxRecords = 10000

const log = getInternalLogger(import.meta.filename)


export class AWSFirehoseAppender<Record extends LogRecord = LogRecord>
  implements Appender<Record> {
  private pendingRecords = Array<LogRecord>()
  private flushDeferred: Deferred<void>
  private flushIntervalMs = 1000;

  constructor(public readonly credentialManager: AWSFirehoseCredentialManager = new AWSFirehoseCredentialManager()) {
    credentialManager.on("received", () => {
      log.info("Credentials received, initializing firehose client")
      if (!this.pendingRecords.length || !!this.flushDeferred) {
        log.debug("Nothing to flush upon credential receipt OR flush already in progress")
        return
      }
      this.flush()
        .catch((e: Error) => {
          log.error(`Error flushing logs after credential receipt: ${e.message}`, e)
        })
    })
  }
  append(record: Record): void {
    const
      pendingCount = this.pendingRecords.length + 1,
      removeCount = LogQueueMaxRecords - pendingCount

    if (removeCount < 0) {
      this.pendingRecords.splice(0, Math.abs(removeCount))
    }

    this.pendingRecords.push({
      ...record,
      app: "web",
      timestamp: Date.now(),
      env: typeof process === "undefined" ? "WEB" : process.env.WIRE_ENV ?? "SHARED",
      url: typeof window === "undefined" ? "local://node" : window.location.href,
    })

    this.flush()
  }

  /**
   * Create the firehose client and return
   *
   * @param {IAWSTemporaryCredentials} credentials
   * @param {boolean} flush
   * @returns {Firehose}
   */
  private getFirehose(): FirehoseClient {
    const creds = this.credentialManager.getCredentials()

    if (!creds) {
      log.warn("No credentials available for flush")
      return null
    }

    const { region, streamName } = creds

    if (!region || !streamName) {
      throw new Error("Region or stream name not available")
    }

    const client = new FirehoseClient({
      region: creds.region,
      credentials: pick(creds, "accessKeyId", "secretAccessKey", "sessionToken"),
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
    const { streamName } = creds,
      client = this.getFirehose()
    if (!client) {
      log.warn("No firehose client available, skipping flush")
      return
    }

    const deferred = this.flushDeferred = new Deferred<void>()
    try {
      while (this.pendingRecords.length) {
        const
          chunkSize = Math.min(this.pendingRecords.length, 10),
          records = this.pendingRecords.splice(0, chunkSize),
          recordJsons = records.map(record => JSON.stringify(record))

        // log.info("Record JSONs", recordJsons)

        const
          textEncoder = new TextEncoder(),
          batch: PutRecordBatchInput["Records"] = recordJsons.map(jsonStr => ({
            Data: textEncoder.encode(jsonStr)
          }))

        log.info(`Pushing ${records.length} records to firehose`)

        const cmd = new PutRecordBatchCommand({
          DeliveryStreamName: streamName,
          Records: batch,
        })

        const resp = await client.send(cmd)
        const failed = resp.FailedPutCount || 0
        if (failed) {
          const rr = resp.RequestResponses || []
          for (let i = 0; i < rr.length; i++) {
            if (rr[i].ErrorCode) {
              log.warn(`Record failed: ${rr[i].ErrorCode} ${rr[i].ErrorMessage}`)
              //this.pendingRecords.unshift(records[i])
            }
          }
          log.info(`PutRecordBatch failed=${failed}; requeued failed records`)
        } else {
          log.info(`PutRecordBatch ok count=${records.length}`)
        }

      }
    } catch (err) {
      log.error("Failed to push logs", err)
      if (err.code === ExpiredTokenException) {
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
