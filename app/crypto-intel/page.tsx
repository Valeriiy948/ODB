'use client'

import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'

// ─── Types ────────────────────────────────────────────────────────────────────
type Chain    = 'auto' | 'btc' | 'eth' | 'bsc' | 'tron' | 'polygon'
type Tab      = 'wallet' | 'trace' | 'cluster' | 'osint' | 'report'

interface Beneficiary {
  address:  string
  total:    number        // USDT / native
  count:    number        // кількість tx
  pct:      number        // % від загального outflow
  currency: string
}

const CHAIN_META: Record<string, { label: string; color: string; ring: string; symbol: string; bg: string }> = {
  btc:     { label: 'Bitcoin',   color: 'text-orange-400', ring: 'ring-orange-500/40', symbol: '₿',    bg: 'bg-orange-500/10 border-orange-500/30' },
  eth:     { label: 'Ethereum',  color: 'text-blue-400',   ring: 'ring-blue-500/40',   symbol: 'Ξ',    bg: 'bg-blue-500/10 border-blue-500/30' },
  bsc:     { label: 'BNB Chain', color: 'text-yellow-400', ring: 'ring-yellow-500/40', symbol: 'BNB',  bg: 'bg-yellow-500/10 border-yellow-500/30' },
  tron:    { label: 'TRON',      color: 'text-red-400',    ring: 'ring-red-500/40',    symbol: 'TRX',  bg: 'bg-red-500/10 border-red-500/30' },
  polygon: { label: 'Polygon',   color: 'text-purple-400', ring: 'ring-purple-500/40', symbol: 'MATIC',bg: 'bg-purple-500/10 border-purple-500/30' },
}

const RISK_STYLE: Record<string, string> = {
  critical:   'text-red-400 bg-red-500/10 border-red-500/40',
  high:       'text-orange-400 bg-orange-500/10 border-orange-500/40',
  medium:     'text-yellow-400 bg-yellow-500/10 border-yellow-500/40',
  low:        'text-green-400 bg-green-500/10 border-green-500/40',
  unknown:    'text-gray-400 bg-gray-500/10 border-gray-500/40',
  suspicious: 'text-orange-400 bg-orange-500/10 border-orange-500/40',
  legitimate: 'text-green-400 bg-green-500/10 border-green-500/40',
  scammer:    'text-red-400 bg-red-500/10 border-red-500/40',
}

