import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyWalletWebhookSignature, verifyIndexerWebhookSignature } from "../../src/core/webhooks.js";
import { WebhookSignatureVerificationError } from "../../src/core/errors.js";

describe("verifyWalletWebhookSignature", () => {
  const secret = "a-secret-you-generate-and-keep";
  const payload = JSON.stringify({ event: "wallet.transfer.completed", data: { id: "tx_1" } });

  function sign(timestamp: string, body: string): string {
    return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  }

  it("accepts a validly signed, fresh payload", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, payload);
    expect(() =>
      verifyWalletWebhookSignature({ payload, timestampHeader: timestamp, signatureHeader: signature, secret }),
    ).not.toThrow();
  });

  it("rejects a tampered payload", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, payload);
    expect(() =>
      verifyWalletWebhookSignature({
        payload: payload + "tampered",
        timestampHeader: timestamp,
        signatureHeader: signature,
        secret,
      }),
    ).toThrow(WebhookSignatureVerificationError);
  });

  it("rejects a signature made with the wrong secret", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, payload);
    expect(() =>
      verifyWalletWebhookSignature({
        payload,
        timestampHeader: timestamp,
        signatureHeader: signature,
        secret: "wrong-secret",
      }),
    ).toThrow(WebhookSignatureVerificationError);
  });

  it("rejects a stale timestamp outside the tolerance window", () => {
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
    const signature = sign(staleTimestamp, payload);
    expect(() =>
      verifyWalletWebhookSignature({
        payload,
        timestampHeader: staleTimestamp,
        signatureHeader: signature,
        secret,
        toleranceSeconds: 300,
      }),
    ).toThrow(/tolerance/);
  });

  it("rejects a missing/non-numeric timestamp header", () => {
    expect(() =>
      verifyWalletWebhookSignature({
        payload,
        timestampHeader: "not-a-number",
        signatureHeader: "irrelevant",
        secret,
      }),
    ).toThrow(/timestamp/);
  });

  it("accepts a Buffer payload identically to the equivalent string", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, payload);
    expect(() =>
      verifyWalletWebhookSignature({
        payload: Buffer.from(payload, "utf8"),
        timestampHeader: timestamp,
        signatureHeader: signature,
        secret,
      }),
    ).not.toThrow();
  });
});

describe("verifyIndexerWebhookSignature", () => {
  const secret = "whsec_3a9f8c2b1d7e4f60a5c8e9b2d1f4a7c0";
  const payload = JSON.stringify({ id: "0xabc:7", network: "BASE", eventType: "transfer" });

  it("accepts a validly signed payload", () => {
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    expect(() => verifyIndexerWebhookSignature({ payload, signatureHeader: signature, secret })).not.toThrow();
  });

  it("rejects a tampered payload", () => {
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    expect(() =>
      verifyIndexerWebhookSignature({ payload: payload + "x", signatureHeader: signature, secret }),
    ).toThrow(WebhookSignatureVerificationError);
  });

  it("rejects a signature of the wrong length", () => {
    expect(() =>
      verifyIndexerWebhookSignature({ payload, signatureHeader: "deadbeef", secret }),
    ).toThrow(WebhookSignatureVerificationError);
  });
});
