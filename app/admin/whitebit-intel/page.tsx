'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from '../../components/Sidebar'

interface Signal {
  id:          string
  market:      string
  signal_type: 'volume_spike' | 'price_move' | 'uah_anomaly' | 'uah_premium'
  emoji:       string
  message:     string
  severity:    'low' | 'medium' | 'high'
  price:       number | null
  change_pct:  number | null
  volume_usd:  number | null
  sent_to_tg:  boolean
  created_at:  string
}

interface ScanResult {
  ok:              boolean
  elapsed_ms:      number
  markets_scanned: number
  snapshots_saved: number
  signals_found:   number
  tg_sent:         number
  uah_premium:     number | null
  nbu_rate:        number | null
  movers?:         Array<{ market: string; change: number; price: number }>
  error?:          string
}

interface Ticker {
  last_price:   string
  quote_volume: string
  change:       string
  base_volume:  string
}

const USDT_MARKETS = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'BNB_USDT', 'XRP_USDT', 'ADA_USDT']
const UAH_MARKETS  = ['BTC_UAH', 'ETH_UAH', 'ADA_UAH', 'LTC_UAH', 'NEAR_UAH', 'SHIB_UAH']
const ALL_MARKETS  = [...USDT_MARKETS, ...UAH_MARKETS]

const SIGNAL_LABELS: Record<string, string> = {
  volume_spike: 'Стрибок обсягу',
  price_move:   'Рух ціни',
  uah_anomaly:  'UAH аномалія',
  uah_premium:  'UAH Премія',
}

const SEVERITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444', label: 'ВИСОКИЙ' },
  medium: { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b', label: 'СЕРЕДНІЙ' },
  low:    { bg: 'rgba(100,116,139,0.12)', text: '#64748b', label: 'НИЗЬКИЙ' },
}

function fmtPrice(price: number, isUAH: boolean) {
  return isUAH
    ? price.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ₴'
    : '$' + price.toLocaleString('en-US', { maximumFractionDigits: price < 1 ? 6 : 2 })
}

