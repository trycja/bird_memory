CREATE TABLE IF NOT EXISTS progress_events (
  id TEXT PRIMARY KEY,
  profile TEXT NOT NULL,
  kind TEXT NOT NULL,
  bird_id TEXT,
  occurred_at TEXT NOT NULL,
  settings TEXT
);

CREATE INDEX IF NOT EXISTS progress_events_profile ON progress_events(profile);
