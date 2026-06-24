'use client'
// app/crime-reports/[id]/page.tsx — Детальний перегляд довідки

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams }             from 'next/navigation'
import Sidebar from '../../components/Sidebar'

interface CryptoAddr { address: string; type: string }

interface CrimeReport {
  id:                string
  title:             string
  erdr_number:       string | null
  location:          string | null
  incident_date:     string | null
  author_id:         string
  file_url:          string | null
  file_name:         string | null
  file_type:         string | null
  file_size_kb:      number | null
  extracted_text:    string | null
  summary:           string | null
  entities:          { names: string[]; phones: string[]; ipn: string[]; crypto: CryptoAddr[]; vehicles: string[] }
  crypto_risk_score: number
  watchlist_hits:    Array<{ entity_type: string; value: string; label: string; priority: string }>
  tags:              string[]
  status:            string
  created_at:        string
}

const RISK_COLOR: Record<string, string> = {
  NONE: '#4b5563', LOW: '#22c55e', MEDIUM: '#f59e0b', HIGH: '#ef4444', CRITICAL: '#a855f7',
}

function riskLabel(score: number) {
  if (score >= 80) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 20) return 'MEDIUM'
  if (score > 0)   return 'LOW'
  return 'NONE'
}

const PRIORITY_COLOR: Record<string, string> = {
  low: '#22c55e', medium: '#f59e0b', high: '#ef4444', critical: '#a855f7',
}

