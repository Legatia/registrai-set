# API + Dashboard Deployment Runbook

## 1) Apply database migrations

```bash
cd /Users/tobiasd/Desktop/8004/master-registry/api
npx wrangler d1 migrations apply kya-prod --remote
```

This release requires `0004_audit_logs.sql`, `0005_organizations.sql`, `0006_plans.sql`, `0007_billing.sql`, and `0008_registration_submissions.sql`.

## 2) Set production environment variables

### Required secrets

```bash
npx wrangler secret put ADMIN_KEY
```

### Optional vars

Set explicit CORS allowlist for production (comma-separated):

```bash
npx wrangler deploy --var CORS_ORIGINS:"https://registrai.cc,https://www.registrai.cc"
```

Or set `CORS_ORIGINS` in `wrangler.toml` under `[vars]`.

## 3) Deploy API

```bash
npm run deploy
```

## 4) Deploy frontend

Deploy your Next.js frontend as usual (Vercel/Cloudflare Pages). Ensure:

- `NEXT_PUBLIC_KYA_API_URL=https://api.registrai.cc`

## 5) Post-deploy smoke test (10 min)

```bash
cd /Users/tobiasd/Desktop/8004/master-registry/api
export ADMIN_KEY='YOUR_ADMIN_KEY'
npm run smoke:postdeploy
```

This verifies:

- Admin auth and overview
- Developer creation + key issuance
- Developer login (`/me`)
- Usage increment path (`/me/usage` after authenticated reads)
- Developer key create/revoke
- Webhook create/delete
- Admin audit feed

## 6) Edge protection baseline (Cloudflare dashboard)

Apply WAF/Rate Limiting rules at the zone edge in addition to app-level limits:

- Rule 1: Protect admin endpoints
  - Expression: `http.request.uri.path starts_with "/developers" or http.request.uri.path starts_with "/admin"`
  - Method: all
  - Threshold: `120 requests / 1 minute / IP`
  - Action: Managed Challenge

- Rule 2: Protect auth-sensitive developer self-service
  - Expression: `http.request.uri.path starts_with "/me/keys"`
  - Method: `POST` or `DELETE`
  - Threshold: `30 requests / 1 minute / IP`
  - Action: Block

- Rule 3: Bot score fallback
  - Expression: `cf.bot_management.score lt 10 and (http.request.uri.path starts_with "/admin" or http.request.uri.path starts_with "/developers")`
  - Action: Managed Challenge

## 7) Operational checks

After deploy, confirm from dashboard:

- Admin Dashboard: recent audit events are visible
- Developer Dashboard: quota/remaining/reset shows correctly
- Developer Dashboard: key rotation flow returns and stores new key

## 8) Daily D1 backups

Run a remote backup (full DB + critical tables):

```bash
cd /Users/tobiasd/Desktop/8004/master-registry/api
npm run db:backup
```

Outputs are written to:

- `/Users/tobiasd/Desktop/8004/master-registry/api/backups/d1/<timestamp>/`

Retention defaults to 14 days. Override with:

```bash
D1_BACKUP_RETENTION_DAYS=30 npm run db:backup
```

Local dev DB backup:

```bash
npm run db:backup:local
```

Optional daily cron at 02:00 local time:

```bash
crontab -e
```

Add:

```cron
0 2 * * * cd /Users/tobiasd/Desktop/8004/master-registry/api && npm run db:backup >> /Users/tobiasd/Desktop/8004/master-registry/api/backups/d1/backup.log 2>&1
```

## 9) Restore reference

Restore a backup `.sql` file to remote DB:

```bash
cd /Users/tobiasd/Desktop/8004/master-registry/api
npx wrangler d1 execute kya-prod --remote --file ./backups/d1/<timestamp>/full.sql
```

For table-scoped restore, use one of the `table_*.sql` files from the same backup folder.
