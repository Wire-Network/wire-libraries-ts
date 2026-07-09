import { Deferred } from "@wireio/shared/helpers/Deferred"
import { PushLogRecordsAppender } from "@wireio/shared/logging/appenders/push/PushLogRecordsAppender"
import { Level } from "@wireio/shared/logging/Level"
import type { LogRecord } from "@wireio/shared/logging/LogRecord"

enum HttpMethod {
  POST = "POST",
  PUT = "PUT"
}

const EndpointUrl = "https://logs.example.test/push"
const LogCategory = "push-log-records-appender-test"
const QueueCapRecordCount = 10000
const FirstPutRequestNumber = 1
const FirstPutRequestIndex = 0
const RetryPutRequestIndex = 1
const AsyncPollAttempts = 20
const HttpStatusOk = 200
const HttpStatusServerError = 500
const FailedRecordMessage = "failed-record"
const ConcurrentRecordMessagePrefix = "concurrent-record"

interface PushLogPayload {
  records: string[]
}

const createRecord = (message: string): LogRecord => ({
  timestamp: Date.now(),
  category: LogCategory,
  level: Level.info,
  message,
  args: []
})

const createFetchMock = (
  firstPutResponse: Deferred<Response>
): jest.MockedFunction<typeof fetch> => {
  let putRequestCount = 0

  return jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    (_input, init) => {
      if (init?.method === HttpMethod.POST) {
        return Promise.resolve(new Response(null, { status: HttpStatusOk }))
      }

      if (init?.method === HttpMethod.PUT) {
        putRequestCount += 1

        return putRequestCount === FirstPutRequestNumber
          ? firstPutResponse.promise
          : Promise.resolve(new Response(null, { status: HttpStatusOk }))
      }

      return Promise.reject(
        new Error(`Unexpected fetch method: ${init?.method}`)
      )
    }
  ) as jest.MockedFunction<typeof fetch>
}

const countFetchMethodCalls = (
  fetchMock: jest.MockedFunction<typeof fetch>,
  method: HttpMethod
): number =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method).length

const waitForFetchMethodCallCount = async (
  fetchMock: jest.MockedFunction<typeof fetch>,
  method: HttpMethod,
  count: number
): Promise<void> => {
  for (let attempt = 0; attempt < AsyncPollAttempts; attempt++) {
    if (countFetchMethodCalls(fetchMock, method) >= count) {
      return
    }

    await new Promise<void>(resolve => setImmediate(resolve))
  }

  throw new Error(`Expected ${count} ${method} fetch calls`)
}

const getPutRequestRecords = (
  fetchMock: jest.MockedFunction<typeof fetch>,
  requestIndex: number
): LogRecord[] => {
  const putCall = fetchMock.mock.calls.filter(
    ([, init]) => init?.method === HttpMethod.PUT
  )[requestIndex]
  const body = putCall?.[1]?.body

  if (typeof body !== "string") {
    throw new Error(
      `Expected PUT request ${requestIndex} to have a string body`
    )
  }

  const payload = JSON.parse(body) as PushLogPayload
  return payload.records.map(record => JSON.parse(record) as LogRecord)
}

const appendConcurrentRecords = (appender: PushLogRecordsAppender): void => {
  Array.from({ length: QueueCapRecordCount }).forEach((_, index) => {
    appender.append(createRecord(`${ConcurrentRecordMessagePrefix}-${index}`))
  })
}

describe("PushLogRecordsAppender", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("keeps failed-send requeues within the queue cap", async () => {
    const firstPutResponse = new Deferred<Response>()
    const fetchMock = createFetchMock(firstPutResponse)
    global.fetch = fetchMock

    const appender = new PushLogRecordsAppender(EndpointUrl)

    try {
      await expect(
        appender.credentialManager.ensureCredentials()
      ).resolves.toBe(true)

      appender.append(createRecord(FailedRecordMessage))
      const firstFlush = appender.forceFlush()
      await waitForFetchMethodCallCount(
        fetchMock,
        HttpMethod.PUT,
        FirstPutRequestNumber
      )

      appendConcurrentRecords(appender)

      firstPutResponse.resolve(
        new Response(null, { status: HttpStatusServerError })
      )
      await expect(firstFlush).rejects.toThrow(
        `Push failed with status ${HttpStatusServerError}`
      )

      await appender.forceFlush()

      const firstPutRecords = getPutRequestRecords(
        fetchMock,
        FirstPutRequestIndex
      )
      const retryPutRecords = getPutRequestRecords(
        fetchMock,
        RetryPutRequestIndex
      )

      expect(firstPutRecords).toHaveLength(FirstPutRequestNumber)
      expect(firstPutRecords[0].message).toBe(FailedRecordMessage)
      expect(retryPutRecords).toHaveLength(QueueCapRecordCount)
      expect(retryPutRecords[0].message).toBe(
        `${ConcurrentRecordMessagePrefix}-0`
      )
      expect(retryPutRecords).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: FailedRecordMessage })
        ])
      )
    } finally {
      appender.destroy()
    }
  })
})
