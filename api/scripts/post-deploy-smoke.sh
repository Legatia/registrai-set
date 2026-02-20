#!/usr/bin/env bash
set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node is required"
  exit 1
fi

API_BASE="${API_BASE:-https://api.registrai.cc}"
ADMIN_KEY="${ADMIN_KEY:-}"

if [[ -z "$ADMIN_KEY" ]]; then
  echo "Set ADMIN_KEY in your shell before running."
  exit 1
fi

rnd="$(date +%s)"
name="Smoke Tester ${rnd}"
email="smoke-${rnd}@example.com"
webhook_url="https://example.com/webhook"

http_json() {
  local method="$1"
  local path="$2"
  local header_name="$3"
  local header_val="$4"
  local body="${5:-}"

  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "$API_BASE$path" \
      -H "Content-Type: application/json" \
      -H "$header_name: $header_val" \
      -d "$body"
  else
    curl -sS -X "$method" "$API_BASE$path" \
      -H "Content-Type: application/json" \
      -H "$header_name: $header_val"
  fi
}

echo "1) Admin overview"
overview="$(http_json GET /admin/overview X-Admin-Key "$ADMIN_KEY")"
node -e 'const d=JSON.parse(process.argv[1]); if(!d.totals){process.exit(1)}; console.log(`developers=${d.totals.developers}, activeKeys=${d.totals.activeApiKeys}`)' "$overview"

echo "2) Create developer"
create_body="$(printf '{"name":"%s","email":"%s"}' "$name" "$email")"
created="$(http_json POST /developers X-Admin-Key "$ADMIN_KEY" "$create_body")"
DEV_ID="$(node -e 'const d=JSON.parse(process.argv[1]); if(!d.id||!d.apiKey){process.exit(1)}; process.stdout.write(d.id)' "$created")"
DEV_KEY="$(node -e 'const d=JSON.parse(process.argv[1]); if(!d.id||!d.apiKey){process.exit(1)}; process.stdout.write(d.apiKey)' "$created")"
echo "created developer=$DEV_ID"

echo "3) Developer endpoints"
me="$(http_json GET /me X-API-Key "$DEV_KEY")"
node -e 'const d=JSON.parse(process.argv[1]); if(!d.id||!d.email){process.exit(1)}; console.log(`developer=${d.id}`)' "$me"

usage_before="$(http_json GET /me/usage X-API-Key "$DEV_KEY")"
usage_before_calls="$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.totalCalls||0))' "$usage_before")"

# generate a few authenticated reads
http_json GET /stats X-API-Key "$DEV_KEY" >/dev/null
http_json GET /stats X-API-Key "$DEV_KEY" >/dev/null

usage_after="$(http_json GET /me/usage X-API-Key "$DEV_KEY")"
usage_after_calls="$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.totalCalls||0))' "$usage_after")"
echo "usage calls: $usage_before_calls -> $usage_after_calls"

echo "4) Developer key management"
new_key_res="$(http_json POST /me/keys X-API-Key "$DEV_KEY" '{"label":"smoke-extra"}')"
EXTRA_KEY="$(node -e 'const d=JSON.parse(process.argv[1]); if(!d.key){process.exit(1)}; process.stdout.write(d.key)' "$new_key_res")"

keys="$(http_json GET /me/keys X-API-Key "$DEV_KEY")"
EXTRA_KEY_ID="$(node -e 'const d=JSON.parse(process.argv[1]); const k=d.keys.find((x)=>x.label==="smoke-extra"); if(!k){process.exit(1)}; process.stdout.write(k.keyId)' "$keys")"
http_json DELETE "/me/keys/$EXTRA_KEY_ID" X-API-Key "$DEV_KEY" >/dev/null

echo "5) Webhook create/delete"
wh_create="$(http_json POST /webhooks X-API-Key "$DEV_KEY" "{\"url\":\"$webhook_url\",\"events\":[\"feedback.received\"]}")"
WH_ID="$(node -e 'const d=JSON.parse(process.argv[1]); if(!d.id){process.exit(1)}; process.stdout.write(d.id)' "$wh_create")"
http_json DELETE "/webhooks/$WH_ID" X-API-Key "$DEV_KEY" >/dev/null

