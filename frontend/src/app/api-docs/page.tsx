"use client";

type AuthType = "Public" | "X-API-Key" | "X-Admin-Key";

interface EndpointDoc {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth: AuthType;
  description: string;
}

interface Section {
  title: string;
  note?: string;
  endpoints: EndpointDoc[];
}

const API_BASE = "https://api.registrai.cc";

const sections: Section[] = [
  {
    title: "Core Public",
    note: "These are public reads plus registration helper writes.",
    endpoints: [
      { method: "GET", path: "/health", auth: "Public", description: "API health and basic counts." },
      { method: "GET", path: "/stats", auth: "Public", description: "Global ecosystem stats." },
      { method: "GET", path: "/agents", auth: "Public", description: "List agents with filters/pagination." },
      { method: "GET", path: "/agents/:id", auth: "Public", description: "Get full agent profile." },
      { method: "GET", path: "/agents/:id/reputation", auth: "Public", description: "Current reputation snapshot." },
      { method: "GET", path: "/agents/:id/reputation/history", auth: "Public", description: "Historical reputation snapshots." },
      { method: "GET", path: "/agents/:id/attestations", auth: "Public", description: "SATI attestations for an agent." },
      { method: "POST", path: "/agents/register/build", auth: "Public", description: "Build unsigned ERC-8004 register tx." },
      { method: "POST", path: "/agents/register/confirm", auth: "Public", description: "Record submitted registration tx hash." },
    ],
  },
  {
    title: "Feedback / Presence / Link",
    endpoints: [
      { method: "POST", path: "/agents/:id/feedback", auth: "X-API-Key", description: "Store feedback comment metadata." },
      { method: "GET", path: "/agents/:id/feedback", auth: "Public", description: "List feedback comments." },
      { method: "PATCH", path: "/agents/:id/feedback/:commentId/tx", auth: "X-API-Key", description: "Attach on-chain tx hash to comment." },
      { method: "POST", path: "/agents/:id/feedback/build", auth: "X-API-Key", description: "Build unsigned giveFeedback tx." },
      { method: "GET", path: "/agents/:id/feedback/chains", auth: "Public", description: "List chains where feedback can be sent." },
      { method: "POST", path: "/agents/:id/presence", auth: "X-API-Key", description: "Add verified presence address." },
      { method: "GET", path: "/agents/:id/presence", auth: "Public", description: "List presence claims." },
      { method: "DELETE", path: "/agents/:id/presence", auth: "X-API-Key", description: "Remove presence claim." },
      { method: "POST", path: "/agents/link", auth: "X-API-Key", description: "Link two agent wallets." },
      { method: "GET", path: "/agents/:id/links", auth: "Public", description: "Get link info for an agent." },
      { method: "DELETE", path: "/agents/:id/links", auth: "X-API-Key", description: "Unlink linked wallets." },
    ],
  },
  {
    title: "Developer Self-Service",
    note: "Requires a valid developer key in `X-API-Key`.",
    endpoints: [
      { method: "GET", path: "/me", auth: "X-API-Key", description: "Get current developer profile." },
      { method: "GET", path: "/me/usage", auth: "X-API-Key", description: "30-day usage summary for this developer." },
      { method: "GET", path: "/me/quota", auth: "X-API-Key", description: "Current quota, remaining, 429 stats, active plan." },
      { method: "GET", path: "/me/plan", auth: "X-API-Key", description: "Current effective plan and quota." },
      { method: "GET", path: "/me/billing", auth: "X-API-Key", description: "Current subscription + today usage counters." },
      { method: "GET", path: "/me/keys", auth: "X-API-Key", description: "List developer API keys." },
      { method: "POST", path: "/me/keys", auth: "X-API-Key", description: "Create additional API key." },
      { method: "POST", path: "/me/keys/rotate", auth: "X-API-Key", description: "Rotate currently-used API key." },
      { method: "DELETE", path: "/me/keys/:keyId", auth: "X-API-Key", description: "Revoke one API key." },
      { method: "GET", path: "/me/organizations", auth: "X-API-Key", description: "List organizations you belong to." },
      { method: "GET", path: "/me/organizations/:organizationId/usage", auth: "X-API-Key", description: "Org-level 30-day usage (member only)." },
    ],
  },
  {
    title: "Webhooks (Developer)",
    note: "Managed by developer key.",
    endpoints: [
      { method: "POST", path: "/webhooks", auth: "X-API-Key", description: "Create webhook subscription." },
      { method: "GET", path: "/webhooks", auth: "X-API-Key", description: "List your webhooks." },
      { method: "GET", path: "/webhooks/:id", auth: "X-API-Key", description: "Get one webhook." },
      { method: "PATCH", path: "/webhooks/:id", auth: "X-API-Key", description: "Update webhook URL/events/active." },
      { method: "DELETE", path: "/webhooks/:id", auth: "X-API-Key", description: "Delete webhook." },
      { method: "GET", path: "/webhooks/:id/deliveries", auth: "X-API-Key", description: "List webhook delivery attempts." },
    ],
  },
  {
    title: "Admin",
    note: "Requires `X-Admin-Key`.",
    endpoints: [
      { method: "GET", path: "/admin/overview", auth: "X-Admin-Key", description: "Operational overview metrics." },
      { method: "GET", path: "/admin/audit", auth: "X-Admin-Key", description: "Audit log stream." },
      { method: "GET", path: "/developers", auth: "X-Admin-Key", description: "List developers." },
      { method: "POST", path: "/developers", auth: "X-Admin-Key", description: "Create developer and issue initial key." },
      { method: "GET", path: "/developers/:id", auth: "X-Admin-Key", description: "Developer detail." },
      { method: "POST", path: "/developers/:id/keys", auth: "X-Admin-Key", description: "Issue key for developer." },
      { method: "GET", path: "/developers/:id/keys", auth: "X-Admin-Key", description: "List developer keys." },
      { method: "DELETE", path: "/developers/:id/keys/:key", auth: "X-Admin-Key", description: "Revoke developer key." },
      { method: "GET", path: "/developers/:id/usage", auth: "X-Admin-Key", description: "Developer 30-day usage." },
      { method: "GET", path: "/developers/:id/webhooks", auth: "X-Admin-Key", description: "Developer webhook list." },
      { method: "GET", path: "/organizations", auth: "X-Admin-Key", description: "List organizations." },
      { method: "POST", path: "/organizations", auth: "X-Admin-Key", description: "Create organization." },
      { method: "GET", path: "/organizations/:id/members", auth: "X-Admin-Key", description: "List organization members." },
      { method: "POST", path: "/organizations/:id/members", auth: "X-Admin-Key", description: "Upsert organization member role." },
      { method: "DELETE", path: "/organizations/:id/members/:developerId", auth: "X-Admin-Key", description: "Remove organization member." },
      { method: "GET", path: "/organizations/:id/usage", auth: "X-Admin-Key", description: "Organization 30-day usage." },
      { method: "GET", path: "/admin/plans", auth: "X-Admin-Key", description: "List plans." },
      { method: "POST", path: "/admin/plans", auth: "X-Admin-Key", description: "Create plan." },
      { method: "GET", path: "/admin/developers/:id/plan", auth: "X-Admin-Key", description: "Get active developer plan assignment." },
      { method: "POST", path: "/admin/developers/:id/plan", auth: "X-Admin-Key", description: "Assign plan to developer." },
      { method: "GET", path: "/admin/billing/overview", auth: "X-Admin-Key", description: "Billing KPIs (MRR/ARR etc)." },
      { method: "GET", path: "/admin/billing/subscriptions", auth: "X-Admin-Key", description: "List subscriptions." },
      { method: "POST", path: "/admin/billing/subscriptions/upsert", auth: "X-Admin-Key", description: "Create/update subscription record." },
      { method: "POST", path: "/admin/billing/events/ingest", auth: "X-Admin-Key", description: "Ingest external billing events." },
      { method: "GET", path: "/admin/billing/usage-export", auth: "X-Admin-Key", description: "Export usage metering (json/csv)." },
    ],
  },
];

