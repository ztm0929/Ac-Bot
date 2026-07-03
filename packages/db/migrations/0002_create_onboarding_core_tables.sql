CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  bio TEXT,
  is_premium INTEGER NOT NULL DEFAULT 0,
  has_avatar INTEGER NOT NULL DEFAULT 0,
  raw_profile_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_accounts_platform_user_id_unique
  ON platform_accounts (platform, platform_user_id);

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY NOT NULL,
  platform TEXT NOT NULL,
  platform_resource_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'group',
  title TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS communities_platform_resource_id_unique
  ON communities (platform, platform_resource_id);

CREATE TABLE IF NOT EXISTS community_members (
  id TEXT PRIMARY KEY NOT NULL,
  community_id TEXT NOT NULL,
  platform_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'verification_pending',
  joined_at TEXT,
  probation_until TEXT,
  left_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS community_members_community_account_unique
  ON community_members (community_id, platform_account_id);

CREATE TABLE IF NOT EXISTS verification_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  community_id TEXT NOT NULL,
  platform_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  channel TEXT NOT NULL,
  prompt_key TEXT,
  answer_attempt_count INTEGER NOT NULL DEFAULT 0,
  timeout_at TEXT NOT NULL,
  completed_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS verification_sessions_one_pending_per_account_unique
  ON verification_sessions (community_id, platform_account_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS banned_users (
  id TEXT PRIMARY KEY NOT NULL,
  platform TEXT NOT NULL,
  platform_account_id TEXT NOT NULL,
  community_id TEXT,
  reason TEXT,
  banned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lifted_at TEXT,
  created_by_admin_platform_account_id TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS banned_users_active_global_account_unique
  ON banned_users (platform, platform_account_id)
  WHERE lifted_at IS NULL AND community_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS banned_users_active_community_account_unique
  ON banned_users (platform, platform_account_id, community_id)
  WHERE lifted_at IS NULL AND community_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY NOT NULL,
  platform TEXT NOT NULL,
  platform_account_id TEXT NOT NULL,
  display_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_platform_account_unique
  ON admin_users (platform, platform_account_id);

CREATE TABLE IF NOT EXISTS admin_actions (
  id TEXT PRIMARY KEY NOT NULL,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  community_id TEXT,
  target_platform_account_id TEXT,
  reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_type TEXT NOT NULL,
  actor_platform TEXT,
  actor_platform_account_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  community_id TEXT,
  platform TEXT,
  platform_account_id TEXT,
  reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
