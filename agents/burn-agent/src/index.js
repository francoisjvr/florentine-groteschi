import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider } from "ethers";
import { BRAINROT_ABI, encodeAgentBurn } from "./abi.js";
import { appendAuditLog } from "./log.js";
import { loadConfig, parseArgs, requirePrivy } from "./config.js";
import { sendAgentBurn } from "./privy.js";
import { buildPostBurnTweet, buildPreBurnTweet, postTweet } from "./twitter.js";

function usage() {
  return `Florentine Brainrot burn agent

Commands:
  burn --token-id <id> [--reason <text>] [--dry-run|--real]
  daemon [--once] [--queue-file <path>]
`;
}

function parseTokenId(value) {
  if (value === undefined || value === null || value === "") throw new Error("--token-id is required");
  if (!/^\d+$/.test(String(value))) throw new Error("tokenId must be a positive integer");
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error("tokenId must be a positive integer");
  return parsed;
}

async function getContract(config) {
  if (!config.rpcUrl) return null;
  const provider = new JsonRpcProvider(config.rpcUrl);
  return new Contract(config.contractAddress, BRAINROT_ABI, provider);
}

async function validateOnchain(config, tokenId) {
  const contract = await getContract(config);
  if (!contract) return { skipped: true, reason: "RPC_URL not configured" };
  const owner = await contract.ownerOf(tokenId);
  let isAdmin = null;
  if (config.privy.walletAddress) {
    isAdmin = await contract.isAdmin(config.privy.walletAddress);
    if (!config.dryRun && !isAdmin) throw new Error(`Privy wallet ${config.privy.walletAddress} is not an admin on the contract`);
  }
  return { skipped: false, owner, isAdmin };
}

async function maybeWaitForReceipt(config, txHash) {
  if (!config.waitForReceipt || !config.rpcUrl || !txHash) return null;
  const provider = new JsonRpcProvider(config.rpcUrl);
  return provider.waitForTransaction(txHash, 1, 120_000);
}

function txHashFromPrivyResponse(response) {
  return response?.data?.hash || response?.hash || response?.transaction_hash || "";
}

export async function burnToken(config, request) {
  const tokenId = parseTokenId(request.tokenId);
  const reason = request.reason || "Policy-approved collection maintenance.";
  const calldata = encodeAgentBurn(tokenId);
  const onchain = await validateOnchain(config, tokenId);

  const preTweet = buildPreBurnTweet({ collectionName: config.collectionName, tokenId, reason });
  let preTweetResult = null;
  if (config.twitter.announceBefore) preTweetResult = await postTweet(config, preTweet);

  if (config.dryRun) {
    const entry = appendAuditLog(config.logFile, { action: "burn_dry_run", tokenId: tokenId.toString(), reason, contract: config.contractAddress, calldata, onchain, preTweet: preTweetResult });
    return { dryRun: true, entry };
  }

  requirePrivy(config);
  const privyResponse = await sendAgentBurn(config, tokenId);
  const txHash = txHashFromPrivyResponse(privyResponse);
  const receipt = await maybeWaitForReceipt(config, txHash);
  const postTweetText = buildPostBurnTweet({ collectionName: config.collectionName, tokenId, reason, txHash, chainId: config.chainId });
  let postTweetResult = null;
  if (config.twitter.announceAfter) postTweetResult = await postTweet(config, postTweetText);

  const entry = appendAuditLog(config.logFile, { action: "burn_submitted", tokenId: tokenId.toString(), reason, contract: config.contractAddress, txHash, receiptStatus: receipt ? Number(receipt.status) : null, onchain, preTweet: preTweetResult, postTweet: postTweetResult });
  return { dryRun: false, txHash, receipt, entry };
}

function readQueue(queueFile) {
  if (!fs.existsSync(queueFile)) return [];
  const data = JSON.parse(fs.readFileSync(queueFile, "utf8"));
  if (!Array.isArray(data)) throw new Error(`${queueFile} must contain a JSON array`);
  return data;
}

function writeQueue(queueFile, queue) {
  fs.writeFileSync(queueFile, `${JSON.stringify(queue, null, 2)}
`);
}

async function processQueue(config) {
  const queue = readQueue(config.queueFile);
  let changed = false;
  for (const item of queue) {
    if ((item.status || "pending") !== "pending") continue;
    try {
      item.status = "in_progress";
      item.startedAt = new Date().toISOString();
      writeQueue(config.queueFile, queue);
      const result = await burnToken(config, item);
      item.status = "completed";
      item.completedAt = new Date().toISOString();
      item.txHash = result.txHash || null;
      item.dryRun = result.dryRun;
    } catch (error) {
      item.status = "failed";
      item.failedAt = new Date().toISOString();
      item.error = error.message;
      appendAuditLog(config.logFile, { action: "burn_failed", tokenId: String(item.tokenId ?? ""), reason: item.reason || "", error: error.message });
    }
    changed = true;
    writeQueue(config.queueFile, queue);
  }
  return { processed: changed };
}

async function main() {
  const args = parseArgs();
  if (args.command === "help" || args.command === "--help" || args.command === "-h") {
    console.log(usage());
    return;
  }
  const config = loadConfig({ ...args, requireContract: true });
  if (args.command === "burn") {
    const result = await burnToken(config, { tokenId: args.tokenId, reason: args.reason });
    console.log(JSON.stringify({ ok: true, dryRun: result.dryRun, txHash: result.txHash || null, log: result.entry }, null, 2));
    return;
  }
  if (args.command === "daemon") {
    console.log(`Florentine Brainrot burn agent started. dryRun=${config.dryRun} queue=${config.queueFile}`);
    do {
      const result = await processQueue(config);
      if (args.once) {
        console.log(JSON.stringify({ ok: true, ...result }, null, 2));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, config.pollSeconds * 1000));
    } while (true);
  }
  throw new Error(`Unknown command: ${args.command}

${usage()}`);
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
