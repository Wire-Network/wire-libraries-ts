import { AWSFirehoseAppender, getLoggingManager, Level, PushLogRecordsAppender } from "@wireio/shared"

declare global {
  const WIRE_PUSH_URL: string
}

const logManager = getLoggingManager()
//logManager.addAppenders(new AWSFirehoseAppender(WIRE_PUSH_URL))
logManager.addAppenders(new PushLogRecordsAppender(WIRE_PUSH_URL))
logManager.globalMetadata = {
  env: "local",
  app: "web-hub-webapp",
  data: {
    globalMetaValue: "web-logging-example"
  }
}

const log = logManager.getLogger("web-logging-example")
log.info("Logger initialized")
document.getElementById("btn")!.addEventListener("click", () => {
  const count = 5;
  for (let i = 0; i < count; i++) {
    log.info("log message", { i, ts: new Date().toISOString(), ua: navigator.userAgent });
    log.error(`error ${i}`, Error(`sample error ${i}`));

    // WITH METADATA SPECIFIC TO THIS SPECIFIC LOG RECORD
    log.log(Level.info, {data: { wireDataId: "123"}}, `log with metadata: ${i}`, { i });
  }
  log.info(`enqueued ${count} logs`);
});

export {}