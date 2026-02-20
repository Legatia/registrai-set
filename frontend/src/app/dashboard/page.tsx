"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_BASE = process.env.NEXT_PUBLIC_KYA_API_URL || "http://localhost:3001";
const ADMIN_KEY_STORAGE_KEY = "dashboard_admin_key";
const ADMIN_SESSION_EXP_KEY = "dashboard_admin_session_exp";
const ADMIN_SESSION_MINUTES = 30;

interface OverviewResponse {
  totals: {
    developers: number;
    apiKeys: number;
    activeApiKeys: number;
    webhooks: number;
    activeWebhooks: number;
    pendingDeliveries: number;
    failedDeliveries: number;
    rateLimited24h: number;
  };
  topRateLimitedKeys24h: Array<{ apiKeyMasked: string; hits: number }>;
  syncCursors: Array<{ chain_id: number; last_block: number; updated_at: number }>;
}

interface DevelopersResponse {
  developers: Array<{
    id: string;
    name: string;
    email: string;
    createdAt: number;
    activeKeyCount: number;
  }>;
}

interface DeveloperResponse {
  id: string;
  name: string;
  email: string;
  createdAt: number;
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

interface UsageResponse {
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

interface AuditResponse {
  logs: Array<{
    id: number;
    actorType: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
    createdAt: number;
  }>;
}

interface OrganizationsResponse {
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    createdAt: number;
    memberCount: number;
  }>;
}

interface OrganizationMembersResponse {
  organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: number;
  };
  members: Array<{
    developerId: string;
    role: string;
    joinedAt: number;
    name: string;
    email: string;
  }>;
}

