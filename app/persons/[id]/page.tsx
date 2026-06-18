'use client'

import { useState, useEffect } from 'react'
import Sidebar           from '../../components/Sidebar'
import ConnectionsGraph  from '../../components/ConnectionsGraph'
import EvidenceUploader  from '../../components/EvidenceUploader'
import AiProfileCard     from '../../components/AiProfileCard'

import { usePersonPage }       from './hooks/usePersonPage'
import { threatColor }         from './utils/person-utils'
import { NotesTab }            from './tabs/NotesTab'
import { UnitTab }             from './tabs/UnitTab'
import { DocumentsTab }        from './tabs/DocumentsTab'
import { IncidentsTab }        from './tabs/IncidentsTab'
import { RegistriesTab }       from './tabs/RegistriesTab'
import { CryptoWalletsTab }    from './tabs/CryptoWalletsTab'
import { OverviewTab }         from './tabs/OverviewTab'
import { OsintTab }            from './tabs/OsintTab'
import GraphTab               from './tabs/GraphTab'

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',     icon: '📋', label: 'Огляд' },
  { id: 'graph',        icon: '🕸️', label: 'Граф' },
  { id: 'connections',  icon: '🔗', label: "Зв'язки" },
  { id: 'incidents',    icon: '⚖️', label: 'Злочини' },
  { id: 'registries',   icon: '🏛️', label: 'Реєстри' },
  { id: 'media',        icon: '🎬', label: 'Медіа' },
  { id: 'documents',    icon: '📁', label: 'Документи' },
  { id: 'unit',         icon: '🏢', label: 'В/Ч та техніка' },
  { id: 'crypto',       icon: '₿',  label: 'Крипто' },
  { id: 'osint',        icon: '🔍', label: 'OSINT' },
  { id: 'notes',        icon: '📝', label: 'Нотатки' },
]

