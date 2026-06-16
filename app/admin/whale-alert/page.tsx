'use client'

// app/admin/whale-alert/page.tsx
// Дашборд великих крипто-транзакцій ($500k+) від Whale Alert

import { useState, useEffect, useCallback } from 'react'
import Sidebar from '../../components/Sidebar'
import type { WhaleTx } from '../../api/whale-alert/transactions/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CHAIN_LABELS: Record<string, string> = {
  ethereum:  'Ethereum',
  bitcoin:   'Bitcoin',
  tron:      'TRON',
  solana:    'Solana',
  ripple:    'XRP',
  stellar:   'Stellar',
  binance:   'BNB',
  polygon:   'Polygon',
  avalanche: 'AVAX',
}

const CHAIN_COLORS: Record<string, string> = {
  ethereum:  '#627eea',
  bitcoin:   '#f7931a',
  tron:      '#ef0027',
  solana:    '#9945ff',
  ripple:    '#00aae4',
  stellar:   '#08b5e5',
  binance:   '#f3ba2f',
  polygon:   '#8247e5',
  avalanche: '#e84142',
}

const BLOCKCHAINS = [
  'ethereum', 'bitcoin', 'tron', 'solana',
  'ripple', 'stellar', 'binance', 'polygon', 'avalanche',
]

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtAmount(n: number, symbol: string): string {
  const fmt = n >= 1_000_000
    ? n.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : n.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return `${fmt} ${symbol}`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Kyiv',
  })
}

function shortAddr(addr: string | null): string {
  if (!addr) return '—'
  if (addr.length <= 16) return addr
  return addr.slice(0, 8) + '…' + addr.slice(-6)
}

function explorerUrl(tx: WhaleTx): string {
  const h = tx.hash ?? ''
  switch (tx.blockchain) {
    case 'ethereum':  return `https://etherscan.io/tx/${h}`
    case 'bitcoin':   return `https://mempool.space/tx/${h}`
    case 'tron':      return `https://tronscan.org/#/transaction/${h}`
    case 'solana':    return `https://solscan.io/tx/${h}`
    case 'ripple':    return `https://xrpscan.com/tx/${h}`
    case 'stellar':   return `https://stellarscan.io/tx/${h}`
    case 'binance':   return `https://bscscan.com/tx/${h}`
    default:          return 'https://whale-alert.io'
  }
}

function ownerLabel(owner: string | null, ownerType: string | null): { text: string; badge: string } {
  if (owner) return { text: owner, badge: ownerType ?? '' }
  if (ownerType === 'exchange') return { text: 'Unknown Exchange', badge: 'exchange' }
  if (ownerType === 'wallet')   return { text: 'Unknown Wallet',   badge: 'wallet' }
  return { text: '—', badge: '' }
}

