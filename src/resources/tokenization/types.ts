import type { Chain, LooseUnion } from "../../types.js";

export type TokenType = "ASSET" | "YIELD_BEARING";

export type TokenStatus = LooseUnion<"PENDING" | "ACTIVE" | "PAUSED" | "RETIRED">;

export type TokenTransactionType = LooseUnion<"MINT" | "BURN" | "TRANSFER" | "DEPLOY" | "REDEEM" | "SNAPSHOT">;

export type TokenTransactionStatus = LooseUnion<"PENDING" | "CONFIRMED" | "FAILED">;

export interface YieldParams {
  /** Annual yield rate as a percentage, e.g. `5.5` for 5.5%. */
  annualRate: number;
  /** Maturity date, `YYYY-MM-DD`. */
  maturityDate: string;
  /** First coupon date, `YYYY-MM-DD`. */
  firstCouponDate: string;
  /** Coupon interval, in days. */
  couponInterval: number;
  /** Day-count convention, e.g. `"ACT_365"`. */
  dayCount: string;
  /** Face value per token, in fiat major units. */
  faceValuePerToken: number;
  /** Grace period, in seconds. */
  gracePeriod?: number;
  callable?: boolean;
  /** Call date, `YYYY-MM-DD`. Only meaningful when `callable` is `true`. */
  callDate?: string;
  /** Early redemption fee, in basis points. */
  earlyRedemptionFee?: number;
}

export interface CreateTokenParams {
  /** Short token symbol, e.g. `"ACMB3"`. */
  ticker: string;
  name: string;
  /** Issue price per token, in fiat major units. */
  price?: number;
  chainId: string;
  decimals: number;
  /** Asset class, e.g. `"MONEY_MARKET"`. */
  assetClass: string;
  tokenType: TokenType;
  /** Maximum holders; `0` for unlimited. */
  maxShareholders?: number;
  /** Per-investor cap; `0` for unlimited. */
  maxTokensPerInvestor?: number;
  /** Lock-up duration, in seconds; `0` for none. */
  lockUpDuration?: number;
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
  chainId: string;
  /** Holder address to burn from. */
  fromAddress: string;
  /** Amount to burn, in token units. */
  amount: number;
  /** Optional note recorded with the operation. */
  memo?: string;
}

export interface MintTokenParams {
  tokenId: string;
  chainId: string;
  /** Recipient wallet address. */
  toAddress: string;
  /** Amount to mint, in token units. */
  amount: number;
  memo?: string;
}

export interface TransferTokenParams {
  tokenId: string;
  chainId: string;
  /** HD address index of the sending holder wallet. */
  fromAddressIndex: number;
  toAddress: string;
  /** Amount to transfer, in token units. */
  amount: number;
  memo?: string;
}

export interface ForcedTransferTokenParams {
  tokenId: string;
  chainId: string;
  /** Holder address to move tokens out of. */
  fromAddress: string;
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
  chainId: string;
  walletAddress: string;
}

export interface RegisterTokenWalletResult {
  tokenId: string;
  chainId: string;
  walletAddress: string;
}

export interface GetTokenHoldersParams {
  tokenId: string;
  chainId?: string;
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
  chainId: string;
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
}

export interface ListTokenTransactionsParams {
  tokenId?: string;
  chainId?: string;
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
}

export interface UpdateTokenYieldParams {
  /** Yield-bearing token id. */
  tokenId: string;
  chainId: string;
  /** New annual yield rate, as a percentage. */
  annualRate: number;
}

export interface DistributeYieldParams {
  tokenId: string;
  chainId: string;
  /** Amount to fund the distribution, in fiat major units. */
  fundAmount: number;
  payoutToken?: string;
  /** Seconds after which unclaimed funds may be reclaimed. */
  reclaimAfter?: number;
  memo?: string;
}

export interface PayCouponParams {
  tokenId: string;
  chainId: string;
  payoutToken?: string;
  /** Push the coupon to investors instead of letting them claim it. */
  pushYield?: boolean;
  reclaimAfter?: number;
  memo?: string;
}

export interface ClaimYieldParams {
  tokenId: string;
  chainId: string;
  /** HD address index of the claiming investor. */
  investorAddressIndex: number;
  /** Distribution snapshot to claim against. */
  snapshotId: number;
}

export interface RedeemPrincipalParams {
  tokenId: string;
  chainId: string;
  /** Push redeemed funds to investors instead of letting them claim. */
  pushYield?: boolean;
}

/** Result of a yield operation that only returns a transaction hash. */
export interface YieldTxResult {
  txHash: string;
}

/** Result of a yield operation that also returns an operation reference (distribute, pay-coupon). */
export interface YieldOperationResult {
  operationRef: string;
  txHash: string;
}
