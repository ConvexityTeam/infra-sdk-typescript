import { APIResource } from "../resource.js";
import { pageFromFlatResponse } from "../../core/pagination.js";
import type { Page, FlatPaginatedResponse } from "../../core/pagination.js";
import type { RequestOverrides } from "../../types.js";
import type {
  BurnTokenParams,
  ClaimYieldParams,
  CreateTokenParams,
  DistributeYieldParams,
  GetTokenHoldersParams,
  ListTokenTransactionsParams,
  ListTokensParams,
  MintTokenParams,
  PayCouponParams,
  RedeemPrincipalParams,
  RegisterTokenWalletParams,
  RegisterTokenWalletResult,
  TokenDeploymentResult,
  TokenDetail,
  TokenHolder,
  TokenOperationResult,
  TokenSummary,
  TokenTransactionRecord,
  TokenTransferResult,
  TransferTokenParams,
  UpdateTokenYieldParams,
  YieldOperationResult,
  YieldTxResult,
} from "./types.js";

export * from "./types.js";

/**
 * The Tokenization service — issues and manages tokenized real-world assets: deployment,
 * mint/burn/transfer, wallet whitelisting, holder balances, and the yield lifecycle
 * (rate updates, coupon payments, claims, and principal redemption) for `YIELD_BEARING`
 * tokens.
 */
export class TokenizationResource extends APIResource {
  /**
   * Issues a new tokenized asset and deploys it on the target chain. Returns immediately
   * with a `PENDING` token plus a deployment `operationRef` and `txHash` — poll
   * {@link getToken} until `status` is `ACTIVE`. Supply `yieldParams` for a
   * `YIELD_BEARING` token.
   */
  async createToken(params: CreateTokenParams, overrides: RequestOverrides = {}): Promise<TokenDeploymentResult> {
    return this.client.request<TokenDeploymentResult>({
      method: "POST",
      path: "/v1/tokens",
      body: params,
      ...overrides,
    });
  }

  /**
   * Returns a paginated list of tokens for the calling project.
   *
   * ```ts
   * const page = await client.tokenization.listTokens();
   * for await (const token of page) console.log(token.ticker, token.status);
   * ```
   */
  async listTokens(params: ListTokensParams = {}, overrides: RequestOverrides = {}): Promise<Page<TokenSummary>> {
    const fetchPage = (query: Record<string, unknown>): Promise<Page<TokenSummary>> =>
      this.client
        .request<FlatPaginatedResponse<TokenSummary>>({
          method: "GET",
          path: "/v1/tokens",
          query: { ...params, ...query },
          ...overrides,
        })
        .then((raw) => pageFromFlatResponse(raw, fetchPage));

    return fetchPage({ page: params.page, pageSize: params.pageSize });
  }

  /** Fetches a single token by id, including its per-chain deployment details. */
  async getToken(id: string, overrides: RequestOverrides = {}): Promise<TokenDetail> {
    return this.client.request<TokenDetail>({
      method: "GET",
      path: `/v1/tokens/${encodeURIComponent(id)}`,
      ...overrides,
    });
  }

  /** Mints new units of a token to a recipient address. */
  async mintToken(params: MintTokenParams, overrides: RequestOverrides = {}): Promise<TokenOperationResult> {
    return this.client.request<TokenOperationResult>({
      method: "POST",
      path: "/v1/tokens/mint",
      body: params,
      ...overrides,
    });
  }

  /** Burns units of a token from a holder address. */
  async burnToken(params: BurnTokenParams, overrides: RequestOverrides = {}): Promise<TokenOperationResult> {
    return this.client.request<TokenOperationResult>({
      method: "POST",
      path: "/v1/tokens/burn",
      body: params,
      ...overrides,
    });
  }

  /** Transfers token units between holder addresses. */
  async transferToken(params: TransferTokenParams, overrides: RequestOverrides = {}): Promise<TokenTransferResult> {
    return this.client.request<TokenTransferResult>({
      method: "POST",
      path: "/v1/tokens/transfer",
      body: params,
      ...overrides,
    });
  }

