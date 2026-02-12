
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

// ── Middleware Types ──────────────────────────────────────────

export interface TrustGateOptions extends TrustCheckOptions {
    extractAgentId: (req: any) => string | undefined;
    onDenied?: (result: TrustCheckResult, req: any, res: any) => void;
    onError?: (error: unknown, req: any, res: any) => void;
    cache?: { ttlMs: number };
}

// ── ERRORS ────────────────────────────────────────────────────

export enum KYAErrorCode {
    VALIDATION_ERROR = "VALIDATION_ERROR",
    UNAUTHORIZED = "UNAUTHORIZED",
    FORBIDDEN = "FORBIDDEN",
    NOT_FOUND = "NOT_FOUND",
    CONFLICT = "CONFLICT",
    RATE_LIMITED = "RATE_LIMITED",
    SERVER_ERROR = "SERVER_ERROR",
    NETWORK_ERROR = "NETWORK_ERROR",
}

const statusToCode: Record<number, KYAErrorCode> = {
    400: KYAErrorCode.VALIDATION_ERROR,
    401: KYAErrorCode.UNAUTHORIZED,
    403: KYAErrorCode.FORBIDDEN,
    404: KYAErrorCode.NOT_FOUND,
    409: KYAErrorCode.CONFLICT,
    429: KYAErrorCode.RATE_LIMITED,
};

export class KYAError extends Error {
    readonly code: KYAErrorCode;
    readonly status: number | undefined;

    constructor(code: KYAErrorCode, message: string, status?: number) {
        super(message);
        this.name = "KYAError";
        this.code = code;
        this.status = status;
    }

    static fromStatus(status: number, message: string): KYAError {
        const code =
            statusToCode[status] ??
            (status >= 500 ? KYAErrorCode.SERVER_ERROR : KYAErrorCode.SERVER_ERROR);
        return new KYAError(code, message, status);
    }

    static networkError(cause: unknown): KYAError {
        const message =
            cause instanceof Error ? cause.message : "Network request failed";
        return new KYAError(KYAErrorCode.NETWORK_ERROR, message);
    }
}

// ── CLIENT ────────────────────────────────────────────────────

export class KYAClient {
    private readonly baseUrl: string;
    private readonly apiKey: string | undefined;
    private readonly _fetch: typeof globalThis.fetch;

    constructor(config: KYAClientConfig = {}) {
        this.baseUrl = (config.baseUrl ?? "http://localhost:3001").replace(
            /\/$/,
            "",
        );
        this.apiKey = config.apiKey;
        this._fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
    }

    // ── Internal helpers ────────────────────────────────────────

    private async request<T>(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<T> {
        const headers: Record<string, string> = {};

        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        if (this.apiKey) {
            headers["X-API-Key"] = this.apiKey;
        }

        let res: Response;
        try {
            res = await this._fetch(`${this.baseUrl}${path}`, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
            });
        } catch (err) {
            throw KYAError.networkError(err);
        }

        if (!res.ok) {
            let message: string;
            try {
                const json = (await res.json()) as { error?: string };
                message = json.error ?? res.statusText;
            } catch {
                message = res.statusText;
            }
            throw KYAError.fromStatus(res.status, message);
        }

        return (await res.json()) as T;
    }

