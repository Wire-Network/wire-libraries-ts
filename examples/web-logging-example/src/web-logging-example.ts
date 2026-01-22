import { AWSFirehoseAppender, getLoggingManager } from "@wireio/shared"


const logManager = getLoggingManager()
logManager.addAppenders(new AWSFirehoseAppender())

const log = logManager.getLogger("web-logging-example")
log.info("Logger initialized")
document.getElementById("btn")!.addEventListener("click", () => {
  const count = 5;
  for (let i = 0; i < count; i++) {
    log.info("log message", { i, ts: new Date().toISOString(), ua: navigator.userAgent });
    log.error(`error ${i}`, Error(`sample error ${i}`));
  }
  log.info(`enqueued ${count} logs`);
});

export {}