-- WhiteBit Intelligence: ринкові знімки + сигнали
CREATE TABLE IF NOT EXISTS whitebit_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  market       text        NOT NULL,
  last_price   numeric     NOT NULL,
  base_volume  numeric     NOT NULL,
  quote_volume numeric     NOT NULL,
  change_pct   numeric     NOT NULL,
  captured_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whitebit_snapshots_market_time
  ON whitebit_snapshots (market, captured_at DESC);

-- Сигнали (що відправили в Telegram)
CREATE TABLE IF NOT EXISTS whitebit_signals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  market      text        NOT NULL,
  signal_type text        NOT NULL,  -- 'volume_spike' | 'price_move' | 'uah_anomaly' | 'arbitrage'
  emoji       text        NOT NULL DEFAULT '📊',
  message     text        NOT NULL,
  severity    text        NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high'
  price       numeric,
  change_pct  numeric,
  volume_usd  numeric,
  sent_to_tg  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whitebit_signals_created
  ON whitebit_signals (created_at DESC);
CREATE INDEX IF NOT EXISTS whitebit_signals_type
  ON whitebit_signals (signal_type, created_at DESC);
