import { APIResource } from "../resource.js";
import { pageFromMetaResponse } from "../../core/pagination.js";
import type { Page, MetaPaginatedResponse } from "../../core/pagination.js";
import type { QueryValue } from "../../core/http-client.js";
import type { RequestOverrides } from "../../types.js";
import type {
  CreateSubscriptionParams,
  EventCatalogEntry,
  IndexerSubscription,
  IndexerSubscriptionWithSecret,
  ListEventCatalogParams,
  ListSubscriptionsParams,
  UpdateSubscriptionParams,
} from "./types.js";

export * from "./types.js";

/**
 * The Blockchain Events (Indexer) service — subscribe to decoded on-chain events for a
 * contract and receive them at your webhook, signed with a per-subscription secret.
 *
 * Every operation requires a token bound to a project and business, and is gated on a
 * capability granted by your plan (e.g. `indexer.subscribe.evm`).
 */
export class IndexerResource extends APIResource {
  /**
   * Creates a subscription that streams decoded events for a contract to your webhook.
   * Requires the network's subscribe capability (e.g. `indexer.subscribe.evm`).
   *
   * The response includes `signingSecret` only on creation — store it securely, it is
   * never shown again (see {@link rotateSigningSecret} if you lose it).
   */
  async createSubscription(
    params: CreateSubscriptionParams,
    overrides: RequestOverrides = {},
  ): Promise<IndexerSubscriptionWithSecret> {
    return this.client.request<IndexerSubscriptionWithSecret>({
      method: "POST",
      path: "/v1/indexer/subscriptions",
      body: params,
      ...overrides,
    });
  }

  /** Lists the project's subscriptions. Requires `indexer.subscription.list`. */
  async listSubscriptions(
    params: ListSubscriptionsParams = {},
    overrides: RequestOverrides = {},
  ): Promise<Page<IndexerSubscription>> {
    const fetchPage = (query: Record<string, unknown>): Promise<Page<IndexerSubscription>> =>
      this.client
        .request<MetaPaginatedResponse<IndexerSubscription>>({
          method: "GET",
          path: "/v1/indexer/subscriptions",
          query: { ...params, ...query },
          ...overrides,
        })
        .then((raw) => pageFromMetaResponse(raw, fetchPage));

    return fetchPage({ page: params.page, limit: params.limit });
  }

  /** Fetches one subscription. Requires `indexer.subscription.read`. */
  async getSubscription(id: string, overrides: RequestOverrides = {}): Promise<IndexerSubscription> {
    return this.client.request<IndexerSubscription>({
      method: "GET",
      path: `/v1/indexer/subscriptions/${encodeURIComponent(id)}`,
      ...overrides,
    });
  }

  /** Updates a subscription's webhook, events, or status. At least one field is required. Requires `indexer.subscription.update`. */
  async updateSubscription(
    id: string,
    params: UpdateSubscriptionParams,
    overrides: RequestOverrides = {},
  ): Promise<IndexerSubscription> {
    return this.client.request<IndexerSubscription>({
      method: "PATCH",
      path: `/v1/indexer/subscriptions/${encodeURIComponent(id)}`,
      body: params,
      ...overrides,
    });
  }

  /** Soft-deletes a subscription (`status` becomes `"deleted"`; deliveries stop). Requires `indexer.subscription.delete`. */
  async deleteSubscription(id: string, overrides: RequestOverrides = {}): Promise<IndexerSubscription> {
    return this.client.request<IndexerSubscription>({
      method: "DELETE",
      path: `/v1/indexer/subscriptions/${encodeURIComponent(id)}`,
      ...overrides,
    });
  }

  /**
   * Generates a new signing secret and invalidates the old one. Requires
   * `indexer.subscription.rotate_secret`. The response includes the new `signingSecret`
   * once — store it immediately.
   */
  async rotateSigningSecret(
    id: string,
    overrides: RequestOverrides = {},
  ): Promise<IndexerSubscriptionWithSecret> {
    return this.client.request<IndexerSubscriptionWithSecret>({
      method: "POST",
      path: `/v1/indexer/subscriptions/${encodeURIComponent(id)}/rotate-secret`,
      ...overrides,
    });
  }

  /** Returns the catalog of subscribable event keys. Requires `indexer.subscription.list`. */
  async listEventCatalog(
    params: ListEventCatalogParams = {},
    overrides: RequestOverrides = {},
  ): Promise<EventCatalogEntry[]> {
    return this.client.request<EventCatalogEntry[]>({
      method: "GET",
      path: "/v1/indexer/events",
      query: params as Record<string, QueryValue>,
      ...overrides,
    });
  }
}
