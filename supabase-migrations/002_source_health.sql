-- 002_source_health.sql
-- Persistent storage for circuit breaker state across Vercel lambda instances.
-- Run once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS source_health (
  source        TEXT        PRIMARY KEY,
  state         TEXT        NOT NULL DEFAULT 'closed'
                            CHECK (state IN ('closed', 'open', 'half_open')),
  failure_count INT         NOT NULL DEFAULT 0,
  last_failure  TIMESTAMPTZ,
  last_success  TIMESTAMPTZ,
  last_latency  INT,                  -- milliseconds
  open_until    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Let the API write health updates without full auth
ALTER TABLE source_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON source_health
  FOR ALL USING (true) WITH CHECK (true);

-- Useful index for admin dashboard queries
CREATE INDEX IF NOT EXISTS source_health_state_idx ON source_health (state);

-- Seed with known sources so the admin page shows them from day one
INSERT INTO source_health (source) VALUES
  ('odb'),
  ('telegram'),
  ('leakosint'),
  ('osintkit'),
  ('dehashed'),
  ('hibp'),
  ('leakcheck'),
  ('vps_telethon'),
  ('vps_registries'),
  ('vps_social'),
  ('vps_orchestrator'),
  ('nazk'),
  ('mvs'),
  ('myrotvorets'),
  ('erb'),
  ('shodan'),
  ('vk'),
  ('sanctions'),
  ('web')
ON CONFLICT (source) DO NOTHING;
