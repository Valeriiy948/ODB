-- ═══════════════════════════════════════════════════════════════
-- CONNECTIONS: зв'язки між особами
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS connections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_a     UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  person_b     UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  rel_type     TEXT NOT NULL DEFAULT 'unknown',
  -- командир | підлеглий | родич | однокласник | колега | знайомий | unknown
  direction    TEXT NOT NULL DEFAULT 'both',
  -- 'a_to_b' | 'b_to_a' | 'both'
  evidence_url TEXT,
  notes        TEXT,
  confidence   NUMERIC(3,2) DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  created_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT no_self_loop CHECK (person_a <> person_b)
);

CREATE INDEX IF NOT EXISTS idx_connections_person_a ON connections(person_a);
CREATE INDEX IF NOT EXISTS idx_connections_person_b ON connections(person_b);

-- ═══════════════════════════════════════════════════════════════
-- INCIDENTS: воєнні злочини та інциденти
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS incidents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  date         DATE,
  location     TEXT,
  latitude     NUMERIC(9,6),
  longitude    NUMERIC(9,6),
  inc_type     TEXT DEFAULT 'unknown',
  -- обстріл | катування | мародерство | вбивство | зґвалтування | депортація | інше
  description  TEXT,
  evidence_urls TEXT[],
  icc_article  TEXT,
  -- Наприклад: "Ст. 8(2)(a)(i) — вбивство"
  severity     TEXT DEFAULT 'medium',
  -- low | medium | high | critical
  status       TEXT DEFAULT 'reported',
  -- reported | verified | submitted | closed
  source_url   TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_date ON incidents(date DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(inc_type);

-- ═══════════════════════════════════════════════════════════════
-- INCIDENT_PERSONS: зв'язок особа ↔ інцидент
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS incident_persons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  person_id   UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  role        TEXT DEFAULT 'виконавець',
  -- виконавець | командир | організатор | свідок | жертва
  notes       TEXT,
  UNIQUE(incident_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_persons_person ON incident_persons(person_id);
CREATE INDEX IF NOT EXISTS idx_incident_persons_incident ON incident_persons(incident_id);
