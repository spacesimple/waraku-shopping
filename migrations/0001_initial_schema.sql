-- ============================================================
-- 不動産チラシ生成ツール D1 スキーマ
-- Cloudflare D1 (SQLite互換)
-- ============================================================

-- ユーザー（会社情報）
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,           -- UUID
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,              -- bcryptハッシュ
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 会社情報
CREATE TABLE IF NOT EXISTS companies (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,             -- 会社名
  tel          TEXT,
  email        TEXT,
  address      TEXT,
  logo_key     TEXT,                      -- R2のキー
  license_no   TEXT,                      -- 宅建業者番号
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 物件情報
CREATE TABLE IF NOT EXISTS properties (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  -- 基本情報
  name            TEXT NOT NULL,          -- 物件名
  catch_copy      TEXT,                   -- キャッチコピー
  price           INTEGER,                -- 価格（万円）
  price_unit      TEXT DEFAULT '万円',
  layout          TEXT,                   -- 間取り (4LDK等)
  area            REAL,                   -- 専有面積
  address         TEXT,                   -- 所在地
  station         TEXT,                   -- 最寄り駅
  walk_minutes    INTEGER,                -- 徒歩分
  -- 詳情
  built_year      TEXT,                   -- 築年月
  floors          TEXT,                   -- 階数
  structure       TEXT,                   -- 構造
  land_area       REAL,                   -- 土地面積
  parking         TEXT,                   -- 駐車場
  balcony_area    REAL,                   -- バルコニー面積
  building_features TEXT,                -- 建物の特徴
  surrounding     TEXT,                   -- 周辺環境
  interior        TEXT,                   -- 室内の特徴
  -- 設備（JSON配列）
  facilities      TEXT DEFAULT '[]',
  -- 画像（R2キー, JSON配列）
  images          TEXT DEFAULT '[]',
  status          TEXT DEFAULT 'active',  -- active / sold
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- セッション
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_properties_user ON properties(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);