function authClass(auth: AuthType): string {
  if (auth === "Public") return "text-emerald-300 border-emerald-500/40";
  if (auth === "X-Admin-Key") return "text-rose-300 border-rose-500/40";
  return "text-sky-300 border-sky-500/40";
}

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">API Reference</h1>
        <p className="text-sm text-muted-foreground">
          Exact endpoint map from current backend routes and auth middleware.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
        <h2 className="font-semibold">Quick Start</h2>
        <p className="text-xs text-muted-foreground">Base URL: <code>{API_BASE}</code></p>
        <pre className="overflow-x-auto rounded-md border border-white/10 bg-black/30 p-3 text-xs">
{`# Public read
curl "${API_BASE}/stats"

# Developer-auth write
curl -X POST "${API_BASE}/webhooks" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: kya_..." \\
  -d '{"url":"https://example.com/hook","events":["feedback.received"]}'

# Admin-auth call
curl "${API_BASE}/admin/overview" \\
  -H "X-Admin-Key: ..."`}
        </pre>
        <p className="text-xs text-muted-foreground">
          Note: Non-GET endpoints generally require `X-API-Key`, except registration build/confirm and admin routes.
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.title} className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-3">
          <div>
            <h2 className="font-semibold">{section.title}</h2>
            {section.note ? <p className="text-xs text-muted-foreground">{section.note}</p> : null}
          </div>

          <div className="space-y-2">
            {section.endpoints.map((ep) => (
              <div
                key={`${ep.method}-${ep.path}`}
                className="rounded-md border border-white/10 p-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded border border-white/20 px-2 py-0.5 text-xs font-semibold">{ep.method}</span>
                  <code className="text-xs">{ep.path}</code>
                  <span className={`rounded border px-2 py-0.5 text-[11px] ${authClass(ep.auth)}`}>{ep.auth}</span>
                </div>
                <p className="text-xs text-muted-foreground">{ep.description}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
