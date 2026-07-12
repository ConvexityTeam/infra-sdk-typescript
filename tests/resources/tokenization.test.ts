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
            chain: "BASE",
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
      chain: "BASE",
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

    await client.tokenization.mintToken({ tokenId: "tok_1", chain: "BASE", toAddress: "0xabc", amount: 10 });
    await client.tokenization.burnToken({ tokenId: "tok_1", chain: "BASE", fromAddress: "0xabc", amount: 5 });

    expect(requests[0]?.url.pathname).toBe("/v1/tokens/mint");
    expect(requests[0]?.body).toMatchObject({ toAddress: "0xabc", amount: 10 });
    expect(requests[1]?.url.pathname).toBe("/v1/tokens/burn");
    expect(requests[1]?.body).toMatchObject({ fromAddress: "0xabc", amount: 5 });
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
    const result = await client.tokenization.distributeYield({ tokenId: "tok_1", chain: "BASE", fundAmount: 1000 });
    expect(result.operationRef).toBe("distribute_1");
    expect(requests[0]?.url.pathname).toBe("/v1/tokens/yield/distribute");
  });
});
