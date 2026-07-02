CREATE TABLE IF NOT EXISTS join_applications (
  id TEXT PRIMARY KEY NOT NULL,
  platform TEXT NOT NULL,
  platform_account_id TEXT NOT NULL,
  community_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'applied',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS join_applications_platform_application_id_unique
  ON join_applications (platform, application_id);

CREATE UNIQUE INDEX IF NOT EXISTS join_applications_one_active_per_account_unique
  ON join_applications (community_id, platform, platform_account_id)
  WHERE status IN ('applied', 'verification_pending', 'manual_review');
