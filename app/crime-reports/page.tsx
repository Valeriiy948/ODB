'use client'
// app/crime-reports/page.tsx — Реєстр довідок по злочинах

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../components/Sidebar'

interface CrimeReport {
  id:                string
  title:             string
  erdr_number:       string | null
  location:          string | null
  incident_date:     string | null
  file_type:         string | null
  crypto_risk_score: number
  entities:          { names: string[]; phones: string[]; ipn: string[]; crypto: Array<{ address: string; type: string }>; vehicles: string[] }
  tags:              string[]
  status:            string
  created_at:        string
  summary:           string | null
  watchlist_hits:    unknown[]
}

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  NONE:     { label: 'NONE',     color: '#4b5563', bg: 'rgba(75,85,99,0.15)'   },
  LOW:      { label: 'LOW',      color: '#22c55e', bg: 'rgba(34,197,94,0.15)'  },
  MEDIUM:   { label: 'MEDIUM',   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  HIGH:     { label: 'HIGH',     color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
  CRITICAL: { label: 'CRITICAL', color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
}

function riskLabel(score: number) {
  if (score >= 80) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 20) return 'MEDIUM'
  if (score > 0)   return 'LOW'
  return 'NONE'
}

function fileIcon(type: string | null) {
  if (type === 'pdf')  return '📄'
  if (type === 'docx') return '📝'
  if (type === 'xlsx') return '📊'
  return '📎'
}

export default function CrimeReportsPage() {
  const router = useRouter()
  const [reports, setReports] = useState<CrimeReport[]>([])
  const [loading, setLoading] = useState(true)
  const [query,   setQuery]   = useState('')
  const [riskFilter, setRiskFilter] = useState(0)

  const load = useCallback(async (q: string, minRisk: number) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '50' })
    if (q)       params.set('q', q)
    if (minRisk) params.set('risk_min', String(minRisk))
    const res  = await fetch(`/api/crime-reports?${params}`)
    const json = await res.json()
    setReports(json.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load('', 0) }, [load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    load(query, riskFilter)
  }

  const totalEntities = (r: CrimeReport) =>
    r.entities.names.length + r.entities.phones.length + r.entities.crypto.length +
    r.entities.vehicles.length + r.entities.ipn.length

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)' }}>
    <Sidebar />
    <div className="flex-1 p-6 space-y-6" style={{ minWidth: 0 }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Довідки по злочинах</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--odb-text-faint)' }}>
            Аналіз документів · NER · Крипто-ризик · Watchlist
          </p>
        </div>
        <button
          onClick={() => router.push('/crime-reports/new')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-black transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, var(--odb-accent-hi), var(--odb-accent-lo))' }}
        >
          + Завантажити довідку
        </button>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Пошук по тексту, ЄРДР, місцю, іменам..."
          className="flex-1 px-4 py-2.5 rounded-xl text-sm text-white border outline-none transition"
          style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)', caretColor: 'var(--odb-accent-hi)' }}
        />
        <select
          value={riskFilter}
          onChange={e => setRiskFilter(Number(e.target.value))}
          className="px-3 py-2.5 rounded-xl text-sm border text-white outline-none"
          style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)' }}
        >
          <option value={0}>Будь-який ризик</option>
          <option value={20}>Ризик ≥ LOW</option>
          <option value={50}>Ризик ≥ HIGH</option>
          <option value={80}>Ризик ≥ CRITICAL</option>
        </select>
        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: 'var(--odb-accent-hi)' }}
        >
          Пошук
        </button>
      </form>

      {/* Stats bar */}
      {!loading && (
        <div className="flex gap-4 text-sm" style={{ color: 'var(--odb-text-faint)' }}>
          <span>{reports.length} довідок</span>
          <span>·</span>
          <span>{reports.filter(r => r.crypto_risk_score >= 50).length} з крипто-ризиком</span>
          <span>·</span>
          <span>{reports.filter(r => (r.watchlist_hits as unknown[])?.length > 0).length} watchlist-збігів</span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-sm" style={{ color: 'var(--odb-text-faint)' }}>Завантаження...</div>
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="text-lg text-white">Довідок не знайдено</p>
          <p className="text-sm" style={{ color: 'var(--odb-text-faint)' }}>
            Завантажте перший документ для аналізу
          </p>
          <button
            onClick={() => router.push('/crime-reports/new')}
            className="mt-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ background: 'var(--odb-accent-hi)' }}
          >
            Завантажити
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--odb-border-soft)', background: 'var(--odb-surface)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--odb-border-soft)' }}>
                {['Документ', 'ЄРДР', 'Місце', 'Сутності', 'Крипто-ризик', 'Дата'].map(h => (
                  <th key={h} className="px-4 py-3 font-medium text-xs tracking-wide uppercase"
                      style={{ color: 'var(--odb-text-faint)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map((r, i) => {
                const risk   = riskLabel(r.crypto_risk_score)
                const rc     = RISK_CONFIG[risk]
                const hasWL  = (r.watchlist_hits as unknown[])?.length > 0
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/crime-reports/${r.id}`)}
                    className="border-b transition-all cursor-pointer"
                    style={{
                      borderColor: 'var(--odb-border-soft)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--odb-surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)')}
                  >
                    {/* Назва */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{fileIcon(r.file_type)}</span>
                        <div>
                          <div className="font-medium text-white flex items-center gap-1.5">
                            {hasWL && <span title="Watchlist збіг" className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                            <span className="truncate max-w-[220px]">{r.title}</span>
                          </div>
                          {r.summary && (
                            <div className="text-xs mt-0.5 truncate max-w-[220px]"
                                 style={{ color: 'var(--odb-text-faint)' }}>
                              {r.summary.slice(0, 80)}…
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* ЄРДР */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs" style={{ color: r.erdr_number ? 'var(--odb-accent-hi)' : 'var(--odb-text-faint)' }}>
                        {r.erdr_number ?? '—'}
                      </span>
                    </td>
                    {/* Місце */}
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: 'var(--odb-text-dim)' }}>
                        {r.location ?? '—'}
                      </span>
                    </td>
                    {/* Сутності */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.entities.names.length > 0   && <Badge label={`👤 ${r.entities.names.length}`}   />}
                        {r.entities.phones.length > 0  && <Badge label={`📞 ${r.entities.phones.length}`}  />}
                        {r.entities.crypto.length > 0  && <Badge label={`🔐 ${r.entities.crypto.length}`} color="#a855f7" />}
                        {r.entities.vehicles.length > 0 && <Badge label={`🚗 ${r.entities.vehicles.length}`} />}
                        {totalEntities(r) === 0 && <span style={{ color: 'var(--odb-text-faint)' }}>—</span>}
                      </div>
                    </td>
                    {/* Ризик */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold"
                            style={{ color: rc.color, background: rc.bg }}>
                        {risk === 'NONE' ? '—' : `${risk} ${r.crypto_risk_score}`}
                      </span>
                    </td>
                    {/* Дата */}
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: 'var(--odb-text-faint)' }}>
                        {new Date(r.created_at).toLocaleDateString('uk-UA')}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </div>
  )
}

function Badge({ label, color = '#6b7280' }: { label: string; color?: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs"
          style={{ background: `${color}22`, color }}>
      {label}
    </span>
  )
}
