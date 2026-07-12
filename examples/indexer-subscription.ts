import { InfraClient } from "../src/index.js";

const client = new InfraClient({ apiKey: process.env.INFRA_API_KEY! });

async function main() {
  const catalog = await client.indexer.listEventCatalog({ family: "EVM" });
  console.log(
    "Subscribable EVM events:",
    catalog.map((e) => e.key),
  );

  // signingSecret is only ever returned here — store it immediately.
  const subscription = await client.indexer.createSubscription({
    network: "BASE",
    contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    webhookUrl: "https://api.merchant.example/webhooks/indexer",
    events: ["transfer", "burn"],
  });
  console.log(`Subscription ${subscription.id} created. Signing secret: ${subscription.signingSecret}`);
  await saveSecretSecurely(subscription.id, subscription.signingSecret);

  // Pause deliveries without deleting the subscription.
  await client.indexer.updateSubscription(subscription.id, { status: "paused" });

  // Lost the secret? Rotate it — the old one is invalidated immediately.
  const rotated = await client.indexer.rotateSigningSecret(subscription.id);
  await saveSecretSecurely(subscription.id, rotated.signingSecret);
}

async function saveSecretSecurely(subscriptionId: string, secret: string): Promise<void> {
  // Persist to your secrets manager — this is just a placeholder.
  void subscriptionId;
  void secret;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
