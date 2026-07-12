import { describe, it, expect, vi } from "vitest";
import { TokenManager } from "../../src/core/auth.js";
import { InfraAuthTokenError } from "../../src/core/errors.js";

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  return vi.fn(async () => {
    const next = responses[call++];
    if (!next) throw new Error("No more mock responses");
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("TokenManager", () => {
  it("mints a token and caches it across calls", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: "abc", token_type: "Bearer", expires_in: 600 } },
    ]);
    const manager = new TokenManager({
      apiKey: "sk_test_x",
      baseURL: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const token1 = await manager.getAccessToken();
    const token2 = await manager.getAccessToken();

    expect(token1).toBe("abc");
    expect(token2).toBe("abc");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("mints a fresh token when forceRefresh is true", async () => {
    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: "first", token_type: "Bearer", expires_in: 600 } },
      { status: 200, body: { access_token: "second", token_type: "Bearer", expires_in: 600 } },
    ]);
    const manager = new TokenManager({
      apiKey: "sk_test_x",
      baseURL: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const token1 = await manager.getAccessToken();
    const token2 = await manager.getAccessToken({ forceRefresh: true });

    expect(token1).toBe("first");
    expect(token2).toBe("second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent refreshes into a single request", async () => {
    let resolveFetch: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    const manager = new TokenManager({
      apiKey: "sk_test_x",
      baseURL: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const p1 = manager.getAccessToken();
    const p2 = manager.getAccessToken();
    resolveFetch!(
      new Response(JSON.stringify({ access_token: "shared", token_type: "Bearer", expires_in: 600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const [token1, token2] = await Promise.all([p1, p2]);
    expect(token1).toBe("shared");
    expect(token2).toBe("shared");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = mockFetchSequence([
      { status: 429, body: { status: false, message: "Too many requests", retryAfter: 0 } },
      { status: 200, body: { access_token: "after-retry", token_type: "Bearer", expires_in: 600 } },
    ]);
    const manager = new TokenManager({
      apiKey: "sk_test_x",
      baseURL: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
      maxRetries: 2,
    });

    const token = await manager.getAccessToken();
    expect(token).toBe("after-retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws InfraAuthTokenError on an OAuth error body", async () => {
    const fetchMock = mockFetchSequence([
      { status: 401, body: { error: "invalid_client", error_description: "Missing API key" } },
    ]);
    const manager = new TokenManager({
      apiKey: "",
      baseURL: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(InfraAuthTokenError);
  });
});