interface OrganizationUsageResponse {
  organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: number;
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

interface PlansResponse {
  plans: Array<{
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    billingInterval: string;
    quota: {
      totalPerDay: number;
      writePerDay: number;
      feedbackSubmitPerDay: number;
    };
    active: boolean;
    createdAt: number;
  }>;
}

interface DeveloperPlanResponse {
  developerId: string;
  plan: null | {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    billingInterval: string;
    startsAt: number;
    endsAt: number | null;
    quota: {
      totalPerDay: number;
      writePerDay: number;
      feedbackSubmitPerDay: number;
    };
  };
}

interface BillingOverviewResponse {
  totals: {
    totalSubscriptions: number;
    activeSubscriptions: number;
    activeDeveloperSubscriptions: number;
    activeOrganizationSubscriptions: number;
  };
  revenue: {
    mrrCents: number;
    arrCents: number;
  };
}

interface BillingSubscriptionsResponse {
  subscriptions: Array<{
    id: string;
    provider: string;
    externalSubscriptionId: string;
    ownerType: "developer" | "organization";
    ownerId: string;
    planId: string | null;
    status: string;
    amountCents: number;
    currency: string;
    billingInterval: string;
    currentPeriodStart: number | null;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
}

function fmt(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export default function AdminDashboardPage() {
  const [adminKey, setAdminKey] = useState("");
  const [rememberKey, setRememberKey] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [developers, setDevelopers] = useState<DevelopersResponse["developers"]>([]);
  const [query, setQuery] = useState("");
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string | null>(null);
  const [selectedDeveloper, setSelectedDeveloper] = useState<DeveloperResponse | null>(null);
  const [keys, setKeys] = useState<KeysResponse["keys"]>([]);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [webhooks, setWebhooks] = useState<WebhooksResponse["webhooks"]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditResponse["logs"]>([]);
  const [organizations, setOrganizations] = useState<OrganizationsResponse["organizations"]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMembersResponse["members"]>([]);
  const [organizationUsage, setOrganizationUsage] = useState<OrganizationUsageResponse | null>(null);
  const [plans, setPlans] = useState<PlansResponse["plans"]>([]);
  const [selectedDeveloperPlan, setSelectedDeveloperPlan] = useState<DeveloperPlanResponse["plan"]>(null);
  const [billingOverview, setBillingOverview] = useState<BillingOverviewResponse | null>(null);
  const [billingSubscriptions, setBillingSubscriptions] = useState<BillingSubscriptionsResponse["subscriptions"]>([]);

  const [newDevName, setNewDevName] = useState("");
  const [newDevEmail, setNewDevEmail] = useState("");
  const [issuedApiKey, setIssuedApiKey] = useState<string | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [memberDeveloperId, setMemberDeveloperId] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanSlug, setNewPlanSlug] = useState("");
  const [newPlanPrice, setNewPlanPrice] = useState("0");
  const [newPlanTotal, setNewPlanTotal] = useState("10000");
  const [newPlanWrite, setNewPlanWrite] = useState("2000");
  const [newPlanFeedback, setNewPlanFeedback] = useState("500");
  const [assignPlanId, setAssignPlanId] = useState("");
  const [newSubExternalId, setNewSubExternalId] = useState("");
  const [newSubOwnerType, setNewSubOwnerType] = useState("developer");
  const [newSubOwnerId, setNewSubOwnerId] = useState("");
  const [newSubPlanId, setNewSubPlanId] = useState("");
  const [newSubStatus, setNewSubStatus] = useState("active");
  const [newSubAmount, setNewSubAmount] = useState("0");

  useEffect(() => {
    const remembered = localStorage.getItem(ADMIN_KEY_STORAGE_KEY);
    if (remembered) {
      setAdminKey(remembered);
      setRememberKey(true);
    }
  }, []);

  useEffect(() => {
    if (!loggedIn) return;

    const interval = window.setInterval(() => {
      const exp = Number(sessionStorage.getItem(ADMIN_SESSION_EXP_KEY) || 0);
      if (exp > 0 && Date.now() > exp) {
        setLoggedIn(false);
        setSelectedDeveloperId(null);
        setSelectedDeveloper(null);
        setSelectedOrganizationId(null);
        setOrganizationMembers([]);
        setOrganizationUsage(null);
        setSelectedDeveloperPlan(null);
        setKeys([]);
        setUsage(null);
        setWebhooks([]);
        setAuditLogs([]);
        sessionStorage.removeItem(ADMIN_SESSION_EXP_KEY);
        if (!rememberKey) {
          setAdminKey("");
        }
        setNotice("Session expired. Please login again.");
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loggedIn, rememberKey]);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey,
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    return (await res.json()) as T;
  }

  function setSessionExpiration(): void {
    sessionStorage.setItem(ADMIN_SESSION_EXP_KEY, String(Date.now() + ADMIN_SESSION_MINUTES * 60 * 1000));
  }

  async function login() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const [orgs, planRes, billOverview, billSubs, ov, devs, audit] = await Promise.all([
        api<OrganizationsResponse>("/organizations?limit=200"),
        api<PlansResponse>("/admin/plans"),
        api<BillingOverviewResponse>("/admin/billing/overview"),
        api<BillingSubscriptionsResponse>("/admin/billing/subscriptions"),
        api<OverviewResponse>("/admin/overview"),
        api<DevelopersResponse>("/developers?limit=200"),
        api<AuditResponse>("/admin/audit?limit=30"),
      ]);
      setOrganizations(orgs.organizations);
      setPlans(planRes.plans);
      setBillingOverview(billOverview);
      setBillingSubscriptions(billSubs.subscriptions);
      setOverview(ov);
      setDevelopers(devs.developers);
      setAuditLogs(audit.logs);
      setLoggedIn(true);
      setSessionExpiration();

      if (rememberKey) {
        localStorage.setItem(ADMIN_KEY_STORAGE_KEY, adminKey);
      } else {
        localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
      }
      setNotice(`Admin authenticated. Session expires in ${ADMIN_SESSION_MINUTES} minutes.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setLoggedIn(false);
    } finally {
      setLoading(false);
    }
  }

  async function refreshOverviewAndList() {
    const [orgs, planRes, billOverview, billSubs, ov, devs, audit] = await Promise.all([
      api<OrganizationsResponse>("/organizations?limit=200"),
      api<PlansResponse>("/admin/plans"),
      api<BillingOverviewResponse>("/admin/billing/overview"),
      api<BillingSubscriptionsResponse>("/admin/billing/subscriptions"),
      api<OverviewResponse>("/admin/overview"),
      api<DevelopersResponse>("/developers?limit=200"),
      api<AuditResponse>("/admin/audit?limit=30"),
    ]);
    setOrganizations(orgs.organizations);
    setPlans(planRes.plans);
    setBillingOverview(billOverview);
    setBillingSubscriptions(billSubs.subscriptions);
    setOverview(ov);
    setDevelopers(devs.developers);
    setAuditLogs(audit.logs);
    setSessionExpiration();
  }

  async function selectDeveloper(id: string) {
    setLoading(true);
    setError(null);
    try {
      const [dev, keyList, usageRes, webhooksRes, planRes] = await Promise.all([
        api<DeveloperResponse>(`/developers/${id}`),
        api<KeysResponse>(`/developers/${id}/keys`),
        api<UsageResponse>(`/developers/${id}/usage`),
        api<WebhooksResponse>(`/developers/${id}/webhooks`),
        api<DeveloperPlanResponse>(`/admin/developers/${id}/plan`),
      ]);
      setSelectedDeveloperId(id);
      setSelectedDeveloper(dev);
      setKeys(keyList.keys);
      setUsage(usageRes);
      setWebhooks(webhooksRes.webhooks);
      setSelectedDeveloperPlan(planRes.plan);
      setAssignPlanId(planRes.plan?.id || "");
      setNewSubOwnerType("developer");
      setNewSubOwnerId(dev.id);
      setSessionExpiration();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load developer");
    } finally {
      setLoading(false);
    }
  }

  async function createDeveloper() {
    if (!newDevName || !newDevEmail) {
      setError("Name and email are required.");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    setIssuedApiKey(null);
    try {
      const created = await api<{ id: string; apiKey: string }>("/developers", {
        method: "POST",
        body: JSON.stringify({ name: newDevName, email: newDevEmail }),
      });
      setIssuedApiKey(created.apiKey);
      setNewDevName("");
      setNewDevEmail("");
      await refreshOverviewAndList();
      setNotice("Developer created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create developer failed");
    } finally {
      setLoading(false);
    }
  }

  async function createKey() {
    if (!selectedDeveloperId) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ key: string }>(`/developers/${selectedDeveloperId}/keys`, {
        method: "POST",
        body: JSON.stringify({ label: newKeyLabel || "dashboard" }),
      });
      setIssuedApiKey(res.key);
      setNewKeyLabel("");
      await selectDeveloper(selectedDeveloperId);
      await refreshOverviewAndList();
      setNotice("API key created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create key failed");
    } finally {
      setLoading(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (!selectedDeveloperId) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ message: string }>(`/developers/${selectedDeveloperId}/keys/${encodeURIComponent(keyId)}`, {
        method: "DELETE",
      });
      await selectDeveloper(selectedDeveloperId);
      await refreshOverviewAndList();
      setNotice("API key revoked.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setLoading(false);
    }
  }

  async function createOrganization() {
    if (!newOrgName.trim()) {
      setError("Organization name is required.");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ id: string; name: string; slug: string }>("/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: newOrgName.trim(),
          slug: newOrgSlug.trim() || undefined,
        }),
      });
      setNewOrgName("");
      setNewOrgSlug("");
      await refreshOverviewAndList();
      setNotice("Organization created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create organization failed");
    } finally {
      setLoading(false);
    }
  }

  async function selectOrganization(id: string) {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, usageRes] = await Promise.all([
        api<OrganizationMembersResponse>(`/organizations/${id}/members`),
        api<OrganizationUsageResponse>(`/organizations/${id}/usage`),
      ]);
      setSelectedOrganizationId(id);
      setOrganizationMembers(membersRes.members);
      setOrganizationUsage(usageRes);
      setNewSubOwnerType("organization");
      setNewSubOwnerId(id);
      setSessionExpiration();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load organization failed");
    } finally {
      setLoading(false);
    }
  }

  async function addOrganizationMember() {
    if (!selectedOrganizationId) {
      setError("Select an organization first.");
      return;
    }
    if (!memberDeveloperId.trim()) {
      setError("Developer ID is required.");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ organizationId: string; developerId: string; role: string }>(
        `/organizations/${selectedOrganizationId}/members`,
        {
          method: "POST",
          body: JSON.stringify({
            developerId: memberDeveloperId.trim(),
            role: memberRole,
          }),
        }
      );
      setMemberDeveloperId("");
      await selectOrganization(selectedOrganizationId);
      await refreshOverviewAndList();
      setNotice("Organization member updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add member failed");
    } finally {
      setLoading(false);
    }
  }

  async function removeOrganizationMember(developerId: string) {
    if (!selectedOrganizationId) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ message: string }>(
        `/organizations/${selectedOrganizationId}/members/${encodeURIComponent(developerId)}`,
        { method: "DELETE" }
      );
      await selectOrganization(selectedOrganizationId);
      await refreshOverviewAndList();
      setNotice("Organization member removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove member failed");
    } finally {
      setLoading(false);
    }
  }

  async function createPlan() {
    if (!newPlanName.trim() || !newPlanSlug.trim()) {
      setError("Plan name and slug are required.");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ id: string; slug: string }>("/admin/plans", {
        method: "POST",
        body: JSON.stringify({
          name: newPlanName.trim(),
          slug: newPlanSlug.trim(),
          priceCents: Number(newPlanPrice || "0"),
          totalPerDay: Number(newPlanTotal || "0"),
          writePerDay: Number(newPlanWrite || "0"),
          feedbackSubmitPerDay: Number(newPlanFeedback || "0"),
          billingInterval: "monthly",
          active: true,
        }),
      });
      setNewPlanName("");
      setNewPlanSlug("");
      await refreshOverviewAndList();
      setNotice("Plan created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create plan failed");
    } finally {
      setLoading(false);
    }
  }

  async function assignPlanToDeveloper() {
    if (!selectedDeveloperId) {
      setError("Select a developer first.");
      return;
    }
    if (!assignPlanId) {
      setError("Select a plan.");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ developerId: string; planId: string }>(`/admin/developers/${selectedDeveloperId}/plan`, {
        method: "POST",
        body: JSON.stringify({ planId: assignPlanId }),
      });
      await selectDeveloper(selectedDeveloperId);
      await refreshOverviewAndList();
      setNotice("Developer plan updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assign plan failed");
    } finally {
      setLoading(false);
    }
  }

  async function upsertSubscription() {
    if (!newSubExternalId.trim() || !newSubOwnerId.trim()) {
      setError("Subscription external ID and owner ID are required.");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ externalSubscriptionId: string }>("/admin/billing/subscriptions/upsert", {
        method: "POST",
        body: JSON.stringify({
          provider: "manual",
          externalSubscriptionId: newSubExternalId.trim(),
          ownerType: newSubOwnerType,
          ownerId: newSubOwnerId.trim(),
          planId: newSubPlanId || undefined,
          status: newSubStatus,
          amountCents: Number(newSubAmount || "0"),
          currency: "usd",
          billingInterval: "monthly",
        }),
      });
      await refreshOverviewAndList();
      setNotice("Subscription upserted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Subscription upsert failed");
    } finally {
      setLoading(false);
    }
  }

  async function exportUsageCsv() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/admin/billing/usage-export?format=csv`, {
        headers: {
          "X-Admin-Key": adminKey,
        },
      });
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }
      const csv = await res.text();
      setNotice(`Usage CSV generated (${csv.split("\n").length - 1} rows).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Usage export failed");
    } finally {
      setLoading(false);
    }
  }

  const filteredDevelopers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return developers;
    return developers.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q)
    );
  }, [developers, query]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Manage developers, keys, usage, and audit events from browser.
        </p>
      </div>

      {!loggedIn ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-6 space-y-4">
          <p className="text-sm text-muted-foreground">Enter `ADMIN_KEY` to continue.</p>
          <Input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="ADMIN_KEY"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={rememberKey}
              onChange={(e) => setRememberKey(e.target.checked)}
            />
            Remember admin key in this browser (optional)
          </label>
          <Button onClick={login} disabled={loading || !adminKey}>
            {loading ? "Checking..." : "Login"}
          </Button>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {notice && <p className="text-sm text-green-400">{notice}</p>}
        </div>
      ) : (
        <>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {notice && <p className="text-sm text-green-400">{notice}</p>}
          {issuedApiKey && (
            <p className="text-xs text-yellow-300 break-all">
              Newly issued key (copy now, shown once): {issuedApiKey}
            </p>
          )}

          {overview && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric title="Developers" value={overview.totals.developers} />
              <Metric title="Active Keys" value={overview.totals.activeApiKeys} />
              <Metric title="Active Webhooks" value={overview.totals.activeWebhooks} />
              <Metric title="429 (24h)" value={overview.totals.rateLimited24h} />
              <Metric title="Pending Deliveries" value={overview.totals.pendingDeliveries} />
              <Metric title="Failed Deliveries" value={overview.totals.failedDeliveries} />
              <Metric title="Total Keys" value={overview.totals.apiKeys} />
              <Metric title="Total Webhooks" value={overview.totals.webhooks} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-4">
              <h2 className="font-semibold">Create Developer</h2>
              <Input placeholder="Name" value={newDevName} onChange={(e) => setNewDevName(e.target.value)} />
              <Input placeholder="Email" value={newDevEmail} onChange={(e) => setNewDevEmail(e.target.value)} />
              <Button onClick={createDeveloper} disabled={loading}>Create + Issue Key</Button>
              <Button variant="outline" onClick={() => refreshOverviewAndList()} disabled={loading}>Refresh</Button>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-5 lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">Developers</h2>
                <Input
                  className="max-w-sm"
                  placeholder="Search by name/email/id"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="space-y-2 max-h-96 overflow-auto">
                {filteredDevelopers.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => selectDeveloper(d.id)}
                    className={`w-full text-left rounded-lg border p-3 transition ${
                      selectedDeveloperId === d.id ? "border-primary bg-primary/10" : "border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <p className="text-sm font-medium">{d.name} ({d.email})</p>
                    <p className="text-xs text-muted-foreground">ID: {d.id}</p>
                    <p className="text-xs text-muted-foreground">Active keys: {d.activeKeyCount} · Created: {fmt(d.createdAt)}</p>
                  </button>
                ))}
                {filteredDevelopers.length === 0 && (
                  <p className="text-sm text-muted-foreground">No developers found.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
              <h2 className="font-semibold">Create Organization</h2>
              <Input
                placeholder="Organization name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
              />
              <Input
                placeholder="Slug (optional)"
                value={newOrgSlug}
                onChange={(e) => setNewOrgSlug(e.target.value)}
              />
              <Button onClick={createOrganization} disabled={loading}>
                Create Organization
              </Button>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-5 lg:col-span-2 space-y-4">
              <h2 className="font-semibold">Organizations</h2>
              <div className="space-y-2 max-h-64 overflow-auto">
                {organizations.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => selectOrganization(o.id)}
                    className={`w-full text-left rounded-lg border p-3 transition ${
                      selectedOrganizationId === o.id ? "border-primary bg-primary/10" : "border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <p className="text-sm font-medium">{o.name} ({o.slug})</p>
                    <p className="text-xs text-muted-foreground">
                      Members: {o.memberCount} · Created: {fmt(o.createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground break-all">ID: {o.id}</p>
                  </button>
                ))}
                {organizations.length === 0 && (
                  <p className="text-sm text-muted-foreground">No organizations yet.</p>
                )}
              </div>

              {selectedOrganizationId && (
                <div className="rounded-lg border border-white/10 p-3 space-y-3">
                  <p className="text-sm font-medium">Assign Member</p>
                  <Input
                    placeholder="Developer ID"
                    value={memberDeveloperId}
                    onChange={(e) => setMemberDeveloperId(e.target.value)}
                  />
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm"
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                    <option value="owner">owner</option>
                  </select>
                  <Button onClick={addOrganizationMember} disabled={loading}>
                    Add / Update Member
                  </Button>
                </div>
              )}
            </div>
          </div>

          {selectedOrganizationId && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-2">
              <h3 className="font-semibold">Organization Members</h3>
              <div className="space-y-2 max-h-56 overflow-auto">
                {organizationMembers.map((m) => (
                  <div
                    key={`${m.developerId}-${m.role}`}
                    className="rounded-md border border-white/10 p-2 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm">{m.name} ({m.email})</p>
                      <p className="text-xs text-muted-foreground">
                        {m.role} · joined {fmt(m.joinedAt)}
                      </p>
                      <p className="text-xs text-muted-foreground break-all">Developer ID: {m.developerId}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => removeOrganizationMember(m.developerId)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                {organizationMembers.length === 0 && (
                  <p className="text-sm text-muted-foreground">No members in this organization.</p>
                )}
              </div>
            </div>
          )}

          {selectedOrganizationId && organizationUsage && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
              <h3 className="font-semibold">Organization Usage (30d)</h3>
              <p className="text-sm">
                Total calls: {organizationUsage.totalCalls}
              </p>
              <div className="space-y-1 max-h-40 overflow-auto">
                {organizationUsage.byDeveloper.slice(0, 10).map((r) => (
                  <p key={r.developerId} className="text-xs text-muted-foreground">
                    {r.name} ({r.email}) · {r.calls}
                  </p>
                ))}
                {organizationUsage.byDeveloper.length === 0 && (
                  <p className="text-sm text-muted-foreground">No usage for this organization yet.</p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
              <h2 className="font-semibold">Create Plan</h2>
              <Input placeholder="Plan name" value={newPlanName} onChange={(e) => setNewPlanName(e.target.value)} />
              <Input placeholder="Plan slug" value={newPlanSlug} onChange={(e) => setNewPlanSlug(e.target.value)} />
              <Input placeholder="Price cents" value={newPlanPrice} onChange={(e) => setNewPlanPrice(e.target.value)} />
              <Input placeholder="Total/day" value={newPlanTotal} onChange={(e) => setNewPlanTotal(e.target.value)} />
              <Input placeholder="Write/day" value={newPlanWrite} onChange={(e) => setNewPlanWrite(e.target.value)} />
              <Input placeholder="Feedback/day" value={newPlanFeedback} onChange={(e) => setNewPlanFeedback(e.target.value)} />
              <Button onClick={createPlan} disabled={loading}>Create Plan</Button>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-5 lg:col-span-2 space-y-3">
              <h2 className="font-semibold">Plans</h2>
              <div className="space-y-2 max-h-64 overflow-auto">
                {plans.map((p) => (
                  <div key={p.id} className="rounded-md border border-white/10 p-2">
                    <p className="text-sm font-medium">
                      {p.name} ({p.slug}) · ${(p.priceCents / 100).toFixed(2)}/{p.billingInterval}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      quota: total {p.quota.totalPerDay}, write {p.quota.writePerDay}, feedback {p.quota.feedbackSubmitPerDay}
                    </p>
                    <p className="text-xs text-muted-foreground break-all">ID: {p.id}</p>
                  </div>
                ))}
                {plans.length === 0 && (
                  <p className="text-sm text-muted-foreground">No plans yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
              <h2 className="font-semibold">Billing Overview</h2>
              <p className="text-sm text-muted-foreground">
                Active subs: {billingOverview?.totals.activeSubscriptions ?? 0}
              </p>
              <p className="text-sm text-muted-foreground">
                MRR: ${((billingOverview?.revenue.mrrCents ?? 0) / 100).toFixed(2)}
              </p>
              <p className="text-sm text-muted-foreground">
                ARR: ${((billingOverview?.revenue.arrCents ?? 0) / 100).toFixed(2)}
              </p>
              <Button variant="outline" onClick={exportUsageCsv} disabled={loading}>
                Generate Usage CSV
              </Button>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-5 lg:col-span-2 space-y-3">
              <h2 className="font-semibold">Upsert Subscription</h2>
              <Input
                placeholder="External subscription id (e.g. sub_123)"
                value={newSubExternalId}
                onChange={(e) => setNewSubExternalId(e.target.value)}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select
                  value={newSubOwnerType}
                  onChange={(e) => setNewSubOwnerType(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm"
                >
                  <option value="developer">developer</option>
                  <option value="organization">organization</option>
                </select>
                <Input
                  placeholder="Owner id"
                  value={newSubOwnerId}
                  onChange={(e) => setNewSubOwnerId(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={newSubPlanId}
                  onChange={(e) => setNewSubPlanId(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm"
                >
                  <option value="">No plan</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={newSubStatus}
                  onChange={(e) => setNewSubStatus(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm"
                >
                  <option value="active">active</option>
                  <option value="trialing">trialing</option>
                  <option value="past_due">past_due</option>
                  <option value="canceled">canceled</option>
                </select>
                <Input
                  placeholder="Amount cents"
                  value={newSubAmount}
                  onChange={(e) => setNewSubAmount(e.target.value)}
                />
              </div>
              <Button onClick={upsertSubscription} disabled={loading}>
                Save Subscription
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
            <h2 className="font-semibold">Recent Subscriptions</h2>
            <div className="space-y-2 max-h-56 overflow-auto">
              {billingSubscriptions.slice(0, 20).map((s) => (
                <div key={s.id} className="rounded-md border border-white/10 p-2">
                  <p className="text-sm font-medium">
                    {s.externalSubscriptionId} · {s.status} · ${(s.amountCents / 100).toFixed(2)}/{s.billingInterval}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.ownerType}:{s.ownerId} · plan {s.planId || "none"}
                  </p>
                </div>
              ))}
              {billingSubscriptions.length === 0 && (
                <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
              )}
            </div>
          </div>

          {selectedDeveloper && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
                <h3 className="font-semibold">Developer Detail</h3>
                <p className="text-sm">{selectedDeveloper.name}</p>
                <p className="text-sm text-muted-foreground">{selectedDeveloper.email}</p>
                <p className="text-xs text-muted-foreground break-all">ID: {selectedDeveloper.id}</p>
                <p className="text-xs text-muted-foreground">Created: {fmt(selectedDeveloper.createdAt)}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3 lg:col-span-2">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New key label (optional)"
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                  />
                  <Button onClick={createKey} disabled={loading}>Issue Key</Button>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={assignPlanId}
                    onChange={(e) => setAssignPlanId(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm"
                  >
                    <option value="">Select plan</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>
                    ))}
                  </select>
                  <Button variant="outline" onClick={assignPlanToDeveloper} disabled={loading || !assignPlanId}>
                    Assign Plan
                  </Button>
                </div>
                {selectedDeveloperPlan && (
                  <p className="text-xs text-muted-foreground">
                    Current plan: {selectedDeveloperPlan.name} ({selectedDeveloperPlan.slug}) since {fmt(selectedDeveloperPlan.startsAt)}
                  </p>
                )}
                <div className="space-y-2 max-h-56 overflow-auto">
                  {keys.map((k) => (
                    <div key={k.keyId} className="rounded-lg border border-white/10 p-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{k.key}</p>
                        <p className="text-xs text-muted-foreground">
                          {k.label || "default"} · {k.scopes} · {k.active ? "active" : "revoked"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Last used: {k.lastUsedAt ? fmt(k.lastUsedAt) : "never"}
                        </p>
                      </div>
                      {k.active && (
                        <Button variant="outline" size="sm" onClick={() => revokeKey(k.keyId)} disabled={loading}>
                          Revoke
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-5 lg:col-span-2 space-y-2">
                <h3 className="font-semibold">Usage (30d)</h3>
                <p className="text-sm">Total calls: {usage?.totalCalls ?? 0}</p>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {(usage?.byEndpoint || []).slice(0, 10).map((r, i) => (
                    <p key={`${r.method}-${r.path}-${i}`} className="text-xs text-muted-foreground">
                      {r.method} {r.path} · {r.calls}
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-2">
                <h3 className="font-semibold">Webhooks</h3>
                <p className="text-sm">Configured: {webhooks.length}</p>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {webhooks.slice(0, 8).map((w) => (
                    <p key={w.id} className="text-xs text-muted-foreground truncate">
                      {w.active ? "active" : "inactive"} · {w.url}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-2">
            <h3 className="font-semibold">Recent Audit Events</h3>
            <div className="space-y-2 max-h-64 overflow-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="rounded-md border border-white/10 p-2 text-xs">
                  <p className="text-muted-foreground">
                    {fmt(log.createdAt)} · {log.actorType}:{log.actorId}
                  </p>
                  <p>{log.action} → {log.targetType}:{log.targetId}</p>
                </div>
              ))}
              {auditLogs.length === 0 && <p className="text-sm text-muted-foreground">No audit events yet.</p>}
            </div>
          </div>

          {overview && overview.topRateLimitedKeys24h.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-5">
              <h3 className="font-semibold mb-2">Top Rate-Limited Keys (24h)</h3>
              <div className="space-y-1">
                {overview.topRateLimitedKeys24h.map((k) => (
                  <p key={k.apiKeyMasked} className="text-xs text-muted-foreground">
                    {k.apiKeyMasked} · {k.hits} hits
                  </p>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
