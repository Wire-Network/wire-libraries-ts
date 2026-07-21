/**
 * Structured, machine-readable diagnostic context captured at a {@link NestedError}
 * throw site — the values that make a failure diagnosable (the `text` that failed to
 * parse, a schema / type name, an id, …). Heterogeneous by nature, so the values are
 * `unknown` (a documented type-erased bag, not a shortcut).
 */
export type NestedErrorContext = Record<string, unknown>

/**
 * Options for {@link NestedError} — what it preserves about the failure it wraps.
 */
export interface NestedErrorOptions<
  Context extends NestedErrorContext = NestedErrorContext
> {
  /**
   * The originating error(s) — the root-cause chain that must NOT be swallowed. A
   * non-Error thrown value is coerced to an Error; the first becomes the native
   * ES2022 `Error.cause`.
   */
  cause?: unknown
  /** Diagnostic context captured at the throw site. */
  context?: Context
}

/**
 * An Error that PRESERVES what it wraps instead of restringing it. Given a new
 * message string, it ALSO retains the full cause chain: the originating error(s)
 * survive as {@link NestedError.causes} (and the native `Error.cause`) — the real
 * Error objects, so **each cause keeps its own stack trace and message** — and a
 * nested-exception `Caused by:` section per cause is appended to this error's
 * {@link NestedError.stack}, so the whole chain (each cause's stack + message) is
 * visible wherever the error is printed, not only via the programmatic accessors.
 * The diagnostic {@link NestedError.context} (the `text`, the schema / type name, …)
 * is BOTH a structured property AND folded into the message.
 *
 * Never rewrite a caught error into a bare ``new Error(`… ${err.message}`)`` — that
 * SWALLOWS the cause and the context. Wrap it:
 * `new NestedError("…", { cause: err, context: { … } })`.
 */
export class NestedError<
  Context extends NestedErrorContext = NestedErrorContext
> extends Error {
  /** The originating error chain (flattened + coerced to Error); `causes[0]` is the native `.cause`. */
  readonly causes: Error[]

  /** The diagnostic context captured at the throw site. */
  readonly context: Context

  /**
   * @param message - The high-level failure description.
   * @param options - The {@link NestedErrorOptions.cause} to preserve + the {@link NestedErrorOptions.context} to capture.
   */
  constructor(message: string, options: NestedErrorOptions<Context> = {}) {
    const causes = NestedError.toErrors(options.cause)
    super(
      NestedError.composeMessage(message, options.context),
      causes.length > 0 ? { cause: causes[0] } : undefined
    )
    this.name = "NestedError"
    this.causes = causes
    this.context = options.context ?? ({} as Context)
    // Retain each cause's stack + message VISIBLY: append a `Caused by:` section
    // per cause so the full chain shows in `.stack` (and any logger that prints it),
    // not only via the programmatic `.causes` / native `.cause`.
    this.stack = NestedError.composeStack(this.stack, causes)
  }
}

export namespace NestedError {
  /** Max characters of any single context value folded into the message — long `text` is truncated. */
  export const ContextPreviewMaxChars = 200

  /** The marker appended when a folded context value is truncated. */
  export const TruncationSuffix = "…"

  /** Prefix marking each retained cause in the composed stack (nested-exception style). */
  export const CausedByPrefix = "Caused by: "

  /**
   * Append a `Caused by:` section per cause to `stack`, so every cause's stack trace
   * AND message stay visible in `.stack` (and any logger that prints it) — not only
   * via the programmatic {@link NestedError.causes} / native `Error.cause`. Each
   * cause's own `.stack` already begins with its `name: message`, so both are kept.
   *
   * @param stack - The wrapping error's own stack (may be undefined in exotic runtimes).
   * @param causes - The retained cause chain.
   * @returns The wrapping stack with one appended `Caused by:` section per cause.
   */
  export function composeStack(stack: string | undefined, causes: Error[]): string {
    return causes.reduce(
      (composed, cause) =>
        `${composed}\n${CausedByPrefix}${cause.stack ?? `${cause.name}: ${cause.message}`}`,
      stack ?? ""
    )
  }

  /**
   * Create a {@link NestedError}.
   *
   * @param message - The high-level failure description.
   * @param options - The cause to preserve + the context to capture.
   * @returns The constructed error.
   */
  export function create<Context extends NestedErrorContext = NestedErrorContext>(
    message: string,
    options: NestedErrorOptions<Context> = {}
  ): NestedError<Context> {
    return new NestedError(message, options)
  }

  /**
   * Create + throw a {@link NestedError}.
   *
   * @param message - The high-level failure description.
   * @param options - The cause to preserve + the context to capture.
   */
  export function throwError<
    Context extends NestedErrorContext = NestedErrorContext
  >(message: string, options: NestedErrorOptions<Context> = {}): never {
    throw create(message, options)
  }

  /**
   * Coerce a thrown value (an Error, an array of them, or any value) into a flat
   * `Error[]`, so a caught `unknown` can be preserved as a cause without loss.
   *
   * @param cause - The caught / rejected value.
   * @returns The coerced error chain (empty when `cause` is nullish).
   */
  export function toErrors(cause: unknown): Error[] {
    return (Array.isArray(cause) ? cause : cause == null ? [] : [cause]).map(
      toError
    )
  }

  /**
   * Coerce a single thrown value into an Error (Errors pass through unchanged).
   *
   * @param value - The caught value.
   * @returns `value` when it is an Error, else a new Error wrapping its string form.
   */
  export function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value))
  }

  /**
   * Fold a compact, truncated {@link NestedErrorContext} summary into the message so
   * it is visible wherever the message is (logs, stack traces), not only on the
   * `.context` property.
   *
   * @param message - The base message.
   * @param context - The context to summarize, if any.
   * @returns `message` with a ` (key=value, …)` suffix when context is non-empty.
   */
  export function composeMessage(
    message: string,
    context?: NestedErrorContext
  ): string {
    const entries = context == null ? [] : Object.entries(context)
    return entries.length === 0
      ? message
      : `${message} (${entries
          .map(([key, value]) => `${key}=${previewValue(value)}`)
          .join(", ")})`
  }

  /**
   * Render one context value for the message suffix — strings verbatim, everything
   * else via a bigint-/cycle-safe form, truncated to {@link ContextPreviewMaxChars}.
   *
   * @param value - The context value.
   * @returns The truncated preview string.
   */
  export function previewValue(value: unknown): string {
    const rendered = typeof value === "string" ? value : safeStringify(value)
    return rendered.length > ContextPreviewMaxChars
      ? `${rendered.slice(0, ContextPreviewMaxChars)}${TruncationSuffix}`
      : rendered
  }
}

/**
 * A best-effort rendering of `value` for a message preview: JSON when serializable,
 * else `String(value)`. Pure display fallback — a BigInt or a circular object makes
 * `JSON.stringify` throw — NOT error handling, so the catch is a deliberate render
 * fallback rather than a swallow.
 *
 * @param value - The value to render.
 * @returns A single-line string form of `value`.
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
