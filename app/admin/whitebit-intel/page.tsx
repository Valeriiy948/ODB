'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from '../../components/Sidebar'

interface Signal {
  id:          string
  market:      string
  signal_type: 'volume_spike' | 'price_move' | 'uah_anomaly' | 'arbitrage'
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
  error?:          string
}

interface Ticker {
  last_price:   string
  quote_volume: string
  change:       string
}

const SIGNAL_LABELS: Record<string, string> = {
  volume_spike: 'Стрибок обсягу',
  price_move:   'Рух ціни',
  uah_anomaly:  'UAH аномалія',
  arbitrage:    'Арбітраж',
}

const SEVERITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444', label: 'ВИСОКИЙ' },
  medium: { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b', label: 'СЕРЕДНІЙ' },
  low:    { bg: 'rgba(100,116,139,0.12)', text: '#64748b', label: 'НИЗЬКИЙ' },
}

export default function WhiteBitIntelPage() {
  const [signals,    setSignals]    = useState<Signal[]>([])
  const [tickers,    setTickers]    = useState<Record<string, Ticker>>({})
  const [scanning,   setScanning]   = useState(false)
  const [lastScan,   setLastScan]   = useState<ScanResult | null>(null)
  const [autoScan,   setAutoScan]   = useState(false)
  const [countdown,  setCountdown]  = useState(0)
  const [loading,    setLoading]    = useState(true)
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cdRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  const AUTO_INTERVAL = 120 // секунд

  const WATCH_MARKETS = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'BTC_UAH', 'ETH_UAH']

  // ─── Завантаження сигналів ────────────────────────────────────────────────
  const loadSignals = useCallback(async () => {
    const res = await fetch('/api/whitebit-intel/signals')
    if (res.ok) setSignals(await res.json())
  }, [])

  // ─── Завантаження тікерів ─────────────────────────────────────────────────
  const loadTickers = useCallback(async () => {
    try {
      const res = await fetch('/api/whitebit-intel/tickers')
      const data = await res.json() as Record<string, Ticker>
      setTickers(data)
    } catch {}
  }, [])

  // ─── Скан ─────────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    setScanning(true)
    try {
      const res  = await fetch('/api/whitebit-intel/scan')
      const data = await res.json() as ScanResult
      setLastScan(data)
      await loadSignals()
      await loadTickers()
    } catch (e) {
      setLastScan({ ok: false, error: String(e), elapsed_ms: 0, markets_scanned: 0, snapshots_saved: 0, signals_found: 0, tg_sent: 0 })
    }
    setScanning(false)
  }, [loadSignals, loadTickers])

  // ─── Авто-скан ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScan) {
      setCountdown(AUTO_INTERVAL)
      autoRef.current = setInterval(runScan, AUTO_INTERVAL * 1000)
      cdRef.current   = setInterval(() => setCountdown(c => c > 0 ? c - 1 : AUTO_INTERVAL), 1000)
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
              style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 0 16px rgba(245,158,11,0.3)' }}>
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
                style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                ⏱ {countdown}с
              </span>
            )}
            <button
              onClick={() => setAutoScan(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={autoScan
                ? { background: 'rgba(245,158,11,0.15)', borderColor: '#f59e0b', color: '#f59e0b' }
                : { background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)', color: 'var(--odb-text-dim)' }}>
              {autoScan ? `⟳ Авто ${AUTO_INTERVAL}с` : '⟳ Авто'}
            </button>
            <button
              onClick={runScan}
              disabled={scanning}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000' }}>
              {scanning
                ? <><span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Скануємо…</>
                : '▶ Сканувати'}
            </button>
          </div>
        </header>

        <div className="flex-1 p-6 space-y-6 overflow-auto">

          {/* Live тікери */}
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase mb-3"
              style={{ color: 'var(--odb-text-faint)' }}>Поточні ціни WhiteBit</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {WATCH_MARKETS.map(market => {
                const t = tickers[market]
                const change = t ? parseFloat(t.change) : 0
                const isUAH  = market.endsWith('_UAH')
                return (
                  <div key={market} className="rounded-xl p-3 border"
                    style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>
                    <p className="text-[10px] font-mono mb-1" style={{ color: 'var(--odb-text-faint)' }}>{market}</p>
                    {t ? (
                      <>
                        <p className="text-sm font-bold">
                          {isUAH
                            ? `${parseFloat(t.last_price).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴`
                            : `$${parseFloat(t.last_price).toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
                        </p>
                        <p className="text-xs mt-0.5 font-medium"
                          style={{ color: change >= 0 ? '#22c55e' : '#ef4444' }}>
                          {change >= 0 ? '+' : ''}{change.toFixed(2)}% 24h
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">—</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Результат останнього скану */}
          {lastScan && (
            <div className="rounded-xl p-4 border flex flex-wrap gap-4 items-center"
              style={{
                background: lastScan.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                borderColor: lastScan.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)',
              }}>
              <span className="text-sm font-medium" style={{ color: lastScan.ok ? '#22c55e' : '#ef4444' }}>
                {lastScan.ok ? '✅ Скан завершено' : '❌ Помилка скану'}
              </span>
              {lastScan.ok && (
                <>
                  <span className="text-xs" style={{ color: 'var(--odb-text-dim)' }}>
                    📊 Ринків: <b>{lastScan.markets_scanned}</b>
                  </span>
                  <span className="text-xs" style={{ color: 'var(--odb-text-dim)' }}>
                    🔔 Сигналів: <b>{lastScan.signals_found}</b>
                  </span>
                  <span className="text-xs" style={{ color: 'var(--odb-text-dim)' }}>
                    📨 У Telegram: <b>{lastScan.tg_sent}</b>
                  </span>
                  <span className="text-xs" style={{ color: 'var(--odb-text-dim)' }}>
                    ⏱ {lastScan.elapsed_ms}ms
                  </span>
                </>
              )}
              {lastScan.error && (
                <span className="text-xs" style={{ color: '#ef4444' }}>{lastScan.error}</span>
              )}
            </div>
          )}

          {/* Сигнали */}
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
                  Сигналів ще немає. Натисніть "Сканувати" або увімкніть авто-режим.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {signals.map(sig => {
                  const sev = SEVERITY_STYLE[sig.severity] || SEVERITY_STYLE.medium
                  const time = new Date(sig.created_at).toLocaleString('uk-UA', {
                    timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit',
                    day: '2-digit', month: '2-digit',
                  })
                  return (
                    <div key={sig.id} className="rounded-xl p-4 border flex items-start gap-4"
                      style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>
                      <span className="text-2xl shrink-0">{sig.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-mono font-bold">{sig.market}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: sev.bg, color: sev.text }}>
                            {sev.label}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ background: 'var(--odb-surface-2)', color: 'var(--odb-text-faint)' }}>
                            {SIGNAL_LABELS[sig.signal_type] || sig.signal_type}
                          </span>
                          {sig.sent_to_tg && (
                            <span className="text-[10px]" style={{ color: '#64748b' }}>📨 TG</span>
                          )}
                        </div>
                        <div className="flex gap-4 text-xs" style={{ color: 'var(--odb-text-dim)' }}>
                          {sig.change_pct !== null && (
                            <span style={{ color: (sig.change_pct ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                              {(sig.change_pct ?? 0) >= 0 ? '+' : ''}{sig.change_pct?.toFixed(2)}%
                            </span>
                          )}
                          {sig.price && <span>Ціна: {sig.market.endsWith('_UAH') ? `${sig.price.toLocaleString('uk-UA')} ₴` : `$${sig.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}</span>}
                          {sig.volume_usd && <span>Обсяг: ${(sig.volume_usd / 1_000_000).toFixed(2)}M</span>}
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
