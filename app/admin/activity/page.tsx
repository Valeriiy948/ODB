'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
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

const ACTION_ICONS: Record<string, string> = {
  search:      '🔍',
  view_person: '👤',
  login:       '🔐',
  export:      '📤',
  import:      '📥',
  unknown:     '❓',
}

const DEVICE_ICONS: Record<string, string> = {
  mobile:  '📱',
  tablet:  '📟',
  desktop: '🖥️',
  unknown: '❓',
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

  // Filters — initialise from URL params if present
  const [filterEmail,  setFilterEmail]  = useState(searchParams.get('email')  || '')
  const [filterAction, setFilterAction] = useState(searchParams.get('action') || '')
  const [filterFrom,   setFilterFrom]   = useState(searchParams.get('from')   || '')
  const [filterTo,     setFilterTo]     = useState(searchParams.get('to')     || '')

  const LIMIT = 50

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const params = new URLSearchParams({
      page:  String(p),
      limit: String(LIMIT),
    })
    if (filterEmail)  params.set('email',  filterEmail)
    if (filterAction) params.set('action', filterAction)
    if (filterFrom)   params.set('from',   filterFrom)
    if (filterTo)     params.set('to',     filterTo)

    const res = await fetch(`/api/activity/log?${params}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    })

    if (res.status === 401 || res.status === 403) {
      router.push('/dashboard')
      return
    }

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

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
          <a href="/settings?tab=admin" className="text-gray-500 hover:text-white text-sm">← Налаштування</a>
          <h1 className="text-lg font-bold">📊 Активність користувачів</h1>
          <span className="ml-2 px-2 py-0.5 bg-yellow-900/50 border border-yellow-700 rounded text-yellow-400 text-xs">
            👑 Тільки для адміна
          </span>
          <button onClick={() => load(page)}
            className="ml-auto px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs transition">
            🔄 Оновити
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-5">

            {/* Today stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Пошуків сьогодні',    value: todayStats.searches     ?? '—', icon: '🔍', color: 'text-blue-400' },
                { label: 'Активних користувачів', value: todayStats.unique_users ?? '—', icon: '👥', color: 'text-green-400' },
                { label: 'З мобільних',           value: todayStats.mobile       ?? '—', icon: '📱', color: 'text-yellow-400' },
                { label: 'Всього записів',         value: total,                         icon: '📋', color: 'text-gray-300' },
              ].map(s => (
                <div key={s.label} className="bg-gray-800 rounded-xl border border-gray-700 p-4 text-center">
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-gray-500 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <form onSubmit={handleFilter}
              className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email / ім'я</label>
                <input value={filterEmail} onChange={e => setFilterEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white w-48 focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Дія</label>
                <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none">
                  <option value="">Всі</option>
                  <option value="search">🔍 Пошук</option>
                  <option value="view_person">👤 Перегляд особи</option>
                  <option value="login">🔐 Вхід</option>
                  <option value="export">📤 Експорт</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Від</label>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">До</label>
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none" />
              </div>
              <button type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition">
                🔍 Фільтрувати
              </button>
              <button type="button" onClick={() => { setFilterEmail(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); setTimeout(() => load(1), 0) }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition">
                ✕ Скинути
              </button>
            </form>

            {/* Table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              {loading ? (
                <div className="p-12 text-center text-gray-500">⏳ Завантаження...</div>
              ) : !authorized ? (
                <div className="p-12 text-center text-red-400">⛔ Доступ заборонено</div>
              ) : logs.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <p className="text-4xl mb-3">📭</p>
                  <p>Записів не знайдено</p>
                  <p className="text-xs text-gray-600 mt-2">Запусти SQL міграцію в Supabase щоб почати збирати логи</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                          <th className="px-4 py-3 text-left">Час</th>
                          <th className="px-4 py-3 text-left">Користувач</th>
                          <th className="px-4 py-3 text-left">Дія</th>
                          <th className="px-4 py-3 text-left">Запит</th>
                          <th className="px-4 py-3 text-left">IP</th>
                          <th className="px-4 py-3 text-left">Пристрій</th>
                          <th className="px-4 py-3 text-left">Браузер</th>
                          <th className="px-4 py-3 text-right">ms</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map(log => (
                          <tr key={log.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition">
                            <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                              {new Date(log.created_at).toLocaleString('uk-UA', {
                                day: '2-digit', month: '2-digit',
                                hour: '2-digit', minute: '2-digit', second: '2-digit',
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-white text-xs font-medium">{log.user_email || '—'}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-xs">
                                {ACTION_ICONS[log.action] || '❓'} {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              {log.query ? (
                                <div>
                                  <span className="text-white">{log.query}</span>
                                  {log.query_type && (
                                    <span className="ml-2 text-xs text-gray-600">[{log.query_type}]</span>
                                  )}
                                </div>
                              ) : (
                                log.person_id ? (
                                  <a href={`/persons/${log.person_id}`} target="_blank"
                                    className="text-blue-400 hover:underline text-xs">
                                    Особа #{log.person_id.slice(0, 8)}
                                  </a>
                                ) : <span className="text-gray-600">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-400">
                              {log.ip_address || '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span title={log.device_type}>
                                {DEVICE_ICONS[log.device_type] || '❓'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {parseUA(log.user_agent)}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600">
                              {log.duration_ms ? `${log.duration_ms}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between text-sm">
                      <span className="text-gray-500 text-xs">
                        {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} з {total.toLocaleString()} записів
                      </span>
                      <div className="flex gap-2">
                        <button disabled={page === 1}
                          onClick={() => { setPage(p => p - 1); load(page - 1) }}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded text-xs transition">
                          ← Назад
                        </button>
                        <span className="px-3 py-1 text-gray-400 text-xs">{page} / {totalPages}</span>
                        <button disabled={page === totalPages}
                          onClick={() => { setPage(p => p + 1); load(page + 1) }}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded text-xs transition">
                          Далі →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Setup hint if no logs */}
            {!loading && authorized && logs.length === 0 && (
              <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5">
                <p className="text-blue-300 font-semibold mb-2">🚀 Перший запуск</p>
                <p className="text-gray-400 text-sm mb-3">
                  Щоб логи починали зберігатись, потрібно створити таблицю <code className="bg-gray-800 px-1 rounded">activity_logs</code> в Supabase.
                </p>
                <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
                  <li>Відкрий <a href="https://supabase.com/dashboard/project/zvvtldyxmjuzpyozneoo/sql" target="_blank" className="text-blue-400 hover:underline">Supabase SQL Editor</a></li>
                  <li>Скопіюй вміст файлу <code className="bg-gray-800 px-1 rounded">supabase-migrations/001_activity_logs.sql</code></li>
                  <li>Виконай SQL</li>
                  <li>Зроби будь-який пошук — лог з'явиться тут</li>
                </ol>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

export default function ActivityPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-gray-950 text-white items-center justify-center">
        <div className="text-gray-500 animate-pulse">Завантаження...</div>
      </div>
    }>
      <ActivityPageInner />
    </Suspense>
  )
}
