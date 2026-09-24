import { describe, it, expect } from "vitest";
import { createTestClient, envelope } from "../support/harness.js";

describe("TokenizationResource", () => {
  it("createToken posts the body and returns the deployment result", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 201,
          body: envelope({
            id: "tok_1",
            chainId: "84532",
            status: "PENDING",
            operationRef: "deploy_abc",
            tokenAdmin: "0xadmin",
            txHash: "0xhash",
          }),
        },
      ],
    });

    const result = await client.tokenization.createToken({
      ticker: "ACMB3",
      name: "Acme Bond",
      chainId: "84532",
      decimals: 18,
      assetClass: "MONEY_MARKET",
      tokenType: "ASSET",
    });

    expect(result.status).toBe("PENDING");
    const req = requests.find((r) => r.url.pathname === "/v1/tokens" && r.method === "POST");
    expect(req?.body).toMatchObject({ ticker: "ACMB3", tokenType: "ASSET" });
  });

  it("listTokens paginates using page/pageSize and stops once every item is seen", async () => {
    const { client } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            items: [{ id: "t1", ticker: "A" }, { id: "t2", ticker: "B" }],
            total: 3,
            page: 1,
            pageSize: 2,
          }),
        },
        {
          status: 200,
          body: envelope({ items: [{ id: "t3", ticker: "C" }], total: 3, page: 2, pageSize: 2 }),
        },
      ],
    });

    const page = await client.tokenization.listTokens({ pageSize: 2 });
    const all = await page.toArray();
    expect(all.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("mintToken and burnToken hit the right paths with the right bodies", async () => {
    const { client, requests } = createTestClient({
      responses: [
        { status: 200, body: envelope({ operationRef: "mint_1", transactionId: "tx_1", txHash: "0x1" }) },
        { status: 200, body: envelope({ operationRef: "burn_1", transactionId: "tx_2", txHash: "0x2" }) },
      ],
    });

    await client.tokenization.mintToken({ tokenId: "tok_1", chainId: "84532", toAddress: "0xabc", amount: 10 });
    await client.tokenization.burnToken({ tokenId: "tok_1", chainId: "84532", fromAddress: "0xabc", amount: 5 });

    expect(requests[0]?.url.pathname).toBe("/v1/tokens/mint");
    expect(requests[0]?.body).toMatchObject({ toAddress: "0xabc", amount: 10 });
    expect(requests[1]?.url.pathname).toBe("/v1/tokens/burn");
    expect(requests[1]?.body).toMatchObject({ fromAddress: "0xabc", amount: 5 });
    for (const req of requests) {
      expect(req.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("transferToken sends fromAddressIndex with an Idempotency-Key and returns the transfer", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            tokenId: "tok_1",
            status: "CONFIRMED",
            transactionId: "tx_1",
            fromAddressIndex: 2,
            toAddress: "0xto",
            amount: 50,
            txHash: "0x1",
            operationRef: "transfer_1",
          }),
        },
      ],
    });

    const result = await client.tokenization.transferToken(
      { tokenId: "tok_1", chainId: "84532", fromAddressIndex: 2, toAddress: "0xto", amount: 50 },
      { idempotencyKey: "my-fixed-key" },
    );

    expect(result).toMatchObject({ status: "CONFIRMED", fromAddressIndex: 2, operationRef: "transfer_1" });
    expect(requests[0]?.url.pathname).toBe("/v1/tokens/transfer");
    expect(requests[0]?.body).toMatchObject({ fromAddressIndex: 2, toAddress: "0xto", amount: 50 });
    expect(requests[0]?.headers.get("Idempotency-Key")).toBe("my-fixed-key");
  });

  it("getTokenHolders requires tokenId as a query param and paginates", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            tokenId: "tok_1",
            ticker: "BND",
            chain: "BASE",
            total: 1,
            page: 1,
            pageSize: 20,
            items: [{ walletAddress: "0xabc", balance: "5.0" }],
          }),
        },
      ],
    });

    const page = await client.tokenization.getTokenHolders({ tokenId: "tok_1" });
    expect(page.data).toEqual([{ walletAddress: "0xabc", balance: "5.0" }]);
    const req = requests.find((r) => r.url.pathname === "/v1/tokens/holders");
    expect(req?.url.searchParams.get("tokenId")).toBe("tok_1");
  });

  it("distributeYield posts fundAmount and returns operationRef + txHash", async () => {
    const { client, requests } = createTestClient({
      responses: [{ status: 200, body: envelope({ operationRef: "distribute_1", txHash: "0xabc" }) }],
    });
    const result = await client.tokenization.distributeYield({ tokenId: "tok_1", chainId: "84532", fundAmount: 1000 });
    expect(result.operationRef).toBe("distribute_1");
    expect(requests[0]?.url.pathname).toBe("/v1/tokens/yield/distribute");
  });

  it("payCoupon posts to pay-coupon with an Idempotency-Key", async () => {
    const { client, requests } = createTestClient({
      responses: [{ status: 200, body: envelope({ operationRef: "coupon_1", txHash: "0xabc" }) }],
    });
    const result = await client.tokenization.payCoupon({ tokenId: "tok_1", chainId: "84532", pushYield: true });
    expect(result.operationRef).toBe("coupon_1");
    expect(requests[0]?.url.pathname).toBe("/v1/tokens/yield/pay-coupon");
    expect(requests[0]?.body).toMatchObject({ pushYield: true });
    expect(requests[0]?.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("getWalletBalance sends tokenId, chainId and walletAddress as query params", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            tokenId: "tok_1",
            ticker: "SFSF2",
            chainId: "84532",
            walletAddress: "0xabc",
            balance: "75.0",
            decimals: 18,
          }),
        },
      ],
    });

    const result = await client.tokenization.getWalletBalance({
      tokenId: "tok_1",
      chainId: "84532",
      walletAddress: "0xabc",
    });

    expect(result.balance).toBe("75.0");
    expect(result.decimals).toBe(18);
    const req = requests[0];
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/v1/tokens/balance");
    expect(req?.url.searchParams.get("tokenId")).toBe("tok_1");
    expect(req?.url.searchParams.get("chainId")).toBe("84532");
    expect(req?.url.searchParams.get("walletAddress")).toBe("0xabc");
  });

  it("forcedTransfer posts the body with an Idempotency-Key, generated or caller-supplied", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            operationRef: "forced-transfer_1",
            transactionId: "tx_1",
            txHash: "0x1",
          }),
        },
        {
          status: 200,
          body: envelope({
            operationRef: "forced-transfer_2",
            transactionId: "tx_2",
            txHash: "0x2",
          }),
        },
      ],
    });

    const params = {
      tokenId: "tok_1",
      chainId: "84532",
      fromAddress: "0xfrom",
      toAddress: "0xto",
      amount: 10,
      memo: "Forced transfer",
    };
    const result = await client.tokenization.forcedTransfer(params);
    await client.tokenization.forcedTransfer(params, { idempotencyKey: "my-fixed-key" });

    expect(result.operationRef).toBe("forced-transfer_1");
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url.pathname).toBe("/v1/tokens/forced-transfer");
    expect(requests[0]?.body).toMatchObject(params);
    expect(requests[0]?.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(requests[1]?.headers.get("Idempotency-Key")).toBe("my-fixed-key");
  });
});
