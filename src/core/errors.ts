/**
 * Error hierarchy for the Convexity Infra SDK.
 *
 * Every error the SDK can throw extends {@link InfraError}, so callers can do a single
 * `catch (err) { if (err instanceof InfraError) ... }` to distinguish SDK errors from
 * unrelated exceptions. HTTP failures extend {@link InfraAPIError} and are further
 * specialized by status code (see {@link errorFromResponse}), matching the status code
 * table in the API's error conventions doc.
 */

/** Base class for every error raised by this SDK. */
export class InfraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The request never reached the server (DNS/TCP/TLS failure, aborted connection, etc). */
export class InfraConnectionError extends InfraError {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}

/** The request was aborted because it exceeded the configured timeout. */
export class InfraConnectionTimeoutError extends InfraConnectionError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
  }
}

/**
 * The server responded with a JSON envelope where `status: false`. Constructed via
 * {@link errorFromResponse}, which picks the most specific subclass for the HTTP status
 * code — prefer catching a subclass (e.g. {@link RateLimitError}) over this base class
 * when you need to branch on the failure kind.
 */
export class InfraAPIError extends InfraError {
  constructor(
    /** HTTP status code returned by the server. */
    readonly status: number,
    message: string,
    /** Field-level validation messages, when the server included an `errors` array. */
    readonly errors: readonly string[] | undefined,
    /** The raw, parsed JSON response body, for callers that need fields this SDK doesn't model. */
    readonly body: unknown,
    /** Response headers, lower-cased keys. */
    readonly headers: Readonly<Record<string, string>>,
  ) {
    super(message);
  }
}

/** `400 Bad Request` — malformed parameter, body, or unsupported value. */
export class BadRequestError extends InfraAPIError {}

/** `401 Unauthorized` — missing/invalid token, or missing project/business context. */
export class AuthenticationError extends InfraAPIError {}

/** `402 Payment Required` — e.g. wallet balance cannot cover estimated gas, or no active subscription. */
export class PaymentRequiredError extends InfraAPIError {}

/** `403 Forbidden` — test token on a live-only endpoint, missing capability, or cross-business access. */
export class PermissionDeniedError extends InfraAPIError {}

/** `404 Not Found` — unknown id, or a resource not owned by your project. */
export class NotFoundError extends InfraAPIError {}

/** `409 Conflict` — e.g. an `Idempotency-Key` was reused with a different request body. */
export class ConflictError extends InfraAPIError {}

/** `422 Unprocessable Entity` — validation passed but the operation failed (e.g. a transfer reverted on-chain). */
export class UnprocessableEntityError extends InfraAPIError {}

/** `429 Too Many Requests` — throttled. Honor {@link retryAfterSeconds} before retrying. */
export class RateLimitError extends InfraAPIError {
  constructor(
    status: number,
    message: string,
    errors: readonly string[] | undefined,
    body: unknown,
    headers: Readonly<Record<string, string>>,
    /** Seconds to wait before retrying, from the response body's `retryAfter` or a `Retry-After` header. */
    readonly retryAfterSeconds: number | undefined,
  ) {
    super(status, message, errors, body, headers);
  }
}

/** `5xx` — an unexpected failure on the server. */
export class InternalServerError extends InfraAPIError {}

/** `503 Service Unavailable` — an upstream dependency (e.g. gas pricing) is temporarily unavailable. Safe to retry. */
export class ServiceUnavailableError extends InfraAPIError {}

/** Any error status this SDK doesn't map to a more specific class. */
export class UnknownAPIError extends InfraAPIError {}

/**
 * Builds the most specific {@link InfraAPIError} subclass for a given HTTP status,
 * following the status code table in the Infra API's error conventions.
 */
export function errorFromResponse(
  status: number,
  parsedBody: unknown,
  headers: Readonly<Record<string, string>>,
): InfraAPIError {
  const body = (parsedBody ?? {}) as {
    message?: unknown;
    errors?: unknown;
    retryAfter?: unknown;
  };
  const message = typeof body.message === "string" ? body.message : `Request failed with status ${status}`;
  const errors = Array.isArray(body.errors) ? body.errors.filter((e): e is string => typeof e === "string") : undefined;

  switch (status) {
    case 400:
      return new BadRequestError(status, message, errors, parsedBody, headers);
    case 401:
      return new AuthenticationError(status, message, errors, parsedBody, headers);
    case 402:
      return new PaymentRequiredError(status, message, errors, parsedBody, headers);
    case 403:
      return new PermissionDeniedError(status, message, errors, parsedBody, headers);
    case 404:
      return new NotFoundError(status, message, errors, parsedBody, headers);
    case 409:
      return new ConflictError(status, message, errors, parsedBody, headers);
    case 422:
      return new UnprocessableEntityError(status, message, errors, parsedBody, headers);
    case 429: {
      const bodyRetryAfter = typeof body.retryAfter === "number" ? body.retryAfter : undefined;
      const headerRetryAfter = headers["retry-after"] !== undefined ? Number(headers["retry-after"]) : undefined;
      const retryAfterSeconds =
        bodyRetryAfter ?? (headerRetryAfter !== undefined && Number.isFinite(headerRetryAfter) ? headerRetryAfter : undefined);
      return new RateLimitError(status, message, errors, parsedBody, headers, retryAfterSeconds);
    }
    case 503:
      return new ServiceUnavailableError(status, message, errors, parsedBody, headers);
    default:
      if (status >= 500) return new InternalServerError(status, message, errors, parsedBody, headers);
      return new UnknownAPIError(status, message, errors, parsedBody, headers);
  }
}

/** Raised by `POST /v1/oauth/token` failures, which use an OAuth 2.0 error body instead of the standard envelope. */
export class InfraAuthTokenError extends InfraError {
  constructor(
    readonly status: number,
    /** OAuth 2.0 error code, e.g. `invalid_client`. */
    readonly error: string,
    /** Human-readable OAuth 2.0 error description. */
    readonly errorDescription: string | undefined,
  ) {
    super(errorDescription ? `${error}: ${errorDescription}` : error);
  }
}

/** Raised by the webhook helpers in `core/webhooks.ts` when a signature fails to verify. */
export class WebhookSignatureVerificationError extends InfraError {}
