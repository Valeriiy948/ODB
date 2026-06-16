-- 004_whale_transactions.sql
-- Whale Alert: зберігання великих крипто-транзакцій ($500k+)
-- Виконати у Supabase SQL Editor → New query → Run

CREATE TABLE IF NOT EXISTS whale_transactions (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  whale_alert_id  TEXT    UNIQUE NOT NULL,          -- Whale Alert внутрішній ID
  blockchain      TEXT    NOT NULL,                  -- ethereum, bitcoin, tron, …
  symbol          TEXT    NOT NULL,                  -- ETH, BTC, USDT, …
  amount          NUMERIC(30, 8) NOT NULL,           -- кількість токенів
  amount_usd      NUMERIC(20, 2) NOT NULL,           -- USD-еквівалент
  tx_type         TEXT    NOT NULL DEFAULT 'transfer', -- transfer, mint, burn, lock, unlock
  hash            TEXT,                              -- on-chain хеш транзакції
  from_address    TEXT,
  from_owner      TEXT,                              -- "Binance", "Coinbase" …
  from_owner_type TEXT,                              -- exchange, wallet, unknown
  to_address      TEXT,
  to_owner        TEXT,
  to_owner_type   TEXT,
  tx_timestamp    TIMESTAMPTZ NOT NULL,              -- коли транзакція відбулась
  telegram_sent   BOOLEAN     DEFAULT false,         -- чи надіслано Telegram alert
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_whale_tx_timestamp
  ON whale_transactions (tx_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_whale_tx_blockchain
  ON whale_transactions (blockchain);

CREATE INDEX IF NOT EXISTS idx_whale_tx_symbol
  ON whale_transactions (symbol);

CREATE INDEX IF NOT EXISTS idx_whale_tx_amount_usd
  ON whale_transactions (amount_usd DESC);

CREATE INDEX IF NOT EXISTS idx_whale_tx_from_owner
  ON whale_transactions (from_owner)
  WHERE from_owner IS NOT NULL AND from_owner != '';

CREATE INDEX IF NOT EXISTS idx_whale_tx_to_owner
  ON whale_transactions (to_owner)
  WHERE to_owner IS NOT NULL AND to_owner != '';

-- ── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE whale_transactions ENABLE ROW LEVEL SECURITY;

-- Авторизовані користувачі — тільки читання
CREATE POLICY "authenticated_read_whale"
  ON whale_transactions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Service role — повний доступ (cron job)
CREATE POLICY "service_role_all_whale"
  ON whale_transactions FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');
