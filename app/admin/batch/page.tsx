'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Sidebar from '../../components/Sidebar'

interface QueueStats {
  pending: number
  running: number
  done: number
  error: number
}

interface RecentTask {
  id: string
  person_id: string
  status: string
  modules: string[]
  created_at: string
  finished_at?: string
  error_msg?: string
}

export default function BatchOsintPage() {
  const [stats, setStats] = useState<QueueStats>({ pending: 0, running: 0, done: 0, error: 0 })
  const [recent, setRecent] = useState<RecentTask[]>([])
  const [loading, setLoading] = useState(false)
  const [queueing, setQueueing] = useState(false)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  // Параметри batch
  const [filter, setFilter] = useState<'myrotvorets' | 'no_osint' | 'low_score' | 'all'>('myrotvorets')
  const [modules, setModules] = useState<string[]>(['web', 'ai'])
  const [limit, setLimit] = useState(100)
  const [autoRun, setAutoRun] = useState(false)

  const moduleOptions = [
    { id: 'web',      label: '🌐 Веб OSINT',    desc: 'Tavily пошук' },
    { id: 'ai',       label: '🤖 AI профіль',   desc: 'Claude Haiku' },
    { id: 'edr',      label: '🏢 ЄДР',          desc: 'data.gov.ua' },
    { id: 'vk',       label: '💙 VK',           desc: 'VK API (потр. токен)' },
    { id: 'vehicles', label: '🚗 Авто',         desc: 'ГИБДД telegram' },
  ]

  async function loadStats() {
    try {
      const res = await fetch('/api/osint/batch')
      if (!res.ok) return
      const data = await res.json()
      setStats(data.queue || { pending: 0, running: 0, done: 0, error: 0 })
      setRecent(data.recent || [])
    } catch {}
  }

  useEffect(() => {
    loadStats()
    pollRef.current = setInterval(loadStats, 5000)
    return () => clearInterval(pollRef.current)
  }, [])

  async function addToQueue() {
    setQueueing(true); setMessage(''); setError('')
    try {
      const res = await fetch('/api/osint/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter, modules, limit, priority: filter === 'myrotvorets' ? 1 : 5 }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setMessage(`✅ ${data.message}`)
      await loadStats()
      if (autoRun) await runWorker()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setQueueing(false)
    }
  }

  async function runWorker() {
    setRunning(true); setError('')
    try {
      const res = await fetch('/api/osint/batch?run=true', { method: 'POST' })
      const data = await res.json()
      setMessage(`⚙️ ${data.message}`)
      await loadStats()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  async function clearDone() {
    try {
      await fetch('/api/osint/batch/clear', { method: 'POST' })
      await loadStats()
    } catch {}
  }

  const toggleModule = (id: string) => {
    setModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  }

  const total = stats.pending + stats.running + stats.done + stats.error
  const donePercent = total > 0 ? Math.round((stats.done / total) * 100) : 0

  return (
    <div className="flex min-h-screen bg-gray-900">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">⚙️ Batch OSINT</h1>
            <p className="text-gray-400 text-sm mt-1">Масове збагачення 167k записів</p>
          </div>
          <Link href="/persons" className="text-gray-400 hover:text-white text-sm transition">
            ← Назад до списку
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ліва колонка — налаштування */}
          <div className="lg:col-span-1 space-y-4">
            {/* Фільтр */}
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="text-white font-semibold mb-3 text-sm">🎯 Які записи обробляти</h2>
              <div className="space-y-2">
                {[
                  { id: 'myrotvorets', label: '🔴 Тільки Myrotvorets', desc: 'Найвищий пріоритет' },
                  { id: 'no_osint',    label: '⬜ Без OSINT',           desc: 'last_full_osint IS NULL' },
                  { id: 'low_score',   label: '🟡 Myrotvorets + score<30', desc: 'Потребують оновлення' },
                  { id: 'all',         label: '📋 Всі записи',          desc: 'Попередження: 167k!' },
                ].map(opt => (
                  <label key={opt.id} className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer border transition ${
                    filter === opt.id
                      ? 'border-blue-500 bg-blue-900/20'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}>
                    <input
                      type="radio"
                      name="filter"
                      value={opt.id}
                      checked={filter === opt.id}
                      onChange={() => setFilter(opt.id as any)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-white text-sm font-medium">{opt.label}</div>
                      <div className="text-gray-500 text-xs">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Модулі */}
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="text-white font-semibold mb-3 text-sm">🔧 Модулі OSINT</h2>
              <div className="space-y-2">
                {moduleOptions.map(mod => (
                  <label key={mod.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition ${
                    modules.includes(mod.id)
                      ? 'border-green-600 bg-green-900/20'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}>
                    <input
                      type="checkbox"
                      checked={modules.includes(mod.id)}
                      onChange={() => toggleModule(mod.id)}
                    />
                    <div className="flex-1">
                      <div className="text-white text-sm">{mod.label}</div>
                      <div className="text-gray-500 text-xs">{mod.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Ліміт */}
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="text-white font-semibold mb-3 text-sm">📊 Кількість записів</h2>
              <input
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={e => setLimit(Number(e.target.value))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
              <p className="text-gray-500 text-xs mt-1">Макс. 500 за раз. Для всіх — запускайте повторно.</p>

              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRun}
                  onChange={e => setAutoRun(e.target.checked)}
                />
                <span className="text-gray-300 text-sm">Автоматично запустити після додавання</span>
              </label>
            </div>

            {/* Кнопки */}
            <div className="space-y-2">
              <button
                onClick={addToQueue}
                disabled={queueing || modules.length === 0}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2"
              >
                {queueing ? <><span className="animate-spin">⟳</span> Додаємо в чергу...</> : '➕ Додати в чергу'}
              </button>

              <button
                onClick={runWorker}
                disabled={running || stats.pending === 0}
                className="w-full py-3 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2"
              >
                {running ? <><span className="animate-spin">⟳</span> Обробляємо...</> : `▶️ Запустити воркер (${stats.pending} в черзі)`}
              </button>
            </div>

            {message && <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg text-green-300 text-sm">{message}</div>}
            {error   && <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}
          </div>

          {/* Права колонка — статус */}
          <div className="lg:col-span-2 space-y-4">
            {/* Прогрес */}
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="text-white font-semibold mb-4 text-sm">📈 Статус черги</h2>

              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'В черзі',    value: stats.pending, color: 'text-blue-400',   bg: 'bg-blue-900/20' },
                  { label: 'В роботі',   value: stats.running, color: 'text-yellow-400', bg: 'bg-yellow-900/20' },
                  { label: 'Виконано',   value: stats.done,    color: 'text-green-400',  bg: 'bg-green-900/20' },
                  { label: 'Помилка',    value: stats.error,   color: 'text-red-400',    bg: 'bg-red-900/20' },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center border border-gray-700`}>
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-gray-400 text-xs mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              {total > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Прогрес</span>
                    <span>{donePercent}% ({stats.done}/{total})</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
                      style={{ width: `${donePercent}%` }}
                    />
                  </div>
                </div>
              )}

              {total === 0 && (
                <p className="text-gray-500 text-sm text-center py-2">Черга порожня. Додайте записи через ліву панель.</p>
              )}
            </div>

            {/* Вартість */}
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="text-white font-semibold mb-3 text-sm">💰 Орієнтовна вартість</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between p-2 bg-gray-700/50 rounded-lg">
                  <span className="text-gray-400">Claude Haiku (AI)</span>
                  <span className="text-white font-mono">~$0.001/запис</span>
                </div>
                <div className="flex justify-between p-2 bg-gray-700/50 rounded-lg">
                  <span className="text-gray-400">Tavily (Веб)</span>
                  <span className="text-white font-mono">~5 кредитів</span>
                </div>
                <div className="flex justify-between p-2 bg-gray-700/50 rounded-lg">
                  <span className="text-gray-400">ЄДР</span>
                  <span className="text-green-400 font-mono">Безкоштовно</span>
                </div>
                <div className="flex justify-between p-2 bg-gray-700/50 rounded-lg">
                  <span className="text-gray-400">Для {limit} записів (AI)</span>
                  <span className="text-yellow-400 font-mono">${(limit * 0.001).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Останні задачі */}
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold text-sm">🕐 Останні задачі</h2>
                <button onClick={loadStats} className="text-gray-500 hover:text-gray-300 text-xs transition">
                  ↻ Оновити
                </button>
              </div>

              {recent.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-3">Немає задач</p>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {recent.map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-750 border border-gray-700/50 text-xs">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        task.status === 'done'    ? 'bg-green-400' :
                        task.status === 'running' ? 'bg-yellow-400 animate-pulse' :
                        task.status === 'error'   ? 'bg-red-400' : 'bg-gray-400'
                      }`} />
                      <Link href={`/persons/${task.person_id}`} className="text-blue-400 hover:text-blue-300 font-mono truncate" style={{maxWidth: '120px'}}>
                        {task.person_id.slice(0, 8)}...
                      </Link>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        task.status === 'done'    ? 'bg-green-900/50 text-green-300' :
                        task.status === 'running' ? 'bg-yellow-900/50 text-yellow-300' :
                        task.status === 'error'   ? 'bg-red-900/50 text-red-300' :
                                                    'bg-gray-700 text-gray-400'
                      }`}>{task.status}</span>
                      <span className="text-gray-500 flex-shrink-0">{(task.modules || []).join(', ')}</span>
                      <span className="text-gray-600 ml-auto flex-shrink-0">
                        {task.finished_at
                          ? new Date(task.finished_at).toLocaleTimeString('uk-UA')
                          : new Date(task.created_at).toLocaleTimeString('uk-UA')}
                      </span>
                      {task.error_msg && (
                        <span className="text-red-400 truncate" style={{maxWidth: '200px'}} title={task.error_msg}>
                          ⚠️ {task.error_msg.slice(0, 40)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Інструкція */}
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="text-white font-semibold mb-3 text-sm">📖 Як користуватись</h2>
              <ol className="text-gray-400 text-sm space-y-1.5">
                <li><span className="text-white">1.</span> Виберіть фільтр — рекомендується <strong className="text-red-400">Myrotvorets</strong></li>
                <li><span className="text-white">2.</span> Виберіть модулі (AI + Веб = базовий пакет)</li>
                <li><span className="text-white">3.</span> Встановіть ліміт (100-200 за раз)</li>
                <li><span className="text-white">4.</span> Натисніть <strong className="text-blue-400">Додати в чергу</strong></li>
                <li><span className="text-white">5.</span> Натисніть <strong className="text-green-400">Запустити воркер</strong> — обробляє 5 паралельно</li>
                <li><span className="text-white">6.</span> Повторюйте поки черга не закінчиться</li>
              </ol>
              <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-800/40 rounded-lg">
                <p className="text-yellow-300 text-xs">⚠️ Кожен запуск воркера обробляє 5 задач. Для 100 записів потрібно 20 запусків.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
