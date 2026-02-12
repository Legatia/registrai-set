# @registrai/kya

TypeScript SDK for the RegistrAI KYA API.

## Install

```bash
npm install @registrai/kya
```

## Quick start

```ts
import { KYAClient } from "@registrai/kya";

const kya = new KYAClient({
  baseUrl: "https://api.registrai.cc",
  apiKey: process.env.KYA_API_KEY, // required for write endpoints
});

const stats = await kya.getStats();
const profile = await kya.getAgent("0xOwnerOrMasterAgentId");
const trust = await kya.isAgentTrusted(profile.masterAgentId, {
  minScore: 50,
  minFeedback: 5,
});
```

## Runtime requirements

- Node.js `>=18` (or any runtime with `fetch` support)

## Notes

- Public read endpoints work without an API key.
- Webhook and developer endpoints require a valid developer API key.
- SDK throws `KYAError` for HTTP and network failures.
