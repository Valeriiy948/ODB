'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-900/60 text-red-300 border-red-700',
  high:     'bg-orange-900/60 text-orange-300 border-orange-700',
  medium:   'bg-yellow-900/60 text-yellow-300 border-yellow-700',
  low:      'bg-gray-700 text-gray-300 border-gray-600',
}

const TYPE_ICONS: Record<string, string> = {
  обстріл: '💥', катування: '⛓️', вбивство: '💀',
  мародерство: '🏴‍☠️', зґвалтування: '🚨', депортація: '🚌', unknown: '❓',
}

const INC_TYPES = ['обстріл', 'катування', 'вбивство', 'мародерство', 'зґвалтування', 'депортація', 'unknown']

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    load()
  }, [filterType])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (filterType) params.set('type', filterType)
      const res = await fetch(`/api/incidents?${params}`)
      const data = await res.json()
      setIncidents(data.data || [])
      setTotal(data.total || 0)
    } catch {}
    setLoading(false)
  }

  const filtered = query.trim().length > 1
    ? incidents.filter(i =>
        i.title?.toLowerCase().includes(query.toLowerCase()) ||
        i.location?.toLowerCase().includes(query.toLowerCase()) ||
        i.description?.toLowerCase().includes(query.toLowerCase())
      )
    : incidents

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">⚖️ Реєстр злочинів</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              Всього: <span className="text-white font-medium">{total.toLocaleString()}</span>
            </p>
          </div>
          <Link href="/incidents/new"
            className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium transition">
            + Новий інцидент
          </Link>
        </header>

        {/* Фільтри */}
        <div className="border-b border-gray-700 px-6 py-3 flex items-center gap-3 flex-wrap bg-gray-800/30">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Пошук за назвою, місцем, описом..."
            className="flex-1 min-w-48 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none"
          />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none">
            <option value="">Всі типи</option>
            {INC_TYPES.map(t => (
              <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>
            ))}
          </select>
        </div>

        {/* Список */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-gray-400">Завантаження...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-5xl mb-4">⚖️</p>
              <p className="text-gray-400 text-lg">Інцидентів не знайдено</p>
              <Link href="/incidents/new"
                className="inline-block mt-4 px-5 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium transition">
                + Додати перший інцидент
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-700/30">
              {filtered.map(inc => (
                <Link key={inc.id} href={`/incidents/${inc.id}`}
                  className="flex items-start gap-4 px-6 py-4 hover:bg-gray-800/40 transition group">
                  {/* Іконка типу */}
                  <div className="text-2xl w-8 flex-shrink-0 mt-0.5">
                    {TYPE_ICONS[inc.inc_type] || '❓'}
                  </div>

                  {/* Дані */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-white font-medium group-hover:text-red-300 transition">
                        {inc.title}
                      </span>
                      {inc.icc_article && (
                        <span className="px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded text-xs font-mono border border-blue-800">
                          {inc.icc_article}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      {inc.date && <span>📅 {inc.date}</span>}
                      {inc.location && <span>📍 {inc.location}</span>}
                      {inc.inc_type && inc.inc_type !== 'unknown' && (
                        <span>🔹 {inc.inc_type}</span>
                      )}
                    </div>
                    {inc.description && (
                      <p className="text-gray-400 text-sm mt-1 line-clamp-2">{inc.description}</p>
                    )}
                  </div>

                  {/* Тяжкість + статус */}
                  <div className="flex flex-col gap-1 flex-shrink-0 items-end">
                    <span className={`px-2 py-0.5 rounded text-xs border ${SEVERITY_COLORS[inc.severity] || SEVERITY_COLORS.medium}`}>
                      {inc.severity}
                    </span>
                    <span className="text-gray-600 text-xs">{inc.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
