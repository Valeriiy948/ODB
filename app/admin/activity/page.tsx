'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Icon from '../../components/Icon'
import { createClient } from '../../lib/supabase/client'

const supabase = createClient()

interface LogEntry {
  id: string
  created_at: string
  user_email: string
  action: string
  query: string
  query_type: string
  result_count: number
  ip_address: string
  user_agent: string
  device_type: string
  duration_ms: number
  person_id?: string
}

type ActionKey = 'search' | 'view_person' | 'login' | 'export' | 'import' | 'unknown'

const ACTION_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  search:      { icon: <Icon name="search"   size={11} strokeWidth={2} />, label: 'пошук',   color: 'text-blue-400',   bg: 'bg-blue-900/30 border-blue-800/50' },
  view_person: { icon: <Icon name="user"     size={11} strokeWidth={2} />, label: 'особа',   color: 'text-purple-400', bg: 'bg-purple-900/30 border-purple-800/50' },
  login:       { icon: <Icon name="shield"   size={11} strokeWidth={2} />, label: 'вхід',    color: 'text-green-400',  bg: 'bg-green-900/30 border-green-800/50' },
  export:      { icon: <Icon name="file"     size={11} strokeWidth={2} />, label: 'експорт', color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-800/50' },
  import:      { icon: <Icon name="download" size={11} strokeWidth={2} />, label: 'імпорт',  color: 'text-orange-400', bg: 'bg-orange-900/30 border-orange-800/50' },
}

function parseUA(ua: string) {
  if (!ua) return '—'
  if (/chrome/i.test(ua)  && !/edge/i.test(ua))  return 'Chrome'
  if (/firefox/i.test(ua))   return 'Firefox'
  if (/safari/i.test(ua)  && !/chrome/i.test(ua)) return 'Safari'
  if (/edge/i.test(ua))      return 'Edge'
  if (/opr|opera/i.test(ua)) return 'Opera'
  return ua.slice(0, 20)
}

function ActivityPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [logs,       setLogs]      = useState<LogEntry[]>([])
  const [total,      setTotal]     = useState(0)
  const [page,       setPage]      = useState(1)
  const [loading,    setLoading]   = useState(true)
  const [authorized, setAuth]      = useState(false)
  const [todayStats, setTodayStats]= useState<any>({})

  const [filterEmail,  setFilterEmail]  = useState(searchParams.get('email')  || '')
  const [filterAction, setFilterAction] = useState(searchParams.get('action') || '')
  const [filterFrom,   setFilterFrom]   = useState(searchParams.get('from')   || '')
  const [filterTo,     setFilterTo]     = useState(searchParams.get('to')     || '')

  const LIMIT = 50

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
    if (filterEmail)  params.set('email',  filterEmail)
    if (filterAction) params.set('action', filterAction)
    if (filterFrom)   params.set('from',   filterFrom)
    if (filterTo)     params.set('to',     filterTo)

    const res = await fetch(`/api/activity/log?${params}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    if (res.status === 401 || res.status === 403) { router.push('/dashboard'); return }

    const data = await res.json()
    setLogs(data.logs || [])
    setTotal(data.total || 0)
    setTodayStats(data.today_stats || {})
    setAuth(true)
    setLoading(false)
  }, [router, filterEmail, filterAction, filterFrom, filterTo])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      load(1)
    })
  }, [load, router])

  function handleFilter(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    load(1)
  }

  function handleReset() {
    setFilterEmail('')
    setFilterAction('')
    setFilterFrom('')
    setFilterTo('')
    setTimeout(() => load(1), 0)
  }

  const totalPages = Math.ceil(total / LIMIT)

  const STATS = [
    { icon: 'search'   as const, label: 'Пошуків сьогодні',    value: todayStats.searches     ?? '—', color: 'text-[var(--odb-accent)]' },
    { icon: 'users'    as const, label: 'Активних користувачів',value: todayStats.unique_users ?? '—', color: 'text-[var(--odb-ok)]' },
    { icon: 'phone'    as const, label: 'З мобільних',          value: todayStats.mobile       ?? '—', color: 'text-[var(--odb-warn)]' },
    { icon: 'database' as const, label: 'Всього записів',       value: total.toLocaleString(),         color: 'text-[var(--odb-text-dim)]' },
  ]

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
              <Icon name="activity" size={17} className="text-[var(--odb-accent)]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Активність</h1>
              <p className="text-gray-500 text-xs">Журнал дій користувачів</p>
            </div>
            <span className="ml-auto text-xs px-2.5 py-1 bg-amber-900/30 text-amber-400 border border-amber-800/50 rounded-lg">
              Адмін
            </span>
            <button
              onClick={() => load(page)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-white transition"
              title="Оновити"
            >
              <Icon name="refresh" size={14} />
            </button>
          </div>
        </div>

        <div className="p-6 max-w-7xl mx-auto space-y-5">

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 odb-stagger">
            {STATS.map(s => (
              <div key={s.label} className="odb-card p-4 text-center">
                <Icon name={s.icon} size={18} className={`mx-auto ${s.color}`} />
                <div className={`text-2xl font-bold mt-2 ${s.color}`}>{s.value}</div>
                <div className="text-gray-500 text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <form onSubmit={handleFilter}
            className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email / ім'я</label>
              <input
                value={filterEmail}
                onChange={e => setFilterEmail(e.target.value)}
                placeholder="user@example.com"
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white w-48
                           focus:border-[var(--odb-accent)] focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Дія</label>
              <select
                value={filterAction}
                onChange={e => setFilterAction(e.target.value)}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white
                           focus:border-[var(--odb-accent)] focus:outline-none transition"
              >
                <option value="">Всі дії</option>
                <option value="search">Пошук</option>
                <option value="view_person">Перегляд особи</option>
                <option value="login">Вхід</option>
                <option value="export">Експорт</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Від</label>
              <input
                type="date"
                value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white
                           focus:border-[var(--odb-accent)] focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">До</label>
              <input
                type="date"
                value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white
                           focus:border-[var(--odb-accent)] focus:outline-none transition"
              />
            </div>
            <button type="submit"
              className="odb-btn-accent px-4 py-2 text-sm font-medium flex items-center gap-2">
              <Icon name="filter" size={13} />
              Фільтрувати
            </button>
            <button type="button" onClick={handleReset}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition flex items-center gap-1.5">
              <Icon name="close" size={13} />
              Скинути
            </button>
          </form>

          {/* Table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="odb-skeleton h-8 rounded-lg" />
                ))}
              </div>
            ) : !authorized ? (
              <div className="p-12 text-center">
                <Icon name="shield" size={32} className="mx-auto text-red-400 mb-3" />
                <p className="text-red-400">Доступ заборонено</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-12 text-center">
                <Icon name="database" size={36} className="mx-auto text-gray-600 mb-3" />
                <p className="text-gray-400 font-medium">Записів не знайдено</p>
                <p className="text-gray-600 text-xs mt-1">
                  Запусти SQL міграцію в Supabase щоб почати збирати логи
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-500 text-xs uppercase tracking-wide">
                        <th className="px-4 py-3 text-left">Час</th>
                        <th className="px-4 py-3 text-left">Користувач</th>
                        <th className="px-4 py-3 text-left">Дія</th>
                        <th className="px-4 py-3 text-left">Запит</th>
                        <th className="px-4 py-3 text-left">IP</th>
                        <th className="px-4 py-3 text-center">Пристрій</th>
                        <th className="px-4 py-3 text-left">Браузер</th>
                        <th className="px-4 py-3 text-right">ms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(log => {
                        const ac = ACTION_CONFIG[log.action]
                        return (
                          <tr key={log.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition">
                            <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                              {new Date(log.created_at).toLocaleString('uk-UA', {
                                day: '2-digit', month: '2-digit',
                                hour: '2-digit', minute: '2-digit', second: '2-digit',
                              })}
                            </td>
                            <td className="px-4 py-3 text-xs font-medium text-white">
                              {log.user_email || '—'}
                            </td>
                            <td className="px-4 py-3">
                              {ac ? (
                                <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${ac.color} ${ac.bg}`}>
                                  {ac.icon}
                                  {ac.label}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-600">{log.action}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              {log.query ? (
                                <span className="text-white text-xs">
                                  {log.query}
                                  {log.query_type && (
                                    <span className="ml-1.5 text-gray-600">[{log.query_type}]</span>
                                  )}
                                </span>
                              ) : log.person_id ? (
                                <a href={`/persons/${log.person_id}`} target="_blank"
                                  className="text-[var(--odb-accent)] hover:underline text-xs">
                                  #{log.person_id.slice(0, 8)}
                                </a>
                              ) : (
                                <span className="text-gray-600 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-400">
                              {log.ip_address || '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {log.device_type === 'mobile'  ? <Icon name="phone"   size={14} className="mx-auto text-gray-400" /> :
                               log.device_type === 'desktop' ? <Icon name="monitor" size={14} className="mx-auto text-gray-400" /> :
                               <span className="text-gray-600 text-xs">{log.device_type || '—'}</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {parseUA(log.user_agent)}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600 font-mono">
                              {log.duration_ms || '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between text-xs">
                    <span className="text-gray-500">
                      {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} з {total.toLocaleString()} записів
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={page === 1}
                        onClick={() => { const p = page - 1; setPage(p); load(p) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 transition"
                      >
                        <Icon name="chevron-right" size={13} className="rotate-180" />
                      </button>
                      <span className="text-gray-400 px-2">{page} / {totalPages}</span>
                      <button
                        disabled={page === totalPages}
                        onClick={() => { const p = page + 1; setPage(p); load(p) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 transition"
                      >
                        <Icon name="chevron-right" size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Setup hint */}
          {!loading && authorized && logs.length === 0 && (
            <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5">
              <p className="text-blue-300 font-semibold text-sm mb-2">Перший запуск</p>
              <p className="text-gray-400 text-sm mb-3">
                Щоб логи починали зберігатись, потрібно створити таблицю{' '}
                <code className="bg-gray-800 px-1 rounded text-xs">activity_logs</code> в Supabase.
              </p>
              <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
                <li>Відкрий{' '}
                  <a href="https://supabase.com/dashboard/project/zvvtldyxmjuzpyozneoo/sql" target="_blank"
                    className="text-[var(--odb-accent)] hover:underline">Supabase SQL Editor</a>
                </li>
                <li>Скопіюй <code className="bg-gray-800 px-1 rounded text-xs">supabase-migrations/001_activity_logs.sql</code></li>
                <li>Виконай SQL та зроби будь-який пошук</li>
              </ol>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default function ActivityPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-gray-950 text-white items-center justify-center">
        <div className="odb-skeleton w-8 h-8 rounded-full" />
      </div>
    }>
      <ActivityPageInner />
    </Suspense>
  )
}