// ─── Beneficiary detection ────────────────────────────────────────────────────
function computeBeneficiaries(txs: any[], selfAddress: string): Beneficiary[] {
  const map: Record<string, Beneficiary> = {}

  for (const tx of txs) {
    if (tx.direction !== 'out' && tx.direction !== 'OUT') continue
    const to = tx.to || tx.counterparty
    if (!to || to.toLowerCase() === selfAddress.toLowerCase()) continue

    const amount   = Number(tx.value_usdt ?? tx.value_eth ?? tx.value_btc ?? tx.value ?? 0)
    const currency = tx.value_usdt != null ? 'USDT' : tx.value_btc != null ? 'BTC' : 'native'

    if (!map[to]) map[to] = { address: to, total: 0, count: 0, pct: 0, currency }
    map[to].total += amount
    map[to].count++
  }

  const totalOut = Object.values(map).reduce((s, v) => s + v.total, 0)

  return Object.values(map)
    .map(v => ({ ...v, pct: totalOut > 0 ? Math.round(v.total / totalOut * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
}

// Витягти адресу гаманця з тексту (наприклад рядки destinations з AI-звіту)
function extractWalletAddr(text: string): string | null {
  const m = text.match(/\b(T[a-zA-Z0-9]{33}|0x[a-fA-F0-9]{40}|[13][a-zA-Z0-9]{25,34}|bc1[a-zA-Z0-9]{25,62})\b/)
  return m ? m[1] : null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectChainUI(addr: string): Chain {
  if (/^(1|3|bc1)[a-zA-Z0-9]{25,62}$/.test(addr)) return 'btc'
  if (/^T[a-zA-Z0-9]{33}$/.test(addr))             return 'tron'
  if (/^0x[a-fA-F0-9]{40}$/.test(addr))            return 'eth'
  return 'auto'
}

function shortAddr(addr: string) {
  if (!addr || addr.length <= 16) return addr || '—'
  return addr.slice(0, 8) + '…' + addr.slice(-6)
}

function RiskBadge({ level, score }: { level?: string; score?: number }) {
  if (!level) return null
  const cls = RISK_STYLE[level] || RISK_STYLE.unknown
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wide ${cls}`}>
      {score != null && <span>{score}</span>}
      {level}
    </span>
  )
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="shrink-0 text-gray-600 hover:text-gray-300 transition text-xs px-1"
      title="Скопіювати"
    >
      {copied ? '✓' : '⧉'}
    </button>
  )
}

function StatCard({ label, value, accent }: { label: string; value: any; accent?: string }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-gray-500 text-xs uppercase tracking-wider">{label}</span>
      <span className={`font-bold text-lg font-mono truncate ${accent || 'text-white'}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-lg">{icon}</span>
      <span className="text-gray-300 text-sm font-semibold uppercase tracking-wider">{title}</span>
      <div className="flex-1 h-px bg-gray-700/50" />
    </div>
  )
}

// ─── Beneficiaries panel ─────────────────────────────────────────────────────
function BeneficiariesPanel({ beneficiaries, onInvestigate }: {
  beneficiaries: Beneficiary[]
  onInvestigate: (addr: string) => void
}) {
  if (!beneficiaries.length) return null

  return (
    <div>
      <SectionHeader icon="🎯" title={`Бенефіціари — куди пішли кошти (${beneficiaries.length})`} />
      <div className="space-y-2">
        {beneficiaries.map((b, i) => (
          <div key={b.address}
            className={`rounded-xl border p-3 flex items-center gap-3 ${
              i === 0 ? 'bg-red-950/20 border-red-800/40' :
              i === 1 ? 'bg-orange-950/20 border-orange-800/30' :
                        'bg-gray-800/50 border-gray-700/40'
            }`}
          >
            {/* Rank */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
              i === 0 ? 'bg-red-800/60 text-red-300' :
              i === 1 ? 'bg-orange-800/60 text-orange-300' :
                        'bg-gray-700 text-gray-400'
            }`}>
              {i + 1}
            </div>

            {/* Address + stats */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-white font-mono text-xs">{shortAddr(b.address)}</span>
                <CopyBtn value={b.address} />
              </div>
              <div className="flex items-center gap-3">
                {/* Progress bar */}
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${
                    i === 0 ? 'bg-red-500' : i === 1 ? 'bg-orange-500' : 'bg-gray-500'
                  }`} style={{ width: `${b.pct}%` }} />
                </div>
                <span className={`text-xs font-bold shrink-0 ${
                  i === 0 ? 'text-red-400' : i === 1 ? 'text-orange-400' : 'text-gray-400'
                }`}>{b.pct}%</span>
                <span className="text-gray-500 text-xs shrink-0">
                  {b.total > 0 ? `${b.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${b.currency}` : `${b.count} tx`}
                </span>
                <span className="text-gray-600 text-xs shrink-0">{b.count} tx</span>
              </div>
            </div>

            {/* Investigate button */}
            <button
              onClick={() => onInvestigate(b.address)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                i === 0
                  ? 'bg-red-700/60 hover:bg-red-600/70 text-red-200 border border-red-700/50'
                  : 'bg-gray-700/60 hover:bg-gray-600/70 text-gray-300 border border-gray-600/50'
              }`}
            >
              🔍 Розслідувати →
            </button>
          </div>
        ))}
      </div>

      {beneficiaries.length > 0 && (
        <p className="text-gray-600 text-xs mt-2 italic">
          * автоматично обчислено з транзакцій · клікніть щоб прослідкувати кошти далі
        </p>
      )}
    </div>
  )
}

// ─── Link to Person panel ─────────────────────────────────────────────────────
function LinkToPersonPanel({ address, chain, walletData }: { address: string; chain: string; walletData: any }) {
  const [open, setOpen]           = useState(false)
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [linked, setLinked]       = useState<any>(null)
  const [linking, setLinking]     = useState(false)
  const [linkDone, setLinkDone]   = useState(false)

  useEffect(() => {
    if (!address) return
    fetch(`/api/crypto/link-person?wallet=${encodeURIComponent(address)}`)
      .then(r => r.json())
      .then(d => { if (d.found) setLinked(d.person) })
      .catch(() => {})
  }, [address])

  async function search(q: string) {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/crypto/search-persons?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results || [])
    } finally { setSearching(false) }
  }

  async function linkTo(person: any) {
    setLinking(true)
    try {
      const res = await fetch('/api/crypto/link-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address, chain, person_id: person.id, wallet_data: walletData }),
      })
      const data = await res.json()
      if (data.success) { setLinked(person); setLinkDone(true); setOpen(false) }
    } finally { setLinking(false) }
  }

  if (linkDone || linked) return (
    <div className="bg-green-950/30 border border-green-800/40 rounded-xl p-3 flex items-center gap-3">
      <span className="text-green-400 text-xl">✓</span>
      <div className="flex-1 min-w-0">
        <p className="text-green-400 text-xs font-semibold mb-0.5">Прив&apos;язано до картотеки</p>
        <a href={`/persons/${linked.id}`} target="_blank" rel="noopener noreferrer"
          className="text-green-300 text-sm hover:underline truncate block">
          {linked.name || linked.name_ukr || linked.name_rus} →
        </a>
      </div>
      <button onClick={() => { setLinked(null); setLinkDone(false) }}
        className="text-gray-600 hover:text-gray-400 text-xs shrink-0">
        змінити
      </button>
    </div>
  )

  return (
    <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2.5 text-gray-500 hover:text-gray-300 text-sm transition">
          <span className="text-base">👤</span>
          <span>Прив&apos;язати гаманець до особи в картотеці...</span>
          <span className="ml-auto text-gray-700">›</span>
        </button>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-gray-300 text-sm font-medium">👤 Пошук у картотеці осіб</p>
            <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-400 text-sm">✕</button>
          </div>
          <div className="relative">
            <input autoFocus value={query} onChange={e => search(e.target.value)}
              placeholder="Прізвище, ім'я або ІПН..."
              className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500/60" />
            {searching && <span className="absolute right-3 top-2.5 text-gray-500 text-xs">⏳</span>}
          </div>
          {results.length > 0 && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg divide-y divide-gray-800 max-h-48 overflow-y-auto">
              {results.map(p => (
                <button key={p.id} onClick={() => linkTo(p)} disabled={linking}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800 text-left transition">
                  <span className="text-base shrink-0">
                    {p.threat_level === 'critical' ? '🔴' : p.threat_level === 'high' ? '🟠' : '👤'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{p.name}</p>
                    {p.dob && <p className="text-gray-500 text-xs">{p.dob}</p>}
                  </div>
                  {p.wallet_count > 0 && <span className="text-orange-500 text-xs shrink-0">₿ {p.wallet_count}</span>}
                  <span className="text-blue-400 text-xs shrink-0">{linking ? '⏳' : 'Привʼ язати →'}</span>
                </button>
              ))}
            </div>
          )}
          {query.length >= 2 && !searching && results.length === 0 && (
            <p className="text-gray-600 text-xs text-center py-2">
              Нікого не знайдено.{' '}
              <a href="/persons/new" target="_blank" className="text-blue-400 hover:underline">Створити нову особу</a>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tab views ─────────────────────────────────────────────────────────────────

function WalletView({ data, onInvestigate }: { data: any; onInvestigate: (addr: string) => void }) {
  if (!data) return null
  const w     = data.wallet || {}
  const meta  = CHAIN_META[w.chain || data.chain || data.detected_chain] || CHAIN_META.eth
  const txs   = w.recent_txs || w.recent_usdt_txs || []
  const beneficiaries = computeBeneficiaries(txs, data.address)

  return (
    <div className="space-y-5">
      {/* Address header */}
      <div className={`rounded-2xl border p-5 ${meta.bg}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className={`text-4xl font-black ${meta.color}`}>{meta.symbol}</div>
            <div>
              <div className={`text-xs font-bold uppercase tracking-widest ${meta.color} mb-1`}>{meta.label}</div>
              <div className="text-white font-mono text-sm flex items-center gap-1.5">
                <span className="break-all">{data.address}</span>
                <CopyBtn value={data.address} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <RiskBadge level={data.risk_level} score={data.risk_score} />
            {w.explorer_url && (
              <a href={w.explorer_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900/50 hover:bg-gray-900/80 border border-gray-700/50 rounded-lg text-blue-400 text-xs transition">
                🔗 Explorer
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Баланс"       value={`${w.balance_native ?? '—'} ${meta.symbol}`} accent={meta.color} />
        <StatCard label="Транзакцій"   value={w.tx_count ?? w.total_txs ?? '—'} />
        <StatCard label="Отримано"     value={w.tx_received ?? '—'} accent="text-green-400" />
        <StatCard label="Відправлено"  value={w.tx_sent ?? '—'} accent="text-red-400" />
        <StatCard label="Контрагентів" value={w.unique_counterparties ?? '—'} />
        <StatCard label="Перша tx"     value={w.first_tx ?? w.first_seen ?? '—'} />
        <StatCard label="Остання tx"   value={w.last_tx ?? w.last_seen ?? '—'} />
        <StatCard label="Stable txs"   value={w.stablecoin_txs ?? w.usdt_txs ?? '—'} />
      </div>

      {/* Tokens */}
      {Object.keys(w.token_balances || w.trc20_tokens || {}).length > 0 && (
        <div>
          <SectionHeader icon="🪙" title="Токени" />
          <div className="flex flex-wrap gap-2">
            {Object.entries(w.token_balances || w.trc20_tokens || {}).map(([sym, bal]: any) => (
              <span key={sym} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs font-mono text-white">
                <span className="text-gray-400 mr-1">{sym}</span>
                {typeof bal === 'number' ? bal.toLocaleString() : bal}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Risk flags */}
      {w.risk_flags?.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-xl p-4">
          <SectionHeader icon="🚨" title="Індикатори ризику" />
          <div className="flex flex-wrap gap-2">
            {w.risk_flags.map((f: string) => (
              <span key={f} className="px-2.5 py-1 bg-red-900/40 border border-red-700/50 rounded-lg text-xs text-red-300">
                {f.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Beneficiaries (Follow the Money) ── */}
      {beneficiaries.length > 0 && (
        <BeneficiariesPanel beneficiaries={beneficiaries} onInvestigate={onInvestigate} />
      )}

      {/* Link to person */}
      <LinkToPersonPanel address={data.address} chain={w.chain || data.chain || data.detected_chain} walletData={w} />

      {/* Recent transactions */}
      {(w.recent_txs || w.recent_usdt_txs)?.length > 0 && (
        <div>
          <SectionHeader icon="📜" title="Останні транзакції" />
          <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl overflow-hidden">
            <div className="divide-y divide-gray-700/30 max-h-72 overflow-y-auto">
              {(w.recent_txs || w.recent_usdt_txs).slice(0, 20).map((tx: any, i: number) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-xs hover:bg-gray-700/20 transition">
                  <span className={`w-12 shrink-0 font-bold ${tx.direction === 'in' ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.direction === 'in' ? '↓ IN' : '↑ OUT'}
                  </span>
                  <span className="text-gray-500 shrink-0">{tx.date}</span>
                  <span className="text-white font-mono flex-1 truncate">
                    {tx.value_eth  != null && `${tx.value_eth} ${meta.symbol}`}
                    {tx.value_usdt != null && `${tx.value_usdt} USDT`}
                    {tx.value_btc  != null && `${tx.value_btc} BTC`}
                  </span>
                  <span className="text-gray-500 font-mono">{shortAddr(tx.to || tx.from || '')}</span>
                  {tx.hash && (
                    <a href={(w.explorer_url?.replace('/address/', '/tx/') || '') + tx.hash}
                      target="_blank" rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-400 shrink-0">⧉</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TraceView({ data }: { data: any }) {
  if (!data) return null
  const nodes = Object.values(data.nodes || {}) as any[]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Вузлів знайдено" value={data.nodes_found} />
        <StatCard label="Глибина аналізу" value={data.depth_analyzed} />
        <StatCard label="Ризикових" value={data.high_risk_nodes?.length || 0} accent="text-red-400" />
      </div>

      {data.high_risk_nodes?.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-xl p-4">
          <SectionHeader icon="🚨" title="Ризикові адреси у ланцюгу" />
          {data.high_risk_nodes.map((addr: string) => (
            <div key={addr} className="flex items-center gap-2 py-1.5">
              <span className="text-red-400">⚠</span>
              <span className="text-white font-mono text-sm">{addr}</span>
              <CopyBtn value={addr} />
            </div>
          ))}
        </div>
      )}

      <div>
        <SectionHeader icon="🔗" title="Граф транзакцій" />
        <div className="space-y-2">
          {nodes.sort((a, b) => a.depth - b.depth).map((node: any) => (
            <div key={node.address}
              className={`bg-gray-800/60 border rounded-xl p-3 ${node.address === data.root ? 'border-blue-500/50' : 'border-gray-700/50'}`}
              style={{ marginLeft: `${node.depth * 20}px` }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-600 text-xs bg-gray-700/50 px-1.5 py-0.5 rounded">d:{node.depth}</span>
                {node.address === data.root && <span className="text-blue-400 text-xs font-bold bg-blue-900/30 px-2 py-0.5 rounded">◉ ROOT</span>}
                <span className="text-white font-mono text-sm flex-1 truncate">{node.address}</span>
                <CopyBtn value={node.address} />
                {node.flags?.map((f: string) => (
                  <span key={f} className="px-1.5 py-0.5 bg-orange-900/40 text-orange-300 text-xs rounded">{f}</span>
                ))}
              </div>
              <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
                <span className="text-green-500/70">↓ {node.received} отрим.</span>
                <span className="text-red-500/70">↑ {node.sent} відпр.</span>
                <span>{node.txs} tx</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ClusterView({ data }: { data: any }) {
  if (!data) return null
  const wallets: any[] = data.clustered_wallets || []

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Гаманців у кластері" value={data.cluster_size} />
        <StatCard label="Висока впевненість"  value={data.high_confidence} accent="text-orange-400" />
        <StatCard label="Всього знайдено"     value={wallets.length} />
      </div>

      <div>
        <SectionHeader icon="🕸️" title="Кластер гаманців" />
        {wallets.length === 0 ? (
          <div className="text-center text-gray-500 py-12 bg-gray-800/30 border border-gray-700/50 rounded-xl">
            <p className="text-4xl mb-2">🔍</p>
            <p>Пов&apos;язані гаманці не знайдено</p>
          </div>
        ) : (
          <div className="space-y-2">
            {wallets.map((w: any, i: number) => (
              <div key={i} className={`bg-gray-800/60 border rounded-xl p-3 ${
                w.confidence === 'high'   ? 'border-red-700/40' :
                w.confidence === 'medium' ? 'border-orange-700/40' : 'border-gray-700/40'
              }`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <RiskBadge level={w.confidence} />
                  <span className="text-white font-mono text-sm">{w.address}</span>
                  <CopyBtn value={w.address} />
                  <span className="text-gray-500 text-xs">{w.reason?.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-gray-400 text-xs">{w.evidence}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {data.note && <p className="text-gray-600 text-xs italic">{data.note}</p>}
    </div>
  )
}

function OsintBridgeView({ data }: { data: any }) {
  if (!data) return null
  const clues: any[] = data.identity_clues || []

  return (
    <div className="space-y-5">
      {/* De-anon score */}
      <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-300 font-semibold">Ступінь деанонімізації</span>
          <span className={`text-3xl font-black ${
            (data.de_anonymization_score ?? 0) >= 60 ? 'text-red-400' :
            (data.de_anonymization_score ?? 0) >= 30 ? 'text-orange-400' : 'text-gray-400'
          }`}>{data.de_anonymization_score ?? 0}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2.5">
          <div className={`h-2.5 rounded-full transition-all duration-700 ${
            (data.de_anonymization_score ?? 0) >= 60 ? 'bg-red-500' :
            (data.de_anonymization_score ?? 0) >= 30 ? 'bg-orange-500' : 'bg-gray-500'
          }`} style={{ width: `${data.de_anonymization_score ?? 0}%` }} />
        </div>
      </div>

      {/* Intel summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Витоки (hits)" value={data.intelligence_score?.breach_hits} />
        <StatCard label="Веб-згадки"   value={data.intelligence_score?.web_hits} />
        <StatCard label="Scam mentions" value={data.intelligence_score?.scam_mentions} accent="text-red-400" />
        <StatCard label="Форуми"        value={data.intelligence_score?.forum_mentions} />
      </div>

      {/* Identity clues */}
      <div>
        <SectionHeader icon="🎯" title={`Знайдені ідентифікатори (${clues.length})`} />
        {clues.length > 0 ? (
          <div className="bg-gray-800/60 border border-green-700/30 rounded-xl overflow-hidden">
            <div className="divide-y divide-gray-700/30">
              {clues.map((c: any, i: number) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase shrink-0 ${
                    c.type === 'email' ? 'bg-blue-900/60 text-blue-300' :
                    c.type === 'phone' ? 'bg-green-900/60 text-green-300' :
                    c.type === 'name'  ? 'bg-purple-900/60 text-purple-300' :
                                         'bg-gray-700 text-gray-300'
                  }`}>{c.type}</span>
                  <span className="text-white font-mono text-sm flex-1 truncate">{c.value}</span>
                  <RiskBadge level={c.confidence} />
                  <span className="text-gray-600 text-xs truncate max-w-28">{c.source}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-10 bg-gray-800/30 border border-gray-700/50 rounded-xl">
            <p className="text-3xl mb-2">🔒</p>
            <p className="text-sm">Особистих ідентифікаторів не знайдено</p>
          </div>
        )}
      </div>

      {/* Scam mentions */}
      {data.scam_mentions?.length > 0 && (
        <div>
          <SectionHeader icon="🚨" title="Scam-згадки" />
          <div className="space-y-2">
            {data.scam_mentions.map((m: any, i: number) => (
              <div key={i} className="bg-red-950/20 border border-red-800/30 rounded-xl p-3">
                <a href={m.url} target="_blank" rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-sm font-medium">{m.title}</a>
                <p className="text-gray-400 text-xs mt-1">{m.snippet}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Forum posts */}
      {data.forum_posts?.length > 0 && (
        <div>
          <SectionHeader icon="💬" title="Форуми / Reddit" />
          <div className="space-y-2">
            {data.forum_posts.map((p: any, i: number) => (
              <div key={i} className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-sm">{p.title}</a>
                <p className="text-gray-500 text-xs mt-0.5">{p.snippet?.slice(0, 120)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AiReportView({ data, onInvestigate }: { data: any; onInvestigate: (addr: string) => void }) {
  if (!data) return null
  const r = data.report || {}

  if (r.parse_error) {
    return <pre className="text-gray-300 text-xs whitespace-pre-wrap bg-gray-800 p-4 rounded-xl">{r.raw}</pre>
  }

  return (
    <div className="space-y-5">
      {/* Verdict */}
      <div className={`rounded-2xl border p-5 ${RISK_STYLE[r.verdict || 'unknown']}`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase font-bold opacity-60 mb-1 tracking-widest">Вердикт AI</p>
            <p className="text-2xl font-black uppercase">{r.verdict || '—'}</p>
            {r.executive_summary && (
              <p className="text-sm opacity-80 mt-2 max-w-xl leading-relaxed">{r.executive_summary}</p>
            )}
          </div>
          <div className="text-center shrink-0">
            <p className="text-xs opacity-60 mb-1">Risk Score</p>
            <p className="text-5xl font-black">{r.risk_score ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Subject */}
      {r.subject && (
        <div>
          <SectionHeader icon="👤" title="Суб'єкт розслідування" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { k: 'Особа',    v: r.subject.estimated_identity },
              { k: 'Гаманець', v: r.subject.wallet },
              { k: 'Email',    v: r.subject.known_emails?.join(', ') },
              { k: 'Телефони', v: r.subject.known_phones?.join(', ') },
              { k: 'Обсяг',    v: r.subject.total_volume_usd_approx },
            ].filter(({ v }) => v).map(({ k, v }) => (
              <div key={k} className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3 flex gap-2">
                <span className="text-gray-500 text-xs shrink-0 mt-0.5">{k}:</span>
                <span className="text-white font-mono text-sm break-all">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fraud indicators */}
      {r.fraud_indicators?.length > 0 && (
        <div>
          <SectionHeader icon="🚨" title="Індикатори шахрайства" />
          <div className="space-y-2">
            {r.fraud_indicators.map((fi: any, i: number) => (
              <div key={i} className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <RiskBadge level={fi.severity} />
                  <span className="text-white text-sm font-semibold">{fi.indicator}</span>
                </div>
                <p className="text-gray-400 text-xs">{fi.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Money flow */}
      {r.money_flow && (
        <div>
          <SectionHeader icon="💸" title="Рух коштів" />
          <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-4 space-y-3">
            <p className="text-gray-300 text-sm">{r.money_flow.pattern}</p>
            {r.money_flow.total_volume_estimate && (
              <p className="text-orange-400 font-bold text-lg">{r.money_flow.total_volume_estimate}</p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-gray-500 text-xs mb-2 uppercase tracking-wider">Джерела</p>
                {r.money_flow.sources?.map((s: string, i: number) => (
                  <p key={i} className="text-green-300 text-xs py-0.5 flex gap-1.5"><span>↓</span>{s}</p>
                ))}
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-2 uppercase tracking-wider">Призначення</p>
                {r.money_flow.destinations?.map((d: string, i: number) => {
                  const addr = extractWalletAddr(d)
                  return (
                    <div key={i} className="flex items-start gap-2 py-1 group">
                      <span className="text-red-400 shrink-0 mt-0.5">↑</span>
                      <span className="text-red-300 text-xs flex-1">{d}</span>
                      {addr && (
                        <button
                          onClick={() => onInvestigate(addr)}
                          className="shrink-0 opacity-0 group-hover:opacity-100 text-xs px-2 py-0.5 bg-orange-800/50 hover:bg-orange-700/60 text-orange-300 rounded transition"
                        >
                          🔍→
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {r.timeline?.length > 0 && (
        <div>
          <SectionHeader icon="📅" title="Хронологія" />
          <div className="relative pl-5 space-y-3">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-700" />
            {r.timeline.map((ev: any, i: number) => (
              <div key={i} className="relative">
                <div className={`absolute -left-3.5 top-1.5 w-2 h-2 rounded-full ${
                  ev.significance === 'high' ? 'bg-red-500' :
                  ev.significance === 'medium' ? 'bg-orange-500' : 'bg-gray-500'
                }`} />
                <p className="text-gray-500 text-xs font-mono">{ev.date}</p>
                <p className="text-white text-sm">{ev.event}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {r.recommendations?.length > 0 && (
        <div>
          <SectionHeader icon="💡" title="Рекомендації" />
          <div className="bg-blue-950/20 border border-blue-800/30 rounded-xl p-4 space-y-2">
            {r.recommendations.map((rec: string, i: number) => {
              const addr = extractWalletAddr(rec)
              return (
                <div key={i} className="flex items-start gap-2.5 text-sm group">
                  <span className="text-blue-500 shrink-0 font-bold mt-0.5">{i + 1}.</span>
                  <span className="text-blue-200 flex-1">{rec}</span>
                  {addr && (
                    <button
                      onClick={() => onInvestigate(addr)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-xs px-2 py-0.5 bg-blue-800/50 hover:bg-blue-700/60 text-blue-300 rounded transition whitespace-nowrap"
                    >
                      🔍 Розслідувати →
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Law enforcement */}
      {r.law_enforcement_notes && (
        <div className="bg-yellow-950/20 border border-yellow-700/30 rounded-xl p-4">
          <p className="text-yellow-400 text-xs font-bold uppercase tracking-wider mb-2">⚖️ Для правоохоронців</p>
          <p className="text-yellow-200 text-sm">{r.law_enforcement_notes}</p>
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function CryptoIntelPage() {
  const [address, setAddress]     = useState('')
  const [chain, setChain]         = useState<Chain>('auto')
  const [activeTab, setActiveTab] = useState<Tab>('wallet')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const [walletData,  setWalletData]  = useState<any>(null)
  const [traceData,   setTraceData]   = useState<any>(null)
  const [clusterData, setClusterData] = useState<any>(null)
  const [osintData,   setOsintData]   = useState<any>(null)
  const [reportData,  setReportData]  = useState<any>(null)

  const [traceDepth, setTraceDepth]   = useState(2)
  const [autoRunAll, setAutoRunAll]   = useState(true)

  // ── Follow the Money: ланцюг розслідування ──
  const [chain_history, setChainHistory] = useState<string[]>([])

  const detectedChain = address ? detectChainUI(address.trim()) : 'auto'
  const hasResults    = !!(walletData || traceData || clusterData || osintData || reportData)

  function resetAll() {
    setWalletData(null); setTraceData(null); setClusterData(null)
    setOsintData(null);  setReportData(null); setError('')
  }

  async function post(endpoint: string, body: object): Promise<any> {
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.json()
  }

  // Розслідувати бенефіціара — додаємо поточну адресу в ланцюг
  function investigateBeneficiary(targetAddr: string) {
    if (address.trim()) {
      setChainHistory(prev => {
        // Уникаємо дублікатів в ланцюгу
        const existing = prev.filter(a => a !== address.trim())
        return [...existing, address.trim()]
      })
    }
    setAddress(targetAddr)
    setChain('auto')
    resetAll()
    // Запускаємо аналіз через невеликий timeout щоб state оновився
    setTimeout(() => runAnalysisFor(targetAddr), 50)
  }

  async function runAnalysisFor(addr: string) {
    if (!addr) return
    resetAll(); setLoading(true); setError('')
    const ec = detectChainUI(addr)
    try {
      setActiveTab('wallet')
      const wData = await post('/api/crypto/wallet', { address: addr, chain: ec })
      setWalletData(wData)
      if (!autoRunAll) return

      setActiveTab('trace')
      const tData = await post('/api/crypto/trace', { address: addr, chain: ec, depth: traceDepth })
      setTraceData(tData)

      setActiveTab('cluster')
      const cData = await post('/api/crypto/cluster', { address: addr, chain: ec })
      setClusterData(cData)

      setActiveTab('osint')
      const oData = await post('/api/crypto/osint-bridge', { address: addr, chain: ec })
      setOsintData(oData)

      setActiveTab('report')
      const rData = await post('/api/crypto/ai-report', { address: addr, wallet: wData, trace: tData, cluster: cData, osint_bridge: oData })
      setReportData(rData)
    } catch (e: any) { setError(e.message)
    } finally { setLoading(false) }
  }

  async function runAnalysis() {
    const addr = address.trim()
    if (!addr) return
    resetAll(); setLoading(true); setError('')
    const ec = chain === 'auto' ? detectedChain : chain
    try {
      setActiveTab('wallet')
      const wData = await post('/api/crypto/wallet', { address: addr, chain: ec })
      setWalletData(wData)
      if (!autoRunAll) return

      setActiveTab('trace')
      const tData = await post('/api/crypto/trace', { address: addr, chain: ec, depth: traceDepth })
      setTraceData(tData)

      setActiveTab('cluster')
      const cData = await post('/api/crypto/cluster', { address: addr, chain: ec })
      setClusterData(cData)

      setActiveTab('osint')
      const oData = await post('/api/crypto/osint-bridge', { address: addr, chain: ec })
      setOsintData(oData)

      setActiveTab('report')
      const rData = await post('/api/crypto/ai-report', { address: addr, wallet: wData, trace: tData, cluster: cData, osint_bridge: oData })
      setReportData(rData)
    } catch (e: any) { setError(e.message)
    } finally { setLoading(false) }
  }

  async function runSingle(tab: Tab) {
    const addr = address.trim()
    if (!addr) return
    setLoading(true); setError('')
    const ec = chain === 'auto' ? detectedChain : chain
    try {
      if (tab === 'wallet')  { setWalletData(  await post('/api/crypto/wallet',      { address: addr, chain: ec })) }
      if (tab === 'trace')   { setTraceData(   await post('/api/crypto/trace',       { address: addr, chain: ec, depth: traceDepth })) }
      if (tab === 'cluster') { setClusterData( await post('/api/crypto/cluster',     { address: addr, chain: ec })) }
      if (tab === 'osint')   { setOsintData(   await post('/api/crypto/osint-bridge',{ address: addr, chain: ec })) }
      if (tab === 'report')  { setReportData(  await post('/api/crypto/ai-report',   { address: addr, wallet: walletData, trace: traceData, cluster: clusterData, osint_bridge: osintData })) }
    } catch (e: any) { setError(e.message)
    } finally { setLoading(false) }
  }

  const TABS: Array<{ id: Tab; label: string; icon: string; hasData: boolean }> = [
    { id: 'wallet',  label: 'Гаманець',     icon: '💼', hasData: !!walletData },
    { id: 'trace',   label: 'Трасування',   icon: '🔗', hasData: !!traceData },
    { id: 'cluster', label: 'Кластер',      icon: '🕸️', hasData: !!clusterData },
    { id: 'osint',   label: 'OSINT-місток', icon: '🎯', hasData: !!osintData },
    { id: 'report',  label: 'AI Звіт',      icon: '🤖', hasData: !!reportData },
  ]

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        {/* ── Header ── */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">₿</span>
            <div>
              <h1 className="text-white text-2xl font-bold">Крипто-розвідка</h1>
              <p className="text-gray-500 text-sm">Блокчейн форензика · Ідентифікація шахраїв · OSINT по гаманцях</p>
            </div>
          </div>
        </div>

        {/* ── Search panel ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6 space-y-4">
          {/* Address input row */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runAnalysis()}
                placeholder="Bitcoin, Ethereum, TRON, BSC адреса... (0x..., T..., 1/3/bc1...)"
                className="w-full bg-gray-800 border border-gray-700 text-white font-mono rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500/60 placeholder-gray-600"
                disabled={loading}
              />
              {address && detectedChain !== 'auto' && (
                <span className={`absolute right-3 top-3 text-xs font-bold ${CHAIN_META[detectedChain]?.color}`}>
                  {CHAIN_META[detectedChain]?.label}
                </span>
              )}
            </div>
            <select
              value={chain}
              onChange={e => setChain(e.target.value as Chain)}
              disabled={loading}
              className="bg-gray-800 border border-gray-700 text-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none"
            >
              <option value="auto">🔍 Авто</option>
              <option value="btc">₿ Bitcoin</option>
              <option value="eth">Ξ Ethereum</option>
              <option value="bsc">BNB Chain</option>
              <option value="tron">TRX TRON</option>
              <option value="polygon">MATIC Polygon</option>
            </select>
          </div>

          {/* Options row */}
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={autoRunAll} onChange={e => setAutoRunAll(e.target.checked)}
                className="w-4 h-4 accent-orange-500" />
              <span className="text-gray-400">Повний аналіз (всі модулі)</span>
            </label>
            <div className="flex items-center gap-2 text-gray-500">
              <span className="text-xs">Глибина трасування:</span>
              <div className="flex gap-1">
                {[1, 2, 3].map(d => (
                  <button key={d} onClick={() => setTraceDepth(d)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                      traceDepth === d ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main button */}
          <button
            onClick={runAnalysis}
            disabled={!address.trim() || loading}
            className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
          >
            {loading
              ? <><span className="animate-spin">⏳</span> Аналіз...</>
              : <><span>🔍</span> Розслідувати гаманець</>}
          </button>

          {/* Quick examples */}
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { label: 'BTC Silk Road', addr: '1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF' },
              { label: 'ETH приклад',   addr: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE' },
              { label: 'TRON USDT',     addr: 'TUFkHoYKnQgRuPZYqvQn2QU6r7NiHKWxDF' },
            ].map(({ label, addr }) => (
              <button key={label}
                onClick={() => { setAddress(addr); resetAll() }}
                className="text-xs px-3 py-1.5 bg-gray-800 border border-gray-700 hover:border-orange-500/40 hover:text-orange-300 rounded-lg text-gray-400 transition font-mono"
              >
                {label}: {addr.slice(0, 10)}…
              </button>
            ))}
          </div>
        </div>

        {/* ── API keys notice ── */}
        <div className="bg-blue-950/20 border border-blue-800/30 rounded-xl px-4 py-3 mb-6 text-xs text-blue-400 flex items-start gap-2">
          <span className="shrink-0 mt-0.5">📌</span>
          <span>
            <span className="font-semibold text-blue-300">API ключі:</span>
            {' '}BTC ✅ (без ключа) · TRON ✅ (без ключа) ·{' '}
            ETH/BSC/Polygon — безкоштовний{' '}
            <a href="https://etherscan.io/apis" target="_blank" rel="noopener noreferrer"
              className="underline hover:text-white">Etherscan API key</a>
            {' '}→ <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono">ETHERSCAN_API_KEY</code> у .env.local
          </span>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-950/30 border border-red-800/50 rounded-xl px-4 py-3 mb-6 text-red-400 text-sm flex gap-2">
            <span>⚠️</span><span>{error}</span>
          </div>
        )}

        {/* ── Follow the Money: ланцюг розслідування ── */}
        {chain_history.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 mb-4 flex items-center gap-2 flex-wrap">
            <span className="text-gray-500 text-xs shrink-0">🔗 Ланцюг:</span>
            {chain_history.map((a, i) => (
              <div key={a} className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    // Повертаємось до попереднього гаманця
                    setAddress(a)
                    setChainHistory(prev => prev.slice(0, i))
                    resetAll()
                    setTimeout(() => runAnalysisFor(a), 50)
                  }}
                  className="font-mono text-xs text-orange-400 hover:text-orange-300 bg-orange-900/20 hover:bg-orange-900/40 border border-orange-800/30 px-2 py-1 rounded-lg transition"
                  title={a}
                >
                  {shortAddr(a)}
                </button>
                <span className="text-gray-600 text-xs">→</span>
              </div>
            ))}
            <span className="font-mono text-xs text-white bg-orange-800/30 border border-orange-700/50 px-2 py-1 rounded-lg">
              {shortAddr(address)}
            </span>
            <button
              onClick={() => { setChainHistory([]); resetAll() }}
              className="ml-auto text-xs text-gray-600 hover:text-gray-400 transition"
              title="Очистити ланцюг"
            >
              ✕ скинути
            </button>
          </div>
        )}

        {/* ── Results panel ── */}
        {hasResults && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-800 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => !loading && setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-5 py-3.5 text-sm whitespace-nowrap transition border-b-2 ${
                    activeTab === tab.id
                      ? 'border-orange-500 text-orange-400 bg-orange-500/5'
                      : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span className="font-medium">{tab.label}</span>
                  {tab.hasData && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                  )}
                  {activeTab === tab.id && loading && (
                    <span className="text-xs animate-spin shrink-0">⏳</span>
                  )}
                </button>
              ))}
              <div className="ml-auto flex items-center px-4">
                {!loading && (
                  <button
                    onClick={() => runSingle(activeTab)}
                    disabled={!address.trim()}
                    className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-400 hover:text-white disabled:opacity-40 transition"
                  >
                    ↺ Оновити
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {activeTab === 'wallet'  && <WalletView      data={walletData}  onInvestigate={investigateBeneficiary} />}
              {activeTab === 'trace'   && <TraceView       data={traceData} />}
              {activeTab === 'cluster' && <ClusterView     data={clusterData} />}
              {activeTab === 'osint'   && <OsintBridgeView data={osintData} />}
              {activeTab === 'report'  && <AiReportView    data={reportData}  onInvestigate={investigateBeneficiary} />}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!hasResults && !loading && (
          <div className="text-center py-20">
            <p className="text-6xl mb-4">₿</p>
            <p className="text-gray-400 text-lg mb-2">Введіть адресу гаманця</p>
            <p className="text-gray-600 text-sm max-w-md mx-auto">
              Bitcoin, Ethereum, TRON, BNB Chain або Polygon. Агент проведе повну форензику:
              трасування транзакцій, кластеризацію, OSINT-ідентифікацію та AI-звіт.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
