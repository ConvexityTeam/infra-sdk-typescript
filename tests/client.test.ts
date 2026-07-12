import { describe, it, expect, vi } from "vitest";
import { InfraClient } from "../src/client.js";
import { AuthenticationError } from "../src/core/errors.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("InfraClient", () => {
  it("throws synchronously when constructed without an apiKey", () => {
    expect(() => new InfraClient({ apiKey: "" })).toThrow(/apiKey/);
  });

  it("refreshes the token once and retries after a 401, then succeeds", async () => {
    let tokenCalls = 0;
    let apiCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname === "/v1/oauth/token") {
        tokenCalls++;
        return jsonResponse(200, { access_token: `token-${tokenCalls}`, token_type: "Bearer", expires_in: 600 });
      }
      apiCalls++;
      if (apiCalls === 1) {
        return jsonResponse(401, { status: false, message: "Authorization token is missing or malformed." });
      }
      return jsonResponse(200, { status: true, message: "OK", data: { balance: "1.00", currency: "USD", updatedAt: "now" } });
    });

    const client = new InfraClient({ apiKey: "sk_test_x", fetch: fetchMock as unknown as typeof fetch, maxRetries: 0 });
    const balance = await client.wallet.getBalance();

    expect(balance.balance).toBe("1.00");
    expect(tokenCalls).toBe(2); // initial mint + forced refresh after the 401
    expect(apiCalls).toBe(2); // failed attempt + retry
  });

  it("propagates the error when the retried request also fails with 401", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname === "/v1/oauth/token") {
        return jsonResponse(200, { access_token: "token", token_type: "Bearer", expires_in: 600 });
      }
      return jsonResponse(401, { status: false, message: "Authorization token is missing or malformed." });
    });

    const client = new InfraClient({ apiKey: "sk_test_x", fetch: fetchMock as unknown as typeof fetch, maxRetries: 0 });
    await expect(client.wallet.getBalance()).rejects.toBeInstanceOf(AuthenticationError);
  });
});