export default function PersonDetailPage() {
  const s = usePersonPage()

  // ── Investigation modal state ─────────────────────────────────────────────
  const [showInvModal, setShowInvModal] = useState(false)
  const [invList, setInvList] = useState<{ id: string; title: string; person_ids: string[] }[]>([])
  const [invLoading, setInvLoading] = useState(false)
  const [invAdding, setInvAdding] = useState<string | null>(null)
  const [invAdded, setInvAdded] = useState<string | null>(null)

  useEffect(() => {
    if (!showInvModal) return
    setInvLoading(true)
    fetch('/api/investigations?status=active')
      .then(r => r.json())
      .then(d => setInvList(d.data || []))
      .catch(() => {})
      .finally(() => setInvLoading(false))
  }, [showInvModal])

  async function addToInvestigation(invId: string) {
    if (!s.personId || invAdding) return
    setInvAdding(invId)
    const inv = invList.find(i => i.id === invId)
    if (!inv) { setInvAdding(null); return }
    const updated = [...new Set([...(inv.person_ids || []), s.personId])]
    await fetch(`/api/investigations/${invId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_ids: updated }),
    })
    setInvAdded(invId)
    setInvList(prev => prev.map(i => i.id === invId ? { ...i, person_ids: updated } : i))
    setInvAdding(null)
    setTimeout(() => setInvAdded(null), 2000)
  }

  // ── Loading / not found ───────────────────────────────────────────────────
  if (s.loading) return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)' }}>
      <Sidebar />
      <div className="flex-1 flex items-center justify-center">
        <p style={{ color: 'var(--odb-text-dim)' }}>Завантаження...</p>
      </div>
    </div>
  )
  if (!s.person || s.person.error) return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)' }}>
      <Sidebar />
      <div className="flex-1 flex items-center justify-center">
        <p style={{ color: 'var(--odb-danger)' }}>Особу не знайдено</p>
      </div>
    </div>
  )

  const p = s.person

  // ── Tab badge helpers ─────────────────────────────────────────────────────
  const regHits = (s.regNazk?.found || 0) + (s.regMyrotvorets?.found || 0) + (s.regErb?.found || 0) + (s.regMvs?.total || 0) + (s.regSanctions?.total || 0)

  return (
    <>
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)', color: 'var(--odb-text)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Top header ──────────────────────────────────────────────────── */}
        <header className="px-6 py-3 flex justify-between items-center shrink-0"
          style={{ background: 'var(--odb-surface)', borderBottom: '1px solid var(--odb-border)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => history.back()}
              className="text-sm transition"
              style={{ color: 'var(--odb-text-dim)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--odb-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--odb-text-dim)')}>
              ← Назад
            </button>
            <div>
              <h1 className="text-base font-bold" style={{ color: 'var(--odb-text)' }}>{s.personName}</h1>
              <p className="text-xs" style={{ color: 'var(--odb-text-faint)' }}>ID: {s.personId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {p.threat_score !== undefined && p.threat_score !== null && (
              <div className="flex items-center gap-1.5" title={`Threat Score: ${p.threat_score}/100`}>
                <div className="h-1.5 w-20 rounded-full overflow-hidden" style={{ background: 'var(--odb-surface3)' }}>
                  <div className={`h-full rounded-full transition-all ${p.threat_score >= 70 ? 'bg-red-500' : p.threat_score >= 40 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${p.threat_score}%` }} />
                </div>
                <span className={`text-xs font-mono font-bold ${p.threat_score >= 70 ? 'text-red-400' : p.threat_score >= 40 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {p.threat_score}
                </span>
              </div>
            )}
            {p.threat_level && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs border ${threatColor(p.threat_level)}`}>
                Загроза: {p.threat_level}
              </span>
            )}
            {p.status && (
              <span className="px-2.5 py-0.5 rounded-full text-xs bg-blue-900 text-blue-300 border border-blue-700">
                {p.status}
              </span>
            )}
            <button
              onClick={() => setShowInvModal(true)}
              className="px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5"
              style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text-dim)' }}
              title="Додати до розслідування">
              📁 У справу
            </button>
            <a href={`/api/persons/${s.personId}/report`} target="_blank" rel="noopener noreferrer"
              className="px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5"
              style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text-dim)' }}>
              📄 Звіт PDF
            </a>
            <a href={`/api/persons/${s.personId}/dossier`}
              className="px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5"
              style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text-dim)' }}>
              📝 DOCX
            </a>
            {p.photo_url && (
              <a href={`/face-search?url=${encodeURIComponent(p.photo_url)}`}
                className="px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text-dim)' }}>
                👁️ За фото
              </a>
            )}
            <button onClick={() => s.runOsint()} disabled={s.osintLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)', color: '#fff', boxShadow: '0 0 12px rgba(124,58,237,0.25)' }}>
              {s.osintLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : <>🔍 OSINT</>}
            </button>
          </div>
        </header>

        {/* ── Photo banner ────────────────────────────────────────────────── */}
        <div className="px-6 py-3 flex items-center gap-4"
          style={{ background: 'var(--odb-surface2)', borderBottom: '1px solid var(--odb-border)' }}>
          {/* Photo gallery */}
          <div className="relative shrink-0 flex gap-1.5 items-end pb-1">
            {s.allPersonPhotos.length > 0 ? (
              <>
                {s.allPersonPhotos.slice(0, 5).map((url, idx) => (
                  <div key={idx} className="relative group shrink-0">
                    <img src={url} alt={s.personName} onClick={() => s.setPhotoLightboxIdx(idx)}
                      className={`cursor-zoom-in object-cover rounded-lg border-2 transition ${idx === 0 ? 'w-16 h-16 border-blue-500 hover:border-blue-300' : 'w-11 h-11 border-gray-600 opacity-80 hover:opacity-100 hover:border-gray-400'}`}
                    />
                    {idx === 0 && <span className="absolute top-0.5 left-0.5 text-[8px] bg-blue-600 text-white rounded px-0.5 leading-tight">★</span>}
                  </div>
                ))}
                {s.allPersonPhotos.length > 5 && (
                  <div onClick={() => s.setPhotoLightboxIdx(5)}
                    className="cursor-pointer w-11 h-11 rounded-lg flex items-center justify-center text-xs transition shrink-0"
                    style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text-dim)' }}>
                    +{s.allPersonPhotos.length - 5}
                  </div>
                )}
              </>
            ) : (
              <div className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)' }}>
                👤
              </div>
            )}
          </div>

          {/* Name + quick facts */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white truncate">{s.personName}</h2>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {p.dob   && <span className="text-gray-400 text-xs">📅 {p.dob}</span>}
              {p.rank  && <span className="text-gray-400 text-xs">🎖️ {p.rank}</span>}
              {p.unit  && <span className="text-gray-400 text-xs">🏢 {p.unit}</span>}
              {p.phones?.length > 0 && <span className="text-green-400 text-xs">📱 {p.phones[0]}</span>}
            </div>
          </div>

          {/* Enrich banner */}
          {s.enrichOpen && !p.myrotvorets_url && (
            <div className="flex items-center gap-3 bg-yellow-950/60 border border-yellow-700/50 rounded-xl px-4 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-yellow-400 text-xs font-semibold">🕵️ Знайдено у Миротворці</p>
                <p className="text-yellow-600 text-xs truncate">{s.enrichUrl}</p>
              </div>
              <button onClick={() => s.importFromMyrotvorets()} disabled={s.enrichLoading}
                className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shrink-0">
                {s.enrichLoading ? '⏳' : '📥 Імпорт'}
              </button>
              <button onClick={() => s.setEnrichOpen(false)} className="text-gray-500 hover:text-white text-sm">✕</button>
            </div>
          )}
        </div>

        {/* ── Lightbox ────────────────────────────────────────────────────── */}
        {s.photoLightboxIdx !== null && s.allPersonPhotos.length > 0 && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => s.setPhotoLightboxIdx(null)}>
            <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
              <img src={s.allPersonPhotos[s.photoLightboxIdx]} alt={s.personName} className="w-full max-h-[80vh] object-contain rounded-xl" />
              <button onClick={() => s.setPhotoLightboxIdx(null)} className="absolute top-3 right-3 text-white bg-black/60 rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80">✕</button>
              {s.allPersonPhotos.length > 1 && (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                  {s.allPersonPhotos.map((url, idx) => (
                    <img key={idx} src={url} alt="" onClick={() => s.setPhotoLightboxIdx(idx)}
                      className={`w-16 h-16 object-cover rounded-lg cursor-pointer border-2 transition shrink-0 ${idx === s.photoLightboxIdx ? 'border-blue-400' : 'border-transparent opacity-60 hover:opacity-100'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab navigation ──────────────────────────────────────────────── */}
        <div className="flex px-6 shrink-0 overflow-x-auto"
          style={{ background: 'var(--odb-surface)', borderBottom: '1px solid var(--odb-border)' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => s.setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap -mb-px"
              style={s.activeTab === tab.id
                ? { borderBottomColor: 'var(--odb-accent)', color: 'var(--odb-accent)' }
                : { borderBottomColor: 'transparent', color: 'var(--odb-text-faint)' }}>
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.id === 'registries' && s.regLoading && <span className="ml-1 animate-spin text-xs">⟳</span>}
              {tab.id === 'registries' && !s.regLoading && s.regAutoRan && regHits > 0 && (
                <span className="ml-1 bg-red-700 text-red-200 text-xs px-1.5 py-0.5 rounded-full">{regHits}</span>
              )}
              {tab.id === 'osint' && s.osintData && (
                <span className="ml-1 bg-purple-800 text-purple-200 text-xs px-1.5 py-0.5 rounded-full">{s.osintData.total}</span>
              )}
              {tab.id === 'documents' && (s.evidenceItems.length > 0 || s.osintPdfsAll.length > 0) && (
                <span className="ml-1 bg-yellow-800 text-yellow-200 text-xs px-1.5 py-0.5 rounded-full">
                  {s.evidenceItems.length > 0 ? s.evidenceItems.length : s.osintPdfs.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">

          {s.activeTab === 'overview' && (
            <OverviewTab state={s} />
          )}

          {s.activeTab === 'graph' && (
            <GraphTab
              person={s.person}
              personId={s.personId}
              incidents={s.incidents}
              onNavigate={href => window.location.href = href}
            />
          )}

          {s.activeTab === 'connections' && (
            <ConnectionsGraph personId={s.personId} personName={s.personName} />
          )}

          {s.activeTab === 'registries' && (
            <RegistriesTab
              personName={s.personName}
              regLoading={s.regLoading}
              regAutoRan={s.regAutoRan}
              regNazk={s.regNazk}
              regMyrotvorets={s.regMyrotvorets}
              regErb={s.regErb}
              regMvs={s.regMvs}
              regSanctions={s.regSanctions}
              regCompany={s.regCompany}
              onRefresh={s.runRegistriesCheck}
            />
          )}

          {s.activeTab === 'incidents' && (
            <IncidentsTab
              incidents={s.incidents}
              incidentsLoading={s.incidentsLoading}
              showForm={s.showIncidentForm}
              setShowForm={s.setShowIncidentForm}
              form={{
                title: s.incidentTitle,     setTitle:    s.setIncidentTitle,
                date:  s.incidentDate,      setDate:     s.setIncidentDate,
                location: s.incidentLocation, setLocation: s.setIncidentLocation,
                type:  s.incidentType,      setType:     s.setIncidentType,
                desc:  s.incidentDesc,      setDesc:     s.setIncidentDesc,
                icc:   s.incidentIcc,       setIcc:      s.setIncidentIcc,
                severity: s.incidentSeverity, setSeverity: s.setIncidentSeverity,
                role:  s.incidentRole,      setRole:     s.setIncidentRole,
              }}
              saving={s.savingIncident}
              onCreate={s.createIncident}
            />
          )}

          {s.activeTab === 'media' && p && (
            <EvidenceUploader personId={p.id} />
          )}

          {s.activeTab === 'documents' && p && (
            <DocumentsTab personId={p.id} osintPdfs={s.osintPdfs} />
          )}

          {s.activeTab === 'unit' && (
            <UnitTab person={p} osintRelatives={s.osintRelatives} />
          )}

          {s.activeTab === 'crypto' && (
            <CryptoWalletsTab personId={p.id} personName={p.name || p.name_ukr || p.name_rus || ''} />
          )}

          {s.activeTab === 'osint' && (
            <OsintTab state={s} />
          )}

          {s.activeTab === 'notes' && (
            <NotesTab
              notes={p.notes}
              analystNotes={p.analyst_notes}
              sources={p.sources || p.source}
            />
          )}

        </div>
      </div>
    </div>

    {/* ── Add to Investigation modal ──────────────────────────────────────── */}
    {showInvModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={e => { if (e.target === e.currentTarget) setShowInvModal(false) }}>
        <div className="w-full max-w-sm rounded-2xl p-5 border"
          style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold">📁 Додати до розслідування</h2>
            <button onClick={() => setShowInvModal(false)}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: 'var(--odb-text-faint)' }}>✕</button>
          </div>
          {invLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--odb-accent-hi)', borderTopColor: 'transparent' }} />
            </div>
          ) : invList.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm mb-3" style={{ color: 'var(--odb-text-dim)' }}>Немає активних розслідувань</p>
              <a href="/investigations"
                className="inline-block px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--odb-accent-glow)', color: 'var(--odb-accent-hi)' }}>
                Створити нове
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              {invList.map(inv => {
                const alreadyIn = (inv.person_ids || []).includes(s.personId || '')
                const isAdding = invAdding === inv.id
                const wasAdded = invAdded === inv.id
                return (
                  <button
                    key={inv.id}
                    onClick={() => !alreadyIn && addToInvestigation(inv.id)}
                    disabled={alreadyIn || isAdding}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm border transition-all text-left"
                    style={{
                      background: alreadyIn ? 'var(--odb-surface-2)' : 'var(--odb-surface-2)',
                      borderColor: wasAdded ? 'var(--odb-accent-lo)' : 'var(--odb-border-soft)',
                      color: alreadyIn ? 'var(--odb-text-faint)' : 'var(--odb-text)',
                      cursor: alreadyIn ? 'default' : 'pointer',
                    }}>
                    <span className="truncate">📁 {inv.title}</span>
                    <span className="shrink-0 ml-2 text-xs">
                      {isAdding ? '…' : wasAdded ? '✓ Додано' : alreadyIn ? 'Вже є' : '+ Додати'}
                    </span>
                  </button>
                )
              })}
              <a href="/investigations"
                className="block text-center text-xs mt-3 hover:underline"
                style={{ color: 'var(--odb-accent-hi)' }}>
                Відкрити всі розслідування →
              </a>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  )
}
