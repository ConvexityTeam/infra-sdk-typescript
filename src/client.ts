import { HttpClient, type RequestOptions } from "./core/http-client.js";
import { TokenManager } from "./core/auth.js";
import { AuthenticationError } from "./core/errors.js";
import { WalletResource } from "./resources/wallet/index.js";
import { TokenizationResource } from "./resources/tokenization/index.js";
import { IndexerResource } from "./resources/indexer/index.js";

const DEFAULT_BASE_URL = "https://api.withconvexity.com";

export interface InfraClientOptions {
  /** Your Convexity Infra project API key (`sk_live_...` or `sk_test_...`). Exchanged internally for a bearer token. */
  apiKey: string;
  /** Overrides the API host. Defaults to `"https://api.withconvexity.com"`. */
  baseURL?: string;
  /** Space-separated OAuth scopes to request for minted tokens. Omit for full access. */
  scope?: string;
  /** Default per-request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Default number of retries for rate limits, service-unavailable responses, and safe connection errors. Default 2. */
  maxRetries?: number;
  /** Override the fetch implementation (mainly for testing). Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Client for the Convexity Infra API — Wallet, Tokenization, and Blockchain Events (Indexer).
 *
 * ```ts
 * import { InfraClient } from "infra-sdk-typescript";
 *
 * const infra = new InfraClient({ apiKey: process.env.INFRA_API_KEY! });
 * const balance = await infra.wallet.getBalance();
 * ```
 */
export class InfraClient {
  readonly wallet: WalletResource;
  readonly tokenization: TokenizationResource;
  readonly indexer: IndexerResource;

  private readonly http: HttpClient;
  private readonly auth: TokenManager;

  constructor(options: InfraClientOptions) {
    if (!options.apiKey) {
      throw new Error(
        "InfraClient requires an `apiKey`. Request test/live keys from infra@withconvexity.com.",
      );
    }

    const baseURL = options.baseURL ?? DEFAULT_BASE_URL;

    this.auth = new TokenManager({
      apiKey: options.apiKey,
      baseURL,
      scope: options.scope,
      fetch: options.fetch,
    });

    this.http = new HttpClient({
      baseURL,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
      getAuthHeaders: async () => ({ Authorization: `Bearer ${await this.auth.getAccessToken()}` }),
    });

    this.wallet = new WalletResource(this);
    this.tokenization = new TokenizationResource(this);
    this.indexer = new IndexerResource(this);
  }

  /**
   * Low-level escape hatch that issues a raw request against the Infra API using this
   * client's auth, retry, and timeout configuration. The typed resource methods
   * (`client.wallet.*`, `client.tokenization.*`, `client.indexer.*`) are built on top of
   * this and should be preferred — reach for this only to call an endpoint this SDK
   * version doesn't wrap yet.
   */
  async request<T>(options: RequestOptions): Promise<T> {
    try {
      return await this.http.request<T>(options);
    } catch (err) {
      if (err instanceof AuthenticationError) {
        // The cached token may have expired between mint and use, or been revoked
        // server-side. Force one refresh and retry exactly once before giving up.
        await this.auth.getAccessToken({ forceRefresh: true });
        return await this.http.request<T>(options);
      }
      throw err;
    }
  }
}
