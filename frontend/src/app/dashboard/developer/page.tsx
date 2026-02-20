"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_BASE = process.env.NEXT_PUBLIC_KYA_API_URL || "http://localhost:3001";
const STORAGE_KEY = "dashboard_developer_api_key";
const SESSION_EXP_KEY = "dashboard_developer_session_exp";
const SESSION_MINUTES = 60;

interface MeResponse {
  id: string;
  name: string;
  email: string;
  createdAt: number;
}

interface UsageResponse {
  developerId: string;
  period: string;
  totalCalls: number;
  daily: Array<{ day: string; calls: number }>;
  byEndpoint: Array<{ method: string; path: string; calls: number }>;
}

interface WebhooksResponse {
  webhooks: Array<{
    id: string;
    url: string;
    events: string[];
    active: boolean;
    createdAt: number;
  }>;
}

interface KeysResponse {
  keys: Array<{
    keyId: string;
    key: string;
    label: string;
    scopes: string;
    active: boolean;
    createdAt: number;
    revokedAt: number | null;
    lastUsedAt: number | null;
  }>;
}

interface QuotaResponse {
  keyMasked: string;
  plan: null | {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    billingInterval: string;
  };
  quota: {
    total: { limit: number; used: number; remaining: number };
    write: { limit: number; used: number; remaining: number };
    feedbackSubmit: { limit: number; used: number; remaining: number };
    resetAt: number;
  };
  rateLimit: {
    last24h429: number;
    byEndpoint: Array<{ method: string; path: string; hits: number }>;
  };
}

interface MyOrganizationsResponse {
  organizations: Array<{
    organizationId: string;
    name: string;
    slug: string;
    role: string;
    joinedAt: number;
  }>;
}

interface MyOrganizationUsageResponse {
  organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: number;
    role: string;
  };
  period: string;
  totalCalls: number;
  daily: Array<{ day: string; calls: number }>;
  byDeveloper: Array<{
    developerId: string;
    name: string;
    email: string;
    calls: number;
  }>;
  byEndpoint: Array<{ method: string; path: string; calls: number }>;
}

interface MyBillingResponse {
  developerId: string;
  subscription: null | {
    id: string;
    provider: string;
    externalSubscriptionId: string;
    status: string;
    amountCents: number;
    currency: string;
    billingInterval: string;
    planId: string | null;
    currentPeriodStart: number | null;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    updatedAt: number;
  };
  today: {
    totalCalls: number;
    rateLimitedCalls: number;
    dayStart: number;
    dayEnd: number;
  };
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export default function DeveloperDashboardPage() {
  const [apiKey, setApiKey] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [quota, setQuota] = useState<QuotaResponse | null>(null);
  const [webhooks, setWebhooks] = useState<WebhooksResponse["webhooks"]>([]);
  const [keys, setKeys] = useState<KeysResponse["keys"]>([]);
  const [organizations, setOrganizations] = useState<MyOrganizationsResponse["organizations"]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [selectedOrganizationUsage, setSelectedOrganizationUsage] = useState<MyOrganizationUsageResponse | null>(null);
  const [billing, setBilling] = useState<MyBillingResponse | null>(null);

  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [rotateLabel, setRotateLabel] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) setApiKey(saved);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    const interval = window.setInterval(() => {
      const exp = Number(sessionStorage.getItem(SESSION_EXP_KEY) || 0);
      if (exp > 0 && Date.now() > exp) {
        logout("Session expired. Please login again.");
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loggedIn]);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    return (await res.json()) as T;
  }

  function extendSession() {
    sessionStorage.setItem(SESSION_EXP_KEY, String(Date.now() + SESSION_MINUTES * 60 * 1000));
  }

