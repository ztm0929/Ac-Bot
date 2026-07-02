CREATE TABLE IF NOT EXISTS platform_events (
  id TEXT PRIMARY KEY NOT NULL,
  platform TEXT NOT NULL,
  raw_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_events_platform_raw_event_id_unique
  ON platform_events (platform, raw_event_id);
