import type { Chain, LooseUnion } from "../../types.js";

export type TokenType = "ASSET" | "YIELD_BEARING";

export type TokenStatus = LooseUnion<"PENDING" | "ACTIVE" | "PAUSED" | "RETIRED">;

export type TokenTransactionType = LooseUnion<
  "MINT" | "BURN" | "TRANSFER" | "DEPLOY" | "REDEEM" | "SNAPSHOT" | "FORCED_TRANSFER"
>;

export type TokenTransactionStatus = LooseUnion<"PENDING" | "CONFIRMED" | "FAILED">;

/**
 * Chain id a token is deployed on, e.g. `84532` (Base Sepolia). The API accepts it as a number
 * or a numeric string; responses always return it as a string.
 */
export type TokenChainId = string | number;

export type AssetClass = LooseUnion<"FIXED_INCOME" | "MONEY_MARKET" | "REAL_ESTATE" | "COMMODITY" | "EQUITY" | "LOYALTY_VOUCHER">;

/** Day-count convention used to accrue yield. */
export type YieldDayCount = LooseUnion<"ACT_365" | "ACT_360" | "THIRTY_360">;

/** Stablecoin a yield payout is made in. Omit to pay out in the token's own settlement asset. */
export type YieldPayoutToken = LooseUnion<"CNGN">;

export interface YieldParams {
  /**
   * Annual yield rate as a percentage, e.g. `5.5` for 5.5%. Must be greater than `0`, at most
   * `100`, and have no more than 2 decimal places.
   */
  annualRate: number;
  /** Maturity date, `YYYY-MM-DD`. Must be in the future. */
  maturityDate: string;
  /** First coupon date, `YYYY-MM-DD`. Must be in the future and before `maturityDate`. */
  firstCouponDate: string;
  /** Coupon interval, in days. Must be at least `1`. */
  couponInterval: number;
  dayCount: YieldDayCount;
  /** Face value per token, in fiat major units. Must be at least `1`. */
  faceValuePerToken: number;
  /** Grace period, in seconds. */
  gracePeriod: number;
  callable: boolean;
  /**
   * Call date, `YYYY-MM-DD`. Only meaningful when `callable` is `true`. Must be in the future
   * and before `maturityDate`.
   */
  callDate?: string;
  /** Early redemption fee, in basis points. */
  earlyRedemptionFee?: number;
}

export interface CreateTokenParams {
  /** Short token symbol, e.g. `"ACMB3"`. At most 10 characters. */
  ticker: string;
  name: string;
  /** Issue price per token, in fiat major units. Must be at least `1`. */
  price: number;
  chainId: TokenChainId;
  /** Between `1` and `18`. */
  decimals?: number;
  assetClass: AssetClass;
  tokenType: TokenType;
  /** Maximum holders; `0` for unlimited. */
  maxShareholders: number;
  /** Per-investor cap; `0` for unlimited. */
  maxTokensPerInvestor: number;
  /** Lock-up duration, in seconds; `0` for none. */
  lockUpDuration: number;
  /** Required when `tokenType` is `"YIELD_BEARING"`. */
  yieldParams?: YieldParams;
}

/** Result of a token deployment submission — `status` starts `PENDING` until the chain confirms it. */
export interface TokenDeploymentResult {
  id: string;
  chainId: string;
  status: TokenStatus;
  operationRef: string;
  tokenAdmin: string;
  txHash: string;
}

