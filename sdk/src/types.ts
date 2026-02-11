// ── Pagination ───────────────────────────────────────────────

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ── Health & Stats ───────────────────────────────────────────

export interface HealthResponse {
  status: string;
  agentCount: number;
}

export interface StatsResponse {
  totalAgents: number;
  totalIdentities: number;
  totalFeedback: number;
  chainsTracked: number;
}

// ── Agent ────────────────────────────────────────────────────

export interface AgentSummary {
  masterAgentId: string;
  ownerAddress: string;
  registeredAt: number;
  unifiedValue: string;
  unifiedValueDecimals: number;
  totalFeedbackCount: string;
}

export interface AgentIdentity {
  globalAgentId: string;
  chainId: number;
  chainName: string;
  l2AgentId: string;
  agentUri: string | null;
  discoveredBlock: number;
}

export interface ChainReputation {
  chainId: number;
  chainName: string;
  summaryValue: string;
  summaryValueDecimals: number;
  feedbackCount: string;
  updatedAt: number;
}

export interface UnifiedReputation {
  value: string;
  decimals: number;
  totalFeedbackCount: string;
}

export interface AgentProfile {
  masterAgentId: string;
  ownerAddress: string;
  registeredAt: number;
  identities: AgentIdentity[];
  reputation: {
    unified: UnifiedReputation;
    perChain: ChainReputation[];
  };
}

// ── Reputation ───────────────────────────────────────────────

export interface ReputationResponse {
  masterAgentId: string;
  unified: UnifiedReputation;
  perChain: ChainReputation[];
}

export interface ReputationSnapshot {
  chainId: number;
  chainName: string;
  summaryValue: string;
  summaryValueDecimals: number;
  feedbackCount: string;
  recordedAt: number;
}

export interface ReputationHistoryResponse {
  masterAgentId: string;
  snapshots: ReputationSnapshot[];
  pagination: Pagination;
}

// ── Attestations ─────────────────────────────────────────────

export interface Attestation {
  attestationAddress: string;
  counterparty: string;
  outcome: "negative" | "neutral" | "positive";
  slot: number;
  txSignature: string;
  createdAt: number;
}

export interface AttestationsResponse {
  masterAgentId: string;
  attestations: Attestation[];
  pagination: Pagination;
}

// ── Presence ────────────────────────────────────────────────

export interface AddressPresence {
  address: string;
  chainType: "evm" | "solana";
  chainId: number | null;
  verifiedAt: number;
}

export interface PresenceResponse {
  masterAgentId: string;
  presence: AddressPresence[];
}

export interface AddPresenceParams {
  address: string;
  chainType: "evm" | "solana";
  chainId?: number;
  ownerSignature: string;
  addressSignature: string;
}

export interface AddPresenceResponse {
  masterAgentId: string;
  address: string;
  chainType: "evm" | "solana";
  chainId: number | null;
  message: string;
}

export interface RemovePresenceParams {
  address: string;
  chainType: "evm" | "solana";
  signature: string;
  signerAddress: string;
}

export interface RemovePresenceResponse {
  message: string;
}

// ── Feedback ─────────────────────────────────────────────────

export interface FeedbackComment {
  id: number;
  chainId: number;
  chainName: string;
  commenterAddress: string;
  score: number;
  tag: string;
  comment: string;
  commentHash: string;
  txHash: string | null;
  createdAt: number;
}

export interface FeedbackResponse {
  masterAgentId: string;
  comments: FeedbackComment[];
  pagination: Pagination;
}

export interface FeedbackChain {
  chainId: number;
  chainName: string;
  reputationRegistry: string;
  agentId: string;
  globalAgentId: string;
}

export interface FeedbackChainsResponse {
  masterAgentId: string;
  chains: FeedbackChain[];
}

export interface SubmitFeedbackResponse {
  id: number;
  commentHash: string;
  message: string;
}

export interface UpdateFeedbackTxResponse {
  message: string;
}

