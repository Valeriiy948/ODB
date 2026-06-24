-- ═══════════════════════════════════════════════════════════════════════
-- 006_crime_reports.sql — Довідки по злочинах (Crime Reports module)
-- ═══════════════════════════════════════════════════════════════════════

-- ── Основна таблиця ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crime_reports (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text        NOT NULL,
  erdr_number       varchar(60),                    -- номер ЄРДР
  location          text,                           -- місце вчинення
  incident_date     date,                           -- дата події
  author_id         uuid        REFERENCES auth.users(id) NOT NULL,
  file_url          text,                           -- шлях у Supabase Storage
  file_name         text,
  file_type         text,                           -- pdf | docx | xlsx
  file_size_kb      int,
  extracted_text    text,                           -- повний текст для FTS
  summary           text,                           -- AI-резюме
  entities          jsonb       NOT NULL DEFAULT    -- NER результати
    '{"names":[],"phones":[],"ipn":[],"crypto":[],"vehicles":[]}',
  crypto_risk_score int         NOT NULL DEFAULT 0, -- 0-100
  watchlist_hits    jsonb       NOT NULL DEFAULT '[]', -- збіги з watchlist
  tags              text[]      DEFAULT '{}',
  status            text        NOT NULL DEFAULT 'active',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── Повнотекстовий пошук (FTS) ───────────────────────────────────────────
ALTER TABLE crime_reports ADD COLUMN IF NOT EXISTS
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(erdr_number, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(location, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(extracted_text, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS crime_reports_fts_idx    ON crime_reports USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS crime_reports_author_idx ON crime_reports(author_id);
CREATE INDEX IF NOT EXISTS crime_reports_created_idx ON crime_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS crime_reports_entities_idx ON crime_reports USING GIN(entities);
CREATE INDEX IF NOT EXISTS crime_reports_risk_idx   ON crime_reports(crypto_risk_score DESC);

-- ── Доступи до довідок ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_shares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid REFERENCES crime_reports(id) ON DELETE CASCADE NOT NULL,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  permission_type text NOT NULL DEFAULT 'read',  -- read | write
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_id, user_id)
);

-- ── Watchlist — особи та об'єкти на контролі ────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,  -- person | phone | crypto | vehicle | ipn
  value       text NOT NULL,
  label       text,           -- зрозуміла назва/ім'я
  priority    text NOT NULL DEFAULT 'medium', -- low | medium | high | critical
  notes       text,
  added_by    uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_type, value)
);

CREATE INDEX IF NOT EXISTS watchlist_value_idx ON watchlist(lower(value));
CREATE INDEX IF NOT EXISTS watchlist_type_idx  ON watchlist(entity_type);

-- ── RLS (Row Level Security) ─────────────────────────────────────────────
ALTER TABLE crime_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_shares  ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist      ENABLE ROW LEVEL SECURITY;

-- crime_reports: автор бачить свої + ті де є запис у report_shares
DROP POLICY IF EXISTS crime_reports_author ON crime_reports;
CREATE POLICY crime_reports_author ON crime_reports
  FOR ALL USING (auth.uid() = author_id);

DROP POLICY IF EXISTS crime_reports_shared ON crime_reports;
CREATE POLICY crime_reports_shared ON crime_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM report_shares rs
      WHERE rs.report_id = id AND rs.user_id = auth.uid()
    )
  );

-- report_shares: лише автор управляє доступами до своїх довідок
DROP POLICY IF EXISTS report_shares_policy ON report_shares;
CREATE POLICY report_shares_policy ON report_shares
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM crime_reports cr
      WHERE cr.id = report_id AND cr.author_id = auth.uid()
    )
  );

-- watchlist: всі авторизовані читають, пишуть — хто додав
DROP POLICY IF EXISTS watchlist_read  ON watchlist;
DROP POLICY IF EXISTS watchlist_write ON watchlist;
CREATE POLICY watchlist_read  ON watchlist FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY watchlist_insert ON watchlist FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY watchlist_delete ON watchlist FOR DELETE USING (added_by = auth.uid());

-- ── Storage bucket (виконай в Supabase Dashboard → Storage) ─────────────
-- Name: crime-reports  |  Public: NO  |  Max file size: 50MB
-- Allowed types: application/pdf, application/vnd.openxmlformats...
