# Push Log Records Appender

This is a logging appender (src @packages/shared/src/logging/appenders/push/PushLogRecordsAppender.ts), which is a client to the
`PushLogRecordsLambda` (located at `../wire-cloud-infra/lib/lambda/log-ingest/src/PushLogRecordsLambda.ts` from the root of `wire-libraries-ts` repo) you have created previously.

Use the AWS firehose appender as a template @../aws-firehose/AWSFirehoseAppender.ts

Using the `fetch` implementation in the browser for communication throughout, be sure to enable `cors` and configure it to send the cookie header and update via `set-cookie` header,

## Setup Credential Cookie `POST`
`class PushLogRecordsCredentialManager` is responsible for the credential implementation.  Invoke the lambda via the `endpointUrl` (using standard `fetch` with `cors`) provided in the constructor with a JSON request `{}`, which will return a valid `Set-Cookie` (cookies last for 30 mins (make this a constant at the top of the file, so it can be adjusted in dev), so when invoked, be sure to check the expiration time of the cookie).

The cookie is accessible from the browser (`Http Only` is NOT set).  The cookie name is `wire_logs_id`.

## Push logs `PUT`

`class PushLogRecordsAppender` should queue and push
`LogRecord` instances either when the queue depth reaches `100` or `10secs` has elapsed (make both constants at the top of the file so they can be adjusted in development).

If a failure occurs `console.debug("Failed to push log records", ...)`