export interface BuildFeedbackTxResponse {
  chainId: number;
  chainName: string;
  to: string;
  data: string;
  agentId: string;
  globalAgentId: string;
}

// ── Links ────────────────────────────────────────────────────

export interface LinkInfo {
  linkedAgentId: string;
  solanaAddress: string;
  evmAddress: string;
  createdAt: number;
}

export type LinksResponse =
  | {
      masterAgentId: string;
      role: "primary";
      links: LinkInfo[];
    }
  | {
      masterAgentId: string;
      role: "linked";
      primaryAgentId: string;
      solanaAddress: string;
      evmAddress: string;
      createdAt: number;
    }
  | {
      masterAgentId: string;
      role: "none";
      links: [];
    };

export interface LinkAgentsResponse {
  primaryAgentId: string;
  linkedAgentId: string;
  solanaAddress: string;
  evmAddress: string;
  unifiedValue: string;
  unifiedValueDecimals: number;
  totalFeedbackCount: string;
}

export interface UnlinkAgentsResponse {
  message: string;
}

// ── Trust Check ──────────────────────────────────────────────

export interface TrustCheckResult {
  trusted: boolean;
  score: number;
  feedbackCount: number;
  reason: string;
}

// ── Request Params ───────────────────────────────────────────

export interface ListAgentsParams {
  page?: number;
  limit?: number;
  chain?: number;
  network?: "mainnet" | "testnet";
  owner?: string;
  sort?: "oldest" | "newest";
}

export interface StatsParams {
  network?: "mainnet" | "testnet";
}

export interface ReputationHistoryParams {
  page?: number;
  limit?: number;
  chain?: number;
  from?: number;
  to?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface SubmitFeedbackParams {
  chainId: number;
  commenterAddress: string;
  score: number;
  commentHash: string;
  tag?: string;
  comment?: string;
  txHash?: string;
}

export interface BuildFeedbackTxParams {
  chainId: number;
  value: string;
  valueDecimals: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
  feedbackHash?: string;
}

export interface LinkAgentsParams {
  solanaAddress: string;
  evmAddress: string;
  solanaSignature: string;
  evmSignature: string;
}

export interface UnlinkAgentsParams {
  signature: string;
  signerAddress: string;
  chain: "evm" | "solana";
}

export interface TrustCheckOptions {
  minScore?: number;
  minFeedback?: number;
}

export interface KYAClientConfig {
  baseUrl?: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
}

// ── Webhooks ─────────────────────────────────────────────────

export type WebhookEventType =
  | "feedback.received"
  | "reputation.changed"
  | "reputation.threshold"
  | "agent.registered"
  | "link.created"
  | "link.removed";

export interface CreateWebhookParams {
  url: string;
  events: WebhookEventType[];
  agentId?: string;
}

export interface UpdateWebhookParams {
  url?: string;
  events?: WebhookEventType[];
  active?: boolean;
}

export interface WebhookResponse {
  id: string;
  url: string;
  secret?: string;
  events: WebhookEventType[];
  agentId: string | null;
  active: boolean;
  createdAt: number;
}

export interface WebhookListResponse {
  webhooks: WebhookResponse[];
}

export interface WebhookDelivery {
  id: number;
  event: string;
  payload: unknown;
  statusCode: number | null;
  attempts: number;
  nextRetryAt: number | null;
  deliveredAt: number | null;
  createdAt: number;
}

export interface WebhookDeliveriesResponse {
  deliveries: WebhookDelivery[];
  pagination: Pagination;
}

export interface WebhookDeleteResponse {
  message: string;
}

// ── Middleware ────────────────────────────────────────────────

export interface TrustGateOptions extends TrustCheckOptions {
  extractAgentId: (req: any) => string | undefined;
  onDenied?: (result: TrustCheckResult, req: any, res: any) => void;
  onError?: (error: unknown, req: any, res: any) => void;
  cache?: { ttlMs: number };
}
