import crypto from "node:crypto";
import { twitterCredentialsPresent } from "./config.js";

const TWEET_ENDPOINT = "https://api.twitter.com/2/tweets";

function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function randomNonce() {
  return crypto.randomBytes(16).toString("hex");
}

export function makeOAuth1Header({ method, url, apiKey, apiSecret, accessToken, accessTokenSecret, nonce = randomNonce(), timestamp = Math.floor(Date.now() / 1000) }) {
  const oauth = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(timestamp),
    oauth_token: accessToken,
    oauth_version: "1.0"
  };
  const params = Object.entries(oauth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
  const base = [method.toUpperCase(), percentEncode(url), percentEncode(params)].join("&");
  const signingKey = `${percentEncode(apiSecret)}&${percentEncode(accessTokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(base).digest("base64");
  return "OAuth " + Object.entries({ ...oauth, oauth_signature: signature })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ");
}

function explorerTxUrl(chainId, txHash) {
  if (!txHash) return "";
  if (Number(chainId) === 1) return `https://etherscan.io/tx/${txHash}`;
  if (Number(chainId) === 8453) return `https://basescan.org/tx/${txHash}`;
  if (Number(chainId) === 11155111) return `https://sepolia.etherscan.io/tx/${txHash}`;
  return txHash;
}

function clampTweet(text) {
  if (text.length <= 280) return text;
  return `${text.slice(0, 276)}…`;
}

export function buildPreBurnTweet({ collectionName, tokenId, reason }) {
  const lines = [
    `🔥 ${collectionName} burn notice`,
    `Token #${tokenId} has been selected for an agent burn.`,
    reason ? `Reason: ${reason}` : "Reason: policy-approved collection maintenance."
  ];
  return clampTweet(lines.join("\n"));
}

export function buildPostBurnTweet({ collectionName, tokenId, reason, txHash, chainId }) {
  const txUrl = explorerTxUrl(chainId, txHash);
  const lines = [
    `🔥 ${collectionName} burn complete`,
    `Token #${tokenId} has been burned by the collection agent.`,
    reason ? `Reason: ${reason}` : "Reason: policy-approved collection maintenance."
  ];
  if (txUrl) lines.push(`Tx: ${txUrl}`);
  return clampTweet(lines.join("\n"));
}

export async function postTweet(config, text) {
  if (config.twitter.dryRun || !twitterCredentialsPresent(config)) {
    return { dryRun: true, text };
  }
  const response = await fetch(TWEET_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: makeOAuth1Header({
        method: "POST",
        url: TWEET_ENDPOINT,
        apiKey: config.twitter.apiKey,
        apiSecret: config.twitter.apiSecret,
        accessToken: config.twitter.accessToken,
        accessTokenSecret: config.twitter.accessTokenSecret
      }),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) {
    const detail = data?.detail || data?.title || response.statusText;
    throw new Error(`Twitter post failed (${response.status}): ${detail}`);
  }
  return { dryRun: false, data };
}
