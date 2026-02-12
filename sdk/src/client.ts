import { KYAError } from "./errors.js";
import type {
  AddPresenceParams,
  AddPresenceResponse,
  AgentProfile,
  AgentSummary,
  AttestationsResponse,
  BuildFeedbackTxParams,
  BuildFeedbackTxResponse,
  CreateWebhookParams,
  FeedbackChainsResponse,
  FeedbackResponse,
  HealthResponse,
  KYAClientConfig,
  LinkAgentsParams,
  LinkAgentsResponse,
  LinksResponse,
  ListAgentsParams,
  Pagination,
  PaginationParams,
  PresenceResponse,
  RemovePresenceParams,
  RemovePresenceResponse,
  ReputationHistoryParams,
  ReputationHistoryResponse,
  ReputationResponse,
  StatsParams,
  StatsResponse,
  SubmitFeedbackParams,
  SubmitFeedbackResponse,
  TrustCheckOptions,
  TrustCheckResult,
  UnlinkAgentsParams,
  UnlinkAgentsResponse,
  UpdateFeedbackTxResponse,
  UpdateWebhookParams,
  WebhookDeleteResponse,
  WebhookDeliveriesResponse,
  WebhookListResponse,
  WebhookResponse,
} from "./types.js";

export class KYAClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly _fetch: typeof globalThis.fetch;

  constructor(config: KYAClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "http://localhost:3001").replace(
      /\/$/,
      "",
    );
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.defaultHeaders = config.headers ?? {};
    this._fetch = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  // ── Internal helpers ────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = { ...this.defaultHeaders };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this._fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        signal: controller.signal,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw KYAError.networkError(err);
    } finally {
      clearTimeout(timeout);
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

    if (res.status === 204) {
      return undefined as T;
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
    const feedbackCountRaw = BigInt(rep.unified.totalFeedbackCount);
    const minFeedbackRaw = BigInt(minFeedback);
    const feedbackCount =
      feedbackCountRaw > BigInt(Number.MAX_SAFE_INTEGER)
        ? Number.MAX_SAFE_INTEGER
        : Number(feedbackCountRaw);

    if (feedbackCountRaw < minFeedbackRaw) {
      return {
        trusted: false,
        score,
        feedbackCount,
        reason: `Insufficient feedback: ${feedbackCountRaw.toString()} < ${minFeedback} required`,
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
