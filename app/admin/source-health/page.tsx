'use client'

// app/admin/source-health/page.tsx
// Дашборд стану всіх зовнішніх джерел (circuit breaker + Supabase persistent)

import { useState, useEffect, useCallback } from 'react'
import Sidebar from '../../components/Sidebar'
import type { SourceHealthEntry } from '../../api/admin/source-health/route'

// Людські назви джерел
const SOURCE_LABELS: Record<string, string> = {
  odb:              'ODB Core',
  telegram:         'Telegram Bots',
  leakosint:        'LeakOsint',
  osintkit:         'OsintKit',
  dehashed:         'DeHashed',
  hibp:             'HIBP',
  leakcheck:        'LeakCheck',
  vps_telethon:     'VPS Telethon (MTProto)',
  vps_registries:   'VPS Registries',
  vps_social:       'VPS Social',
  vps_orchestrator: 'VPS Orchestrator',
  nazk:             'НАЗК',
  mvs:              'МВС (розшук)',
  myrotvorets:      'Миротворець',
  erb:              'ЄРБ',
  shodan:           'Shodan',
  vk:               'VKontakte',
  sanctions:        'Sanctions (OpenSanctions)',
  web:              'Web Search',
}

// Категорії для групування
const GROUPS: Record<string, string[]> = {
  '🔥 VPS-сервіси':     ['vps_telethon', 'vps_registries', 'vps_social', 'vps_orchestrator'],
  '💧 Витоки даних':    ['leakosint', 'osintkit', 'dehashed', 'hibp', 'leakcheck'],
  '🏛️ Держреєстри':    ['nazk', 'mvs', 'myrotvorets', 'erb'],
  '🔍 OSINT-сервіси':   ['shodan', 'vk', 'web', 'sanctions', 'telegram'],
  '⚙️ Система':         ['odb'],
}

const STATE_CONFIG = {
  closed:    { label: 'Активний',    color: 'text-green-400',  bg: 'bg-green-950/30 border-green-700/40',  dot: 'bg-green-400', icon: '🟢' },
  open:      { label: 'Недоступний', color: 'text-red-400',    bg: 'bg-red-950/30 border-red-700/40',      dot: 'bg-red-400',   icon: '🔴' },
  half_open: { label: 'Відновлення', color: 'text-yellow-400', bg: 'bg-yellow-950/30 border-yellow-700/40',dot: 'bg-yellow-400',icon: '🟡' },
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function formatLatency(ms: number | null): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}мс`
  return `${(ms / 1000).toFixed(1)}с`
}

// ─── Картка одного джерела ────────────────────────────────────────────────────
function SourceCard({
  entry,
  onReset,
  resetting,
}: {
  entry:     SourceHealthEntry
  onReset:   (source: string) => void
  resetting: boolean
}) {
  const cfg   = STATE_CONFIG[entry.state] ?? STATE_CONFIG.closed
  const label = SOURCE_LABELS[entry.source] ?? entry.source

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-all ${cfg.bg}`}>
      {/* Назва + стан */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 w-2 h-2 rounded-full animate-pulse ${cfg.dot}`} />
          <span className="font-medium text-sm truncate" style={{ color: 'var(--odb-text)' }}>
            {label}
          </span>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.bg}`}>
          {cfg.icon} {cfg.label}
        </span>
      </div>

      {/* Метрики */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="mb-0.5" style={{ color: 'var(--odb-text-faint)' }}>Затримка</p>
          <p className={`font-mono font-semibold ${
            (entry.last_latency ?? 0) > 3000 ? 'text-red-400' :
            (entry.last_latency ?? 0) > 1000 ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {formatLatency(entry.last_latency)}
          </p>
        </div>
        <div>
          <p className="mb-0.5" style={{ color: 'var(--odb-text-faint)' }}>Збої</p>
          <p className={`font-mono font-semibold ${
            entry.failure_count >= 3 ? 'text-red-400' :
            entry.failure_count > 0  ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {entry.failure_count}
          </p>
        </div>
        <div>
          <p className="mb-0.5" style={{ color: 'var(--odb-text-faint)' }}>Відновлення</p>
          <p className="font-mono" style={{ color: 'var(--odb-text-dim)' }}>
            {entry.open_until && new Date(entry.open_until) > new Date()
              ? formatDate(entry.open_until)
              : '—'}
          </p>
        </div>
      </div>

      {/* Останні події */}
      <div className="text-xs space-y-0.5">
        <div className="flex justify-between">
          <span style={{ color: 'var(--odb-text-faint)' }}>✅ Успіх:</span>
          <span style={{ color: 'var(--odb-text-dim)' }}>{formatDate(entry.last_success)}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--odb-text-faint)' }}>❌ Збій:</span>
          <span style={{ color: 'var(--odb-text-dim)' }}>{formatDate(entry.last_failure)}</span>
        </div>
      </div>

      {/* Кнопка скидання (тільки для open/half_open) */}
      {entry.state !== 'closed' && (
        <button
          onClick={() => onReset(entry.source)}
          disabled={resetting}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs
                     font-medium transition bg-blue-900/40 border border-blue-700/40
                     text-blue-300 hover:bg-blue-800/50 disabled:opacity-50"
        >
          {resetting ? '⏳ Скидаю...' : '↺ Скинути CB'}
        </button>
      )}
    </div>
  )
}

