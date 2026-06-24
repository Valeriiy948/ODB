'use client'

import { useEffect, useState, useCallback } from 'react'

interface Signal {
  id:          string
  market:      string
  signal_type: string
  emoji:       string
  severity:    'low' | 'medium' | 'high'
  change_pct:  number | null
  price:       number | null
  volume_usd:  number | null
  created_at:  string
}

interface Ticker { last_price: string; change: string }

const SEVERITY_COLOR: Record<string, string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#64748b',
}
const SIGNAL_LABEL: Record<string, string> = {
  volume_spike: 'Стрибок обсягу',
  price_move:   'Рух ціни',
  uah_anomaly:  'UAH аномалія',
  uah_premium:  'UAH Премія',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m    = Math.floor(diff / 60_000)
  if (m < 1)   return 'щойно'
  if (m < 60)  return `${m} хв тому`
  const h    = Math.floor(m / 60)
  if (h < 24)  return `${h} год тому`
  return `${Math.floor(h / 24)} дн тому`
}

export default function PublicSignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [tickers, setTickers] = useState<Record<string, Ticker>>({})
  const [premium, setPremium] = useState<number | null>(null)
  const [nbu,     setNbu]     = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [sigRes, tickRes] = await Promise.allSettled([
      fetch('/api/public/signals'),
      fetch('/api/whitebit-intel/tickers'),
    ])
    if (sigRes.status  === 'fulfilled' && sigRes.value.ok)  setSignals(await sigRes.value.json())
    if (tickRes.status === 'fulfilled' && tickRes.value.ok) {
      const t: Record<string, Ticker> = await tickRes.value.json()
      setTickers(t)

      // UAH Premium через серверний проксі (НБУ CORS fix)
      try {
        const nbuRes  = await fetch('/api/whitebit-intel/nbu-rate')
        const nbuData = await nbuRes.json() as { rate: number }
        const rate    = nbuData?.rate
        if (rate && t['BTC_USDT'] && t['BTC_UAH']) {
          const fair = parseFloat(t['BTC_USDT'].last_price) * rate
          setPremium(((parseFloat(t['BTC_UAH'].last_price) / fair) - 1) * 100)
          setNbu(rate)
        }
      } catch {}
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Ключові ціни для шапки
  const btc = tickers['BTC_USDT']
  const eth = tickers['ETH_USDT']
  const sol = tickers['SOL_USDT']
  const btcUah = tickers['BTC_UAH']

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Шапка */}
      <header style={{ borderBottom: '1px solid #1e293b', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            📊
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>WhiteBit Intelligence</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Ринкові сигнали · Ukraine</div>
          </div>
        </div>
        <a href="https://t.me/odb_signals" target="_blank" rel="noopener noreferrer"
          style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
          📬 Підписатись
        </a>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>

        {/* UAH Premium — hero */}
        {premium !== null && (
          <div style={{
            background:   premium > 2 ? 'rgba(239,68,68,.08)'  : premium < -1 ? 'rgba(34,197,94,.08)' : 'rgba(245,158,11,.08)',
            border:       `1px solid ${premium > 2 ? 'rgba(239,68,68,.3)' : premium < -1 ? 'rgba(34,197,94,.3)' : 'rgba(245,158,11,.3)'}`,
            borderRadius: 16,
            padding:      '24px 28px',
            marginBottom: 24,
            display:      'flex',
            alignItems:   'center',
            gap:          24,
            flexWrap:     'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: 6 }}>
                💰 UAH Премія · Унікальний індикатор
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                Скільки українці переплачують за BTC відносно офіційного курсу НБУ
              </div>
              {nbu && <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>Курс НБУ: {nbu.toFixed(2)} ₴/USD</div>}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 42, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1,
                            color: premium > 2 ? '#ef4444' : premium < -1 ? '#22c55e' : '#f59e0b' }}>
                {premium >= 0 ? '+' : ''}{premium.toFixed(2)}%
              </div>
              <div style={{ fontSize: 12, marginTop: 4,
                            color: premium > 3 ? '#ef4444' : premium < -1 ? '#22c55e' : '#f59e0b' }}>
                {premium > 3 ? '🔴 ринок перегрітий' : premium > 1 ? '🟡 підвищений попит' : premium < -1 ? '🟢 арбітраж' : '✅ норма'}
              </div>
            </div>
          </div>
        )}

        {/* Ціни */}
        {!loading && (btc || eth || sol) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 24 }}>
            {[
              { label: 'BTC', t: btc, usd: true },
              { label: 'ETH', t: eth, usd: true },
              { label: 'SOL', t: sol, usd: true },
              { label: 'BTC/UAH', t: btcUah, usd: false },
            ].map(({ label, t, usd }) => {
              if (!t) return null
              const chg = parseFloat(t.change)
              return (
                <div key={label} style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>
                    {usd
                      ? `$${parseFloat(t.last_price).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                      : `${parseFloat(t.last_price).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴`}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: chg >= 0 ? '#22c55e' : '#ef4444' }}>
                    {chg >= 0 ? '+' : ''}{chg.toFixed(2)}% 24h
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Сигнали */}
        <div style={{ marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569' }}>
          Останні сигнали ({signals.length})
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>Завантаження…</div>
        ) : signals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#475569' }}>
            <div style={{ fontSize: 40 }}>📡</div>
            <div style={{ marginTop: 12 }}>Сигналів поки немає</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signals.map(sig => {
              const color = SEVERITY_COLOR[sig.severity] || SEVERITY_COLOR.medium
              const isUAH = sig.market.endsWith('_UAH')
              return (
                <div key={sig.id} style={{
                  background: '#111827', border: '1px solid #1e293b',
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 12, padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{sig.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>{sig.market}</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, fontWeight: 700,
                                     background: `${color}20`, color }}>
                        {sig.severity.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999,
                                     background: '#1e293b', color: '#64748b' }}>
                        {SIGNAL_LABEL[sig.signal_type] || sig.signal_type}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                      {sig.change_pct !== null && (
                        <span style={{ fontWeight: 600, color: sig.change_pct >= 0 ? '#22c55e' : '#ef4444' }}>
                          {sig.change_pct >= 0 ? '+' : ''}{sig.change_pct.toFixed(2)}%
                        </span>
                      )}
                      {sig.volume_usd && (
                        <span>Vol: ${(sig.volume_usd / 1_000_000).toFixed(2)}M</span>
                      )}
                      <span>{timeAgo(sig.created_at)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* CTA */}
        <div style={{
          marginTop: 32, background: 'linear-gradient(135deg, rgba(245,158,11,.1), rgba(217,119,6,.05))',
          border: '1px solid rgba(245,158,11,.25)', borderRadius: 16, padding: '28px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔔</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Отримуйте сигнали першими</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20, lineHeight: 1.6 }}>
            Реал-тайм Telegram-сповіщення: стрибки обсягу, різкі рухи ціни,<br />
            UAH Premium аномалії — ексклюзивно по WhiteBit
          </div>
          <a href="https://t.me/odb_signals" target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                     color: '#000', padding: '12px 28px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                     textDecoration: 'none' }}>
            Приєднатись до каналу →
          </a>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 12 }}>
            Безкоштовний доступ · Сигнали 24/7 · WhiteBit Intelligence
          </div>
        </div>

      </main>
    </div>
  )
}
