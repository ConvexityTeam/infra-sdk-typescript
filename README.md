# infra-sdk-typescript

Official TypeScript SDK for the [Convexity Infra API](https://docs.withconvexity.com) —
**Wallet**, **Tokenization**, and **Blockchain Events (Indexer)**.

- Fully typed — every request and response shape is modeled, including the three
  different pagination envelopes the API uses.
- Handles auth for you — exchange your API key once; the client mints, caches, and
  refreshes OAuth bearer tokens automatically.
- Automatic retries with backoff for rate limits (`429`, honoring `retryAfter`) and
  upstream outages (`503`), plus safe retries on connection failures for idempotent
  requests.
- Auto-generated `Idempotency-Key` headers on value-moving wallet operations, with the
  option to supply your own.
- A typed error hierarchy (`RateLimitError`, `NotFoundError`, `PaymentRequiredError`, …)
  instead of parsing status codes yourself.
- Webhook signature verification for both the Wallet outcome webhook and Indexer event
  deliveries.
- Zero runtime dependencies — built on native `fetch` and `node:crypto`. Ships dual
  ESM/CJS builds with full `.d.ts` types.

## Requirements

- Node.js 18 or later.
- A Convexity Infra API key. There's no self-service signup — email
  [infra@withconvexity.com](mailto:infra@withconvexity.com) with your business details to
  get a test key (`sk_test_...`) and a live key (`sk_live_...`).

## Install

```bash
npm install infra-sdk-typescript
```

## Quickstart

```ts
import { InfraClient } from "infra-sdk-typescript";

const client = new InfraClient({ apiKey: process.env.INFRA_API_KEY! });

const balance = await client.wallet.getBalance();
console.log(`Business balance: $${balance.balance}`);
```

The client exchanges your API key for a short-lived OAuth bearer token on first use
(`POST /v1/oauth/token`), caches it, and refreshes it before it expires (and once, on an
unexpected `401`) — you never handle tokens directly.

More end-to-end examples live in [`examples/`](./examples):

- [`basic-usage.ts`](./examples/basic-usage.ts) — derive a wallet, transfer, poll for completion.
- [`pagination.ts`](./examples/pagination.ts) — the three ways to consume a paginated list.
- [`tokenization-yield-lifecycle.ts`](./examples/tokenization-yield-lifecycle.ts) — issue a
  yield-bearing token, mint, pay a coupon, redeem principal.
- [`indexer-subscription.ts`](./examples/indexer-subscription.ts) — subscribe to on-chain
  events and manage the subscription.
- [`webhook-verification.ts`](./examples/webhook-verification.ts) — verify both webhook
  signature schemes in a plain `node:http` server.

## Resources

The client exposes one namespace per service:

| Namespace | Service | Docs |
|---|---|---|
| `client.wallet` | HD wallets, on-chain transfers, sponsored signing, USD gas balance | [Wallet overview](https://docs.withconvexity.com/api-reference/wallet/overview) |
| `client.tokenization` | Issue, mint/burn/transfer tokenized assets; yield lifecycle | [Tokenization overview](https://docs.withconvexity.com/api-reference/tokenization/overview) |
| `client.indexer` | Subscribe to decoded on-chain events, delivered to your webhook | [Blockchain Events overview](https://docs.withconvexity.com/api-reference/indexer/overview) |

Every method mirrors the API 1:1 (see each resource's JSDoc, or the type definitions, for
the full parameter/return shape). A few highlights:

### Async transfers

[`initiateTransfer`](./src/resources/wallet/index.ts) and
[`signTransaction`](./src/resources/wallet/index.ts) are asynchronous by default: they
return a `PENDING` transaction immediately (HTTP `202`), and the on-chain execution
continues in the background.

```ts
const transfer = await client.wallet.initiateTransfer({
  fromAddress: 12, // HD addressIndex, or a full "0x..." address
  toAddress: "0x2222222222222222222222222222222222222222",
  amount: "1000000",
  chainType: "EVM",
  chainId: 8453,
});

// Poll until it settles...
let final = await client.wallet.getTransaction(transfer.id);
while (final.status === "PENDING" || final.status === "PROCESSING") {
  await new Promise((r) => setTimeout(r, 2000));
  final = await client.wallet.getTransaction(transfer.id);
}

// ...or receive the outcome at a webhook instead, by passing webhookUrl/webhookSecret
// on the initiate call, and verifying deliveries with `verifyWalletWebhookSignature`.
```

Pass `waitForCompletion: true` for the legacy synchronous behavior, which holds the
request open for the settled result instead.

### Pagination

The API uses three different pagination envelopes depending on the service. This SDK
normalizes all of them into one `Page<T>` type:

```ts
// Lazily iterate every item, fetching subsequent pages as needed:
for await (const token of await client.tokenization.listTokens()) {
  console.log(token.ticker);
}

// Or walk page by page:
let page = await client.wallet.getTransactionHistory({ status: "COMPLETED" });
for (;;) {
  for (const tx of page.data) handle(tx);
  if (!page.hasNextPage()) break;
  page = await page.getNextPage();
}

// Or eagerly collect everything (fine for small collections):
const holders = await (await client.tokenization.getTokenHolders({ tokenId })).toArray();
```

### Idempotency

Wallet's value-moving endpoints (`initiateTransfer`, `signTransaction`, `generateWallets`)
require an `Idempotency-Key` header. The SDK generates a UUIDv4 for you automatically; pass
your own to control retries across separate SDK calls (e.g. after a process restart):

```ts
await client.wallet.initiateTransfer(params, { idempotencyKey: "my-own-key" });
```

### Errors

Every failure is a subclass of `InfraError`. HTTP failures are subclasses of
`InfraAPIError`, matching the API's status code table:

```ts
import { RateLimitError, PaymentRequiredError, UnprocessableEntityError, InfraAPIError } from "infra-sdk-typescript";

try {
  await client.wallet.initiateTransfer(params);
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Throttled — retry after ${err.retryAfterSeconds}s`);
  } else if (err instanceof PaymentRequiredError) {
    console.log("Insufficient gas balance");
  } else if (err instanceof UnprocessableEntityError) {
    // waitForCompletion: true transfers that revert on-chain still carry the failed
    // transaction — read it off the raw response body if you need the details.
    console.log((err.body as { data?: unknown }).data);
  } else if (err instanceof InfraAPIError) {
    console.log(err.status, err.message, err.errors);
  }
}
```

`429` and `503` responses are retried automatically (2 retries by default); everything
else is thrown immediately since retrying without changing the request won't help.

### Retries, timeouts, and connection safety

- `429` and `503` are retried automatically — the server didn't execute the request, so
  this is always safe. `429` retries honor the response's `retryAfter`.
- A connection failure (timeout, DNS, TLS, aborted socket) is ambiguous — the request may
  have already run server-side. The SDK only retries these for `GET` requests or requests
  carrying an `Idempotency-Key`, where a retry is provably safe.
- Configure globally via the constructor, or per call:

```ts
const client = new InfraClient({
  apiKey: process.env.INFRA_API_KEY!,
  timeoutMs: 30_000, // default
  maxRetries: 2, // default
});

await client.wallet.getBalance({ timeoutMs: 5_000, signal: myAbortController.signal });
```

### Webhooks

```ts
import { verifyWalletWebhookSignature, verifyIndexerWebhookSignature } from "infra-sdk-typescript";

// Wallet outcome webhooks (wallet.transfer.completed / .failed, wallet.sign.completed / .failed):
// HMAC-SHA256("<timestamp>.<rawBody>"), with a 5-minute replay-protection window by default.
verifyWalletWebhookSignature({
  payload: rawBody, // the exact bytes received — do not JSON.parse + re-stringify first
  timestampHeader: req.headers["x-wallet-timestamp"],
  signatureHeader: req.headers["x-wallet-signature"],
  secret: webhookSecret, // the value you passed as `webhookSecret` on the originating call
});

// Indexer (Blockchain Events) deliveries: HMAC-SHA256(rawBody), no timestamp component.
verifyIndexerWebhookSignature({
  payload: rawBody,
  signatureHeader: req.headers["x-indexer-signature"],
  secret: signingSecret, // returned once, on subscription creation or secret rotation
});
```

Both throw `WebhookSignatureVerificationError` on failure — see
[`examples/webhook-verification.ts`](./examples/webhook-verification.ts) for a full
`node:http` handler.

### Escape hatch

Every resource method is a thin wrapper over `client.request()`, which carries the same
auth, retry, and timeout behavior. Use it directly for any endpoint this SDK version
doesn't wrap yet:

```ts
const data = await client.request<{ enabled: boolean }>({
  method: "GET",
  path: "/v1/wallet/hd/enabled",
});
```

## Configuration reference

```ts
new InfraClient({
  apiKey: string; // required — sk_live_... or sk_test_...
  baseURL?: string; // default "https://api.withconvexity.com"
  scope?: string; // space-separated OAuth scopes; omit for full access
  timeoutMs?: number; // default 30000
  maxRetries?: number; // default 2
  fetch?: typeof fetch; // override for testing
});
```

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest
npm run build       # tsup -> dist/ (ESM + CJS + .d.ts)
npm run ci           # all of the above, in order
```

## License

MIT — see [LICENSE](./LICENSE).
