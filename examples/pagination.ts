import { InfraClient } from "../src/index.js";

const client = new InfraClient({ apiKey: process.env.INFRA_API_KEY! });

async function main() {
  // `for await` lazily fetches subsequent pages as iteration proceeds, regardless of
  // which of the API's three pagination envelopes the underlying endpoint uses.
  const tokens = await client.tokenization.listTokens({ pageSize: 20 });
  for await (const token of tokens) {
    console.log(token.ticker, token.status, token.chain);
  }

  // Or walk page by page when you want explicit control (e.g. to stop early).
  let page = await client.wallet.getTransactionHistory({ status: "COMPLETED", limit: 50 });
  for (;;) {
    for (const tx of page.data) {
      console.log(tx.id, tx.amount, tx.txHash);
    }
    if (!page.hasNextPage()) break;
    page = await page.getNextPage();
  }

  // Or eagerly collect everything into an array (fine for small collections).
  const holders = await (await client.tokenization.getTokenHolders({ tokenId: "tok_123" })).toArray();
  console.log(`${holders.length} holders`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