// ─── Картка транзакції ────────────────────────────────────────────────────────
function TxCard({ tx, odbUrl }: { tx: WhaleTx; odbUrl: string }) {
  const [copied, setCopied] = useState<string | null>(null)

  const usdVal = Number(tx.amount_usd)
  const border = usdVal >= 10_000_000 ? 'border-red-500/60 bg-red-950/20'
               : usdVal >= 1_000_000  ? 'border-orange-500/50 bg-orange-950/15'
               : usdVal >= 500_000    ? 'border-yellow-500/40 bg-yellow-950/10'
               : 'border-[var(--odb-border)] bg-[var(--odb-surface-2)]'

  const badge = usdVal >= 10_000_000 ? { label: '🚨 $10M+',   cls: 'bg-red-950 border-red-600/50 text-red-300' }
              : usdVal >= 1_000_000  ? { label: '🚨 $1M+',    cls: 'bg-orange-950 border-orange-600/50 text-orange-300' }
              : usdVal >= 500_000    ? { label: '⚠️ $500K+',   cls: 'bg-yellow-950 border-yellow-700/50 text-yellow-300' }
              : null

  const chainColor = CHAIN_COLORS[tx.blockchain] ?? '#888'
  const chainName  = CHAIN_LABELS[tx.blockchain] ?? tx.blockchain.toUpperCase()

  const from = ownerLabel(tx.from_owner, tx.from_owner_type)
  const to   = ownerLabel(tx.to_owner,   tx.to_owner_type)

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-all ${border}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full border"
                style={{ background: chainColor + '22', borderColor: chainColor + '88', color: chainColor }}>
            {chainName}
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                style={{ borderColor: 'var(--odb-border)', color: 'var(--odb-text-dim)', background: 'var(--odb-surface-3)' }}>
            {tx.tx_type}
          </span>
          {tx.telegram_sent && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-950 border border-blue-700/40 text-blue-400">
              📨 TG
            </span>
          )}
        </div>
        {badge && (
          <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>
            {badge.label}
          </span>
        )}
      </div>

      {/* Amount */}
      <div>
        <p className="text-2xl font-bold font-mono" style={{ color: 'var(--odb-text)' }}>
          {fmtUsd(usdVal)}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--odb-text-faint)' }}>
          {fmtAmount(Number(tx.amount), tx.symbol)}
        </p>
      </div>

      {/* From / To */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-start gap-2">
          <span style={{ color: 'var(--odb-text-faint)' }} className="shrink-0 w-16">📤 Від:</span>
          <div className="min-w-0">
            <span className="font-medium" style={{ color: 'var(--odb-text)' }}>{from.text}</span>
            {from.badge && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full border"
                    style={{ borderColor: 'var(--odb-border)', color: 'var(--odb-text-faint)' }}>
                {from.badge}
              </span>
            )}
            {tx.from_address && (
              <button
                className="block font-mono mt-0.5 hover:underline truncate max-w-[180px]"
                style={{ color: 'var(--odb-accent-hi)' }}
                onClick={() => copy(tx.from_address!, 'from')}
                title="Скопіювати адресу"
              >
                {copied === 'from' ? '✅ Скопійовано' : shortAddr(tx.from_address)}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span style={{ color: 'var(--odb-text-faint)' }} className="shrink-0 w-16">📥 До:</span>
          <div className="min-w-0">
            <span className="font-medium" style={{ color: 'var(--odb-text)' }}>{to.text}</span>
            {to.badge && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full border"
                    style={{ borderColor: 'var(--odb-border)', color: 'var(--odb-text-faint)' }}>
                {to.badge}
              </span>
            )}
            {tx.to_address && (
              <button
                className="block font-mono mt-0.5 hover:underline truncate max-w-[180px]"
                style={{ color: 'var(--odb-accent-hi)' }}
                onClick={() => copy(tx.to_address!, 'to')}
                title="Скопіювати адресу"
              >
                {copied === 'to' ? '✅ Скопійовано' : shortAddr(tx.to_address)}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer: time + links */}
      <div className="flex items-center justify-between pt-1 border-t"
           style={{ borderColor: 'var(--odb-border-soft)' }}>
        <span className="text-[11px]" style={{ color: 'var(--odb-text-faint)' }}>
          {fmtTime(tx.tx_timestamp)}
        </span>
        <div className="flex gap-2">
          {tx.hash && (
            <a href={explorerUrl(tx)} target="_blank" rel="noopener noreferrer"
               className="text-[11px] px-2 py-0.5 rounded-lg border transition"
               style={{ borderColor: 'var(--odb-border)', color: 'var(--odb-text-dim)' }}
               onMouseEnter={e => { e.currentTarget.style.color = 'var(--odb-text)' }}
               onMouseLeave={e => { e.currentTarget.style.color = 'var(--odb-text-dim)' }}>
              🔍 Explorer
            </a>
          )}
          {tx.from_address && (
            <a href={`${odbUrl}/crypto-intel?address=${encodeURIComponent(tx.from_address)}`}
               target="_blank" rel="noopener noreferrer"
               className="text-[11px] px-2 py-0.5 rounded-lg border transition"
               style={{ borderColor: 'var(--odb-border)', color: 'var(--odb-text-dim)' }}
               onMouseEnter={e => { e.currentTarget.style.color = 'var(--odb-text)' }}
               onMouseLeave={e => { e.currentTarget.style.color = 'var(--odb-text-dim)' }}>
              🔎 ODB
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Головна сторінка ─────────────────────────────────────────────────────────
export default function WhaleAlertPage() {
  const [data, setData] = useState<{
    transactions: WhaleTx[]
    total:        number
    volume_24h:   number
    count_24h:    number
  } | null>(null)

  const [loading,    setLoading]    = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [blockchain,  setBlockchain]  = useState('')
  const [minUsd,      setMinUsd]      = useState(500_000)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', min_usd: String(minUsd) })
      if (blockchain) params.set('blockchain', blockchain)
      const res = await fetch(`/api/whale-alert/transactions?${params}`)
      if (res.ok) setData(await res.json())
    } catch {
      // мережева помилка
    } finally {
      setLoading(false)
    }
  }, [blockchain, minUsd])

  useEffect(() => {
    fetchData()
    if (!autoRefresh) return
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData, autoRefresh])

  const odbUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const isEmpty = !loading && (!data?.transactions.length)

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)', color: 'var(--odb-text)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Header ── */}
        <header className="px-6 py-4 flex items-center justify-between shrink-0 gap-4"
          style={{ background: 'var(--odb-surface)', borderBottom: '1px solid var(--odb-border)' }}>
          <div>
            <h1 className="text-lg font-bold">🐋 Whale Alert</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--odb-text-faint)' }}>
              Великі крипто-транзакції · $500K+ · Real-time моніторинг
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {data?.total !== undefined && (
              <span className="text-xs" style={{ color: 'var(--odb-text-faint)' }}>
                Всього: {data.total.toLocaleString()}
              </span>
            )}
            <button
              onClick={() => setAutoRefresh(a => !a)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                autoRefresh
                  ? 'bg-green-950/40 border-green-700/40 text-green-400'
                  : 'border-[var(--odb-border)] text-[var(--odb-text-faint)]'
              }`}
            >
              {autoRefresh ? '⟳ Авто 60с' : '⟳ Авто вимк'}
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="odb-btn-accent text-sm px-4 py-1.5 disabled:opacity-50"
            >
              {loading ? '⏳' : '↺ Оновити'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Summary ── */}
          {data && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: 'Всього записів',
                  value: data.total.toLocaleString(),
                  color: 'text-[var(--odb-text)]',
                  bg:    'bg-[var(--odb-surface-2)]',
                },
                {
                  label: 'Транзакцій 24h',
                  value: data.count_24h.toLocaleString(),
                  color: 'text-blue-400',
                  bg:    'bg-blue-950/20 border-blue-700/30',
                },
                {
                  label: 'Обсяг 24h',
                  value: fmtUsd(data.volume_24h),
                  color: 'text-orange-400',
                  bg:    'bg-orange-950/20 border-orange-700/30',
                },
                {
                  label: 'Поточний фільтр',
                  value: `≥ ${fmtUsd(minUsd)}`,
                  color: 'text-[var(--odb-accent-hi)]',
                  bg:    'bg-[var(--odb-surface-2)]',
                },
              ].map(c => (
                <div key={c.label}
                  className={`rounded-xl border p-4 ${c.bg}`}
                  style={{ borderColor: 'var(--odb-border)' }}>
                  <p className="text-xs mb-1" style={{ color: 'var(--odb-text-faint)' }}>{c.label}</p>
                  <p className={`text-2xl font-bold font-mono ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Фільтри ── */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Blockchain */}
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--odb-text-faint)' }}>
                Блокчейн
              </label>
              <select
                value={blockchain}
                onChange={e => setBlockchain(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg border"
                style={{
                  background: 'var(--odb-surface-2)',
                  borderColor: 'var(--odb-border)',
                  color: 'var(--odb-text)',
                }}
              >
                <option value="">Всі мережі</option>
                {BLOCKCHAINS.map(b => (
                  <option key={b} value={b}>{CHAIN_LABELS[b] ?? b}</option>
                ))}
              </select>
            </div>

            {/* Min USD */}
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--odb-text-faint)' }}>
                Мінімум USD
              </label>
              <select
                value={minUsd}
                onChange={e => setMinUsd(Number(e.target.value))}
                className="text-sm px-3 py-2 rounded-lg border"
                style={{
                  background: 'var(--odb-surface-2)',
                  borderColor: 'var(--odb-border)',
                  color: 'var(--odb-text)',
                }}
              >
                <option value={500_000}>$500K+</option>
                <option value={1_000_000}>$1M+</option>
                <option value={5_000_000}>$5M+</option>
                <option value={10_000_000}>$10M+</option>
                <option value={100_000_000}>$100M+</option>
              </select>
            </div>
          </div>

          {/* ── Skeleton ── */}
          {loading && !data && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="odb-skeleton h-52 rounded-xl" />
              ))}
            </div>
          )}

          {/* ── Список транзакцій ── */}
          {data && data.transactions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.transactions.map(tx => (
                <TxCard key={tx.id} tx={tx} odbUrl={odbUrl} />
              ))}
            </div>
          )}

          {/* ── Пустий стан ── */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
              <p className="text-6xl">🐋</p>
              <p className="text-lg font-semibold" style={{ color: 'var(--odb-text-dim)' }}>
                Транзакцій ще немає
              </p>
              <p className="text-sm max-w-sm" style={{ color: 'var(--odb-text-faint)' }}>
                Налаштуй cron-job.org для автоматичного опитування Whale Alert API
                кожну хвилину, або запусти вручну:
              </p>
              <div className="flex flex-col gap-2 items-center">
                <code className="text-xs px-4 py-2 rounded-lg border font-mono"
                      style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border)', color: 'var(--odb-accent-hi)' }}>
                  GET /api/cron/whale-alert
                </code>
                <p className="text-xs" style={{ color: 'var(--odb-text-faint)' }}>
                  Потрібен: <span className="font-mono">WHALE_ALERT_API_KEY</span> у .env.local
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
