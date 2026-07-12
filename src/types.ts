/**
 * A string literal union that still accepts any other string, so autocomplete surfaces
 * the known values without rejecting new ones the API adds before this SDK is updated.
 */
export type LooseUnion<T extends string> = T | (string & Record<never, never>);

/** Chain family used by the Wallet service's HD tree. */
export type ChainType = "EVM" | "SOLANA";

/** `MAINNET` for real funds, `TESTNET` for sponsored/free test transfers. */
export type Network = "MAINNET" | "TESTNET";

/** Lifecycle of an async Wallet transaction (transfer or sponsored sign). */
export type TransactionStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

/**
 * Chain identifier used by Tokenization and the Indexer (e.g. `"BASE"`, `"ETH"`). Distinct
 * from {@link ChainType}, which only distinguishes the EVM/Solana wallet-derivation family.
 */
export type Chain = LooseUnion<"ATC" | "BSC" | "ETH" | "BASE" | "POL" | "SOL" | "LISK">;

/** Per-call overrides accepted by every SDK method. */
export interface RequestOverrides {
  /** Abort this specific call independent of the client's default timeout. */
  signal?: AbortSignal;
  /** Overrides the client's default request timeout, in milliseconds, for this call only. */
  timeoutMs?: number;
}

/** Per-call overrides for methods that accept (or require) an `Idempotency-Key`. */
export interface IdempotentRequestOverrides extends RequestOverrides {
  /**
   * Client-generated key that makes this request safe to retry — a retry sent with the
   * same key returns the original result instead of submitting again. Defaults to an
   * auto-generated UUIDv4 when omitted; pass your own to control retries across separate
   * SDK calls (e.g. after a process restart).
   */
  idempotencyKey?: string;
}