  function logout(reason?: string) {
    setLoggedIn(false);
    setMe(null);
    setUsage(null);
    setQuota(null);
    setWebhooks([]);
    setKeys([]);
    setOrganizations([]);
    setSelectedOrganizationId(null);
    setSelectedOrganizationUsage(null);
    setBilling(null);
    setError(null);
    setNotice(reason || null);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_EXP_KEY);
    setApiKey("");
  }

  async function loadDashboardData() {
    const [meRes, usageRes, webhookRes, keysRes, quotaRes, orgRes, billRes] = await Promise.all([
      api<MeResponse>("/me"),
      api<UsageResponse>("/me/usage"),
      api<WebhooksResponse>("/webhooks"),
      api<KeysResponse>("/me/keys"),
      api<QuotaResponse>("/me/quota"),
      api<MyOrganizationsResponse>("/me/organizations"),
      api<MyBillingResponse>("/me/billing"),
    ]);
    setMe(meRes);
    setUsage(usageRes);
    setWebhooks(webhookRes.webhooks);
    setKeys(keysRes.keys);
    setQuota(quotaRes);
    setOrganizations(orgRes.organizations);
    setBilling(billRes);

    if (orgRes.organizations.length > 0) {
      const orgId = selectedOrganizationId || orgRes.organizations[0].organizationId;
      const orgUsage = await api<MyOrganizationUsageResponse>(`/me/organizations/${orgId}/usage`);
      setSelectedOrganizationId(orgId);
      setSelectedOrganizationUsage(orgUsage);
    } else {
      setSelectedOrganizationId(null);
      setSelectedOrganizationUsage(null);
    }

    extendSession();
  }

  async function selectOrganization(organizationId: string) {
    setLoading(true);
    setError(null);
    try {
      const orgUsage = await api<MyOrganizationUsageResponse>(`/me/organizations/${organizationId}/usage`);
      setSelectedOrganizationId(organizationId);
      setSelectedOrganizationUsage(orgUsage);
      extendSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load organization usage failed");
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await loadDashboardData();
      setLoggedIn(true);
      sessionStorage.setItem(STORAGE_KEY, apiKey);
      setNotice(`Developer authenticated. Session expires in ${SESSION_MINUTES} minutes.`);
    } catch (e) {
      setLoggedIn(false);
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function createAdditionalKey() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ key: string; keyMasked: string }>("/me/keys", {
        method: "POST",
        body: JSON.stringify({ label: newKeyLabel || "self-issued" }),
      });
      setNewKeyLabel("");
      await loadDashboardData();
      setNotice(`New key issued: ${res.key}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create key failed");
    } finally {
      setLoading(false);
    }
  }

  async function rotateCurrentKey() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ key: string; keyMasked: string }>("/me/keys/rotate", {
        method: "POST",
        body: JSON.stringify({ label: rotateLabel || "rotated", revokeCurrent: true }),
      });
      setRotateLabel("");
      setApiKey(res.key);
      sessionStorage.setItem(STORAGE_KEY, res.key);
      await loadDashboardData();
      setNotice(`Current key rotated. New key: ${res.key}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rotate key failed");
    } finally {
      setLoading(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (keyId === apiKey) {
      setError("Cannot revoke the currently active key. Use Rotate Current instead.");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ message: string }>(`/me/keys/${encodeURIComponent(keyId)}`, {
        method: "DELETE",
      });
      await loadDashboardData();
      setNotice("API key revoked.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke key failed");
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(() => {
    const daily = usage?.daily || [];
    return [...daily]
      .reverse()
      .map((d) => ({
        day: d.day.slice(5),
        calls: d.calls,
      }));
  }, [usage]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Developer Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Monitor quota, rate-limit behavior, usage, and manage API keys.
          </p>
        </div>
        {loggedIn && (
          <Button variant="outline" onClick={() => logout()}>
            Log out
          </Button>
        )}
      </div>

      {!loggedIn ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Enter your developer `X-API-Key`.</p>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="kya_..."
          />
          <Button onClick={login} disabled={loading || !apiKey}>
            {loading ? "Checking..." : "Login"}
          </Button>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {notice && <p className="text-sm text-green-400">{notice}</p>}
        </div>
      ) : (
        <>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {notice && <p className="text-sm text-green-400 break-all">{notice}</p>}

          {me && quota && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Metric title="Account" value={me.name} subvalue={me.email} />
              <Metric title="Total Quota" value={`${quota.quota.total.used}/${quota.quota.total.limit}`} subvalue={`${quota.quota.total.remaining} left`} />
              <Metric title="Write Quota" value={`${quota.quota.write.used}/${quota.quota.write.limit}`} subvalue={`${quota.quota.write.remaining} left`} />
              <Metric title="429 (24h)" value={String(quota.rateLimit.last24h429)} subvalue={`Reset: ${formatDate(quota.quota.resetAt)}`} />
            </div>
          )}

          {quota?.plan && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs text-muted-foreground">Current Plan</p>
              <p className="text-sm font-medium">
                {quota.plan.name} ({quota.plan.slug}) · ${(quota.plan.priceCents / 100).toFixed(2)}/{quota.plan.billingInterval}
              </p>
            </div>
          )}

          {billing && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs text-muted-foreground">Billing</p>
              <p className="text-sm font-medium">
                Subscription: {billing.subscription ? `${billing.subscription.status} · ${(billing.subscription.amountCents / 100).toFixed(2)}/${billing.subscription.billingInterval}` : "none"}
              </p>
              <p className="text-xs text-muted-foreground">
                Today calls: {billing.today.totalCalls} · 429: {billing.today.rateLimitedCalls}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
              <h2 className="font-semibold">Daily Usage (30d)</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                    <XAxis dataKey="day" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip />
                    <Bar dataKey="calls" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
              <h2 className="font-semibold">Top Endpoints (30d)</h2>
              <div className="space-y-2 max-h-64 overflow-auto">
                {(usage?.byEndpoint || []).slice(0, 20).map((r, i) => (
                  <div
                    key={`${r.method}-${r.path}-${i}`}
                    className="rounded-md border border-white/10 p-2 flex items-center justify-between gap-4"
                  >
                    <p className="text-xs text-muted-foreground truncate">
                      {r.method} {r.path}
                    </p>
                    <p className="text-sm font-medium">{r.calls}</p>
                  </div>
                ))}
                {(usage?.byEndpoint || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No endpoint usage yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
              <h2 className="font-semibold">API Keys</h2>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Label for new key"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                />
                <Button onClick={createAdditionalKey} disabled={loading}>Issue Key</Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Label for rotated key"
                  value={rotateLabel}
                  onChange={(e) => setRotateLabel(e.target.value)}
                />
                <Button variant="outline" onClick={rotateCurrentKey} disabled={loading}>Rotate Current</Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-auto">
                {keys.map((k) => (
                  <div key={k.keyId} className="rounded-md border border-white/10 p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm">{k.key}</p>
                      <p className="text-xs text-muted-foreground">{k.label || "default"} · {k.active ? "active" : "revoked"}</p>
                      <p className="text-xs text-muted-foreground">Last used: {k.lastUsedAt ? formatDate(k.lastUsedAt) : "never"}</p>
                    </div>
                    {k.active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => revokeKey(k.keyId)}
                        disabled={loading || k.keyId === apiKey}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
                {keys.length === 0 && <p className="text-sm text-muted-foreground">No keys found.</p>}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
              <h2 className="font-semibold">429 By Endpoint (24h)</h2>
              <div className="space-y-2 max-h-64 overflow-auto">
                {(quota?.rateLimit.byEndpoint || []).map((r, i) => (
                  <div
                    key={`${r.method}-${r.path}-${i}`}
                    className="rounded-md border border-white/10 p-2 flex items-center justify-between gap-4"
                  >
                    <p className="text-xs text-muted-foreground truncate">{r.method} {r.path}</p>
                    <p className="text-sm font-medium">{r.hits}</p>
                  </div>
                ))}
                {(quota?.rateLimit.byEndpoint || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No 429s in last 24 hours.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
            <h2 className="font-semibold">Webhooks</h2>
            <p className="text-sm text-muted-foreground">Configured: {webhooks.length}</p>
            <div className="space-y-2 max-h-80 overflow-auto">
              {webhooks.map((w) => (
                <div key={w.id} className="rounded-md border border-white/10 p-3">
                  <p className="text-xs text-muted-foreground break-all">{w.url}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.active ? "active" : "inactive"} · events: {w.events.join(", ")}
                  </p>
                </div>
              ))}
              {webhooks.length === 0 && (
                <p className="text-sm text-muted-foreground">No webhooks configured.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
              <h2 className="font-semibold">Organizations</h2>
              <div className="space-y-2 max-h-64 overflow-auto">
                {organizations.map((org) => (
                  <button
                    key={org.organizationId}
                    onClick={() => selectOrganization(org.organizationId)}
                    className={`w-full text-left rounded-md border p-2 transition ${
                      selectedOrganizationId === org.organizationId ? "border-primary bg-primary/10" : "border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <p className="text-sm font-medium">{org.name} ({org.slug})</p>
                    <p className="text-xs text-muted-foreground">
                      Role: {org.role} · Joined: {formatDate(org.joinedAt)}
                    </p>
                  </button>
                ))}
                {organizations.length === 0 && (
                  <p className="text-sm text-muted-foreground">No organizations yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
              <h2 className="font-semibold">Selected Org Usage (30d)</h2>
              {selectedOrganizationUsage ? (
                <>
                  <p className="text-sm">
                    {selectedOrganizationUsage.organization.name} · Total calls: {selectedOrganizationUsage.totalCalls}
                  </p>
                  <div className="space-y-2 max-h-56 overflow-auto">
                    {selectedOrganizationUsage.byDeveloper.map((r) => (
                      <div key={r.developerId} className="rounded-md border border-white/10 p-2">
                        <p className="text-xs text-muted-foreground">
                          {r.name} ({r.email}) · {r.calls} calls
                        </p>
                      </div>
                    ))}
                    {selectedOrganizationUsage.byDeveloper.length === 0 && (
                      <p className="text-sm text-muted-foreground">No org usage yet.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select an organization to view usage.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ title, value, subvalue }: { title: string; value: string; subvalue?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-xl font-semibold truncate">{value}</p>
      {subvalue ? <p className="text-xs text-muted-foreground truncate">{subvalue}</p> : null}
    </div>
  );
}
