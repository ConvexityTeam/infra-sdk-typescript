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
      price: 1000,
      chainId: "84532",
      decimals: 18,
      assetClass: "MONEY_MARKET",
      tokenType: "ASSET",
      maxShareholders: 0,
      maxTokensPerInvestor: 0,
      lockUpDuration: 0,
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

  it("distributeYield posts the payout and returns the operation with its transaction", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({ tokenId: "tok_1", operationRef: "distribute_1", transactionId: "tx_1", txHash: "0xabc" }),
        },
      ],
    });
    const result = await client.tokenization.distributeYield({
      tokenId: "tok_1",
      chainId: 84532,
      payoutToken: "CNGN",
      fundAmount: 1000,
      reclaimAfter: 86400,
      pushYield: true,
      memo: "Dividend payout",
    });
    expect(result).toMatchObject({ tokenId: "tok_1", operationRef: "distribute_1", transactionId: "tx_1" });
    expect(requests[0]?.url.pathname).toBe("/v1/tokens/yield/distribute");
    // A numeric chainId is sent through as-is; the API coerces it.
    expect(requests[0]?.body).toMatchObject({ chainId: 84532, fundAmount: 1000, pushYield: true });
    expect(requests[0]?.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("payCoupon posts to pay-coupon with an Idempotency-Key", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({ tokenId: "tok_1", operationRef: "coupon_1", transactionId: "tx_1", txHash: "0xabc" }),
        },
      ],
    });
    const result = await client.tokenization.payCoupon({
      tokenId: "tok_1",
      chainId: "84532",
      pushYield: true,
      reclaimAfter: 86400,
      memo: "Coupon payout",
    });
    expect(result.operationRef).toBe("coupon_1");
    expect(result.transactionId).toBe("tx_1");
    expect(requests[0]?.url.pathname).toBe("/v1/tokens/yield/pay-coupon");
    expect(requests[0]?.body).toMatchObject({ pushYield: true, reclaimAfter: 86400, memo: "Coupon payout" });
    expect(requests[0]?.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("updateYield patches the rate with a generated Idempotency-Key and returns old and new rates", async () => {
    const response = {
      currentRate: 27.55,
      newRate: 25.55,
      operationRef: "updateYield_1",
      txHash: "0xabc",
    };
    const { client, requests } = createTestClient({
      responses: [{ status: 200, body: envelope(response) }],
    });
    const result = await client.tokenization.updateYield({ tokenId: "tok_1", chainId: "84532", annualRate: 25.55 });
    expect(result).toEqual(response);
    expect(requests[0]?.method).toBe("PATCH");
    expect(requests[0]?.url.pathname).toBe("/v1/tokens/yield");
    expect(requests[0]?.body).toEqual({ tokenId: "tok_1", chainId: "84532", annualRate: 25.55 });
    expect(requests[0]?.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("updateYield sends the caller's own Idempotency-Key when given", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            currentRate: 5,
            newRate: 6,
            operationRef: "updateYield_2",
            txHash: "0xdef",
          }),
        },
      ],
    });
    await client.tokenization.updateYield(
      { tokenId: "tok_1", chainId: "84532", annualRate: 6 },
      { idempotencyKey: "rate-change-2026-10" },
    );
    expect(requests[0]?.headers.get("Idempotency-Key")).toBe("rate-change-2026-10");
  });

  it("claimYield posts the claim with a generated Idempotency-Key and returns the operationRef", async () => {
    const { client, requests } = createTestClient({
      responses: [
        { status: 200, body: envelope({ operationRef: "claimYield_1", txHash: "0xclaim" }) },
      ],
    });
    const params = { tokenId: "tok_1", chainId: "84532", investorAddressIndex: 12, snapshotId: 4 };
    const result = await client.tokenization.claimYield(params);
    expect(result).toEqual({ operationRef: "claimYield_1", txHash: "0xclaim" });
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url.pathname).toBe("/v1/tokens/yield/claim");
    expect(requests[0]?.body).toEqual(params);
    expect(requests[0]?.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("redeemPrincipal returns every transaction, what was paid, and who was skipped", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            tokenId: "tok_1",
            operationRef: "redeemPrincipal_1",
            transactionIds: ["tx_burn", "tx_1"],
            txHashes: ["0xburn", "0x1"],
            redeemedHolders: 1,
            paidPrincipal: "100000000000",
            paidPrincipalFormatted: "100000.0",
            unreconciledBatches: [],
            skipped: [{ address: "0xfrozen", balance: "5000000000000000000", reasons: ["FROZEN"] }],
            treasuryBurned: { amount: "10000000000000000000", txHash: "0xburn" },
            outstandingSupply: "5000000000000000000",
            closed: false,
          }),
        },
      ],
    });
    const result = await client.tokenization.redeemPrincipal({ tokenId: "tok_1", chainId: "84532" });
    expect(result.transactionIds).toEqual(["tx_burn", "tx_1"]);
    expect(result.txHashes).toEqual(["0xburn", "0x1"]);
    expect(result.paidPrincipalFormatted).toBe("100000.0");
    expect(result.skipped[0]?.reasons).toEqual(["FROZEN"]);
    expect(result.treasuryBurned?.txHash).toBe("0xburn");
    expect(result.closed).toBe(false);
    expect(requests[0]?.url.pathname).toBe("/v1/tokens/yield/redeem");
    expect(requests[0]?.body).toEqual({ tokenId: "tok_1", chainId: "84532" });
    expect(requests[0]?.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reclaimUnclaimedYield posts the snapshot with an Idempotency-Key and returns the reclaimed amount", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            tokenId: "tok_1",
            snapshotId: "1",
            reclaimed: "10",
            operationRef: "reclaim_1",
            txHash: "0xabc",
          }),
        },
      ],
    });
    const result = await client.tokenization.reclaimUnclaimedYield(
      { tokenId: "tok_1", chainId: "84532", snapshotId: 1 },
      { idempotencyKey: "my-fixed-key" },
    );
    expect(result).toMatchObject({ snapshotId: "1", reclaimed: "10", operationRef: "reclaim_1" });
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url.pathname).toBe("/v1/tokens/yield/reclaim");
    expect(requests[0]?.body).toEqual({ tokenId: "tok_1", chainId: "84532", snapshotId: 1 });
    expect(requests[0]?.headers.get("Idempotency-Key")).toBe("my-fixed-key");
  });

  it("getNextCoupon GETs the schedule with tokenId and chainId as query params, without an Idempotency-Key", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            tokenId: "tok_1",
            chainId: "84532",
            status: "SCHEDULED",
            nextCouponDate: "2026-10-31T00:00:00.000Z",
            graceEndsAt: "2026-11-07T00:00:00.000Z",
            isDue: false,
            couponPeriodSeconds: 2592000,
            maturityDate: "2027-10-01T00:00:00.000Z",
            couponPerToken: "20.547945",
          }),
        },
      ],
    });

    const result = await client.tokenization.getNextCoupon({ tokenId: "tok_1", chainId: 84532 });

    expect(result.status).toBe("SCHEDULED");
    expect(result.nextCouponDate).toBe("2026-10-31T00:00:00.000Z");
    expect(result.isDue).toBe(false);
    const req = requests[0];
    expect(req?.method).toBe("GET");
    expect(req?.url.pathname).toBe("/v1/tokens/yield/next-coupon");
    expect(req?.url.searchParams.get("tokenId")).toBe("tok_1");
    expect(req?.url.searchParams.get("chainId")).toBe("84532");
    expect(req?.headers.get("Idempotency-Key")).toBeNull();
    expect(req?.body).toBeUndefined();
  });

  it("getNextCoupon passes null dates through once coupons are over", async () => {
    const { client } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            tokenId: "tok_1",
            chainId: "84532",
            status: "CLOSED",
            nextCouponDate: null,
            graceEndsAt: null,
            isDue: false,
            couponPeriodSeconds: 2592000,
            maturityDate: "2027-10-01T00:00:00.000Z",
            couponPerToken: "20.547945",
          }),
        },
      ],
    });

    const result = await client.tokenization.getNextCoupon({ tokenId: "tok_1", chainId: "84532" });

    expect(result.status).toBe("CLOSED");
    expect(result.nextCouponDate).toBeNull();
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
            cNgnBalance: "1234.56",
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
    expect(result.cNgnBalance).toBe("1234.56");
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