    private get<T>(
        path: string,
        query?: Record<string, string | number | undefined>,
    ): Promise<T> {
        let qs = "";
        if (query) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(query)) {
                if (v !== undefined) params.set(k, String(v));
            }
            const str = params.toString();
            if (str) qs = `?${str}`;
        }
        return this.request<T>("GET", `${path}${qs}`);
    }

    private agentPath(id: string): string {
        return `/agents/${encodeURIComponent(id)}`;
    }

    // ── Health & Stats ──────────────────────────────────────────

    health(): Promise<HealthResponse> {
        return this.get<HealthResponse>("/health");
    }

    getStats(params?: StatsParams): Promise<StatsResponse> {
        return this.get<StatsResponse>("/stats", params as Record<string, string | number | undefined>);
    }

    // ── Agents ──────────────────────────────────────────────────

    listAgents(
        params?: ListAgentsParams,
    ): Promise<{ agents: AgentSummary[]; pagination: Pagination }> {
        return this.get("/agents", params as Record<string, string | number | undefined>);
    }

    getAgent(id: string): Promise<AgentProfile> {
        return this.get<AgentProfile>(this.agentPath(id));
    }

    // ── Reputation ──────────────────────────────────────────────

    getReputation(id: string): Promise<ReputationResponse> {
        return this.get<ReputationResponse>(`${this.agentPath(id)}/reputation`);
    }

    getReputationHistory(
        id: string,
        params?: ReputationHistoryParams,
    ): Promise<ReputationHistoryResponse> {
        return this.get<ReputationHistoryResponse>(
            `${this.agentPath(id)}/reputation/history`,
            params as Record<string, string | number | undefined>,
        );
    }

    // ── Attestations ────────────────────────────────────────────

    getAttestations(
        id: string,
        params?: PaginationParams,
    ): Promise<AttestationsResponse> {
        return this.get<AttestationsResponse>(
            `${this.agentPath(id)}/attestations`,
            params as Record<string, string | number | undefined>,
        );
    }

    // ── Feedback ────────────────────────────────────────────────

    getFeedback(
        id: string,
        params?: PaginationParams,
    ): Promise<FeedbackResponse> {
        return this.get<FeedbackResponse>(
            `${this.agentPath(id)}/feedback`,
            params as Record<string, string | number | undefined>,
        );
    }

    getFeedbackChains(id: string): Promise<FeedbackChainsResponse> {
        return this.get<FeedbackChainsResponse>(
            `${this.agentPath(id)}/feedback/chains`,
        );
    }

    submitFeedback(
        id: string,
        params: SubmitFeedbackParams,
    ): Promise<SubmitFeedbackResponse> {
        return this.request<SubmitFeedbackResponse>(
            "POST",
            `${this.agentPath(id)}/feedback`,
            params,
        );
    }

    updateFeedbackTx(
        id: string,
        commentId: number,
        txHash: string,
    ): Promise<UpdateFeedbackTxResponse> {
        return this.request<UpdateFeedbackTxResponse>(
            "PATCH",
            `${this.agentPath(id)}/feedback/${commentId}/tx`,
            { txHash },
        );
    }

    buildFeedbackTx(
        id: string,
        params: BuildFeedbackTxParams,
    ): Promise<BuildFeedbackTxResponse> {
        return this.request<BuildFeedbackTxResponse>(
            "POST",
            `${this.agentPath(id)}/feedback/build`,
            params,
        );
    }

    // ── Presence ────────────────────────────────────────────────

    getPresence(id: string): Promise<PresenceResponse> {
        return this.get<PresenceResponse>(`${this.agentPath(id)}/presence`);
    }

    addPresence(
        id: string,
        params: AddPresenceParams,
    ): Promise<AddPresenceResponse> {
        return this.request<AddPresenceResponse>(
            "POST",
            `${this.agentPath(id)}/presence`,
            params,
        );
    }

    removePresence(
        id: string,
        params: RemovePresenceParams,
    ): Promise<RemovePresenceResponse> {
        return this.request<RemovePresenceResponse>(
            "DELETE",
            `${this.agentPath(id)}/presence`,
            params,
        );
    }

    // ── Links ───────────────────────────────────────────────────

    getLinks(id: string): Promise<LinksResponse> {
        return this.get<LinksResponse>(`${this.agentPath(id)}/links`);
    }

    linkAgents(params: LinkAgentsParams): Promise<LinkAgentsResponse> {
        return this.request<LinkAgentsResponse>("POST", "/agents/link", params);
    }

    unlinkAgents(
        id: string,
        params: UnlinkAgentsParams,
    ): Promise<UnlinkAgentsResponse> {
        return this.request<UnlinkAgentsResponse>(
            "DELETE",
            `${this.agentPath(id)}/links`,
            params,
        );
    }

    // ── Trust Gate ──────────────────────────────────────────────

    async isAgentTrusted(
        id: string,
        options: TrustCheckOptions = {},
    ): Promise<TrustCheckResult> {
        const { minScore = 50, minFeedback = 5 } = options;

        const rep = await this.getReputation(id);
        const rawValue = Number(rep.unified.value);
        const decimals = rep.unified.decimals;
        const score = decimals > 0 ? rawValue / 10 ** decimals : rawValue;
        const feedbackCount = Number(rep.unified.totalFeedbackCount);

        if (feedbackCount < minFeedback) {
            return {
                trusted: false,
                score,
                feedbackCount,
                reason: `Insufficient feedback: ${feedbackCount} < ${minFeedback} required`,
            };
        }

        if (score < minScore) {
            return {
                trusted: false,
                score,
                feedbackCount,
                reason: `Score too low: ${score} < ${minScore} required`,
            };
        }

        return {
            trusted: true,
            score,
            feedbackCount,
            reason: "Agent meets trust thresholds",
        };
    }

    // ── Webhooks ────────────────────────────────────────────────

    createWebhook(params: CreateWebhookParams): Promise<WebhookResponse> {
        return this.request<WebhookResponse>("POST", "/webhooks", params);
    }

    listWebhooks(): Promise<WebhookListResponse> {
        return this.get<WebhookListResponse>("/webhooks");
    }

    getWebhook(id: string): Promise<WebhookResponse> {
        return this.get<WebhookResponse>(`/webhooks/${encodeURIComponent(id)}`);
    }

    updateWebhook(
        id: string,
        params: UpdateWebhookParams,
    ): Promise<WebhookResponse> {
        return this.request<WebhookResponse>(
            "PATCH",
            `/webhooks/${encodeURIComponent(id)}`,
            params,
        );
    }

    deleteWebhook(id: string): Promise<WebhookDeleteResponse> {
        return this.request<WebhookDeleteResponse>(
            "DELETE",
            `/webhooks/${encodeURIComponent(id)}`,
        );
    }

    getWebhookDeliveries(
        id: string,
        params?: PaginationParams,
    ): Promise<WebhookDeliveriesResponse> {
        return this.get<WebhookDeliveriesResponse>(
            `/webhooks/${encodeURIComponent(id)}/deliveries`,
            params as Record<string, string | number | undefined>,
        );
    }
}