/** Summary shape returned by {@link TokenizationResource.listTokens}. */
export interface TokenSummary {
  id: string;
  projectId: string;
  businessId: string;
  ticker: string;
  name: string;
  assetClass: string;
  tokenType: TokenType;
  decimals: number;
  totalSupply: string;
  circulatingSupply: string;
  chain: Chain;
  status: TokenStatus;
  deploymentRef: string;
  contractAddress: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** Per-chain deployment details within a {@link TokenDetail}. */
export interface TokenChainDeployment {
  id: string;
  chainId: string;
  tokenAdmin: string;
  decimals: number;
  status: TokenStatus;
  deploymentRef: string;
  contractAddress: string;
}

/** Detailed shape returned by {@link TokenizationResource.getToken}, including every chain it's deployed on. */
export interface TokenDetail {
  id: string;
  projectId: string;
  businessId: string;
  ticker: string;
  name: string;
  price?: string | number;
  assetClass: string;
  tokenType: TokenType;
  status: TokenStatus;
  createdAt: string;
  updatedAt: string;
  chains: TokenChainDeployment[];
}

export interface ListTokensParams {
  /** Default `1`. */
  page?: number;
  /** Default `20`. */
  pageSize?: number;
}

export interface BurnTokenParams {
  tokenId: string;
  chainId: TokenChainId;
  /** Holder address to burn from. */
  fromAddress: string;
  /** Amount to burn, in token units. */
  amount: number;
  /** Optional note recorded with the operation. */
  memo?: string;
}

export interface MintTokenParams {
  tokenId: string;
  chainId: TokenChainId;
  /** Recipient wallet address. */
  toAddress: string;
  /** Amount to mint, in token units. */
  amount: number;
  memo?: string;
}

export interface TransferTokenParams {
  tokenId: string;
  chainId: TokenChainId;
  /** HD address index of the sending holder wallet. Must be greater than `0`. */
  fromAddressIndex: number;
  toAddress: string;
  /** Amount to transfer, in token units. */
  amount: number;
  memo?: string;
}

export interface ForcedTransferTokenParams {
  tokenId: string;
  chainId: TokenChainId;
  /** Holder address to move tokens out of. Must be a valid EVM address. */
  fromAddress: string;
  /** Must be a valid EVM address. */
  toAddress: string;
  /** Amount to transfer, in token units. */
  amount: number;
  memo?: string;
}

/**
 * Result of {@link TokenizationResource.mintToken} / {@link TokenizationResource.burnToken} /
 * {@link TokenizationResource.forcedTransfer}.
 */
export interface TokenOperationResult {
  operationRef: string;
  transactionId: string;
  txHash: string;
}

/** Result of {@link TokenizationResource.transferToken}. */
export interface TokenTransferResult {
  tokenId: string;
  status: TokenTransactionStatus;
  transactionId: string;
  fromAddressIndex: number;
  toAddress: string;
  /** Amount transferred, in token units. */
  amount: number;
  txHash: string;
  operationRef: string;
}

export interface RegisterTokenWalletParams {
  tokenId: string;
  chainId: TokenChainId;
  walletAddress: string;
}

export interface RegisterTokenWalletResult {
  tokenId: string;
  chainId: string;
  walletAddress: string;
}

export interface GetTokenHoldersParams {
  tokenId: string;
  chainId?: TokenChainId;
  page?: number;
  pageSize?: number;
}

export interface TokenHolder {
  walletAddress: string;
  /** Balance in token units, as a decimal string. */
  balance: string;
}

export interface GetWalletBalanceParams {
  tokenId: string;
  chainId: TokenChainId;
  walletAddress: string;
}

/** A single wallet's balance of a token, returned by {@link TokenizationResource.getWalletBalance}. */
export interface TokenWalletBalance {
  tokenId: string;
  ticker: string;
  chainId: string;
  walletAddress: string;
  /** Balance in token units, as a decimal string. */
  balance: string;
  decimals: number;
  /** The wallet's cNGN (payout token) balance, as a decimal string. Coupons, yield and principal are paid in cNGN. */
  cNgnBalance: string;
}

export interface ListTokenTransactionsParams {
  tokenId?: string;
  chainId?: TokenChainId;
  page?: number;
  pageSize?: number;
  type?: TokenTransactionType;
  status?: TokenTransactionStatus;
  fromAddress?: string;
  toAddress?: string;
  txHash?: string;
  operationRef?: string;
}

/** A recorded on-chain operation against a token (mint, burn, or transfer). */
export interface TokenTransactionRecord {
  id: string;
  tokenId: string;
  chainId: string;
  projectId?: string;
  type: TokenTransactionType;
  status: TokenTransactionStatus;
  fromAddress?: string;
  toAddress?: string;
  /** Amount in token units, as a decimal string. */
  amount: string;
  txHash: string;
  blockNumber?: number;
  blockHash?: string;
  gasUsed?: string;
  feeWei?: string;
  operationRef?: string;
  memo?: string;
  createdAt?: string;
  confirmedAt?: string;
  /** Distribution snapshot id, set on `SNAPSHOT` transactions. */
  snapshotId?: number;
}

export interface UpdateTokenYieldParams {
  /** Yield-bearing token id. */
  tokenId: string;
  chainId: TokenChainId;
  /** New annual yield rate, as a percentage. Same limits as {@link YieldParams.annualRate}. */
  annualRate: number;
}

/** Result of {@link TokenizationResource.updateYield}. */
export interface UpdateYieldResult {
  /** Annual rate before the update, as a percentage. */
  currentRate: number;
  /** Annual rate after the update, as a percentage. */
  newRate: number;
  operationRef: string;
  txHash: string;
}

export interface DistributeYieldParams {
  tokenId: string;
  chainId: TokenChainId;
  /** Amount to fund the distribution, in fiat major units. A whole number, at least `1`. */
  fundAmount: number;
  payoutToken?: YieldPayoutToken;
  /** Seconds after which unclaimed funds may be reclaimed. A whole number, at least `1`. */
  reclaimAfter: number;
  /** Push the payout to investors instead of letting them claim it. */
  pushYield?: boolean;
  /** Note recorded with the distribution. */
  memo: string;
}

export interface PayCouponParams {
  tokenId: string;
  chainId: TokenChainId;
  payoutToken?: YieldPayoutToken;
  /** Push the coupon to investors instead of letting them claim it. */
  pushYield: boolean;
  /** Seconds after which unclaimed funds may be reclaimed. At least `1`. */
  reclaimAfter: number;
  /** Note recorded with the coupon payment. */
  memo: string;
}

export interface ClaimYieldParams {
  tokenId: string;
  chainId: TokenChainId;
  /** HD address index of the claiming investor. At least `1`. */
  investorAddressIndex: number;
  /** Distribution snapshot to claim against. At least `1`. */
  snapshotId: number;
}

export interface RedeemPrincipalParams {
  tokenId: string;
  chainId: TokenChainId;
}

/**
 * Why a holder was left out of a redemption. Their principal is still owed once the cause is resolved.
 *
 * - `NOT_VERIFIED` — not KYC-verified in the token's identity registry.
 * - `FROZEN` — the wallet is frozen.
 * - `NOT_ALLOWLISTED` — removed from the compliance allowlist.
 * - `SKIPPED_BY_CONTRACT` — eligible when read, but the contract skipped it when the batch executed
 *   (e.g. it became ineligible in between).
 */
export type RedemptionSkipReason = LooseUnion<"NOT_VERIFIED" | "FROZEN" | "NOT_ALLOWLISTED" | "SKIPPED_BY_CONTRACT">;

/** A holder {@link TokenizationResource.redeemPrincipal} did not redeem. */
export interface RedemptionSkippedHolder {
  address: string;
  /** Unredeemed balance in the token's smallest unit, as an integer string. */
  balance: string;
  reasons: RedemptionSkipReason[];
}

/** Result of {@link TokenizationResource.redeemPrincipal}. */
export interface RedeemPrincipalResult {
  tokenId: string;
  operationRef: string;
  /** Transaction records created by this run: the issuer-token burn (if any), then one per redemption batch. */
  transactionIds: string[];
  /** Hashes in send order: the burn, each batch, then the seal that marks the principal repaid (if one was needed). */
  txHashes: string[];
  /** Holders actually paid, from the contract's `PrincipalRedeemed` events. */
  redeemedHolders: number;
  /** Principal actually paid, in cNGN base units (6 decimals), as an integer string. */
  paidPrincipal: string;
  /** {@link paidPrincipal} as a decimal cNGN string, e.g. `"100000.0"`. */
  paidPrincipalFormatted: string;
  /**
   * Indexes of batches whose receipt couldn't be read. Their transactions landed, but their paid amounts
   * are the pre-transaction estimate rather than the on-chain events.
   */
  unreconciledBatches: number[];
  /** Holders that were not redeemed, with their balances and why. */
  skipped: RedemptionSkippedHolder[];
  /** Issuer-held (treasury) tokens burned without a payout, or `null` when there were none. Frozen tokens are never burned. */
  treasuryBurned: { amount: string; txHash: string } | null;
  /** Supply left after the run, in the token's smallest unit, as an integer string. */
  outstandingSupply: string;
  /**
   * `true` once supply is zero and the bond is marked principal-repaid. While `false`, the remaining
   * supply belongs to {@link skipped} holders, frozen issuer tokens or the yield distributor.
   */
  closed: boolean;
}

export interface GetNextCouponParams {
  tokenId: string;
  chainId: TokenChainId;
}

/**
 * Where a bond stands on its coupon schedule.
 *
 * - `SCHEDULED` — the next coupon isn't due yet.
 * - `DUE` — the coupon can be paid now with {@link TokenizationResource.payCoupon}.
 * - `GRACE_EXPIRED` — the coupon was missed and its grace period has passed; it is still payable,
 *   but anyone can now flag the bond as defaulted.
 * - `DEFAULTED` — the bond is in default; no further coupons can be scheduled.
 * - `NO_MORE_COUPONS` — the schedule has run past maturity; only principal redemption remains.
 * - `CLOSED` — principal has been repaid and the bond is closed.
 */
export type NextCouponStatus = LooseUnion<
  "SCHEDULED" | "DUE" | "GRACE_EXPIRED" | "DEFAULTED" | "NO_MORE_COUPONS" | "CLOSED"
>;

/** Result of {@link TokenizationResource.getNextCoupon}. Dates are ISO 8601 strings in UTC. */
export interface NextCoupon {
  tokenId: string;
  chainId: string;
  status: NextCouponStatus;
  /** When the next coupon falls due. `null` once there are no more coupons (`NO_MORE_COUPONS` or `CLOSED`). */
  nextCouponDate: string | null;
  /** `nextCouponDate` plus the bond's grace period; after this a missed coupon allows a default. `null` with it. */
  graceEndsAt: string | null;
  /** `true` when a coupon can be paid now (`DUE` or `GRACE_EXPIRED`). */
  isDue: boolean;
  /** Seconds between coupons. */
  couponPeriodSeconds: number;
  maturityDate: string;
  /** Coupon paid per whole token, in cNGN, as a decimal string. */
  couponPerToken: string;
}

export interface ReclaimUnclaimedYieldParams {
  tokenId: string;
  chainId: TokenChainId;
  /** Distribution snapshot to reclaim unclaimed funds from. A whole number, at least `1`. */
  snapshotId: number;
}

/** Result of {@link TokenizationResource.reclaimUnclaimedYield}. */
export interface ReclaimUnclaimedYieldResult {
  tokenId: string;
  /** Snapshot id, as a numeric string. */
  snapshotId: string;
  /** Amount reclaimed, as a decimal string. */
  reclaimed: string;
  operationRef: string;
  txHash: string;
}

/** Result of {@link TokenizationResource.claimYield}. */
export interface YieldTxResult {
  operationRef: string;
  txHash: string;
}

/** Result of {@link TokenizationResource.distributeYield} / {@link TokenizationResource.payCoupon}. */
export interface YieldOperationResult {
  tokenId: string;
  operationRef: string;
  transactionId: string;
  txHash: string;
}
