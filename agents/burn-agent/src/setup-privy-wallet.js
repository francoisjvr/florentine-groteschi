import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadConfig } from "./config.js";
import { createBurnPolicy, createPrivyWallet } from "./privy.js";

async function main() {
  const config = loadConfig({ requireContract: true });
  const policy = await createBurnPolicy(config);
  const wallet = await createPrivyWallet(config, policy.id);
  const out = {
    createdAt: new Date().toISOString(),
    policy_id: policy.id,
    wallet_id: wallet.id,
    wallet_address: wallet.address,
    chain_type: wallet.chain_type || "ethereum",
    contract: config.contractAddress,
    chain_id: config.chainId,
    next_steps: [
      "Copy wallet_id to PRIVY_WALLET_ID in agents/burn-agent/.env",
      "Copy wallet_address to PRIVY_WALLET_ADDRESS in agents/burn-agent/.env",
      "From the collection owner wallet, call setAdmin(wallet_address, true)",
      "Fund wallet_address for gas unless PRIVY_SPONSOR_GAS=true is configured and supported"
    ]
  };
  const outFile = path.join("agents", "burn-agent", "privy-wallet.local.json");
  fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}
`);
  console.log(`Created Privy burn policy and wallet. Wrote ${outFile}`);
  console.log(JSON.stringify({ wallet_id: wallet.id, wallet_address: wallet.address, policy_id: policy.id }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
