import { InfraClient } from "../src/index.js";

const client = new InfraClient({
  apiKey: process.env.INFRA_API_KEY!,
});

async function main() {
  // Wallet — spendable USD balance used to pay gas on mainnet transfers.
  const balance = await client.wallet.getBalance();
  console.log(`Business balance: $${balance.balance}`);

  // Derive a new EVM address on the business HD tree.
  const generated = await client.wallet.generateWallets({ chainType: "EVM", purpose: "deposit" });
  const wallet = generated[0];
  if (!wallet) throw new Error("Expected at least one generated wallet");
  console.log(`New wallet: ${wallet.address} (index ${wallet.addressIndex})`);

  // Transfers are async by default: you get a PENDING transaction back immediately.
  const transfer = await client.wallet.initiateTransfer({
    fromAddress: wallet.addressIndex,
    toAddress: "0x2222222222222222222222222222222222222222",
    amount: "1000000",
    chainType: "EVM",
    chainId: 84532, // Base Sepolia — sponsored testnet transfer
  });
  console.log(`Transfer ${transfer.id} is ${transfer.status}`);

  // Poll until it settles (or pass `webhookUrl`/`webhookSecret` on initiate instead).
  let final = transfer;
  while (final.status === "PENDING" || final.status === "PROCESSING") {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    final = await client.wallet.getTransaction(transfer.id);
  }
  console.log(`Transfer settled: ${final.status} (${final.txHash ?? "no hash"})`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
