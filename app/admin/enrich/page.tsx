'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Stats {
  total: number
  enriched: number
  withPhoto: number
  pending: number
}

interface BatchResult {
  processed: number
  enriched: number
  notFound: number
  skipped: number
}

export default function AdminEnrichPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [batchSize, setBatchSize] = useState(10)
  const [totalProcessed, setTotalProcessed] = useState(0)
  const [totalEnriched, setTotalEnriched] = useState(0)
  const runRef = useRef(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadStats()
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  async function loadStats() {
    const res = await fetch('/api/persons/bulk-enrich')
    const data = await res.json()
    setStats(data)
  }

  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString('uk-UA')
    setLog(prev => [...prev.slice(-200), `[${time}] ${msg}`])
  }

  async function startEnrich() {
    if (running) return
    setRunning(true)
    setPaused(false)
    runRef.current = true
    setLog([])
    setTotalProcessed(0)
    setTotalEnriched(0)
    addLog('🚀 Починаємо масове збагачення...')

    let iteration = 0

    while (runRef.current) {
      if (paused) {
        await new Promise(r => setTimeout(r, 1000))
        continue
      }

      try {
        const res = await fetch('/api/persons/bulk-enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize, onlyWithoutMyrotvorets: true }),
        })
        const data: BatchResult & { done?: boolean; message?: string } = await res.json()

        if (data.done) {
          addLog('✅ Всі особи оброблені!')
          break
        }

        iteration++
        setTotalProcessed(p => p + data.processed)
        setTotalEnriched(e => e + data.enriched)

        addLog(
          `Батч ${iteration}: оброблено ${data.processed}, знайдено ${data.enriched}, ` +
          `не знайдено ${data.notFound}, пропущено ${data.skipped}`
        )

        // Оновлюємо статистику кожні 5 батчів
        if (iteration % 5 === 0) {
          await loadStats()
        }

        // Пауза між батчами (щоб не перевантажити Serper API)
        await new Promise(r => setTimeout(r, 2000))

      } catch (e: any) {
        addLog(`❌ Помилка: ${e.message}`)
        await new Promise(r => setTimeout(r, 5000))
      }
    }

    setRunning(false)
    runRef.current = false
    await loadStats()
    addLog('⏹ Зупинено.')
  }

  function stop() {
    runRef.current = false
    setPaused(false)
    setRunning(false)
    addLog('⏹ Зупиняємо...')
  }

  const progress = stats ? Math.round((stats.enriched / Math.max(stats.total, 1)) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">

        {/* Заголовок */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/persons" className="text-slate-400 hover:text-white transition-colors">← Назад</Link>
          <h1 className="text-2xl font-bold">🔄 Масове збагачення бази</h1>
        </div>

        {/* Статистика */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Всього', value: stats.total.toLocaleString(), color: 'text-white' },
              { label: 'Збагачено', value: stats.enriched.toLocaleString(), color: 'text-green-400' },
              { label: 'З фото', value: stats.withPhoto.toLocaleString(), color: 'text-blue-400' },
              { label: 'Очікують', value: stats.pending.toLocaleString(), color: 'text-yellow-400' },
            ].map(s => (
              <div key={s.label} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Прогрес бар */}
        {stats && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">Прогрес збагачення</span>
              <span className="text-white font-medium">{progress}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-3">
              <div
                className="bg-green-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Налаштування */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">⚙️ Налаштування</h2>

          <div className="flex items-center gap-6">
            <div>
              <label className="text-slate-400 text-xs block mb-1">Розмір батчу (осіб за раз)</label>
              <select
                value={batchSize}
                onChange={e => setBatchSize(Number(e.target.value))}
                disabled={running}
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                {[5, 10, 15, 20].map(n => (
                  <option key={n} value={n}>{n} осіб</option>
                ))}
              </select>
            </div>

            <div className="text-slate-500 text-xs">
              <p>Serper API: ~{batchSize * 2} запити/батч</p>
              <p>Затримка: 2 сек між батчами</p>
            </div>
          </div>
        </div>

        {/* Кнопки управління */}
        <div className="flex gap-3 mb-6">
          {!running ? (
            <button
              onClick={startEnrich}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-medium transition-colors flex items-center gap-2"
            >
              ▶️ Запустити збагачення
            </button>
          ) : (
            <>
              <button
                onClick={stop}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-medium transition-colors"
              >
                ⏹ Зупинити
              </button>
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <div className="animate-spin w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full"/>
                Обробляємо... ({totalProcessed} оброблено, {totalEnriched} знайдено)
              </div>
            </>
          )}

          <button
            onClick={loadStats}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm transition-colors"
          >
            🔄 Оновити статистику
          </button>
        </div>

        {/* Лог */}
        {log.length > 0 && (
          <div className="bg-slate-950 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-2 bg-slate-800 border-b border-slate-700 text-xs text-slate-400 font-mono">
              Лог виконання
            </div>
            <div ref={logRef} className="h-64 overflow-y-auto p-4 font-mono text-xs text-slate-300 space-y-0.5">
              {log.map((line, i) => (
                <div key={i} className={
                  line.includes('✅') ? 'text-green-400' :
                  line.includes('❌') ? 'text-red-400' :
                  line.includes('знайдено') ? 'text-yellow-300' :
                  'text-slate-400'
                }>
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Інформація */}
        <div className="mt-6 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 text-sm text-slate-400">
          <p className="font-medium text-slate-300 mb-2">ℹ️ Як це працює</p>
          <p>Система шукає кожну особу в Myrotvorets через Google (Serper API). Якщо знаходить — автоматично зберігає URL, дату народження, опис та позначає як верифіковану. Фото імпортується окремо через кнопку "Миротворець" на картці особи.</p>
          <p className="mt-2 text-yellow-400/70">⚠️ Serper API має ліміт. Рекомендуємо запускати батчами по 10 осіб і робити перерви.</p>
        </div>
      </div>
    </div>
  )
}
