CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','done','failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (sha256)
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON ingest_queue (status);

CREATE TABLE IF NOT EXISTS analyze_cache (
  sha256 TEXT PRIMARY KEY,
  analyze_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
