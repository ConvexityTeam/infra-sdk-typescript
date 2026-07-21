import type { ChainType, Network, TransactionStatus } from "../../types.js";

/** A derived HD wallet address. */
export interface Wallet {
  id: string;
  businessName: string;
  address: string;
  chainType: ChainType;
  purpose: string;
  derivationPath: string;
  addressIndex: number;
  isActive: boolean;
  createdAt: string;
  deactivatedAt: string | null;
  metadata: Record<string, unknown> | null;
}

/** The minimal shape returned immediately after deriving new addresses. */
export interface GeneratedWallet {
  address: string;
  chainType: ChainType;
  isActive: boolean;
  addressIndex: number;
}

/** A Wallet-service on-chain transaction (transfer or sponsored sign), in any lifecycle state. */
export interface WalletTransaction {
  id: string;
  type: string;
  chainType: ChainType;
  network: Network;
  chainId: number;
  signerType: string;
  fromAddress: string;
  addressIndex: number | null;
  toAddress: string;
  amount: string | null;
  /** USD-equivalent value at execution time, when available. */
  valueUsd?: string;
  tokenAddress: string | null;
  data: string | null;
  value: string | null;
  txHash: string | null;
  status: TransactionStatus;
  gasUsed: string | null;
  feeWei: string | null;
  explorerUrl?: string;
  explorerTxUrl?: string | null;
  /** Present only when `status` is `FAILED`. */
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** Result of a local-only sign (non-EVM chain, nothing broadcast) — always returned synchronously. */
export interface SignedTransactionResult {
  signedTransaction: string;
}

export interface SupportedChain {
  chainType: ChainType;
  name: string;
  chainId: number | null;
  network: Network;
}

export interface WalletBalance {
  /** Spendable USD balance as a decimal string. */
  balance: string;
  currency: "USD";
  updatedAt: string;
}

export interface WalletCount {
  count: number;
}

export interface HdEnabledStatus {
  enabled: boolean;
}

export interface GenerateWalletsParams {
  chainType: ChainType;
  /** Logical tag for the addresses, e.g. `"deposit"`. */
  purpose?: string;
}

export interface ListWalletsParams {
  chainType?: ChainType;
  isActive?: boolean;
  /** Page size. Default 50. */
  limit?: number;
  offset?: number;
}

export interface GetWalletCountParams {
  chainType?: ChainType;
}

export interface GetWalletByAddressParams {
  /** Disambiguates the chain when the same address string could exist on more than one. */
  chainType?: ChainType;
}

export interface GetWalletByAddressIndexParams {
  chainType?: ChainType;
}

export interface SignTransactionRequest {
  to: string;
  /** Native value in the chain's smallest unit. */
  value?: string;
  /** Calldata, hex-encoded. */
  data?: string;
}

export interface SignTransactionParams {
  chainType: ChainType;
  /** HD index of the signing wallet. */
  addressIndex?: number;
  /** Target chain id (e.g. `8453`). Required for EVM. */
  chainId?: number;
  network?: Network;
  transaction: SignTransactionRequest;
  /**
   * `true` = legacy synchronous mode: hold the request open for the relay outcome
   * instead of `202` + poll. Default `false`.
   */
  waitForCompletion?: boolean;
  /** HTTPS URL to receive the final transaction once execution settles. */
  webhookUrl?: string;
  /** Your own HMAC key (16-256 chars) for the webhook signature. Requires `webhookUrl`. */
  webhookSecret?: string;
}

export interface DeactivateWalletParams {
  chainType?: ChainType;
}

export interface InitiateTransferParams {
  /** Sending wallet — either its full on-chain address or its HD `addressIndex`. */
  fromAddress: string | number;
  toAddress: string;
  /** Amount in the token's smallest unit (e.g. `"1000000"`). */
  amount: string;
  chainType: ChainType;
  /** Target chain id. Use `84532` (Base Sepolia) for sponsored testnet transfers. Required for EVM. */
  chainId?: number;
  network?: Network;
  /** ERC-20 token contract. Omit for a native transfer. */
  tokenAddress?: string;
  /** Set `true` to transfer cNGN. Default `false`. */
  cNGN?: boolean;
  /**
   * `true` = legacy synchronous mode: hold the request open for the final outcome
   * (`201`/`422`) instead of `202` + poll. Default `false`.
   */
  waitForCompletion?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
}

export interface GetTransactionHistoryParams {
  chainType?: ChainType;
  /** e.g. `"COMPLETED"`. */
  status?: TransactionStatus;
  /** Page size. Default 20. */
  limit?: number;
  offset?: number;
}
