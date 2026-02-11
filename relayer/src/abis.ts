// ─── L2 Identity Registry ABI (real ERC-8004) ──────────────────────────────
export const L2_IDENTITY_REGISTRY_ABI = [
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "function getAgentWallet(uint256 agentId) external view returns (address)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
] as const;

// ─── L2 Reputation Registry ABI (real ERC-8004) ────────────────────────────
export const L2_REPUTATION_REGISTRY_ABI = [
  "function getSummary(uint256 agentId, address[] clients, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 decimals)",
  "function getClients(uint256 agentId) external view returns (address[])",
  "event NewFeedback(uint256 indexed agentId, address indexed client, uint64 index, int128 value, uint8 decimals, string tag1, string tag2)",
] as const;
