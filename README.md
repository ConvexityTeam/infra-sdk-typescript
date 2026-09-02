# infra-sdk-typescript

The official TypeScript SDK for the [Convexity Infra API](https://docs.withconvexity.com).
It covers three services: **Wallet**, **Tokenization**, and **Blockchain Events** (the
Indexer).

What you get:

- Types for every request and response, including all three of the pagination envelopes
  the API uses.
- Auth handled for you. Hand the client an API key and it mints, caches, and refreshes
  OAuth bearer tokens in the background.
- Retries with backoff on rate limits (`429`, honoring `retryAfter`) and upstream outages
  (`503`). Connection failures get retried too, but only when a retry is safe.
- `Idempotency-Key` headers generated automatically on the wallet operations that move
  value. You can pass your own instead.
- Real error classes (`RateLimitError`, `NotFoundError`, `PaymentRequiredError`, and so
  on) so you're not switching on status codes.
- Signature verification for both webhook schemes: Wallet outcome webhooks and Indexer
  event deliveries.
- No runtime dependencies. It's built on native `fetch` and `node:crypto`, and ships dual
  ESM/CJS builds with full `.d.ts` types.

## Requirements

- Node.js 18 or later.
- A Convexity Infra API key. There's no self-service signup yet, so email
  [infra@withconvexity.com](mailto:infra@withconvexity.com) with your business details and
  you'll get back a test key (`sk_test_...`) and a live key (`sk_live_...`).

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

On the first call, the client trades your API key for a short-lived OAuth bearer token
(`POST /v1/oauth/token`) and caches it. It refreshes that token before it expires, and
retries once if it ever gets a surprise `401`. You shouldn't need to touch tokens yourself.

There are fuller examples in [`examples/`](./examples):

- [`basic-usage.ts`](./examples/basic-usage.ts) derives a wallet, transfers, and polls for
  completion.
- [`pagination.ts`](./examples/pagination.ts) shows all three ways to consume a paginated
  list.
- [`tokenization-yield-lifecycle.ts`](./examples/tokenization-yield-lifecycle.ts) walks a
  yield-bearing token from issue through mint, coupon payment, and principal redemption.
- [`indexer-subscription.ts`](./examples/indexer-subscription.ts) subscribes to on-chain
  events and manages the subscription afterward.
- [`webhook-verification.ts`](./examples/webhook-verification.ts) verifies both signature
  schemes inside a plain `node:http` server.

## Resources

There's one namespace per service:

| Namespace | Service | Docs |
|---|---|---|
| `client.wallet` | HD wallets, on-chain transfers, sponsored signing, USD gas balance | [Wallet overview](https://docs.withconvexity.com/api-reference/wallet/overview) |
| `client.tokenization` | Issue, mint/burn/transfer tokenized assets; yield lifecycle | [Tokenization overview](https://docs.withconvexity.com/api-reference/tokenization/overview) |
| `client.indexer` | Subscribe to decoded on-chain events, delivered to your webhook | [Blockchain Events overview](https://docs.withconvexity.com/api-reference/indexer/overview) |

The methods map 1:1 onto the API. Check the JSDoc on each resource, or the type
definitions, for full parameter and return shapes. A few things worth calling out:

### Async transfers

[`initiateTransfer`](./src/resources/wallet/index.ts) and
[`signTransaction`](./src/resources/wallet/index.ts) are async by default. They hand back a
`PENDING` transaction right away (HTTP `202`) and the on-chain execution keeps going in the
background.

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

// ...or take the outcome at a webhook instead: pass webhookUrl/webhookSecret on the
// initiate call, then verify deliveries with `verifyWalletWebhookSignature`.
```

If you want the old synchronous behavior, pass `waitForCompletion: true`. That holds the
request open until the transaction settles and returns the final result.

### Pagination

The API hands back three different pagination envelopes depending on which service you're
hitting. The SDK flattens all of them into a single `Page<T>`:

```ts
// Iterate every item; later pages are fetched as you go.
for await (const token of await client.tokenization.listTokens()) {
  console.log(token.ticker);
}

// Or walk it a page at a time:
let page = await client.wallet.getTransactionHistory({ status: "COMPLETED" });
for (;;) {
  for (const tx of page.data) handle(tx);
  if (!page.hasNextPage()) break;
  page = await page.getNextPage();
}

// Or just pull the whole thing into memory, which is fine for small collections:
const holders = await (await client.tokenization.getTokenHolders({ tokenId })).toArray();
```

### Idempotency

`initiateTransfer`, `signTransaction`, and `generateWallets` all require an
`Idempotency-Key` header. The SDK generates a UUIDv4 per call. Pass your own when you need
a retry to line up across two separate SDK calls, like after a process restart:

```ts
await client.wallet.initiateTransfer(params, { idempotencyKey: "my-own-key" });
```

### Errors

Everything the SDK throws extends `InfraError`. HTTP failures extend `InfraAPIError` and
line up with the status code table in the API docs:

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
    // A waitForCompletion: true transfer that reverts on-chain still carries the failed
    // transaction. Read it off the raw response body if you need the details.
    console.log((err.body as { data?: unknown }).data);
  } else if (err instanceof InfraAPIError) {
    console.log(err.status, err.message, err.errors);
  }
}
```

`429` and `503` get retried for you (twice by default). Everything else throws right away,
because sending the identical request again won't change the answer.

### Retries, timeouts, and connection safety

- `429` and `503` are always retried. The server never executed the request in either
  case, so there's nothing to double up on. `429` retries wait for whatever `retryAfter`
  says.
- Connection failures are murkier. If a request times out, or DNS fails, or TLS breaks, or
  the socket aborts, you can't tell whether the server already ran it. So the SDK only
  retries those on `GET` requests and on requests carrying an `Idempotency-Key`, where a
  duplicate provably can't hurt.
- Set these on the constructor, or override them per call:

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
// HMAC-SHA256("<timestamp>.<rawBody>"), with a 5-minute replay window by default.
verifyWalletWebhookSignature({
  payload: rawBody, // exactly the bytes you received — don't JSON.parse and re-stringify
  timestampHeader: req.headers["x-wallet-timestamp"],
  signatureHeader: req.headers["x-wallet-signature"],
  secret: webhookSecret, // whatever you passed as `webhookSecret` on the originating call
});

// Indexer (Blockchain Events) deliveries: HMAC-SHA256(rawBody), no timestamp component.
verifyIndexerWebhookSignature({
  payload: rawBody,
  signatureHeader: req.headers["x-indexer-signature"],
  secret: signingSecret, // returned once, when you create the subscription or rotate the secret
});
```

Both throw `WebhookSignatureVerificationError` when verification fails. There's a complete
`node:http` handler in [`examples/webhook-verification.ts`](./examples/webhook-verification.ts).

### Escape hatch

Every resource method is a thin wrapper around `client.request()`, which carries the same
auth, retry, and timeout behavior. If this version of the SDK doesn't wrap an endpoint yet,
call it directly:

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
npm run ci          # all of the above, in order
```

## License

MIT. See [LICENSE](./LICENSE).
