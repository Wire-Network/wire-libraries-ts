import { FirehoseClient, PutRecordBatchCommand } from "@aws-sdk/client-firehose";

const API_BASE = (window.__API_BASE__ || "REPLACE_WITH_HTTP_API_URL"); // e.g. https://xxxxx.execute-api.us-east-1.amazonaws.com/

const outEl = document.getElementById("out");
function log(line) {
  outEl.textContent += line + "\n";
}

class CredentialManager {
  constructor() {
    this.creds = null;
    this.streamName = null;
    this.region = null;
    this.refreshTimer = null;
    this.loading = null;
  }

  async get() {
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

  async _load() {
    const r = await fetch(API_BASE + "creds", {
      method: "GET",
      credentials: "include"
    });
    if (!r.ok) throw new Error(`creds http ${r.status}`);
    const j = await r.json();

    this.creds = {
      accessKeyId: j.accessKeyId,
      secretAccessKey: j.secretAccessKey,
      sessionToken: j.sessionToken
    };
    this.streamName = j.streamName;
    this.region = j.region;

    const expMs = Date.parse(j.expiration);
    const refreshInMs = Math.max(10_000, expMs - Date.now() - 3 * 60 * 1000);
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.creds = null;
      this.get().catch((e) => log("refresh failed: " + e.message));
    }, refreshInMs);

    log(`Got creds, expire=${j.expiration}, stream=${this.streamName}, region=${this.region}`);
    return this.creds;
  }
}

class LogQueue {
  constructor(credMgr) {
    this.credMgr = credMgr;
    this.q = [];
    this.flushTimer = null;
    this.flushing = false;
    this.maxRecords = 500;
    this.maxBytes = 4 * 1024 * 1024;
    this.flushIntervalMs = 1000;
  }

  enqueue(obj) {
    const line = JSON.stringify(obj) + "\n";
    this.q.push(line);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush().catch(e => log("flush err: " + e.message)), this.flushIntervalMs);
    }
  }

  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const creds = await this.credMgr.get();

      const client = new FirehoseClient({
        region: this.credMgr.region,
        credentials: creds
      });

      while (this.q.length) {
        const batch = [];
        let bytes = 0;

        while (this.q.length && batch.length < this.maxRecords) {
          const s = this.q[0];
          const b = new TextEncoder().encode(s).byteLength;
          if (batch.length > 0 && (bytes + b) > this.maxBytes) break;
          this.q.shift();
          batch.push({ Data: s });
          bytes += b;
        }

        const cmd = new PutRecordBatchCommand({
          DeliveryStreamName: this.credMgr.streamName,
          Records: batch
        });

        const resp = await client.send(cmd);
        const failed = resp.FailedPutCount || 0;
        if (failed) {
          // naive retry: requeue failed records
          const rr = resp.RequestResponses || [];
          for (let i = 0; i < rr.length; i++) {
            if (rr[i].ErrorCode) {
              this.q.unshift(batch[i].Data);
            }
          }
          log(`PutRecordBatch failed=${failed}; requeued failed records`);
          // backoff
          await new Promise(r => setTimeout(r, 500));
        } else {
          log(`PutRecordBatch ok count=${batch.length}`);
        }

        // avoid tight loop
        if (this.q.length) await new Promise(r => setTimeout(r, 50));
      }
    } finally {
      this.flushing = false;
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

const credMgr = new CredentialManager();
const q = new LogQueue(credMgr);

document.getElementById("btn").addEventListener("click", () => {
  for (let i = 0; i < 100; i++) {
    q.enqueue({
      level: "info",
      msg: "hello",
      i,
      ts: new Date().toISOString(),
      ua: navigator.userAgent
    });
  }
  log("enqueued 100 logs");
});
