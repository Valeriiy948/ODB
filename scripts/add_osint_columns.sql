-- ═══════════════════════════════════════════════════════════════════
-- ODB Platform — розширені OSINT колонки (Phase 2)
-- Виконати в Supabase SQL Editor: https://supabase.com/dashboard
-- ═══════════════════════════════════════════════════════════════════

-- Telegram витоки (масив сесій пошуку)
ALTER TABLE persons ADD COLUMN IF NOT EXISTS
  telegram_raw JSONB DEFAULT '[]';

-- AI-аналіз (Claude)
ALTER TABLE persons ADD COLUMN IF NOT EXISTS
  ai_profile TEXT;

-- Threat Score (0-100)
ALTER TABLE persons ADD COLUMN IF NOT EXISTS
  threat_score INTEGER DEFAULT 0;

-- Час останнього повного OSINT
ALTER TABLE persons ADD COLUMN IF NOT EXISTS
  last_full_osint TIMESTAMPTZ;

-- VK/соцмережі профілі (масив)
ALTER TABLE persons ADD COLUMN IF NOT EXISTS
  social_profiles JSONB DEFAULT '[]';

-- Транспортні засоби
ALTER TABLE persons ADD COLUMN IF NOT EXISTS
  vehicles JSONB DEFAULT '[]';

-- Фото-галерея (face search results)
ALTER TABLE persons ADD COLUMN IF NOT EXISTS
  person_photos JSONB DEFAULT '[]';

-- Бізнес-зв'язки (ЄДР, OpenDataBot)
ALTER TABLE persons ADD COLUMN IF NOT EXISTS
  business_connections JSONB DEFAULT '[]';

-- Громадянство та регіон
ALTER TABLE persons ADD COLUMN IF NOT EXISTS
  nationality TEXT;

ALTER TABLE persons ADD COLUMN IF NOT EXISTS
  region TEXT;

ALTER TABLE persons ADD COLUMN IF NOT EXISTS
  birth_place TEXT;

-- Індекси для швидкого пошуку по JSONB
CREATE INDEX IF NOT EXISTS idx_persons_telegram_raw_gin
  ON persons USING GIN (telegram_raw);

CREATE INDEX IF NOT EXISTS idx_persons_social_profiles_gin
  ON persons USING GIN (social_profiles);

CREATE INDEX IF NOT EXISTS idx_persons_threat_score
  ON persons (threat_score DESC NULLS LAST);

-- ═══════════════════════════════════════════════════════════════════
-- Таблиця черги OSINT (для batch processing)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS osint_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | error
  priority    INTEGER NOT NULL DEFAULT 5,       -- 1=high, 10=low
  modules     TEXT[] DEFAULT '{}',             -- ['web','telegram','vk','ai']
  result      JSONB,
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_osint_queue_status_priority
  ON osint_queue (status, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_osint_queue_person_id
  ON osint_queue (person_id);

-- ═══════════════════════════════════════════════════════════════════
-- ПЕРЕВІРКА (виконати окремо після міграції)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'persons'
-- ORDER BY ordinal_position;
