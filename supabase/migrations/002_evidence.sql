-- ═══════════════════════════════════════════════════════════════
-- EVIDENCE: докази (фото, відео, документи)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS evidence (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id      UUID REFERENCES persons(id) ON DELETE CASCADE,
  incident_id    UUID REFERENCES incidents(id) ON DELETE CASCADE,

  -- Тип файлу
  ev_type        TEXT NOT NULL DEFAULT 'document',
  -- 'photo' | 'video' | 'document' | 'audio' | 'screenshot'

  -- Файл
  filename       TEXT NOT NULL,           -- ім'я у storage (унікальне)
  original_name  TEXT,                    -- оригінальна назва
  file_url       TEXT NOT NULL,           -- публічний URL
  file_size      BIGINT,                  -- розмір у байтах
  mime_type      TEXT,                    -- image/jpeg, application/pdf, etc.

  -- Метадані
  description    TEXT,                    -- опис / підпис
  source         TEXT DEFAULT 'manual',   -- 'manual' | 'telegram' | 'field' | 'confiscated'
  date_captured  DATE,                    -- дата зйомки / отримання
  location       TEXT,                    -- місце

  -- Безпека
  is_classified  BOOLEAN DEFAULT false,   -- обмежений доступ
  hash_sha256    TEXT,                    -- для дедублікації

  -- Метадані файлу (EXIF тощо)
  metadata       JSONB DEFAULT '{}',

  created_by     UUID,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Індекси
CREATE INDEX IF NOT EXISTS idx_evidence_person    ON evidence(person_id);
CREATE INDEX IF NOT EXISTS idx_evidence_incident  ON evidence(incident_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type      ON evidence(ev_type);
CREATE INDEX IF NOT EXISTS idx_evidence_created   ON evidence(created_at DESC);

-- Тригер updated_at
CREATE OR REPLACE FUNCTION update_evidence_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_updated_at
  BEFORE UPDATE ON evidence
  FOR EACH ROW EXECUTE FUNCTION update_evidence_timestamp();

-- ═══════════════════════════════════════════════════════════════
-- RLS (Row Level Security) — всі авторизовані бачать все
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence_select" ON evidence FOR SELECT USING (true);
CREATE POLICY "evidence_insert" ON evidence FOR INSERT WITH CHECK (true);
CREATE POLICY "evidence_update" ON evidence FOR UPDATE USING (true);
CREATE POLICY "evidence_delete" ON evidence FOR DELETE USING (true);

-- ═══════════════════════════════════════════════════════════════
-- STORAGE BUCKET: evidence
-- Виконай це в Supabase Dashboard → Storage → New Bucket
-- Або через API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', true);
-- ═══════════════════════════════════════════════════════════════
