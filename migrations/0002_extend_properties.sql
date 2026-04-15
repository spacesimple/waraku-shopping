-- ============================================================
-- 0002: propertiesテーブルに拡張フィールドを追加
-- data-rule.md に対応する追加カラム
-- SQLite では ADD COLUMN IF NOT EXISTS が使えないため
-- ============================================================

-- 賃貸条件フィールド
ALTER TABLE properties ADD COLUMN rent_yen INTEGER;
ALTER TABLE properties ADD COLUMN kanrihi INTEGER DEFAULT 0;
ALTER TABLE properties ADD COLUMN kyoeki INTEGER DEFAULT 0;
ALTER TABLE properties ADD COLUMN shikikin REAL;
ALTER TABLE properties ADD COLUMN reikin REAL;
ALTER TABLE properties ADD COLUMN freerent TEXT;
ALTER TABLE properties ADD COLUMN keiyaku TEXT;
ALTER TABLE properties ADD COLUMN genkyo TEXT;
ALTER TABLE properties ADD COLUMN nyukyobi TEXT;
ALTER TABLE properties ADD COLUMN pet TEXT;
ALTER TABLE properties ADD COLUMN gas_type TEXT;
ALTER TABLE properties ADD COLUMN internet TEXT;
ALTER TABLE properties ADD COLUMN osusume_points TEXT DEFAULT '[]';
ALTER TABLE properties ADD COLUMN bikou TEXT;

-- 初期費用フィールド
ALTER TABLE properties ADD COLUMN hoshokin INTEGER DEFAULT 0;
ALTER TABLE properties ADD COLUMN kasai INTEGER DEFAULT 0;
ALTER TABLE properties ADD COLUMN kagi INTEGER DEFAULT 0;
ALTER TABLE properties ADD COLUMN cleaning INTEGER DEFAULT 0;
ALTER TABLE properties ADD COLUMN total_shokihi INTEGER DEFAULT 0;
ALTER TABLE properties ADD COLUMN hoshosha TEXT;

-- AI抽出データ（JSON形式で保存）
ALTER TABLE properties ADD COLUMN extra_data TEXT DEFAULT '{}';
