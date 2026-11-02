CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  review_url TEXT NOT NULL,
  link_kind TEXT NOT NULL DEFAULT 'review',
  place_id TEXT,
  pin_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'basic',
  pro_until INTEGER,
  mode TEXT NOT NULL DEFAULT 'direct',
  tagline TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  menu_url TEXT NOT NULL DEFAULT '',
  failed_pins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  is_trial INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  activation_code TEXT NOT NULL,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  business_id INTEGER REFERENCES businesses(id),
  label TEXT NOT NULL DEFAULT '',
  activated_at INTEGER,
  trial_used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_business ON cards(business_id);
CREATE INDEX IF NOT EXISTS cards_batch ON cards(batch_id);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_business_ts ON events(business_id, ts);
CREATE INDEX IF NOT EXISTS events_card ON events(card_id);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  card_id INTEGER REFERENCES cards(id),
  message TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_business ON feedback(business_id, created_at);
CREATE TABLE IF NOT EXISTS review_snapshots (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  review_count INTEGER NOT NULL,
  rating REAL,
  source TEXT NOT NULL,
  taken_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_business ON review_snapshots(business_id, taken_at);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  business_id INTEGER,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
