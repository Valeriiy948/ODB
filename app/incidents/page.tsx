'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import Icon from '../components/Icon'

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
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)', color: 'var(--odb-text)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{ background: 'var(--odb-surface)', borderBottom: '1px solid var(--odb-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', boxShadow: '0 0 16px rgba(220,38,38,0.3)' }}>
              <Icon name="scale" size={20} strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight" style={{ color: 'var(--odb-text)' }}>
                Реєстр злочинів
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--odb-text-dim)' }}>
                Всього: <span style={{ color: 'var(--odb-text)' }} className="font-medium">{total.toLocaleString()}</span>
              </p>
            </div>
          </div>
          <Link href="/incidents/new"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', color: '#fff', boxShadow: '0 0 12px rgba(220,38,38,0.25)' }}>
            + Новий інцидент
          </Link>
        </header>

        {/* Фільтри */}
        <div className="px-6 py-3 flex items-center gap-3 flex-wrap"
          style={{ borderBottom: '1px solid var(--odb-border)', background: 'var(--odb-surface2)' }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Пошук за назвою, місцем, описом..."
            className="flex-1 min-w-48 px-3 py-2 rounded-lg text-sm outline-none transition-all"
            style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
            onFocus={e => (e.target.style.borderColor = '#dc2626')}
            onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
          />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}>
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
              <p style={{ color: 'var(--odb-text-dim)' }}>Завантаження...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--odb-surface2)' }}>
                <Icon name="scale" size={28} strokeWidth={1.5} />
              </div>
              <p className="text-lg mb-1" style={{ color: 'var(--odb-text)' }}>Інцидентів не знайдено</p>
              <Link href="/incidents/new"
                className="inline-block mt-4 px-5 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', color: '#fff' }}>
                + Додати перший інцидент
              </Link>
            </div>
          ) : (
            <div style={{ borderTop: '1px solid var(--odb-border-soft)' }}>
              {filtered.map(inc => (
                <Link key={inc.id} href={`/incidents/${inc.id}`}
                  className="flex items-start gap-4 px-6 py-4 transition group"
                  style={{ borderBottom: '1px solid var(--odb-border-soft)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--odb-surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {/* Іконка типу */}
                  <div className="text-2xl w-8 flex-shrink-0 mt-0.5">
                    {TYPE_ICONS[inc.inc_type] || '❓'}
                  </div>

                  {/* Дані */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="font-medium transition" style={{ color: 'var(--odb-text)' }}>
                        {inc.title}
                      </span>
                      {inc.icc_article && (
                        <span className="px-2 py-0.5 rounded text-xs font-mono"
                          style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--odb-accent)', border: '1px solid rgba(59,130,246,0.3)' }}>
                          {inc.icc_article}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1 text-xs flex-wrap" style={{ color: 'var(--odb-text-faint)' }}>
                      {inc.date && <span>📅 {inc.date}</span>}
                      {inc.location && <span>📍 {inc.location}</span>}
                      {inc.inc_type && inc.inc_type !== 'unknown' && (
                        <span>· {inc.inc_type}</span>
                      )}
                    </div>
                    {inc.description && (
                      <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--odb-text-dim)' }}>{inc.description}</p>
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
