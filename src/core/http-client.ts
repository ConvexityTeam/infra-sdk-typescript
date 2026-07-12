import { SDK_VERSION } from "./version.js";
import {
  errorFromResponse,
  InfraConnectionError,
  InfraConnectionTimeoutError,
  RateLimitError,
  ServiceUnavailableError,
  InternalServerError,
} from "./errors.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method: HttpMethod;
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Sent as the `Idempotency-Key` header. Besides the header itself, its presence tells
   * the retry logic that a connection failure is safe to retry — the server can dedupe
   * a resubmission with the same key.
   */
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface HttpClientOptions {
  baseURL: string;
  /** Invoked before every physical attempt (including retries) to get fresh auth headers. */
  getAuthHeaders: () => Promise<Record<string, string>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

export class HttpClient {
  private readonly baseURL: string;
  private readonly getAuthHeaders: () => Promise<Record<string, string>>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: HttpClientOptions) {
    this.baseURL = options.baseURL;
    this.getAuthHeaders = options.getAuthHeaders;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  /** Issues a request against the Infra API and returns the unwrapped `data` field of the response envelope. */
  async request<T>(options: RequestOptions): Promise<T> {
    const url = buildUrl(this.baseURL, options.path, options.query);
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    // A connection failure (no response received) is only safe to blindly retry when the
    // request is naturally idempotent (GET) or the caller gave us an Idempotency-Key the
    // server can use to dedupe a resubmission. Otherwise a retry risks double-execution.
    const retryableOnConnectionError = options.method === "GET" || Boolean(options.idempotencyKey);

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      attempt++;

      const authHeaders = await this.getAuthHeaders();
      const requestHeaders: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": `infra-sdk-typescript/${SDK_VERSION}`,
        ...this.defaultHeaders,
        ...authHeaders,
        ...options.headers,
      };
      if (options.body !== undefined) {
        requestHeaders["Content-Type"] = "application/json";
      }
      if (options.idempotencyKey) {
        requestHeaders["Idempotency-Key"] = options.idempotencyKey;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onCallerAbort = () => controller.abort();
      if (options.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener("abort", onCallerAbort, { once: true });
      }

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: options.method,
          headers: requestHeaders,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onCallerAbort);

        if (options.signal?.aborted) {
          throw new InfraConnectionError("Request aborted by caller", err);
        }
        const connectionError = isAbortError(err)
          ? new InfraConnectionTimeoutError(timeoutMs)
          : new InfraConnectionError("Could not reach the Infra API", err);

        if (!retryableOnConnectionError || attempt > this.maxRetries) {
          throw connectionError;
        }
        lastError = connectionError;
        await sleep(backoffDelayMs(attempt));
        continue;
      }
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onCallerAbort);

      const responseHeaders = headersToObject(response.headers);
      const parsedBody = await parseJsonSafely(response);

      if (response.ok) {
        const envelope = parsedBody as { data?: T } | undefined;
        return envelope?.data as T;
      }

      const apiError = errorFromResponse(response.status, parsedBody, responseHeaders);
      const isRetryableStatus =
        apiError instanceof RateLimitError ||
        apiError instanceof ServiceUnavailableError ||
        apiError instanceof InternalServerError;

      // 429/503 mean the server did not execute the request, so retrying is always safe
      // regardless of method — unlike a connection error, we know nothing ran.
      if (!isRetryableStatus || attempt > this.maxRetries) {
        throw apiError;
      }
      lastError = apiError;
      const delayMs =
        apiError instanceof RateLimitError && apiError.retryAfterSeconds !== undefined
          ? apiError.retryAfterSeconds * 1000
          : backoffDelayMs(attempt);
      await sleep(delayMs);
    }

    throw lastError;
  }
}

function buildUrl(baseURL: string, path: string, query?: Record<string, QueryValue>): string {
  const base = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function headersToObject(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => {
    obj[key.toLowerCase()] = value;
  });
  return obj;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function backoffDelayMs(attempt: number): number {
  const base = Math.min(500 * 2 ** (attempt - 1), 8_000);
  const jitter = Math.random() * 250;
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