export default function WhiteBitIntelPage() {
  const [signals,   setSignals]   = useState<Signal[]>([])
  const [tickers,   setTickers]   = useState<Record<string, Ticker>>({})
  const [scanning,  setScanning]  = useState(false)
  const [lastScan,  setLastScan]  = useState<ScanResult | null>(null)
  const [autoScan,  setAutoScan]  = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [briefing,  setBriefing]  = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cdRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const AUTO_S  = 120

  const loadSignals = useCallback(async () => {
    const res = await fetch('/api/whitebit-intel/signals')
    if (res.ok) setSignals(await res.json())
  }, [])

  const loadTickers = useCallback(async () => {
    try {
      const [tickRes, nbuRes] = await Promise.allSettled([
        fetch('/api/whitebit-intel/tickers'),
        fetch('https://bank.gov.ua/NBUStatWeb/v1/statdirectory/exchange?valcode=usd&json'),
      ])
      if (tickRes.status === 'fulfilled' && tickRes.value.ok) {
        const data = await tickRes.value.json() as Record<string, Ticker>
        setTickers(data)
      }
      if (nbuRes.status === 'fulfilled' && nbuRes.value.ok) {
        const nbuData = await nbuRes.value.json() as Array<{ rate: number }>
        if (nbuData[0]?.rate) {
          setLastScan(prev => prev
            ? { ...prev, nbu_rate: nbuData[0].rate }
            : { ok: true, elapsed_ms: 0, markets_scanned: 0, snapshots_saved: 0, signals_found: 0, tg_sent: 0, uah_premium: null, nbu_rate: nbuData[0].rate }
          )
        }
      }
    } catch {}
  }, [])

  const sendBrief = useCallback(async () => {
    setBriefing('sending')
    try {
      const res = await fetch('/api/whitebit-intel/send-brief', { method: 'POST' })
      setBriefing(res.ok ? 'sent' : 'error')
      setTimeout(() => setBriefing('idle'), 4000)
    } catch { setBriefing('error'); setTimeout(() => setBriefing('idle'), 4000) }
  }, [])

  const runScan = useCallback(async () => {
    setScanning(true)
    try {
      const res  = await fetch('/api/whitebit-intel/scan')
      const data = await res.json() as ScanResult
      setLastScan(data)
      await Promise.all([loadSignals(), loadTickers()])
    } catch (e) {
      setLastScan({ ok: false, error: String(e), elapsed_ms: 0, markets_scanned: 0, snapshots_saved: 0, signals_found: 0, tg_sent: 0, uah_premium: null, nbu_rate: null })
    }
    setScanning(false)
  }, [loadSignals, loadTickers])

  useEffect(() => {
    if (autoScan) {
      setCountdown(AUTO_S)
      autoRef.current = setInterval(runScan, AUTO_S * 1000)
      cdRef.current   = setInterval(() => setCountdown(c => c > 0 ? c - 1 : AUTO_S), 1000)
    } else {
      if (autoRef.current) clearInterval(autoRef.current)
      if (cdRef.current)   clearInterval(cdRef.current)
      setCountdown(0)
    }
    return () => {
      if (autoRef.current) clearInterval(autoRef.current)
      if (cdRef.current)   clearInterval(cdRef.current)
    }
  }, [autoScan, runScan])

  useEffect(() => {
    Promise.all([loadSignals(), loadTickers()]).then(() => setLoading(false))
  }, [loadSignals, loadTickers])

  // ─── Дані для UAH Premium із тікерів або останнього скану ────────────────
  const premium     = lastScan?.uah_premium ?? null
  const nbuRate     = lastScan?.nbu_rate ?? null
  const btcUAH      = tickers['BTC_UAH']  ? parseFloat(tickers['BTC_UAH'].last_price)  : null
  const btcUSDT     = tickers['BTC_USDT'] ? parseFloat(tickers['BTC_USDT'].last_price) : null
  const livePremium = (btcUAH && btcUSDT && nbuRate)
    ? ((btcUAH / (btcUSDT * nbuRate)) - 1) * 100
    : premium

  const movers = (lastScan?.movers ?? []).slice().sort((a, b) => b.change - a.change)

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)', color: 'var(--odb-text)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{ background: 'var(--odb-surface)', borderBottom: '1px solid var(--odb-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 0 16px rgba(245,158,11,.3)' }}>
              <span className="text-xl">📊</span>
            </div>
            <div>
              <h1 className="text-base font-bold">WhiteBit Intelligence</h1>
              <p className="text-xs" style={{ color: 'var(--odb-text-dim)' }}>
                Моніторинг аномалій · {Object.keys(tickers).length} ринків активно
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {autoScan && countdown > 0 && (
              <span className="text-xs px-2 py-1 rounded-lg font-mono"
                style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b' }}>
                ⏱ {countdown}с
              </span>
            )}
            <button onClick={() => setAutoScan(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={autoScan
                ? { background: 'rgba(245,158,11,.15)', borderColor: '#f59e0b', color: '#f59e0b' }
                : { background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)', color: 'var(--odb-text-dim)' }}>
              {autoScan ? `⟳ Авто ${AUTO_S}с` : '⟳ Авто'}
            </button>
            <button onClick={sendBrief} disabled={briefing === 'sending'}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50"
              style={{
                background:  briefing === 'sent'  ? 'rgba(34,197,94,.15)'  : briefing === 'error' ? 'rgba(239,68,68,.1)' : 'var(--odb-surface-2)',
                borderColor: briefing === 'sent'  ? 'rgba(34,197,94,.4)'   : briefing === 'error' ? 'rgba(239,68,68,.3)' : 'var(--odb-border-soft)',
                color:       briefing === 'sent'  ? '#22c55e'               : briefing === 'error' ? '#ef4444'            : 'var(--odb-text-dim)',
              }}>
              {briefing === 'sending' ? '⏳ Надсилаємо…' : briefing === 'sent' ? '✅ Надіслано' : briefing === 'error' ? '❌ Помилка' : '🌅 Брифінг'}
            </button>
            <button onClick={runScan} disabled={scanning}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#000' }}>
              {scanning
                ? <><span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Скануємо…</>
                : '▶ Сканувати'}
            </button>
          </div>
        </header>

        <div className="flex-1 p-6 space-y-5 overflow-auto">

          {/* ── UAH Premium (УНІКАЛЬНА ФІЧА) ─────────────────────────────────── */}
          <div className="rounded-2xl p-5 border relative overflow-hidden"
            style={{
              background: 'var(--odb-surface)',
              borderColor: livePremium === null ? 'var(--odb-border-soft)'
                : Math.abs(livePremium) >= 3 ? 'rgba(239,68,68,.4)'
                : Math.abs(livePremium) >= 1.5 ? 'rgba(245,158,11,.4)'
                : 'rgba(34,197,94,.3)',
            }}>
            {/* фоновий градієнт */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: livePremium === null ? 'none'
                : livePremium > 0
                  ? 'radial-gradient(ellipse at top right, rgba(239,68,68,.06) 0%, transparent 70%)'
                  : 'radial-gradient(ellipse at top right, rgba(34,197,94,.06) 0%, transparent 70%)' }} />

            <div className="relative flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{livePremium === null ? '🔄' : livePremium > 0 ? '💰' : '💸'}</span>
                  <p className="text-xs font-bold tracking-widest uppercase"
                    style={{ color: 'var(--odb-text-faint)' }}>UAH Премія · Унікальний індикатор</p>
                </div>
                <p className="text-sm" style={{ color: 'var(--odb-text-dim)' }}>
                  Скільки українці переплачують (або недоплачують) за BTC відносно офіційного курсу НБУ
                </p>
              </div>

              {livePremium !== null && nbuRate ? (
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--odb-text-faint)' }}>Курс НБУ</p>
                    <p className="text-sm font-mono font-bold">{nbuRate.toFixed(2)} ₴</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--odb-text-faint)' }}>Справедлива BTC</p>
                    <p className="text-sm font-mono font-bold">
                      {btcUSDT && nbuRate ? (btcUSDT * nbuRate).toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ₴' : '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--odb-text-faint)' }}>WhiteBit BTC</p>
                    <p className="text-sm font-mono font-bold">
                      {btcUAH ? btcUAH.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ₴' : '—'}
                    </p>
                  </div>
                  <div className="text-center px-4 py-3 rounded-xl border"
                    style={{
                      background: livePremium > 2 ? 'rgba(239,68,68,.1)' : livePremium < -1 ? 'rgba(34,197,94,.1)' : 'rgba(245,158,11,.1)',
                      borderColor: livePremium > 2 ? 'rgba(239,68,68,.3)' : livePremium < -1 ? 'rgba(34,197,94,.3)' : 'rgba(245,158,11,.3)',
                    }}>
                    <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--odb-text-faint)' }}>Премія</p>
                    <p className="text-2xl font-black font-mono"
                      style={{ color: livePremium > 2 ? '#ef4444' : livePremium < -1 ? '#22c55e' : '#f59e0b' }}>
                      {livePremium >= 0 ? '+' : ''}{livePremium.toFixed(2)}%
                    </p>
                    <p className="text-[10px] mt-1"
                      style={{ color: livePremium > 2 ? '#ef4444' : livePremium < -1 ? '#22c55e' : '#f59e0b' }}>
                      {livePremium > 3 ? '🔴 перегрів' : livePremium > 1 ? '🟡 підвищений попит' : livePremium < -1 ? '🟢 арбітраж' : '✅ норма'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-xs px-4 py-2 rounded-lg" style={{ background: 'var(--odb-surface-2)', color: 'var(--odb-text-faint)' }}>
                  Натисніть «Сканувати» для розрахунку
                </div>
              )}
            </div>
          </div>

          {/* ── Тікери: 2 рядки (USDT + UAH) ────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold tracking-widest uppercase"
              style={{ color: 'var(--odb-text-faint)' }}>Поточні ціни WhiteBit</p>

            {/* USDT */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {USDT_MARKETS.map(market => {
                const t      = tickers[market]
                const change = t ? parseFloat(t.change) : 0
                return (
                  <div key={market} className="rounded-xl p-3 border"
                    style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>
                    <p className="text-[9px] font-mono mb-1" style={{ color: 'var(--odb-text-faint)' }}>
                      {market.replace('_USDT', '')}
                    </p>
                    {t ? (
                      <>
                        <p className="text-sm font-bold leading-tight">
                          ${parseFloat(t.last_price).toLocaleString('en-US', { maximumFractionDigits: parseFloat(t.last_price) < 1 ? 5 : 2 })}
                        </p>
                        <p className="text-[10px] mt-0.5 font-medium"
                          style={{ color: change >= 0 ? '#22c55e' : '#ef4444' }}>
                          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                        </p>
                      </>
                    ) : <p className="text-sm" style={{ color: 'var(--odb-text-faint)' }}>—</p>}
                  </div>
                )
              })}
            </div>

            {/* UAH */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {UAH_MARKETS.map(market => {
                const t      = tickers[market]
                const change = t ? parseFloat(t.change) : 0
                return (
                  <div key={market} className="rounded-xl p-3 border"
                    style={{
                      background: 'var(--odb-surface)',
                      borderColor: Math.abs(change) >= 3 ? 'rgba(245,158,11,.3)' : 'var(--odb-border-soft)',
                    }}>
                    <p className="text-[9px] font-mono mb-1" style={{ color: '#f59e0b' }}>
                      {market.replace('_UAH', '')} <span style={{ color: 'var(--odb-text-faint)' }}>₴</span>
                    </p>
                    {t ? (
                      <>
                        <p className="text-sm font-bold leading-tight">
                          {parseFloat(t.last_price).toLocaleString('uk-UA', { maximumFractionDigits: parseFloat(t.last_price) < 1 ? 4 : 0 })} ₴
                        </p>
                        <p className="text-[10px] mt-0.5 font-medium"
                          style={{ color: change >= 0 ? '#22c55e' : '#ef4444' }}>
                          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                        </p>
                      </>
                    ) : <p className="text-sm" style={{ color: 'var(--odb-text-faint)' }}>—</p>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Ринкова сила (після сканування) ──────────────────────────────── */}
          {movers.length > 0 && (
            <div className="rounded-xl p-4 border"
              style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>
              <p className="text-[10px] font-semibold tracking-widest uppercase mb-3"
                style={{ color: 'var(--odb-text-faint)' }}>Ринкова сила (USDT пари · 24h)</p>
              <div className="flex gap-2 flex-wrap">
                {movers.map((m, i) => {
                  const pos = m.change >= 0
                  const bar = Math.min(Math.abs(m.change) / 8 * 100, 100)
                  return (
                    <div key={m.market} className="flex items-center gap-2 rounded-lg px-3 py-2 border flex-1 min-w-24"
                      style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)' }}>
                      <span className="text-[10px] font-mono w-4 text-center"
                        style={{ color: 'var(--odb-text-faint)' }}>#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold">{m.market.replace('_USDT', '')}</p>
                        <div className="h-1 rounded-full mt-1" style={{ background: 'var(--odb-border-soft)' }}>
                          <div className="h-full rounded-full transition-all"
                            style={{
                              width: `${bar}%`,
                              background: pos ? '#22c55e' : '#ef4444',
                            }} />
                        </div>
                      </div>
                      <span className="text-xs font-semibold shrink-0"
                        style={{ color: pos ? '#22c55e' : '#ef4444' }}>
                        {pos ? '+' : ''}{m.change.toFixed(2)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Результат останнього скану ───────────────────────────────────── */}
          {lastScan && (
            <div className="rounded-xl p-4 border flex flex-wrap gap-4 items-center"
              style={{
                background:   lastScan.ok ? 'rgba(34,197,94,.08)'  : 'rgba(239,68,68,.08)',
                borderColor:  lastScan.ok ? 'rgba(34,197,94,.25)'  : 'rgba(239,68,68,.25)',
              }}>
              <span className="text-sm font-medium" style={{ color: lastScan.ok ? '#22c55e' : '#ef4444' }}>
                {lastScan.ok ? '✅ Скан завершено' : '❌ Помилка'}
              </span>
              {lastScan.ok && (
                <>
                  <span className="text-xs" style={{ color: 'var(--odb-text-dim)' }}>📊 Ринків: <b>{lastScan.markets_scanned}</b></span>
                  <span className="text-xs" style={{ color: 'var(--odb-text-dim)' }}>🔔 Сигналів: <b>{lastScan.signals_found}</b></span>
                  <span className="text-xs" style={{ color: 'var(--odb-text-dim)' }}>📨 Telegram: <b>{lastScan.tg_sent}</b></span>
                  <span className="text-xs" style={{ color: 'var(--odb-text-dim)' }}>⏱ {lastScan.elapsed_ms}ms</span>
                </>
              )}
              {lastScan.error && <span className="text-xs" style={{ color: '#ef4444' }}>{lastScan.error}</span>}
            </div>
          )}

          {/* ── Сигнали ──────────────────────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase mb-3"
              style={{ color: 'var(--odb-text-faint)' }}>
              Останні сигнали ({signals.length})
            </p>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }} />
              </div>
            ) : signals.length === 0 ? (
              <div className="rounded-xl p-10 border text-center"
                style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>
                <span className="text-4xl">📡</span>
                <p className="text-sm mt-3" style={{ color: 'var(--odb-text-dim)' }}>
                  Сигналів ще немає. Натисніть «Сканувати» або увімкніть авто.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {signals.map(sig => {
                  const sev  = SEVERITY_STYLE[sig.severity] || SEVERITY_STYLE.medium
                  const time = new Date(sig.created_at).toLocaleString('uk-UA', {
                    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit',
                    day: '2-digit', month: '2-digit',
                  })
                  const isUAH = sig.market.endsWith('_UAH')
                  return (
                    <div key={sig.id} className="rounded-xl p-4 border flex items-start gap-4"
                      style={{
                        background:  'var(--odb-surface)',
                        borderColor: sig.signal_type === 'uah_premium'
                          ? (sig.change_pct && sig.change_pct > 0 ? 'rgba(239,68,68,.25)' : 'rgba(34,197,94,.25)')
                          : 'var(--odb-border-soft)',
                      }}>
                      <span className="text-2xl shrink-0">{sig.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-mono font-bold">{sig.market}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: sev.bg, color: sev.text }}>
                            {sev.label}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ background: sig.signal_type === 'uah_premium' ? 'rgba(245,158,11,.15)' : 'var(--odb-surface-2)',
                                     color: sig.signal_type === 'uah_premium' ? '#f59e0b' : 'var(--odb-text-faint)' }}>
                            {SIGNAL_LABELS[sig.signal_type] || sig.signal_type}
                          </span>
                          {sig.sent_to_tg && (
                            <span className="text-[10px]" style={{ color: '#64748b' }}>📨 TG</span>
                          )}
                        </div>
                        <div className="flex gap-4 text-xs flex-wrap" style={{ color: 'var(--odb-text-dim)' }}>
                          {sig.change_pct !== null && (
                            <span style={{ color: (sig.change_pct ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                              {(sig.change_pct ?? 0) >= 0 ? '+' : ''}{sig.change_pct?.toFixed(2)}%
                            </span>
                          )}
                          {sig.price !== null && sig.signal_type !== 'uah_premium' && (
                            <span>Ціна: {fmtPrice(sig.price, isUAH)}</span>
                          )}
                          {sig.signal_type === 'uah_premium' && sig.price !== null && (
                            <span>НБУ: {sig.price.toFixed(2)} ₴/USD</span>
                          )}
                          {sig.volume_usd !== null && (
                            <span>Обсяг: ${(sig.volume_usd / 1_000_000).toFixed(2)}M</span>
                          )}
                          <span style={{ color: 'var(--odb-text-faint)' }}>{time}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
