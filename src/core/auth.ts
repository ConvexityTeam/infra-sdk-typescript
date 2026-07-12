import { SDK_VERSION } from "./version.js";
import { InfraAuthTokenError, InfraConnectionError } from "./errors.js";

export interface TokenManagerOptions {
  apiKey: string;
  baseURL: string;
  /** Space-separated OAuth scopes to request. Omit for a full-access token. */
  scope?: string;
  fetch?: typeof fetch;
  /** Refresh this many seconds before the cached token's actual expiry. Default 30s. */
  clockSkewSeconds?: number;
  /** Retries for transient failures (429/503) while minting a token. Default 2. */
  maxRetries?: number;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface OAuthErrorResponse {
  error: string;
  error_description?: string;
}

/**
 * Exchanges the project API key for a short-lived OAuth 2.0 bearer token
 * (`POST /v1/oauth/token`, `client_credentials` grant) and caches it until shortly
 * before it expires. Concurrent callers during a refresh share the same in-flight
 * request rather than minting redundant tokens.
 */
export class TokenManager {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly scope: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly clockSkewSeconds: number;
  private readonly maxRetries: number;

  private cached: { accessToken: string; expiresAtMs: number } | null = null;
  private pendingRefresh: Promise<string> | null = null;

  constructor(options: TokenManagerOptions) {
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL;
    this.scope = options.scope;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.clockSkewSeconds = options.clockSkewSeconds ?? 30;
    this.maxRetries = options.maxRetries ?? 2;
  }

  /** Returns a valid bearer token, minting or refreshing one only when necessary. */
  async getAccessToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
    if (!opts.forceRefresh && this.cached && Date.now() < this.cached.expiresAtMs) {
      return this.cached.accessToken;
    }
    if (this.pendingRefresh) {
      return this.pendingRefresh;
    }

    this.pendingRefresh = this.fetchToken().finally(() => {
      this.pendingRefresh = null;
    });
    return this.pendingRefresh;
  }

  private async fetchToken(): Promise<string> {
    let attempt = 0;
    for (;;) {
      attempt++;
      let response: Response;
      try {
        response = await this.fetchImpl(new URL("/v1/oauth/token", this.baseURL), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": `infra-sdk-typescript/${SDK_VERSION}`,
          },
          body: JSON.stringify({
            grant_type: "client_credentials",
            client_secret: this.apiKey,
            ...(this.scope ? { scope: this.scope } : {}),
          }),
        });
      } catch (err) {
        throw new InfraConnectionError("Could not reach the Infra API to obtain an access token", err);
      }

      const text = await response.text();
      const parsed = text
        ? (JSON.parse(text) as OAuthTokenResponse | (OAuthErrorResponse & { retryAfter?: number }))
        : undefined;

      if (response.ok && parsed && "access_token" in parsed) {
        const expiresAtMs = Date.now() + Math.max(0, parsed.expires_in - this.clockSkewSeconds) * 1000;
        this.cached = { accessToken: parsed.access_token, expiresAtMs };
        return parsed.access_token;
      }

      // 429 on this endpoint uses the standard `{status, message, retryAfter}` envelope
      // rather than the OAuth `{error, error_description}` shape used elsewhere here.
      const errorBody = (parsed ?? { error: "server_error" }) as OAuthErrorResponse & { retryAfter?: number };
      const retryable = response.status === 429 || response.status === 503;
      if (retryable && attempt <= this.maxRetries) {
        const delayMs =
          typeof errorBody.retryAfter === "number" ? errorBody.retryAfter * 1000 : Math.min(500 * 2 ** (attempt - 1), 4_000);
        await sleep(delayMs);
        continue;
      }
      const fallbackDescription = (parsed as { message?: string } | undefined)?.message;
      throw new InfraAuthTokenError(
        response.status,
        errorBody.error ?? (response.status === 429 ? "rate_limited" : "server_error"),
        errorBody.error_description ?? fallbackDescription,
      );
    }
  }

  /** Drops the cached token, forcing the next call to mint a fresh one. */
  clearCache(): void {
    this.cached = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
