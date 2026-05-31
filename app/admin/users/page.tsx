'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import { createClient } from '../../lib/supabase/client'

const supabase = createClient()

interface UserStats {
  total_actions: number
  last_seen:     string | null
  last_ip:       string | null
  last_device:   string | null
  search_count:  number
}

interface UserEntry {
  id:              string
  email:           string
  created_at:      string
  last_sign_in_at: string | null
  email_confirmed: boolean
  phone:           string | null
  is_admin:        boolean
  role:            string
  banned:          boolean
  banned_until:    string | null
  stats:           UserStats
}

const DEVICE_ICONS: Record<string, string> = {
  mobile:  '📱',
  tablet:  '📟',
  desktop: '🖥️',
  unknown: '❓',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function timeAgo(iso: string | null) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60000)
  const hr   = Math.floor(min  / 60)
  const day  = Math.floor(hr   / 24)
  if (day  > 0)  return `${day}д тому`
  if (hr   > 0)  return `${hr}г тому`
  if (min  > 0)  return `${min}хв тому`
  return 'щойно'
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users,   setUsers]   = useState<UserEntry[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [token,   setToken]   = useState('')
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState<'all' | 'admin' | 'banned' | 'active'>('all')
  const [confirm, setConfirm] = useState<{ action: string; user: UserEntry } | null>(null)
  const [actionMsg, setActionMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setToken(session.access_token)

    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.status === 401 || res.status === 403) {
      router.push('/dashboard')
      return
    }
    const data = await res.json()
    setUsers(data.users || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [router])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      load()
    })
  }, [load, router])

  async function doAction(action: string, user: UserEntry) {
    setConfirm(null)
    setActionMsg('')
    const res = await fetch('/api/admin/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ user_id: user.id, action }),
    })
    const data = await res.json()
    if (data.ok) {
      setActionMsg(`✅ Виконано: ${action} для ${user.email}`)
      load()
    } else {
      setActionMsg(`❌ Помилка: ${data.error}`)
    }
    setTimeout(() => setActionMsg(''), 4000)
  }

  async function deleteUser(user: UserEntry) {
    setConfirm(null)
    const res = await fetch('/api/admin/users', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ user_id: user.id }),
    })
    const data = await res.json()
    if (data.ok) {
      setActionMsg(`✅ Користувача ${user.email} видалено`)
      load()
    } else {
      setActionMsg(`❌ ${data.error}`)
    }
    setTimeout(() => setActionMsg(''), 4000)
  }

  const filtered = users.filter(u => {
    if (search && !u.email.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'admin')  return u.is_admin
    if (filter === 'banned') return u.banned
    if (filter === 'active') {
      if (!u.stats.last_seen) return false
      return Date.now() - new Date(u.stats.last_seen).getTime() < 7 * 24 * 60 * 60 * 1000
    }
    return true
  })

  const stats = {
    total:   users.length,
    admins:  users.filter(u => u.is_admin).length,
    banned:  users.filter(u => u.banned).length,
    active:  users.filter(u => u.stats.last_seen &&
      Date.now() - new Date(u.stats.last_seen).getTime() < 7 * 24 * 60 * 60 * 1000).length,
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-4">
          <a href="/settings?tab=admin" className="text-gray-500 hover:text-white text-sm">← Налаштування</a>
          <h1 className="text-lg font-bold">👥 Управління користувачами</h1>
          <span className="ml-2 px-2 py-0.5 bg-yellow-900/50 border border-yellow-700 rounded text-yellow-400 text-xs">
            👑 Тільки для адміна
          </span>
          <button onClick={load}
            className="ml-auto px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs transition">
            🔄 Оновити
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-5">

            {/* Action message */}
            {actionMsg && (
              <div className={`px-4 py-3 rounded-xl text-sm border ${
                actionMsg.startsWith('✅')
                  ? 'bg-green-950/40 border-green-800/50 text-green-300'
                  : 'bg-red-950/40 border-red-800/50 text-red-300'
              }`}>
                {actionMsg}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Всього користувачів', value: stats.total,  icon: '👥', color: 'text-blue-400',   tab: 'all'    as const },
                { label: 'Адміністраторів',     value: stats.admins, icon: '👑', color: 'text-yellow-400', tab: 'admin'  as const },
                { label: 'Заблокованих',         value: stats.banned, icon: '🚫', color: 'text-red-400',    tab: 'banned' as const },
                { label: 'Активних за 7 днів',   value: stats.active, icon: '✅', color: 'text-green-400',  tab: 'active' as const },
              ].map(s => (
                <button
                  key={s.label}
                  onClick={() => setFilter(s.tab)}
                  className={`bg-gray-800 rounded-xl border p-4 text-center transition hover:border-gray-600 ${
                    filter === s.tab ? 'border-blue-600' : 'border-gray-700'
                  }`}
                >
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className={`text-2xl font-bold ${s.color}`}>{loading ? '…' : s.value}</div>
                  <div className="text-gray-500 text-xs mt-1">{s.label}</div>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="flex gap-3 items-center">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Пошук за email..."
                className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white
                           placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
              {(search || filter !== 'all') && (
                <button onClick={() => { setSearch(''); setFilter('all') }}
                  className="px-3 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm transition">
                  ✕ Скинути
                </button>
              )}
            </div>

            {/* Users table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              {loading ? (
                <div className="p-12 text-center text-gray-500">⏳ Завантаження...</div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <p className="text-3xl mb-2">👤</p>
                  <p>Користувачів не знайдено</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                        <th className="px-4 py-3 text-left">Користувач</th>
                        <th className="px-4 py-3 text-left">Реєстрація</th>
                        <th className="px-4 py-3 text-left">Остання активність</th>
                        <th className="px-4 py-3 text-center">Пристрій</th>
                        <th className="px-4 py-3 text-center">Пошуки</th>
                        <th className="px-4 py-3 text-center">Дії</th>
                        <th className="px-4 py-3 text-center">Статус</th>
                        <th className="px-4 py-3 text-right">Управління</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(u => (
                        <tr key={u.id}
                          className="border-b border-gray-700/50 hover:bg-gray-700/30 transition">
                          {/* User */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                u.is_admin
                                  ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50'
                                  : 'bg-gray-700 text-gray-300'
                              }`}>
                                {u.email[0].toUpperCase()}
                              </div>
                              <div>
                                <div className="text-white text-xs font-medium flex items-center gap-1.5">
                                  {u.email}
                                  {u.is_admin && (
                                    <span className="px-1 py-0.5 bg-yellow-900/40 text-yellow-400 rounded text-xs border border-yellow-800/50">
                                      👑
                                    </span>
                                  )}
                                </div>
                                <div className="text-gray-600 text-xs font-mono mt-0.5">
                                  {u.id.slice(0, 8)}…
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Registration */}
                          <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                            {formatDate(u.created_at)}
                          </td>

                          {/* Last activity */}
                          <td className="px-4 py-3">
                            {u.stats.last_seen ? (
                              <div>
                                <div className="text-gray-300 text-xs">{timeAgo(u.stats.last_seen)}</div>
                                <div className="text-gray-600 text-xs">{u.stats.last_ip || '—'}</div>
                              </div>
                            ) : (
                              <span className="text-gray-600 text-xs">Не активний</span>
                            )}
                          </td>

                          {/* Device */}
                          <td className="px-4 py-3 text-center">
                            <span title={u.stats.last_device || 'unknown'} className="text-base">
                              {DEVICE_ICONS[u.stats.last_device || 'unknown'] || '❓'}
                            </span>
                          </td>

                          {/* Search count */}
                          <td className="px-4 py-3 text-center">
                            <div className="text-blue-300 font-bold text-sm">{u.stats.search_count}</div>
                            <div className="text-gray-600 text-xs">{u.stats.total_actions} дій</div>
                          </td>

                          {/* Activity link */}
                          <td className="px-4 py-3 text-center">
                            <a
                              href={`/admin/activity?email=${encodeURIComponent(u.email)}`}
                              className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                            >
                              📊 Логи
                            </a>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 text-center">
                            {u.banned ? (
                              <span className="px-2 py-0.5 bg-red-900/40 border border-red-800/50 text-red-400 rounded text-xs">
                                🚫 Заблок.
                              </span>
                            ) : u.email_confirmed ? (
                              <span className="px-2 py-0.5 bg-green-900/40 border border-green-800/50 text-green-400 rounded text-xs">
                                ✓ Активний
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-gray-700 border border-gray-600 text-gray-400 rounded text-xs">
                                ⏳ Очікує
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-right">
                            {!u.is_admin && (
                              <div className="flex items-center justify-end gap-1.5">
                                {u.banned ? (
                                  <button
                                    onClick={() => setConfirm({ action: 'unban', user: u })}
                                    className="px-2.5 py-1 bg-green-900/30 hover:bg-green-900/60 border border-green-800/50
                                               text-green-400 rounded-lg text-xs transition"
                                  >
                                    ✅ Розблок.
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setConfirm({ action: 'ban', user: u })}
                                    className="px-2.5 py-1 bg-red-900/30 hover:bg-red-900/60 border border-red-800/50
                                               text-red-400 rounded-lg text-xs transition"
                                  >
                                    🚫 Блок.
                                  </button>
                                )}
                                <button
                                  onClick={() => setConfirm({ action: 'reset_password', user: u })}
                                  className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600
                                             text-gray-300 rounded-lg text-xs transition"
                                >
                                  🔑 Пароль
                                </button>
                                <button
                                  onClick={() => setConfirm({ action: 'delete', user: u })}
                                  className="px-2.5 py-1 bg-red-950/60 hover:bg-red-900/60 border border-red-900/40
                                             text-red-500 rounded-lg text-xs transition"
                                >
                                  🗑
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Result count */}
            {!loading && filtered.length > 0 && (
              <p className="text-gray-600 text-xs text-right">
                Показано {filtered.length} з {total} користувачів
              </p>
            )}

          </div>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="font-bold text-white text-base mb-2">
              {confirm.action === 'ban'            && '🚫 Заблокувати користувача'}
              {confirm.action === 'unban'          && '✅ Розблокувати користувача'}
              {confirm.action === 'reset_password' && '🔑 Скинути пароль'}
              {confirm.action === 'delete'         && '🗑️ Видалити користувача'}
            </h3>
            <p className="text-gray-400 text-sm mb-1">
              {confirm.action === 'delete'
                ? 'Ця дія незворотня! Користувача та всі його дані буде видалено.'
                : 'Підтвердіть дію для користувача:'}
            </p>
            <p className="text-blue-300 text-sm font-medium mb-5">{confirm.user.email}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm transition"
              >
                Скасувати
              </button>
              <button
                onClick={() => {
                  if (confirm.action === 'delete') deleteUser(confirm.user)
                  else doAction(confirm.action, confirm.user)
                }}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition ${
                  confirm.action === 'delete' || confirm.action === 'ban'
                    ? 'bg-red-700 hover:bg-red-600 text-white'
                    : 'bg-blue-700 hover:bg-blue-600 text-white'
                }`}
              >
                Підтвердити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