echo "6) Admin audit check"
org_name="Smoke Org ${rnd}"
org_slug="smoke-org-${rnd}"
org_create_body="$(printf '{"name":"%s","slug":"%s"}' "$org_name" "$org_slug")"
org_created="$(http_json POST /organizations X-Admin-Key "$ADMIN_KEY" "$org_create_body")"
ORG_ID="$(node -e 'const d=JSON.parse(process.argv[1]); if(!d.id){process.exit(1)}; process.stdout.write(d.id)' "$org_created")"
http_json POST "/organizations/$ORG_ID/members" X-Admin-Key "$ADMIN_KEY" "{\"developerId\":\"$DEV_ID\",\"role\":\"owner\"}" >/dev/null
org_usage="$(http_json GET "/organizations/$ORG_ID/usage" X-Admin-Key "$ADMIN_KEY")"
node -e 'const d=JSON.parse(process.argv[1]); if(typeof d.totalCalls!=="number"){process.exit(1)}; console.log(`org_total_calls=${d.totalCalls}`)' "$org_usage"
http_json DELETE "/organizations/$ORG_ID/members/$DEV_ID" X-Admin-Key "$ADMIN_KEY" >/dev/null

echo "7) Plan create/assign"
plan_slug="smoke-plan-${rnd}"
plan_name="Smoke Plan ${rnd}"
plan_body="$(printf '{"name":"%s","slug":"%s","priceCents":0,"billingInterval":"monthly","totalPerDay":15000,"writePerDay":3000,"feedbackSubmitPerDay":700}' "$plan_name" "$plan_slug")"
plan_created="$(http_json POST /admin/plans X-Admin-Key "$ADMIN_KEY" "$plan_body")"
PLAN_ID="$(node -e 'const d=JSON.parse(process.argv[1]); if(!d.id){process.exit(1)}; process.stdout.write(d.id)' "$plan_created")"
http_json POST "/admin/developers/$DEV_ID/plan" X-Admin-Key "$ADMIN_KEY" "{\"planId\":\"$PLAN_ID\"}" >/dev/null
quota_now="$(http_json GET /me/quota X-API-Key "$DEV_KEY")"
node -e 'const d=JSON.parse(process.argv[1]); if(!d.plan || !d.plan.slug){process.exit(1)}; console.log(`assigned_plan=${d.plan.slug}`)' "$quota_now"

echo "8) Billing upsert + usage export"
sub_ext_id="sub_smoke_${rnd}"
http_json POST /admin/billing/subscriptions/upsert X-Admin-Key "$ADMIN_KEY" "{\"provider\":\"manual\",\"externalSubscriptionId\":\"$sub_ext_id\",\"ownerType\":\"developer\",\"ownerId\":\"$DEV_ID\",\"planId\":\"$PLAN_ID\",\"status\":\"active\",\"amountCents\":9900,\"currency\":\"usd\",\"billingInterval\":\"monthly\"}" >/dev/null
me_billing="$(http_json GET /me/billing X-API-Key "$DEV_KEY")"
node -e 'const d=JSON.parse(process.argv[1]); if(!d.subscription || d.subscription.status!=="active"){process.exit(1)}; console.log(`billing_status=${d.subscription.status}`)' "$me_billing"
usage_export="$(http_json GET /admin/billing/usage-export?format=json X-Admin-Key "$ADMIN_KEY")"
node -e 'const d=JSON.parse(process.argv[1]); if(!Array.isArray(d.rows)){process.exit(1)}; console.log(`usage_rows=${d.rows.length}`)' "$usage_export"

echo "9) Admin audit check"
audit="$(http_json GET /admin/audit?limit=10 X-Admin-Key "$ADMIN_KEY")"
node -e 'const d=JSON.parse(process.argv[1]); if(!Array.isArray(d.logs)){process.exit(1)}; console.log(`audit_logs=${d.logs.length}`)' "$audit"

echo "Smoke test completed successfully."
