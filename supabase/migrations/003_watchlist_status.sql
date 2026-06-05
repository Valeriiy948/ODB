-- Migration 003: Add status column to crypto_watchlist
-- Run in: Supabase Dashboard → SQL Editor
-- Date: 2026-06-05

-- Add status column (active / paused / archived)
ALTER TABLE crypto_watchlist
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived'));

-- Index for fast cron query: WHERE status = 'active'
CREATE INDEX IF NOT EXISTS idx_watchlist_status_active
  ON crypto_watchlist (status)
  WHERE status = 'active';

-- All existing rows → 'active'
UPDATE crypto_watchlist
  SET status = 'active'
  WHERE status IS NULL;

-- Verify
SELECT
  status,
  COUNT(*) AS cnt
FROM crypto_watchlist
GROUP BY status;
