-- Migration 004: Investigation Sessions
-- Запустити в Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS investigations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  status      text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'archived')),
  person_ids  uuid[]      NOT NULL DEFAULT '{}',
  notes       text        NOT NULL DEFAULT '',
  tags        text[]      NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investigations_status_idx     ON investigations (status);
CREATE INDEX IF NOT EXISTS investigations_updated_at_idx ON investigations (updated_at DESC);
CREATE INDEX IF NOT EXISTS investigations_person_ids_idx ON investigations USING GIN (person_ids);
