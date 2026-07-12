/**
 * Minimal `node:http` webhook receivers for both services. The key rule for both: verify
 * against the exact raw bytes you received — never `JSON.parse` then re-`JSON.stringify`
 * before hashing, since that can change the body and break the signature comparison.
 */
import { createServer } from "node:http";
import {
  verifyWalletWebhookSignature,
  verifyIndexerWebhookSignature,
  WebhookSignatureVerificationError,
} from "../src/index.js";

const WALLET_WEBHOOK_SECRET = process.env.WALLET_WEBHOOK_SECRET!; // the `webhookSecret` you sent on initiate
const INDEXER_SIGNING_SECRET = process.env.INDEXER_SIGNING_SECRET!; // returned once when the subscription was created

async function readRawBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

const server = createServer((req, res) => {
  void (async () => {
    const rawBody = await readRawBody(req);

    try {
      if (req.url === "/webhooks/wallet") {
        verifyWalletWebhookSignature({
          payload: rawBody,
          timestampHeader: req.headers["x-wallet-timestamp"] as string,
          signatureHeader: req.headers["x-wallet-signature"] as string,
          secret: WALLET_WEBHOOK_SECRET,
        });
        const event = JSON.parse(rawBody.toString("utf8")) as { event: string; data: { id: string } };
        console.log(`Verified wallet event ${event.event} for transaction ${event.data.id}`);
      } else if (req.url === "/webhooks/indexer") {
        verifyIndexerWebhookSignature({
          payload: rawBody,
          signatureHeader: req.headers["x-indexer-signature"] as string,
          secret: INDEXER_SIGNING_SECRET,
        });
        const event = JSON.parse(rawBody.toString("utf8")) as { id: string; eventType: string };
        console.log(`Verified indexer event ${event.eventType} (${event.id})`);
      } else {
        res.writeHead(404).end();
        return;
      }

      // Respond 2xx quickly, before running your own processing, to avoid unnecessary retries.
      res.writeHead(200).end();
    } catch (err) {
      if (err instanceof WebhookSignatureVerificationError) {
        console.warn("Rejected webhook:", err.message);
        res.writeHead(400).end();
        return;
      }
      throw err;
    }
  })();
});

server.listen(3000, () => console.log("Listening on :3000"));
