-- Migration: 003_crypto_wallets.sql
-- Web3 Forensics Module — таблиця для зберігання крипто-гаманців осіб

CREATE TYPE network_type AS ENUM ('ERC-20','TRC-20','BTC','SOL');

CREATE TABLE crypto_wallets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  wallet_address   TEXT NOT NULL,
  network          network_type NOT NULL,
  balance_usd      NUMERIC(18,2),
  risk_score       INTEGER CHECK (risk_score BETWEEN 0 AND 100),
  ofac_hit         BOOLEAN NOT NULL DEFAULT false,
  risk_labels      JSONB DEFAULT '[]',
  last_checked_at  TIMESTAMPTZ,
  raw_data         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(person_id, wallet_address)
);

CREATE INDEX idx_wallets_person  ON crypto_wallets(person_id);
CREATE INDEX idx_wallets_address ON crypto_wallets(wallet_address);
CREATE INDEX idx_wallets_ofac    ON crypto_wallets(ofac_hit) WHERE ofac_hit = true;
CREATE INDEX idx_wallets_risk    ON crypto_wallets(risk_score DESC);

ALTER TABLE crypto_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_only" ON crypto_wallets
  FOR ALL USING (auth.role() = 'authenticated');
