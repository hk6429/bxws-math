CREATE TABLE IF NOT EXISTS weekly_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL,
  week TEXT NOT NULL,
  device_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  pct INTEGER NOT NULL,
  total_sec INTEGER NOT NULL,
  max_streak INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0,
  flag_reasons TEXT,
  submitted_at INTEGER NOT NULL,
  UNIQUE(room_code, week, device_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_lookup ON weekly_results(room_code, week);

CREATE TABLE IF NOT EXISTS arena_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL,
  season TEXT NOT NULL,
  strand_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  pct INTEGER NOT NULL,
  total_sec INTEGER NOT NULL,
  total_dmg INTEGER NOT NULL,
  max_combo INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0,
  flag_reasons TEXT,
  submitted_at INTEGER NOT NULL,
  UNIQUE(room_code, season, strand_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_arena_lookup ON arena_results(room_code, season, strand_id);

CREATE TABLE IF NOT EXISTS market_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL,
  season TEXT NOT NULL,
  seller_device TEXT NOT NULL,
  seller_name TEXT NOT NULL,
  spirit_n INTEGER NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  buyer_device TEXT,
  buyer_name TEXT,
  payout_claimed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  sold_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_market_open ON market_listings(room_code, season, status);
CREATE INDEX IF NOT EXISTS idx_market_seller ON market_listings(seller_device, status);
