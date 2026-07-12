import { vi } from "vitest";
import { InfraClient, type InfraClientOptions } from "../../src/client.js";

export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: unknown;
}

export interface MockResponseSpec {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface TestClientOptions {
  responses: MockResponseSpec[];
  clientOptions?: Partial<InfraClientOptions>;
  tokenResponse?: MockResponseSpec;
}

/** Builds an InfraClient wired to a mock `fetch` that auto-answers the OAuth token exchange and then replays `responses` in order for subsequent calls. */
export function createTestClient(opts: TestClientOptions): {
  client: InfraClient;
  fetchMock: ReturnType<typeof vi.fn>;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  let call = 0;

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = init?.body ? (JSON.parse(init.body as string) as unknown) : undefined;

    if (url.pathname === "/v1/oauth/token") {
      const spec = opts.tokenResponse ?? {
        status: 200,
        body: { access_token: "test-access-token", token_type: "Bearer", expires_in: 600 },
      };
      return toResponse(spec);
    }

    // Only API calls are recorded — the OAuth token exchange is an auth implementation
    // detail, not part of what individual resource-method tests assert against.
    requests.push({ url, method, headers, body });

    const next = opts.responses[call++];
    if (!next) {
      throw new Error(`No mock response queued for ${method} ${url.pathname} (call #${call})`);
    }
    return toResponse(next);
  });

  const client = new InfraClient({
    apiKey: "sk_test_123",
    fetch: fetchMock as unknown as typeof fetch,
    maxRetries: 0,
    ...opts.clientOptions,
  });

  return { client, fetchMock, requests };
}

function toResponse(spec: MockResponseSpec): Response {
  return new Response(spec.body !== undefined ? JSON.stringify(spec.body) : undefined, {
    status: spec.status,
    headers: { "Content-Type": "application/json", ...spec.headers },
  });
}

export function envelope<T>(data: T, message = "OK"): { status: true; message: string; data: T } {
  return { status: true, message, data };
}
