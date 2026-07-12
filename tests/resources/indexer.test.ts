import { describe, it, expect } from "vitest";
import { createTestClient, envelope } from "../support/harness.js";

const baseSubscription = {
  id: "sub_1",
  projectId: "proj_1",
  network: "BASE",
  contractAddress: "0xabc",
  webhookUrl: "https://example.com/hooks",
  events: ["transfer"],
  status: "active",
  createdBy: "proj_1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastDeliveryAt: null,
  deliveredCount: 0,
  failedCount: 0,
  droppedCount: 0,
};

describe("IndexerResource", () => {
  it("createSubscription returns the signingSecret only present on creation", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 201,
          body: envelope({ ...baseSubscription, signingSecret: "whsec_abc", secretWarning: "store this" }),
        },
      ],
    });

    const sub = await client.indexer.createSubscription({
      network: "BASE",
      contractAddress: "0xabc",
      webhookUrl: "https://example.com/hooks",
      events: ["transfer"],
    });

    expect(sub.signingSecret).toBe("whsec_abc");
    expect(requests[0]?.url.pathname).toBe("/v1/indexer/subscriptions");
    expect(requests[0]?.method).toBe("POST");
  });

  it("listSubscriptions paginates using the data/meta envelope", async () => {
    const { client } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope({
            data: [{ ...baseSubscription, id: "sub_1" }],
            meta: { total: 2, page: 1, limit: 1, totalPages: 2 },
          }),
        },
        {
          status: 200,
          body: envelope({
            data: [{ ...baseSubscription, id: "sub_2" }],
            meta: { total: 2, page: 2, limit: 1, totalPages: 2 },
          }),
        },
      ],
    });

    const page = await client.indexer.listSubscriptions({ limit: 1 });
    const all = await page.toArray();
    expect(all.map((s) => s.id)).toEqual(["sub_1", "sub_2"]);
  });

  it("updateSubscription PATCHes the given fields", async () => {
    const { client, requests } = createTestClient({
      responses: [{ status: 200, body: envelope({ ...baseSubscription, status: "paused" }) }],
    });
    const updated = await client.indexer.updateSubscription("sub_1", { status: "paused" });
    expect(updated.status).toBe("paused");
    expect(requests[0]?.method).toBe("PATCH");
    expect(requests[0]?.url.pathname).toBe("/v1/indexer/subscriptions/sub_1");
    expect(requests[0]?.body).toEqual({ status: "paused" });
  });

  it("deleteSubscription issues a DELETE and returns the soft-deleted record", async () => {
    const { client, requests } = createTestClient({
      responses: [{ status: 200, body: envelope({ ...baseSubscription, status: "deleted" }) }],
    });
    const deleted = await client.indexer.deleteSubscription("sub_1");
    expect(deleted.status).toBe("deleted");
    expect(requests[0]?.method).toBe("DELETE");
  });

  it("listEventCatalog supports filtering by family", async () => {
    const { client, requests } = createTestClient({
      responses: [
        {
          status: 200,
          body: envelope([
            { key: "transfer", family: "EVM", kind: "onchain", label: "ERC-20 Transfer", signature: "Transfer(address,address,uint256)" },
          ]),
        },
      ],
    });
    const catalog = await client.indexer.listEventCatalog({ family: "EVM" });
    expect(catalog).toHaveLength(1);
    expect(requests[0]?.url.searchParams.get("family")).toBe("EVM");
  });
});
