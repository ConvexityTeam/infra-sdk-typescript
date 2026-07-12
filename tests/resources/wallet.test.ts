import { describe, it, expect } from "vitest";
import { createTestClient, envelope } from "../support/harness.js";

describe("WalletResource", () => {
  it("generateWallets auto-generates an Idempotency-Key and returns the unwrapped array", async () => {
    const { client, requests } = createTestClient({
      responses: [
        { status: 200, body: envelope([{ address: "0x1", chainType: "EVM", isActive: true, addressIndex: 0 }]) },
      ],
    });

    const result = await client.wallet.generateWallets({ chainType: "EVM", purpose: "deposit" });

    expect(result).toEqual([{ address: "0x1", chainType: "EVM", isActive: true, addressIndex: 0 }]);
    const req = requests.find((r) => r.url.pathname === "/v1/wallet/hd/generate");
    expect(req?.method).toBe("POST");
    expect(req?.body).toEqual({ chainType: "EVM", purpose: "deposit" });
    expect(req?.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("initiateTransfer honors a caller-supplied idempotencyKey instead of generating one", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 202,
          body: envelope({
            id: "tx_1",
            status: "PENDING",
            type: "TRANSFER",
            chainType: "EVM",
            network: "MAINNET",
            chainId: 8453,
            signerType: "BUSINESS_HD",
            fromAddress: "0xabc",
            addressIndex: 12,
            toAddress: "0xdef",
            amount: "150.00",
            tokenAddress: null,
            data: null,
            value: null,
            txHash: null,
            gasUsed: null,
            feeWei: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
        },
      ],
    });

    const tx = await client.wallet.initiateTransfer(
      { fromAddress: 12, toAddress: "0xdef", amount: "150.00", chainType: "EVM", chainId: 8453 },
      { idempotencyKey: "my-fixed-key" },
    );

    expect(tx.status).toBe("PENDING");
    const req = requests.find((r) => r.url.pathname === "/v1/wallet/transaction");
    expect(req?.headers.get("Idempotency-Key")).toBe("my-fixed-key");
  });

  it("listWallets passes filters as query params and returns a plain array", async () => {
    const { client, requests } = createTestClient({
      responses: [{ status: 200, body: envelope([{ id: "w1", chainType: "EVM" }]) }],
    });

    const wallets = await client.wallet.listWallets({ chainType: "EVM", isActive: true, limit: 5 });
    expect(wallets).toHaveLength(1);
    const req = requests.find((r) => r.url.pathname === "/v1/wallet/hd");
    expect(req?.url.searchParams.get("chainType")).toBe("EVM");
    expect(req?.url.searchParams.get("isActive")).toBe("true");
    expect(req?.url.searchParams.get("limit")).toBe("5");
  });

  it("getTransactionHistory returns an iterable Page across two offset pages", async () => {
    const { client } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            items: [{ id: "tx_1" }],
            pagination: { total: 2, limit: 1, offset: 0, hasMore: true, nextOffset: 1 },
          }),
        },
        {
          status: 200,
          body: envelope({
            items: [{ id: "tx_2" }],
            pagination: { total: 2, limit: 1, offset: 1, hasMore: false, nextOffset: null },
          }),
        },
      ],
    });

    const page = await client.wallet.getTransactionHistory({ limit: 1 });
    const all = await page.toArray();
    expect(all.map((t) => t.id)).toEqual(["tx_1", "tx_2"]);
  });

  it("getBalance issues a GET with no body", async () => {
    const { client, requests } = createTestClient({
      responses: [{ status: 200, body: envelope({ balance: "10.00", currency: "USD", updatedAt: "now" }) }],
    });
    const balance = await client.wallet.getBalance();
    expect(balance.currency).toBe("USD");
    const req = requests.find((r) => r.url.pathname === "/v1/wallet/balance");
    expect(req?.method).toBe("GET");
    expect(req?.body).toBeUndefined();
  });
});
