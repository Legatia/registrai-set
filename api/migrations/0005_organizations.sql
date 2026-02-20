-- Team and organization model
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  developer_id TEXT NOT NULL REFERENCES developers(id),
  role TEXT NOT NULL DEFAULT 'member', -- owner | admin | member
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (organization_id, developer_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_dev ON organization_members(developer_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_role ON organization_members(organization_id, role);
