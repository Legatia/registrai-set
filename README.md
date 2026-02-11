# RegistrAI — Master Registry

> The programmable trust layer for AI agents. Know Your Agent (KYA) infrastructure built on [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004).

RegistrAI aggregates agent identities and reputation across chains into a single registry, exposing them via an API, SDK, and explorer frontend so protocols can programmatically trust-gate agents.

## Architecture

```
┌──────────────┐                      ┌──────────────┐
│  Base / L2   │   ┌──────────────┐   │   Solana     │
│  Identity +  │   │  Ethereum L1 │   │   (SATI)     │
│  Reputation  │──▶│  Master      │   └──────┬───────┘
└──────────────┘   │  Registry    │          │
                   └──────┬───────┘          │
                          │                  │
                    ┌─────▼─────┐   ┌────────▼───────┐
                    │  Relayer   │   │ Solana Indexer │
                    │ L2→L1+DB  │   │   DB only      │
                    └─────┬─────┘   └────────┬───────┘
                          │                  │
                          └──────┬───────────┘
                                 │
                           ┌─────▼─────┐
                           │  SQLite DB │  Unified agent + reputation data
                           └─────┬─────┘
                                 │
                           ┌─────▼─────┐
                           │  REST API  │  15 endpoints
                           └─────┬─────┘
                                 │
                     ┌───────────┼───────────┐
                     ▼                       ▼
               ┌───────────┐          ┌───────────┐
               │  Frontend │          │    SDK    │
               │ (Explorer)│          │ @registrai│
               └───────────┘          │   /kya    │
                                      └───────────┘
```

## Repository Structure

| Directory | Description |
|-----------|-------------|
| `src/` | Solidity smart contracts — `MasterRegistry.sol` (L1 aggregation hub) |
| `script/` | Foundry deployment scripts |
| `test/` | Solidity tests |
| `relayer/` | TypeScript — scans L2 identity & reputation registries, syncs to L1 + SQLite |
| `api/` | TypeScript — REST API serving agent data from the relayer DB |
| `frontend/` | Next.js — explorer UI for browsing agents, submitting feedback, registering |
| `sdk/` | TypeScript — `@registrai/kya` package for programmatic trust gating |
| `solana-indexer/` | Solana program indexer for cross-chain agent identity bridging |
| `lib/` | Foundry dependencies (OpenZeppelin, forge-std) |

## Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js ≥ 18
- An RPC endpoint for Sepolia and/or Base Sepolia

### 1. Contracts

```bash
# Build
forge build

# Test
forge test

# Deploy (Sepolia)
cp .env.example .env   # fill in keys
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

### 2. Relayer

```bash
cd relayer
cp .env.example .env   # fill in RPC URLs, private key, registry address
npm install
npm run dev
```

The relayer scans configured L2 chains for `Registered` events, registers agents on the L1 Master Registry, reads reputation data, and writes everything to a local SQLite database for fast API access.

### 3. API

```bash
cd api
cp .env.example .env
npm install
npm run dev            # http://localhost:3001
```

### 4. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev            # http://localhost:3000
```

### 5. SDK

```bash
cd sdk
npm install
npm run build
```

Usage in any project:

```typescript
import { RegistrAI } from "@registrai/kya";

const registrai = new RegistrAI({ apiUrl: "https://api.registrai.cc" });

// Check if an agent is trusted
const trusted = await registrai.isAgentTrusted(agentId);
```

## Deployed Contracts

| Network | Contract | Address |
|---------|----------|---------|
| Eth Sepolia | MasterRegistry | `0x39926322582978bbE2E38A50D7365795eE59CD55` |
| Eth Sepolia | IdentityRegistry (ERC-8004) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Eth Sepolia | ReputationRegistry (ERC-8004) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| Base Sepolia | IdentityRegistry (ERC-8004) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Base Sepolia | ReputationRegistry (ERC-8004) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

## Environment Variables

Copy each `.env.example` to `.env` (or `.env.local` for frontend). Key variables:

- **Root `.env`** — deployer key, Sepolia RPC, Etherscan API key
- **`relayer/.env`** — relayer private key, L1 RPC, L2 RPC URLs, master registry address
- **`api/.env`** — database path, port
- **`frontend/.env.local`** — API URL, master registry address, WalletConnect project ID

## License

MIT
