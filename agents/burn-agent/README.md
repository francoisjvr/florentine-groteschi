# Florentine Brainrot Burn Agent

This folder contains the operational scaffold for a dedicated Florentine Brainrot burn agent.

The agent is deliberately narrow:

- It can call `agentBurnFromCollection(uint256 tokenId)` on the Florentine Brainrot contract through a Privy server wallet.
- It announces intended and completed burns on X/Twitter.
- It logs every action to JSONL.
- It does **not** implement the floor-price rule yet. Burn decisions are explicit queue/CLI inputs until the collection has a finalized policy.

## Recommended deployment

Use the VPS for production. Keep this Windows machine for dry-runs and development.

Why VPS:

- 24/7 uptime for monitoring/queue processing.
- Cleaner secret isolation.
- Easier systemd service/timer setup.
- Less likely to miss burns because a desktop app, laptop session, or sleep state stopped the process.

## Safety model

1. Privy policy restricts the wallet to zero-ETH transactions targeting the configured Florentine Brainrot contract on the configured chain.
2. The contract owner must explicitly make the Privy wallet an admin with `setAdmin(walletAddress, true)` before real burns can run.
3. The script checks `isAdmin(walletAddress)` before a non-dry-run burn when an RPC URL is configured.
4. Dry-run mode is the default unless `BURN_AGENT_DRY_RUN=false` is set.
5. Twitter posting dry-runs automatically when Twitter credentials are missing or `TWITTER_DRY_RUN=true`.

## Files

- `.env.example` — environment variables to copy to `agents/burn-agent/.env` on the target machine.
- `config.example.json` — non-secret config template.
- `queue.example.json` — sample burn queue format.
- `src/setup-privy-wallet.js` — creates the constrained Privy policy and wallet.
- `src/index.js` — burn CLI and queue daemon.
- `systemd/florentine-burn-agent.service.example` — VPS service template.

Generated local files are ignored by git:

- `agents/burn-agent/.env`
- `agents/burn-agent/config.json`
- `agents/burn-agent/privy-wallet.local.json`
- `agents/burn-agent/queue.json`
- `agents/burn-agent/logs/`
- `agents/burn-agent/state/`

## Setup

```bash
cp agents/burn-agent/.env.example agents/burn-agent/.env
cp agents/burn-agent/config.example.json agents/burn-agent/config.json
```

Edit both files for the deployed contract, chain, Privy app, and Twitter app credentials.

### 1. Create Privy policy + wallet

```bash
npm run agent:setup-privy
```

This writes `agents/burn-agent/privy-wallet.local.json`, containing the generated `wallet_id`, `wallet_address`, and `policy_id`.

Copy the wallet ID/address into `agents/burn-agent/.env`:

```bash
PRIVY_WALLET_ID=...
PRIVY_WALLET_ADDRESS=0x...
```

### 2. Authorize the Privy wallet on the NFT contract

From the collection owner wallet, call:

```solidity
setAdmin(PRIVY_WALLET_ADDRESS, true)
```

Do not skip this. The burn function is intentionally protected by `onlyOwnerOrAdmin`.

### 3. Dry-run a burn

```bash
npm run agent:dry-run -- --token-id 1 --reason "Example dry-run only"
```

Dry-run should encode the burn call, optionally check token ownership/admin status if `RPC_URL` is set, draft the Twitter messages, write an audit log entry, and send no transaction.

### 4. Real burn

Only after the Privy wallet is funded for gas and authorized as admin:

```bash
BURN_AGENT_DRY_RUN=false npm run agent:burn -- --token-id 1 --reason "Policy-approved burn"
```

The script will tweet a pre-burn notice if Twitter is configured, send the Privy transaction, wait for a receipt when `RPC_URL` is configured, tweet a completion notice with the tx hash, and append a JSONL audit record.

## Queue daemon

Create `agents/burn-agent/queue.json`:

```json
[
  {
    "tokenId": 1,
    "reason": "Policy-approved burn",
    "status": "pending"
  }
]
```

Then run:

```bash
npm run agent:daemon
```

The daemon processes pending entries and rewrites their status to `completed` or `failed`.

## VPS systemd

On the VPS:

```bash
sudo cp agents/burn-agent/systemd/florentine-burn-agent.service.example /etc/systemd/system/florentine-burn-agent.service
sudo editor /etc/systemd/system/florentine-burn-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now florentine-burn-agent.service
sudo systemctl status florentine-burn-agent.service
```

Check logs:

```bash
journalctl -u florentine-burn-agent.service -f
```

## Twitter/X credentials

Posting uses Twitter API v2 `POST /2/tweets` with OAuth 1.0a user-context credentials:

- `TWITTER_API_KEY`
- `TWITTER_API_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_TOKEN_SECRET`

If these are missing, the agent logs the tweet text but does not post.

## No floor function yet

This scaffold intentionally does not assume an onchain floor-price function. If we add that later, the agent can be extended to read the contract floor and compare OpenSea listings/sales before queuing burns.
