import { FileAppender } from "../appenders/FileAppender.js"
import { getLogger } from "../getLogger.js"
import { LevelNames } from "../Level.js"
import { getLoggingManager } from "../LoggingManager.js"

async function run() {
  const manager = getLoggingManager()
  const fileAppender = new FileAppender({
    enableRolling: true,
    maxFiles: 4,
    maxSize: 20480
  })
  manager.setAppenders(fileAppender).setRootLevel("trace")

  const log = getLogger(__filename)
  await fileAppender.close()
}

run().catch((err) => console.error(`failed`, err))
