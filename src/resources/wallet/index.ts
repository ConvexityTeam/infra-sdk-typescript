import { APIResource } from "../resource.js";
import { generateIdempotencyKey } from "../../core/idempotency.js";
import { pageFromOffsetResponse } from "../../core/pagination.js";
import type { Page, OffsetPaginatedResponse } from "../../core/pagination.js";
import type { QueryValue } from "../../core/http-client.js";
import type { RequestOverrides, IdempotentRequestOverrides } from "../../types.js";
import type {
  DeactivateWalletParams,
  GenerateWalletsParams,
  GeneratedWallet,
  GetTransactionHistoryParams,
  GetWalletByAddressIndexParams,
  GetWalletByAddressParams,
  GetWalletCountParams,
  HdEnabledStatus,
  InitiateTransferParams,
  ListWalletsParams,
  SignTransactionParams,
  SignedTransactionResult,
  SupportedChain,
  Wallet,
  WalletBalance,
  WalletCount,
  WalletTransaction,
} from "./types.js";

export * from "./types.js";

/**
 * The Wallet service — manages the business HD wallet tree: deriving addresses, reading
 * them, signing and submitting transactions, and tracking the USD balance used to pay gas
 * on mainnet transfers.
 *
 * [Initiate transfer]{@link WalletResource.initiateTransfer} and sponsored
 * [Sign transaction]{@link WalletResource.signTransaction} are asynchronous by default:
 * they return a `PENDING` transaction immediately, and you poll
 * {@link WalletResource.getTransaction} (or supply `webhookUrl`) for the outcome. Pass
 * `waitForCompletion: true` for the legacy synchronous behavior.
 */
export class WalletResource extends APIResource {
  /** Derives one or more new addresses on the business HD tree. Requires `wallet.hd.generate`. */
  async generateWallets(
    params: GenerateWalletsParams,
    overrides: IdempotentRequestOverrides = {},
  ): Promise<GeneratedWallet[]> {
    const { idempotencyKey, ...rest } = overrides;
    return this.client.request<GeneratedWallet[]>({
      method: "POST",
      path: "/v1/wallet/hd/generate",
      body: params,
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
      ...rest,
    });
  }

  /**
   * Lists derived wallets for the business. Requires `wallet.hd.read`.
   *
   * Note: unlike {@link getTransactionHistory}, the API does not return pagination
   * metadata for this endpoint — it always answers with a plain array sized by `limit`.
   */
  async listWallets(params: ListWalletsParams = {}, overrides: RequestOverrides = {}): Promise<Wallet[]> {
    return this.client.request<Wallet[]>({
      method: "GET",
      path: "/v1/wallet/hd",
      query: params as Record<string, QueryValue>,
      ...overrides,
    });
  }

  /** Returns the number of derived wallets, optionally filtered by chain. Requires `wallet.hd.read`. */
  async getWalletCount(params: GetWalletCountParams = {}, overrides: RequestOverrides = {}): Promise<WalletCount> {
    return this.client.request<WalletCount>({
      method: "GET",
      path: "/v1/wallet/hd/count",
      query: params as Record<string, QueryValue>,
      ...overrides,
    });
  }

  /** Reports whether HD wallets are enabled for the business. Requires `wallet.hd.read`. */
  async getHdEnabled(overrides: RequestOverrides = {}): Promise<HdEnabledStatus> {
    return this.client.request<HdEnabledStatus>({
      method: "GET",
      path: "/v1/wallet/hd/enabled",
      ...overrides,
    });
  }

  /** Fetches a single wallet by its on-chain address. Requires `wallet.hd.read`. */
  async getWalletByAddress(
    address: string,
    params: GetWalletByAddressParams = {},
    overrides: RequestOverrides = {},
  ): Promise<Wallet> {
    return this.client.request<Wallet>({
      method: "GET",
      path: `/v1/wallet/hd/address/${encodeURIComponent(address)}`,
      query: params as Record<string, QueryValue>,
      ...overrides,
    });
  }

  /** Fetches a wallet by its HD `addressIndex`. Requires `wallet.hd.read`. */
  async getWalletByAddressIndex(
    addressIndex: number,
    params: GetWalletByAddressIndexParams = {},
    overrides: RequestOverrides = {},
  ): Promise<Wallet> {
    return this.client.request<Wallet>({
      method: "GET",
      path: `/v1/wallet/hd/address-index/${encodeURIComponent(String(addressIndex))}`,
      query: params as Record<string, QueryValue>,
      ...overrides,
    });
  }

