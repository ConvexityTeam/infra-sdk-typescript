import type { Chain, LooseUnion } from "../../types.js";

export type SubscriptionStatus = LooseUnion<"active" | "paused" | "deleted">;

export type EventFamily = "EVM" | "SOL";

export type EventKind = LooseUnion<"onchain" | "derived">;

/** A Blockchain Events subscription streaming decoded contract events to your webhook. */
export interface IndexerSubscription {
  id: string;
  projectId: string;
  network: Chain;
  contractAddress: string;
  webhookUrl: string;
  /** Subscribed event catalog keys, e.g. `["transfer", "burn"]`. */
  events: string[];
  status: SubscriptionStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt: string | null;
  deliveredCount: number;
  failedCount: number;
  droppedCount: number;
}

/**
 * An {@link IndexerSubscription} augmented with the HMAC signing secret. Only returned by
 * {@link IndexerResource.createSubscription} and {@link IndexerResource.rotateSigningSecret}
 * — the secret is never shown again after that response, so store it immediately.
 */
export interface IndexerSubscriptionWithSecret extends IndexerSubscription {
  signingSecret: string;
  secretWarning: string;
}

export interface CreateSubscriptionParams {
  network: Chain;
  /** Contract to watch (1-128 chars). */
  contractAddress: string;
  /** HTTPS URL to deliver events to. */
  webhookUrl: string;
  /** Catalog keys to subscribe to. Omit to subscribe to all events for the contract. */
  events?: string[];
}

export interface ListSubscriptionsParams {
  /** Default `1`. */
  page?: number;
  /** Default `20`. */
  limit?: number;
}

export interface UpdateSubscriptionParams {
  /** New HTTPS URL. */
  webhookUrl?: string;
  /** Replacement event keys (at least one). */
  events?: string[];
  /** Use {@link IndexerResource.deleteSubscription} to remove a subscription instead of setting a "deleted" status. */
  status?: "active" | "paused";
}

export interface ListEventCatalogParams {
  family?: EventFamily;
}

/** A subscribable event key in the Blockchain Events catalog. */
export interface EventCatalogEntry {
  key: string;
  family: EventFamily;
  kind: EventKind;
  label: string;
  /** Solidity event signature, e.g. `"Transfer(address,address,uint256)"`. */
  signature: string;
}