  /** Registers (whitelists) a wallet address so it can hold a given token. */
  async registerWallet(
    params: RegisterTokenWalletParams,
    overrides: RequestOverrides = {},
  ): Promise<RegisterTokenWalletResult> {
    return this.client.request<RegisterTokenWalletResult>({
      method: "POST",
      path: "/v1/tokens/register-wallet",
      body: params,
      ...overrides,
    });
  }

  /** Returns the paginated list of holder wallet addresses and balances for a token on a chain. */
  async getTokenHolders(params: GetTokenHoldersParams, overrides: RequestOverrides = {}): Promise<Page<TokenHolder>> {
    const fetchPage = (query: Record<string, unknown>): Promise<Page<TokenHolder>> =>
      this.client
        .request<FlatPaginatedResponse<TokenHolder>>({
          method: "GET",
          path: "/v1/tokens/holders",
          query: { ...params, ...query },
          ...overrides,
        })
        .then((raw) => pageFromFlatResponse(raw, fetchPage));

    return fetchPage({ page: params.page, pageSize: params.pageSize });
  }

  /** Fetches a single token transaction by its reference. */
  async getTokenTransaction(ref: string, overrides: RequestOverrides = {}): Promise<TokenTransactionRecord> {
    return this.client.request<TokenTransactionRecord>({
      method: "GET",
      path: `/v1/tokens/transactions/${encodeURIComponent(ref)}`,
      ...overrides,
    });
  }

  /** Returns token transactions, optionally filtered by token. */
  async listTokenTransactions(
    params: ListTokenTransactionsParams = {},
    overrides: RequestOverrides = {},
  ): Promise<Page<TokenTransactionRecord>> {
    const fetchPage = (query: Record<string, unknown>): Promise<Page<TokenTransactionRecord>> =>
      this.client
        .request<FlatPaginatedResponse<TokenTransactionRecord>>({
          method: "GET",
          path: "/v1/tokens/transactions",
          query: { ...params, ...query },
          ...overrides,
        })
        .then((raw) => pageFromFlatResponse(raw, fetchPage));

    return fetchPage({ page: params.page, pageSize: params.pageSize });
  }

  /** Updates the annual yield rate for a yield-bearing token. */
  async updateYield(params: UpdateTokenYieldParams, overrides: RequestOverrides = {}): Promise<YieldTxResult> {
    return this.client.request<YieldTxResult>({
      method: "PATCH",
      path: "/v1/tokens/yield",
      body: params,
      ...overrides,
    });
  }

  /** Funds and distributes a yield payout to holders. Unclaimed funds may be reclaimed after `reclaimAfter`. */
  async distributeYield(
    params: DistributeYieldParams,
    overrides: RequestOverrides = {},
  ): Promise<YieldOperationResult> {
    return this.client.request<YieldOperationResult>({
      method: "POST",
      path: "/v1/tokens/yield/distribute",
      body: params,
      ...overrides,
    });
  }

  /** Pays the scheduled coupon for a yield-bearing token. Set `pushYield` to push funds rather than let investors claim. */
  async payCoupon(params: PayCouponParams, overrides: RequestOverrides = {}): Promise<YieldOperationResult> {
    return this.client.request<YieldOperationResult>({
      method: "POST",
      path: "/v1/tokens/yield/pay-coupon",
      body: params,
      ...overrides,
    });
  }

  /** Claims an investor's yield for a given distribution snapshot. */
  async claimYield(params: ClaimYieldParams, overrides: RequestOverrides = {}): Promise<YieldTxResult> {
    return this.client.request<YieldTxResult>({
      method: "POST",
      path: "/v1/tokens/yield/claim",
      body: params,
      ...overrides,
    });
  }

  /** Redeems principal to holders at maturity. Set `pushYield` to push funds rather than let investors claim. */
  async redeemPrincipal(params: RedeemPrincipalParams, overrides: RequestOverrides = {}): Promise<YieldTxResult> {
    return this.client.request<YieldTxResult>({
      method: "POST",
      path: "/v1/tokens/yield/redeem",
      body: params,
      ...overrides,
    });
  }
}
