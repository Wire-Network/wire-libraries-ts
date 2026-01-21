import { FirehoseClient, PutRecordBatchCommand } from "@aws-sdk/client-firehose";

const API_BASE = "https://dxwtjurpvh.execute-api.us-east-1.amazonaws.com";

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

interface CredentialsResponse {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  streamName: string;
  region: string;
  expiration: string;
}

function log(message: string): void {
  console.log(`[CredentialManager] ${message}`);
}

export class CredentialManager {
  private creds: AWSCredentials = null;
  private streamName: string = null;
  private region: string = null;
  private refreshTimer: ReturnType<typeof setTimeout> = null;
  private loading: Promise<AWSCredentials> = null;

  async get(): Promise<AWSCredentials> {
    if (this.creds) return this.creds;
    if (this.loading) return this.loading;
    this.loading = this._load();
    try {
      const c = await this.loading;
      return c;
    } finally {
      this.loading = null;
    }
  }

  getStreamName(): string {
    return this.streamName;
  }

  getRegion(): string {
    return this.region;
  }

  private async _load(): Promise<AWSCredentials> {
    const r = await fetch(API_BASE + "/creds", {
      method: "GET",
      credentials: "include",
    });
    if (!r.ok) throw new Error(`creds http ${r.status}`);
    const j: CredentialsResponse = await r.json();

    this.creds = {
      accessKeyId: j.accessKeyId,
      secretAccessKey: j.secretAccessKey,
      sessionToken: j.sessionToken,
    };
    this.streamName = j.streamName;
    this.region = j.region;

    const expMs = Date.parse(j.expiration);
    const refreshInMs = Math.max(10_000, expMs - Date.now() - 3 * 60 * 1000);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.creds = null;
      this.get().catch((e: Error) => log("refresh failed: " + e.message));
    }, refreshInMs);

    log(`Got creds, expire=${j.expiration}, stream=${this.streamName}, region=${this.region}`);
    return this.creds;
  }

  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.creds = null;
  }
}

export class LogQueue {

  private q: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> = null;
  private flushing = false;
  private maxRecords = 500;
  private maxBytes = 4 * 1024 * 1024;
  private flushIntervalMs = 1000;

  constructor(public readonly credMgr: CredentialManager) {

  }

  enqueue(obj: Record<string, unknown>): void {
    const line = JSON.stringify(obj) + "\n";
    this.q.push(line);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(
        () => this.flush().catch((e: Error) => log("flush err: " + e.message)),
        this.flushIntervalMs
      );
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const creds = await this.credMgr.get();
      const region = this.credMgr.getRegion();
      const streamName = this.credMgr.getStreamName();

      if (!region || !streamName) {
        throw new Error("Region or stream name not available");
      }

      const client = new FirehoseClient({
        region,
        credentials: creds,
      });

      while (this.q.length) {
        const batch: { Data: Uint8Array }[] = [];
        let bytes = 0;

        while (this.q.length && batch.length < this.maxRecords) {
          const s = this.q[0];
          const b = new TextEncoder().encode(s).byteLength;
          if (batch.length > 0 && bytes + b > this.maxBytes) break;
          this.q.shift();
          batch.push({ Data: Uint8Array.from(s) });
          bytes += b;
        }

        const cmd = new PutRecordBatchCommand({
          DeliveryStreamName: streamName,
          Records: batch,
        });

        const resp = await client.send(cmd);
        const failed = resp.FailedPutCount || 0;
        if (failed) {
          const rr = resp.RequestResponses || [];
          for (let i = 0; i < rr.length; i++) {
            if (rr[i].ErrorCode) {
              this.q.unshift(batch[i].Data.toString());
            }
          }
          log(`PutRecordBatch failed=${failed}; requeued failed records`);
          await new Promise((r) => setTimeout(r, 500));
        } else {
          log(`PutRecordBatch ok count=${batch.length}`);
        }

        if (this.q.length) await new Promise((r) => setTimeout(r, 50));
      }
    } finally {
      this.flushing = false;
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

export default CredentialManager;
