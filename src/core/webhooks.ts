import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookSignatureVerificationError } from "./errors.js";

/** Default tolerance for {@link verifyWalletWebhookSignature}'s timestamp freshness check. */
const DEFAULT_TOLERANCE_SECONDS = 300;

export interface VerifyWalletWebhookOptions {
  /** The exact, unparsed request body as received (Buffer or string) — do not re-serialize parsed JSON. */
  payload: string | Buffer;
  /** Value of the `x-wallet-timestamp` header. */
  timestampHeader: string;
  /** Value of the `x-wallet-signature` header. */
  signatureHeader: string;
  /** The `webhookSecret` you supplied when creating the transfer/sign request. */
  secret: string;
  /** How old (in seconds) a timestamp may be before it's rejected as a possible replay. Default 300 (5 minutes). */
  toleranceSeconds?: number;
}

/**
 * Verifies a Wallet outcome webhook delivery (`wallet.transfer.completed` /
 * `wallet.transfer.failed` / `wallet.sign.completed` / `wallet.sign.failed`).
 *
 * The signature is `HMAC-SHA256("<timestamp>.<rawBody>")`, hex-encoded, and the delivery
 * is rejected if the timestamp is older than `toleranceSeconds` to block replay attacks.
 *
 * @throws {WebhookSignatureVerificationError} if the timestamp is missing/stale or the signature doesn't match.
 */
export function verifyWalletWebhookSignature(options: VerifyWalletWebhookOptions): void {
  const { payload, timestampHeader, signatureHeader, secret, toleranceSeconds = DEFAULT_TOLERANCE_SECONDS } = options;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    throw new WebhookSignatureVerificationError("Missing or invalid x-wallet-timestamp header");
  }
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > toleranceSeconds) {
    throw new WebhookSignatureVerificationError(
      `Webhook timestamp is ${Math.round(ageSeconds)}s old, outside the allowed tolerance of ${toleranceSeconds}s`,
    );
  }

  const rawBody = typeof payload === "string" ? payload : payload.toString("utf8");
  const expected = createHmac("sha256", secret).update(`${timestampHeader}.${rawBody}`).digest("hex");
  if (!constantTimeEqual(expected, signatureHeader)) {
    throw new WebhookSignatureVerificationError(
      "Signature mismatch — the payload may have been tampered with, or the secret is incorrect",
    );
  }
}

export interface VerifyIndexerWebhookOptions {
  /** The exact, unparsed request body as received (Buffer or string) — do not re-serialize parsed JSON. */
  payload: string | Buffer;
  /** Value of the `X-Indexer-Signature` header. */
  signatureHeader: string;
  /** The subscription's `signingSecret`, returned once on creation or secret rotation. */
  secret: string;
}

/**
 * Verifies a Blockchain Events (Indexer) webhook delivery. The signature is
 * `HMAC-SHA256(rawBody)`, hex-encoded, with no timestamp component.
 *
 * @throws {WebhookSignatureVerificationError} if the signature doesn't match.
 */
export function verifyIndexerWebhookSignature(options: VerifyIndexerWebhookOptions): void {
  const { payload, signatureHeader, secret } = options;
  const rawBody = typeof payload === "string" ? payload : payload.toString("utf8");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!constantTimeEqual(expected, signatureHeader)) {
    throw new WebhookSignatureVerificationError(
      "Signature mismatch — the payload may have been tampered with, or the secret is incorrect",
    );
  }
}

function constantTimeEqual(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, "utf8");
  const actual = Buffer.from(actualHex, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