  /**
   * Signs (and, where applicable, sponsors and submits) a transaction from a derived
   * wallet. Requires `wallet.hd.sign`.
   *
   * Returns a {@link SignedTransactionResult} for local-only signing (a non-EVM chain
   * with `addressIndex` — nothing broadcast), or a {@link WalletTransaction} for a
   * sponsored sign (async `PENDING` by default, or the settled result with
   * `waitForCompletion: true`).
   */
  async signTransaction(
    params: SignTransactionParams,
    overrides: IdempotentRequestOverrides = {},
  ): Promise<SignedTransactionResult | WalletTransaction> {
    const { idempotencyKey, ...rest } = overrides;
    return this.client.request<SignedTransactionResult | WalletTransaction>({
      method: "POST",
      path: "/v1/wallet/hd/sign",
      body: params,
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
      ...rest,
    });
  }

  /** Deactivates a wallet so it is no longer used for new operations. Requires `wallet.hd.deactivate`. */
  async deactivateWallet(
    walletId: string,
    params: DeactivateWalletParams = {},
    overrides: RequestOverrides = {},
  ): Promise<null> {
    return this.client.request<null>({
      method: "POST",
      path: `/v1/wallet/hd/deactivate/${encodeURIComponent(walletId)}`,
      query: params as Record<string, QueryValue>,
      ...overrides,
    });
  }

  /** Lists the chains the platform can sign and broadcast on. */
  async getSupportedChains(overrides: RequestOverrides = {}): Promise<SupportedChain[]> {
    return this.client.request<SupportedChain[]>({
      method: "GET",
      path: "/v1/wallet/rpc/chains",
      ...overrides,
    });
  }

  /**
   * Submits a token (or native) transfer from a derived wallet. Requires
   * `wallet.transfer.create`.
   *
   * On a `422` (transfer reverted after broadcast, `waitForCompletion: true` only), the
   * thrown {@link UnprocessableEntityError} still carries the failed transaction — read it
   * from `error.body` (shaped like `{ data: WalletTransaction }`) if you need the details
   * rather than just the message.
   */
  async initiateTransfer(
    params: InitiateTransferParams,
    overrides: IdempotentRequestOverrides = {},
  ): Promise<WalletTransaction> {
    const { idempotencyKey, ...rest } = overrides;
    return this.client.request<WalletTransaction>({
      method: "POST",
      path: "/v1/wallet/transaction",
      body: params,
      idempotencyKey: idempotencyKey ?? generateIdempotencyKey(),
      ...rest,
    });
  }

  /**
   * Returns a paginated history of the business's transactions. Requires
   * `wallet.transfer.read`.
   *
   * ```ts
   * const page = await client.wallet.getTransactionHistory({ status: "COMPLETED" });
   * for await (const tx of page) {
   *   console.log(tx.id, tx.status);
   * }
   * ```
   */
  async getTransactionHistory(
    params: GetTransactionHistoryParams = {},
    overrides: RequestOverrides = {},
  ): Promise<Page<WalletTransaction>> {
    const fetchPage = (query: Record<string, unknown>): Promise<Page<WalletTransaction>> =>
      this.client
        .request<OffsetPaginatedResponse<WalletTransaction>>({
          method: "GET",
          path: "/v1/wallet/transaction/history",
          query: { ...params, ...query },
          ...overrides,
        })
        .then((raw) => pageFromOffsetResponse(raw, fetchPage));

    return fetchPage({ limit: params.limit, offset: params.offset });
  }

  /**
   * Fetches a single transaction record — the authoritative view of a transfer's outcome.
   * Poll this after an async `202` until `status` is `COMPLETED` or `FAILED`. Requires
   * `wallet.transfer.read`.
   */
  async getTransaction(id: string, overrides: RequestOverrides = {}): Promise<WalletTransaction> {
    return this.client.request<WalletTransaction>({
      method: "GET",
      path: `/v1/wallet/transaction/${encodeURIComponent(id)}`,
      ...overrides,
    });
  }

  /** Returns the business's spendable USD balance, used to pay gas on mainnet transfers. Requires `wallet.balance.read`. */
  async getBalance(overrides: RequestOverrides = {}): Promise<WalletBalance> {
    return this.client.request<WalletBalance>({
      method: "GET",
      path: "/v1/wallet/balance",
      ...overrides,
    });
  }
}
