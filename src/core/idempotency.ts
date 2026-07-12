import { randomUUID } from "node:crypto";

/** Generates a UUIDv4 suitable for use as an `Idempotency-Key` header value. */
export function generateIdempotencyKey(): string {
  return randomUUID();
}
