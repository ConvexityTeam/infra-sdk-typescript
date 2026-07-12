import { InfraClient } from "../src/index.js";

const client = new InfraClient({ apiKey: process.env.INFRA_API_KEY! });

async function main() {
  // Issue a yield-bearing bond token.
  const deployment = await client.tokenization.createToken({
    ticker: "ACMB3",
    name: "Acme 3yr Bond",
    chain: "BASE",
    decimals: 18,
    assetClass: "MONEY_MARKET",
    tokenType: "YIELD_BEARING",
    yieldParams: {
      annualRate: 8.5,
      maturityDate: "2029-07-01",
      firstCouponDate: "2027-01-01",
      couponInterval: 180,
      dayCount: "ACT_365",
      faceValuePerToken: 1000,
    },
  });
  console.log(`Token ${deployment.id} deploying (${deployment.operationRef})`);

  // Poll until the deployment confirms.
  let token = await client.tokenization.getToken(deployment.id);
  while (token.status === "PENDING") {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    token = await client.tokenization.getToken(deployment.id);
  }
  console.log(`Token ${token.ticker} is ${token.status}`);

  // Whitelist an investor wallet, then mint them units.
  await client.tokenization.registerWallet({ tokenId: token.id, chain: "BASE", walletAddress: "0xInvestor..." });
  await client.tokenization.mintToken({ tokenId: token.id, chain: "BASE", toAddress: "0xInvestor...", amount: 10 });

  // Pay the scheduled coupon, pushing funds directly to investors.
  const coupon = await client.tokenization.payCoupon({ tokenId: token.id, chain: "BASE", pushYield: true });
  console.log(`Coupon paid: ${coupon.txHash}`);

  // At maturity, redeem principal.
  const redemption = await client.tokenization.redeemPrincipal({ tokenId: token.id, chain: "BASE", pushYield: true });
  console.log(`Principal redeemed: ${redemption.txHash}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