export default function CrimeReportDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [report,    setReport]    = useState<CrimeReport | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [viewUrl,   setViewUrl]   = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [tab,       setTab]       = useState<'viewer' | 'text' | 'graph'>('viewer')
  const [deleting,  setDeleting]  = useState(false)

  const load = useCallback(async () => {
    const res  = await fetch(`/api/crime-reports/${id}`)
    const json = await res.json()
    if (res.ok) setReport(json)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function openFile() {
    if (!report?.file_url) return
    setLoadingUrl(true)
    const res  = await fetch(`/api/crime-reports/${id}/signed-url`)
    const json = await res.json()
    if (json.url) setViewUrl(json.url)
    setLoadingUrl(false)
  }

  async function downloadFile() {
    if (!viewUrl) { await openFile(); return }
    const a = document.createElement('a')
    a.href = viewUrl
    a.download = report?.file_name ?? 'document'
    a.click()
  }

  async function handleDelete() {
    if (!confirm('Видалити цю довідку? Дію неможливо скасувати.')) return
    setDeleting(true)
    const res = await fetch(`/api/crime-reports/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/crime-reports')
    else setDeleting(false)
  }

  if (loading) return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)' }}>
      <Sidebar />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm" style={{ color: 'var(--odb-text-faint)' }}>Завантаження...</div>
      </div>
    </div>
  )

  if (!report) return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)' }}>
      <Sidebar />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white">Довідку не знайдено</div>
      </div>
    </div>
  )

  const risk  = riskLabel(report.crypto_risk_score)
  const riskC = RISK_COLOR[risk]
  const totalEntities =
    report.entities.names.length + report.entities.phones.length +
    report.entities.crypto.length + report.entities.vehicles.length + report.entities.ipn.length

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)' }}>
    <Sidebar />
    <div className="flex-1 flex flex-col min-h-0" style={{ minWidth: 0 }}>

      {/* Header */}
      <div className="px-6 py-4 border-b flex items-start justify-between gap-4 shrink-0"
           style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/crime-reports')}
                  className="mt-0.5 p-1.5 rounded-lg hover:bg-white/5 transition shrink-0"
                  style={{ color: 'var(--odb-text-faint)' }}>
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
              {report.title}
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold"
                    style={{ color: riskC, background: `${riskC}22` }}>
                CRYPTO {risk} {report.crypto_risk_score > 0 ? `${report.crypto_risk_score}/100` : ''}
              </span>
              {report.watchlist_hits.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold"
                      style={{ color: '#ef4444', background: 'rgba(239,68,68,0.15)' }}>
                  🚨 WATCHLIST
                </span>
              )}
            </h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs" style={{ color: 'var(--odb-text-faint)' }}>
              {report.erdr_number   && <span>ЄРДР: <span className="font-mono text-white">{report.erdr_number}</span></span>}
              {report.location      && <span>📍 {report.location}</span>}
              {report.incident_date && <span>📅 {report.incident_date}</span>}
              <span>Завантажено: {new Date(report.created_at).toLocaleString('uk-UA')}</span>
              {report.file_name && <span>📄 {report.file_name} {report.file_size_kb ? `(${report.file_size_kb} KB)` : ''}</span>}
            </div>
            {report.tags.length > 0 && (
              <div className="flex gap-1 mt-1.5">
                {report.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded text-xs"
                        style={{ background: 'var(--odb-surface-2)', color: 'var(--odb-text-dim)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          {report.file_url && (
            <>
              <button onClick={openFile} disabled={loadingUrl || !!viewUrl}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:bg-white/5"
                      style={{ borderColor: 'var(--odb-border-soft)', color: 'var(--odb-text-dim)' }}>
                {loadingUrl ? '...' : viewUrl ? '✓ Відкрито' : '👁 Переглянути'}
              </button>
              <button onClick={downloadFile}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border transition hover:bg-white/5"
                      style={{ borderColor: 'var(--odb-border-soft)', color: 'var(--odb-text-dim)' }}>
                ⬇ Завантажити
              </button>
            </>
          )}
          <button onClick={handleDelete} disabled={deleting}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition"
                  style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444' }}>
            {deleting ? '...' : '🗑'}
          </button>
        </div>
      </div>

      {/* Body: two-column layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT — document viewer / text */}
        <div className="flex-1 flex flex-col min-w-0 border-r" style={{ borderColor: 'var(--odb-border-soft)' }}>

          {/* Tab bar */}
          <div className="flex border-b px-4 pt-3 gap-1 shrink-0" style={{ borderColor: 'var(--odb-border-soft)' }}>
            {report.file_url && (
              <TabBtn active={tab === 'viewer'} onClick={() => setTab('viewer')} label="Документ" />
            )}
            {report.extracted_text && (
              <TabBtn active={tab === 'text'} onClick={() => setTab('text')} label="Витягнутий текст" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            {tab === 'viewer' && (
              <>
                {!viewUrl ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <div className="text-4xl">📄</div>
                    <p className="text-sm" style={{ color: 'var(--odb-text-faint)' }}>
                      Натисніть &quot;Переглянути&quot; для завантаження захищеного URL
                    </p>
                    <button onClick={openFile} disabled={loadingUrl}
                            className="px-5 py-2 rounded-xl text-sm font-medium text-white"
                            style={{ background: 'var(--odb-accent-hi)' }}>
                      {loadingUrl ? 'Завантаження...' : 'Відкрити документ'}
                    </button>
                  </div>
                ) : report.file_type === 'pdf' ? (
                  <iframe src={viewUrl} className="w-full rounded-xl border"
                          style={{ height: 'calc(100vh - 240px)', borderColor: 'var(--odb-border-soft)' }} />
                ) : (
                  <div className="text-center p-8" style={{ color: 'var(--odb-text-faint)' }}>
                    <p className="text-sm">DOCX/XLSX — завантажте файл для перегляду</p>
                    <button onClick={downloadFile}
                            className="mt-3 px-4 py-2 rounded-lg text-sm font-medium"
                            style={{ background: 'var(--odb-accent-hi)', color: 'black' }}>
                      Завантажити
                    </button>
                  </div>
                )}
              </>
            )}

            {tab === 'text' && report.extracted_text && (
              <div className="rounded-xl p-4 font-mono text-xs leading-relaxed overflow-auto whitespace-pre-wrap"
                   style={{
                     background: 'var(--odb-surface)',
                     color: 'var(--odb-text-dim)',
                     maxHeight: 'calc(100vh - 260px)',
                   }}>
                {report.extracted_text}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — entities, summary, watchlist */}
        <div className="w-80 shrink-0 flex flex-col overflow-y-auto p-4 gap-4"
             style={{ background: 'var(--odb-surface)' }}>

          {/* AI Summary */}
          {report.summary && (
            <Panel title="AI-аналіз" icon="🤖">
              <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--odb-text-dim)' }}>
                {report.summary}
              </p>
            </Panel>
          )}

          {/* Watchlist hits */}
          {report.watchlist_hits.length > 0 && (
            <Panel title={`Watchlist збіги (${report.watchlist_hits.length})`} icon="🚨"
                   headerColor="rgba(239,68,68,0.15)" borderColor="rgba(239,68,68,0.3)">
              <div className="space-y-2">
                {report.watchlist_hits.map((hit, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded text-xs font-bold uppercase shrink-0"
                          style={{
                            color: PRIORITY_COLOR[hit.priority] ?? '#ef4444',
                            background: `${PRIORITY_COLOR[hit.priority] ?? '#ef4444'}22`,
                          }}>
                      {hit.priority}
                    </span>
                    <div>
                      <div style={{ color: 'var(--odb-text-dim)' }}>{hit.entity_type.toUpperCase()}</div>
                      <div className="font-mono" style={{ color: 'white' }}>{hit.value}</div>
                      {hit.label && <div style={{ color: 'var(--odb-text-faint)' }}>{hit.label}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Names */}
          {report.entities.names.length > 0 && (
            <Panel title={`ПІБ (${report.entities.names.length})`} icon="👤">
              <div className="flex flex-wrap gap-1.5">
                {report.entities.names.map((n, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-xs text-white"
                        style={{ background: 'var(--odb-surface-2)' }}>
                    {n}
                  </span>
                ))}
              </div>
            </Panel>
          )}

          {/* Phones */}
          {report.entities.phones.length > 0 && (
            <Panel title={`Телефони (${report.entities.phones.length})`} icon="📞">
              <div className="space-y-1">
                {report.entities.phones.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="font-mono text-xs text-white">{p}</span>
                    <button
                      onClick={() => window.open(`/phone-search?q=${encodeURIComponent(p)}`, '_blank')}
                      className="text-xs px-2 py-0.5 rounded transition hover:bg-white/10"
                      style={{ color: 'var(--odb-accent-hi)' }}>
                      пошук →
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* ІПН */}
          {report.entities.ipn.length > 0 && (
            <Panel title={`ІПН (${report.entities.ipn.length})`} icon="🪪">
              <div className="space-y-1">
                {report.entities.ipn.map((n, i) => (
                  <span key={i} className="block font-mono text-xs text-white">{n}</span>
                ))}
              </div>
            </Panel>
          )}

          {/* Crypto */}
          {report.entities.crypto.length > 0 && (
            <Panel title={`Крипто (${report.entities.crypto.length})`} icon="🔐"
                   headerColor="rgba(168,85,247,0.1)" borderColor="rgba(168,85,247,0.3)">
              <div className="space-y-2">
                {report.entities.crypto.map((c, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                            style={{ background: 'rgba(168,85,247,0.2)', color: '#a855f7' }}>
                        {c.type}
                      </span>
                    </div>
                    <div className="font-mono text-xs break-all" style={{ color: 'var(--odb-text-dim)' }}>
                      {c.address}
                    </div>
                    <button
                      onClick={() => window.open(`/crypto-intel?q=${encodeURIComponent(c.address)}`, '_blank')}
                      className="text-xs transition hover:opacity-80"
                      style={{ color: 'var(--odb-accent-hi)' }}>
                      перевірити →
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Vehicles */}
          {report.entities.vehicles.length > 0 && (
            <Panel title={`Номерні знаки (${report.entities.vehicles.length})`} icon="🚗">
              <div className="flex flex-wrap gap-2">
                {report.entities.vehicles.map((v, i) => (
                  <span key={i} className="px-3 py-1 rounded-lg font-mono text-sm font-bold text-white border"
                        style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)' }}>
                    {v}
                  </span>
                ))}
              </div>
            </Panel>
          )}

          {totalEntities === 0 && !report.summary && (
            <div className="text-center py-8" style={{ color: 'var(--odb-text-faint)' }}>
              <p className="text-sm">Сутностей не виявлено</p>
              <p className="text-xs mt-1">Можливо, документ не містить тексту або є зображенням</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  )
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all"
      style={{
        color:       active ? 'var(--odb-accent-hi)' : 'var(--odb-text-faint)',
        borderColor: active ? 'var(--odb-accent-hi)' : 'transparent',
        background:  active ? 'var(--odb-accent-glow)' : 'transparent',
      }}
    >
      {label}
    </button>
  )
}

function Panel({
  title, icon, children, headerColor, borderColor,
}: {
  title:        string
  icon:         string
  children:     React.ReactNode
  headerColor?: string
  borderColor?: string
}) {
  return (
    <div className="rounded-xl border overflow-hidden"
         style={{ borderColor: borderColor ?? 'var(--odb-border-soft)', background: 'var(--odb-surface-2)' }}>
      <div className="px-3 py-2 flex items-center gap-2 border-b text-xs font-semibold"
           style={{
             borderColor: borderColor ?? 'var(--odb-border-soft)',
             background:  headerColor ?? 'transparent',
             color: 'var(--odb-text-dim)',
           }}>
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}
