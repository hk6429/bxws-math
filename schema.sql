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
