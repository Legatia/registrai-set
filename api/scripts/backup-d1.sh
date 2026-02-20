#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${D1_DB_NAME:-kya-prod}"
BACKUP_BASE="${D1_BACKUP_DIR:-$ROOT_DIR/backups/d1}"
RETENTION_DAYS="${D1_BACKUP_RETENTION_DAYS:-14}"
USE_REMOTE="${D1_REMOTE:-1}"

TS_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
DEST_DIR="$BACKUP_BASE/$TS_UTC"
mkdir -p "$DEST_DIR"

if [[ "$USE_REMOTE" == "1" ]]; then
  LOCATION_FLAG="--remote"
  LOCATION_NAME="remote"
else
  LOCATION_FLAG="--local"
  LOCATION_NAME="local"
fi

export_one() {
  local output="$1"
  shift
  npx wrangler d1 export "$DB_NAME" $LOCATION_FLAG --output "$output" "$@"
}

echo "[backup] database=$DB_NAME location=$LOCATION_NAME"
echo "[backup] writing to $DEST_DIR"

# Full database export (schema + data)
export_one "$DEST_DIR/full.sql"

# Critical table exports for quick partial restores / audits
CRITICAL_TABLES=(
  developers
  api_keys
  api_usage
  organizations
  organization_members
  plans
  developer_plan_assignments
  subscriptions
  billing_events
  audit_logs
  webhooks
  webhook_deliveries
)

for table in "${CRITICAL_TABLES[@]}"; do
  export_one "$DEST_DIR/table_${table}.sql" --table "$table"
done

cat > "$DEST_DIR/manifest.txt" <<MANIFEST
created_at_utc=$TS_UTC
database=$DB_NAME
location=$LOCATION_NAME
retention_days=$RETENTION_DAYS
files=$(ls -1 "$DEST_DIR" | wc -l | tr -d ' ')
MANIFEST

# Retention cleanup
if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  find "$BACKUP_BASE" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
fi

echo "[backup] complete"
echo "[backup] latest=$DEST_DIR"
