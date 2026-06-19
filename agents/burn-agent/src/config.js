import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { isAddress, getAddress } from "ethers";

const AGENT_DIR = "agents/burn-agent";

function loadDotenv() {
  dotenv.config({ path: ".env", quiet: true });
  dotenv.config({ path: path.join(AGENT_DIR, ".env"), override: true, quiet: true });
}

function readJsonIfExists(file) {
  if (!file || !fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function boolFrom(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "y", "on"].includes(String(value).toLowerCase());
}

function numberFrom(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`);
  return parsed;
}

function normalizeAddress(value, field, { allowZero = false, required = false } = {}) {
  if (!value) {
    if (required) throw new Error(`${field} is required`);
    return "";
  }
  if (!isAddress(value)) throw new Error(`${field} must be a valid EVM address`);
  const normalized = getAddress(value);
  if (!allowZero && normalized === "0x0000000000000000000000000000000000000000") {
    if (required) throw new Error(`${field} cannot be the zero address`);
    return "";
  }
  return normalized;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const [command = "help", ...rest] = argv;
  const options = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--real") options.dryRun = false;
    else if (arg === "--once") options.once = true;
    else if (arg === "--token-id") options.tokenId = rest[++i];
    else if (arg.startsWith("--token-id=")) options.tokenId = arg.split("=").slice(1).join("=");
    else if (arg === "--reason") options.reason = rest[++i];
    else if (arg.startsWith("--reason=")) options.reason = arg.split("=").slice(1).join("=");
    else if (arg === "--queue-file") options.queueFile = rest[++i];
    else if (arg.startsWith("--queue-file=")) options.queueFile = arg.split("=").slice(1).join("=");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function loadConfig(options = {}) {
  loadDotenv();
  const configPath = process.env.BURN_AGENT_CONFIG || path.join(AGENT_DIR, "config.json");
  const fileConfig = readJsonIfExists(configPath);

  const chainId = numberFrom(process.env.CHAIN_ID, fileConfig.chainId || 1);
  const contractAddress = normalizeAddress(
    process.env.BRAINROT_CONTRACT_ADDRESS || fileConfig.contractAddress,
    "BRAINROT_CONTRACT_ADDRESS",
    { required: options.requireContract || false }
  );

  const dryRun = options.dryRun ?? boolFrom(process.env.BURN_AGENT_DRY_RUN, fileConfig.dryRun ?? true);
  const twitterConfig = fileConfig.twitter || {};
  const privyConfig = fileConfig.privy || {};

  return {
    chainId,
    caip2: process.env.CAIP2 || fileConfig.caip2 || `eip155:${chainId}`,
    rpcUrl: process.env.RPC_URL || fileConfig.rpcUrl || "",
    contractAddress,
    collectionName: process.env.COLLECTION_NAME || fileConfig.collectionName || "Florentine Brainrot",
    collectionSlug: process.env.OPENSEA_COLLECTION_SLUG || fileConfig.collectionSlug || "florentine-brainrot",
    dryRun,
    waitForReceipt: boolFrom(process.env.BURN_AGENT_WAIT_FOR_RECEIPT, fileConfig.waitForReceipt ?? true),
    pollSeconds: numberFrom(process.env.BURN_AGENT_POLL_SECONDS, fileConfig.pollSeconds || 60),
    queueFile: options.queueFile || process.env.BURN_AGENT_QUEUE_FILE || fileConfig.queueFile || path.join(AGENT_DIR, "queue.json"),
    logFile: process.env.BURN_AGENT_LOG_FILE || fileConfig.logFile || path.join(AGENT_DIR, "logs", "burn-agent.jsonl"),
    openseaApiKey: process.env.OPENSEA_API_KEY || "",
    privy: {
      appId: process.env.PRIVY_APP_ID || "",
      appSecret: process.env.PRIVY_APP_SECRET || "",
      walletId: process.env.PRIVY_WALLET_ID || "",
      walletAddress: normalizeAddress(process.env.PRIVY_WALLET_ADDRESS || privyConfig.walletAddress, "PRIVY_WALLET_ADDRESS"),
      sponsorGas: boolFrom(process.env.PRIVY_SPONSOR_GAS, privyConfig.sponsorGas || false)
    },
    twitter: {
      dryRun: boolFrom(process.env.TWITTER_DRY_RUN, twitterConfig.dryRun ?? true),
      apiKey: process.env.TWITTER_API_KEY || "",
      apiSecret: process.env.TWITTER_API_SECRET || "",
      accessToken: process.env.TWITTER_ACCESS_TOKEN || "",
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
      announceBefore: boolFrom(process.env.TWITTER_ANNOUNCE_BEFORE, twitterConfig.announceBefore ?? true),
      announceAfter: boolFrom(process.env.TWITTER_ANNOUNCE_AFTER, twitterConfig.announceAfter ?? true)
    }
  };
}

export function requirePrivy(config) {
  const missing = [];
  if (!config.privy.appId) missing.push("PRIVY_APP_ID");
  if (!config.privy.appSecret) missing.push("PRIVY_APP_SECRET");
  if (!config.privy.walletId) missing.push("PRIVY_WALLET_ID");
  if (missing.length) throw new Error(`Missing Privy configuration: ${missing.join(", ")}`);
}

export function requirePrivySetupCredentials(config) {
  const missing = [];
  if (!config.privy.appId) missing.push("PRIVY_APP_ID");
  if (!config.privy.appSecret) missing.push("PRIVY_APP_SECRET");
  if (missing.length) throw new Error(`Missing Privy setup credentials: ${missing.join(", ")}`);
}

export function twitterCredentialsPresent(config) {
  return Boolean(
    config.twitter.apiKey &&
    config.twitter.apiSecret &&
    config.twitter.accessToken &&
    config.twitter.accessTokenSecret
  );
}
