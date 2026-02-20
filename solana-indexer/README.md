# SATI Solana Indexer

Indexes SATI program events from Solana and writes agent/reputation data into the shared Cloudflare D1 database used by the KYA API.

## Prerequisites

- Node.js 18+
- Valid Solana RPC endpoint
- Cloudflare D1 credentials (`CF_ACCOUNT_ID`, `CF_API_TOKEN`, `D1_DATABASE_ID`)

## Setup

```bash
cp .env.example .env
npm install
npm run build
```

## Run

```bash
# Development (tsx)
npm run dev

# Production
npm run build
npm run start
```

## Notes

- This indexer writes directly to D1 via Cloudflare REST API.
- Ensure API migrations are applied first (including `sync_cursors` and `sati_attestations` tables).
- For devnet indexing, set `CLUSTER=devnet` and a devnet RPC URL.
