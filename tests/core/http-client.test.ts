import { describe, it, expect, vi } from "vitest";
import { HttpClient } from "../../src/core/http-client.js";
import {
  BadRequestError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  InfraConnectionError,
  InfraConnectionTimeoutError,
} from "../../src/core/errors.js";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function client(fetchMock: typeof fetch, overrides: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}) {
  return new HttpClient({
    baseURL: "https://api.example.com",
    fetch: fetchMock,
    getAuthHeaders: async () => ({ Authorization: "Bearer test" }),
    maxRetries: 2,
    ...overrides,
  });
}

describe("HttpClient", () => {
  it("returns the unwrapped data field on success", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { status: true, message: "OK", data: { id: "1" } }));
    const http = client(fetchMock as unknown as typeof fetch);
    const result = await http.request<{ id: string }>({ method: "GET", path: "/v1/thing" });
    expect(result).toEqual({ id: "1" });
  });

  it("builds query strings, skipping undefined/null values", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { status: true, message: "OK", data: null }));
    const http = client(fetchMock as unknown as typeof fetch);
    await http.request({ method: "GET", path: "/v1/thing", query: { a: 1, b: undefined, c: null, d: "x" } });
    const calledUrl = new URL((fetchMock.mock.calls[0] as unknown[])[0] as string);
    expect(calledUrl.searchParams.get("a")).toBe("1");
    expect(calledUrl.searchParams.has("b")).toBe(false);
    expect(calledUrl.searchParams.has("c")).toBe(false);
    expect(calledUrl.searchParams.get("d")).toBe("x");
  });

  it("throws a BadRequestError (non-retryable) on 400", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, { status: false, message: "bad input" }));
    const http = client(fetchMock as unknown as typeof fetch);
    await expect(http.request({ method: "POST", path: "/v1/thing", body: {} })).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws NotFoundError on 404 without retrying", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(404, { status: false, message: "not found" }));
    const http = client(fetchMock as unknown as typeof fetch);
    await expect(http.request({ method: "GET", path: "/v1/thing/x" })).rejects.toBeInstanceOf(NotFoundError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 honoring retryAfter from the body, then succeeds", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) return jsonResponse(429, { status: false, message: "throttled", retryAfter: 0 });
      return jsonResponse(200, { status: true, message: "OK", data: { ok: true } });
    });
    const http = client(fetchMock as unknown as typeof fetch);
    const result = await http.request<{ ok: boolean }>({ method: "GET", path: "/v1/thing" });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exhausts retries and throws RateLimitError with retryAfterSeconds", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429, { status: false, message: "throttled", retryAfter: 0 }));
    const http = client(fetchMock as unknown as typeof fetch, { maxRetries: 1 });
    const err = await http.request({ method: "GET", path: "/v1/thing" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfterSeconds).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("retries on 503 then succeeds", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) return jsonResponse(503, { status: false, message: "unavailable" });
      return jsonResponse(200, { status: true, message: "OK", data: { ok: true } });
    });
    const http = client(fetchMock as unknown as typeof fetch);
    const result = await http.request<{ ok: boolean }>({ method: "GET", path: "/v1/thing" });
    expect(result).toEqual({ ok: true });
  });

  it("throws ServiceUnavailableError after exhausting retries on repeated 503", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(503, { status: false, message: "unavailable" }));
    const http = client(fetchMock as unknown as typeof fetch, { maxRetries: 0 });
    await expect(http.request({ method: "GET", path: "/v1/thing" })).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it("retries a connection error for GET requests", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) throw new TypeError("network down");
      return jsonResponse(200, { status: true, message: "OK", data: { ok: true } });
    });
    const http = client(fetchMock as unknown as typeof fetch);
    const result = await http.request<{ ok: boolean }>({ method: "GET", path: "/v1/thing" });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a connection error for a POST without an idempotency key", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("network down");
    });
    const http = client(fetchMock as unknown as typeof fetch);
    await expect(http.request({ method: "POST", path: "/v1/thing", body: {} })).rejects.toBeInstanceOf(
      InfraConnectionError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a connection error for a POST that has an idempotency key", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) throw new TypeError("network down");
      return jsonResponse(200, { status: true, message: "OK", data: { ok: true } });
    });
    const http = client(fetchMock as unknown as typeof fetch);
    const result = await http.request<{ ok: boolean }>({
      method: "POST",
      path: "/v1/thing",
      body: {},
      idempotencyKey: "key-1",
    });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws InfraConnectionTimeoutError when the request exceeds timeoutMs", async () => {
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    const http = client(fetchMock as unknown as typeof fetch, { maxRetries: 0, timeoutMs: 20 });
    await expect(http.request({ method: "GET", path: "/v1/thing" })).rejects.toBeInstanceOf(
      InfraConnectionTimeoutError,
    );
  });

  it("sends the Idempotency-Key header when provided", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { status: true, message: "OK", data: null }));
    const http = client(fetchMock as unknown as typeof fetch);
    await http.request({ method: "POST", path: "/v1/thing", body: {}, idempotencyKey: "abc-123" });
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Idempotency-Key")).toBe("abc-123");
  });
});
