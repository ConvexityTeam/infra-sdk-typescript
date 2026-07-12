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

export class InfraConnectionTimeoutError extends InfraConnectionError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
  }
}

/**
 * Constructed via {@link errorFromResponse}, which picks the most specific subclass for
 * the HTTP status code — prefer catching a subclass (e.g. {@link RateLimitError}) over
 * this base class when you need to branch on the failure kind.
 */
export class InfraAPIError extends InfraError {
  constructor(
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

export class BadRequestError extends InfraAPIError {}
export class AuthenticationError extends InfraAPIError {}
export class PaymentRequiredError extends InfraAPIError {}
export class PermissionDeniedError extends InfraAPIError {}
export class NotFoundError extends InfraAPIError {}
export class ConflictError extends InfraAPIError {}
export class UnprocessableEntityError extends InfraAPIError {}

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

export class InternalServerError extends InfraAPIError {}
export class ServiceUnavailableError extends InfraAPIError {}
export class UnknownAPIError extends InfraAPIError {}

/** Builds the most specific {@link InfraAPIError} subclass for a given HTTP status. */
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
    readonly error: string,
    readonly errorDescription: string | undefined,
  ) {
    super(errorDescription ? `${error}: ${errorDescription}` : error);
  }
}

export class WebhookSignatureVerificationError extends InfraError {}