// ─── Головна сторінка ─────────────────────────────────────────────────────────
export default function SourceHealthPage() {
  const [data, setData]           = useState<{
    summary: { total: number; closed: number; open: number; half_open: number }
    sources: SourceHealthEntry[]
    updatedAt: string
  } | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [resetting,  setResetting]  = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/source-health')
      if (res.ok) setData(await res.json())
    } catch {
      // Мережева помилка — залишаємо попередні дані
    } finally {
      setLoading(false)
    }
  }, [])

  // Перше завантаження + авто-оновлення кожні 30с
  useEffect(() => {
    fetchData()
    if (!autoRefresh) return
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [fetchData, autoRefresh])

  async function handleReset(source: string) {
    setResetting(source)
    try {
      await fetch('/api/admin/source-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      await fetchData()
    } finally {
      setResetting(null)
    }
  }

  // Групуємо джерела по категоріях
  function getGroup(groupSources: string[]): SourceHealthEntry[] {
    return groupSources
      .map(s => data?.sources.find(e => e.source === s))
      .filter((e): e is SourceHealthEntry => !!e)
  }

  // Некатегоризовані джерела
  const allGrouped = Object.values(GROUPS).flat()
  const ungrouped  = data?.sources.filter(s => !allGrouped.includes(s.source)) ?? []

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)', color: 'var(--odb-text)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Header ── */}
        <header className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{ background: 'var(--odb-surface)', borderBottom: '1px solid var(--odb-border)' }}>
          <div>
            <h1 className="text-lg font-bold">🔌 Source Health Monitor</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--odb-text-faint)' }}>
              Стан зовнішніх джерел · Circuit Breaker · Персистентний моніторинг
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data?.updatedAt && (
              <span className="text-xs" style={{ color: 'var(--odb-text-faint)' }}>
                Оновлено: {new Date(data.updatedAt).toLocaleTimeString('uk-UA')}
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
              {autoRefresh ? '⟳ Авто 30с' : '⟳ Авто вимк'}
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

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── Summary ── */}
          {data && (
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Всього джерел', value: data.summary.total,     color: 'text-[var(--odb-text)]',   bg: 'bg-[var(--odb-surface-2)]' },
                { label: '🟢 Активних',   value: data.summary.closed,    color: 'text-green-400',             bg: 'bg-green-950/20 border-green-700/30' },
                { label: '🔴 Недоступних',value: data.summary.open,      color: 'text-red-400',               bg: 'bg-red-950/20 border-red-700/30' },
                { label: '🟡 Відновлення',value: data.summary.half_open, color: 'text-yellow-400',            bg: 'bg-yellow-950/20 border-yellow-700/30' },
              ].map(card => (
                <div key={card.label}
                  className={`rounded-xl border p-4 ${card.bg}`}
                  style={{ borderColor: 'var(--odb-border)' }}>
                  <p className="text-xs mb-1" style={{ color: 'var(--odb-text-faint)' }}>{card.label}</p>
                  <p className={`text-3xl font-bold font-mono ${card.color}`}>{card.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Skeleton ── */}
          {loading && !data && (
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="odb-skeleton h-20 rounded-xl" />
              ))}
            </div>
          )}

          {/* ── Групи джерел ── */}
          {data && Object.entries(GROUPS).map(([groupName, groupSources]) => {
            const entries = getGroup(groupSources)
            if (entries.length === 0) return null
            const downCount = entries.filter(e => e.state !== 'closed').length

            return (
              <div key={groupName}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--odb-text-dim)' }}>
                    {groupName}
                  </h2>
                  {downCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-950 border border-red-700/40 text-red-400">
                      {downCount} проблем
                    </span>
                  )}
                  <div className="flex-1 h-px" style={{ background: 'var(--odb-border)' }} />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {entries.map(entry => (
                    <SourceCard
                      key={entry.source}
                      entry={entry}
                      onReset={handleReset}
                      resetting={resetting === entry.source}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {/* ── Некатегоризовані ── */}
          {ungrouped.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--odb-text-dim)' }}>
                  ⚙️ Інші
                </h2>
                <div className="flex-1 h-px" style={{ background: 'var(--odb-border)' }} />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {ungrouped.map(entry => (
                  <SourceCard
                    key={entry.source}
                    entry={entry}
                    onReset={handleReset}
                    resetting={resetting === entry.source}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Порожній стан ── */}
          {!loading && data?.sources.length === 0 && (
            <div className="text-center py-20" style={{ color: 'var(--odb-text-faint)' }}>
              <p className="text-4xl mb-3">🔌</p>
              <p>Джерела ще не відстежувались. Зроби кілька пошуків і поверніться сюди.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
