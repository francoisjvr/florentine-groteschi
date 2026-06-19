import { encodeAgentBurn } from "./abi.js";
import { requirePrivy, requirePrivySetupCredentials } from "./config.js";

const PRIVY_API = "https://api.privy.io";

function authHeader(config) {
  return `Basic ${Buffer.from(`${config.privy.appId}:${config.privy.appSecret}`).toString("base64")}`;
}

export async function privyRequest(config, method, path, body) {
  const response = await fetch(`${PRIVY_API}${path}`, {
    method,
    headers: {
      Authorization: authHeader(config),
      "privy-app-id": config.privy.appId,
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText;
    throw new Error(`Privy ${method} ${path} failed (${response.status}): ${message}`);
  }
  return data;
}

export async function createBurnPolicy(config) {
  requirePrivySetupCredentials(config);
  if (!config.contractAddress) throw new Error("BRAINROT_CONTRACT_ADDRESS is required to create a policy");
  return privyRequest(config, "POST", "/v1/policies", {
    version: "1.0",
    name: `${config.collectionName} burn-agent policy`,
    chain_type: "ethereum",
    rules: [
      {
        name: `Only zero-value calls to ${config.collectionName}`,
        method: "eth_sendTransaction",
        conditions: [
          { field_source: "ethereum_transaction", field: "to", operator: "eq", value: config.contractAddress },
          { field_source: "ethereum_transaction", field: "value", operator: "eq", value: "0" },
          { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: String(config.chainId) }
        ],
        action: "ALLOW"
      }
    ]
  });
}

export async function createPrivyWallet(config, policyId) {
  requirePrivySetupCredentials(config);
  return privyRequest(config, "POST", "/v1/wallets", {
    chain_type: "ethereum",
    policy_ids: [policyId]
  });
}

export async function sendAgentBurn(config, tokenId) {
  requirePrivy(config);
  if (!config.contractAddress) throw new Error("BRAINROT_CONTRACT_ADDRESS is required");
  const payload = {
    method: "eth_sendTransaction",
    caip2: config.caip2,
    params: {
      transaction: {
        to: config.contractAddress,
        value: "0",
        data: encodeAgentBurn(tokenId)
      }
    }
  };
  if (config.privy.sponsorGas) payload.sponsor = true;
  return privyRequest(config, "POST", `/v1/wallets/${config.privy.walletId}/rpc`, payload);
}
