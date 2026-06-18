'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Sidebar from '../../components/Sidebar'
import Icon from '../../components/Icon'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CytoscapeComponent = dynamic(() => import('react-cytoscapejs'), { ssr: false }) as any

interface Investigation {
  id: string
  title: string
  description: string
  status: 'active' | 'archived'
  person_ids: string[]
  notes: string
  tags: string[]
  created_at: string
  updated_at: string
}

interface PersonSummary {
  id: string
  name: string
  name_ukr?: string
  name_rus?: string
  threat_level?: string
  threat_score?: number
  photo_url?: string
}

const CY_STYLESHEET = [
  {
    selector: 'node',
    style: {
      'background-color':   'data(bg)',
      'border-color':       'data(border)',
      'border-width':       2,
      'width':              'data(size)',
      'height':             'data(size)',
      'label':              'data(label)',
      'color':              '#e2e8f0',
      'font-size':          '10px',
      'text-valign':        'bottom',
      'text-margin-y':      6,
      'text-wrap':          'wrap',
      'text-max-width':     '100px',
      'text-overflow-wrap': 'whitespace',
    },
  },
  {
    selector: 'edge',
    style: {
      'width':              1.5,
      'line-color':         '#334155',
      'target-arrow-color': '#334155',
      'target-arrow-shape': 'triangle',
      'curve-style':        'bezier',
      'label':              'data(label)',
      'font-size':          '8px',
      'color':              '#64748b',
      'text-background-color': '#0f172a',
      'text-background-opacity': 0.7,
      'text-background-padding': '2px',
    },
  },
  {
    selector: 'node:selected',
    style: { 'border-width': 3, 'border-color': '#f8fafc' },
  },
]

export default function InvestigationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cyRef = useRef<any>(null)

  const [inv, setInv] = useState<Investigation | null>(null)
  const [persons, setPersons] = useState<PersonSummary[]>([])
  const [graphElements, setGraphElements] = useState<object[]>([])
  const [loading, setLoading] = useState(true)
  const [graphLoading, setGraphLoading] = useState(false)

  const [editTitle, setEditTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)

  const [addPersonQuery, setAddPersonQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PersonSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)

  const [activeTab, setActiveTab] = useState<'graph' | 'persons' | 'notes'>('graph')

  // ─── Load investigation ────────────────────────────────────────────────────
  const loadInv = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/investigations/${id}`)
      if (!res.ok) { router.push('/investigations'); return }
      const data: Investigation = await res.json()
      setInv(data)
      setTitleDraft(data.title)
      setNotesDraft(data.notes || '')
      await loadPersons(data.person_ids || [])
    } catch {}
    setLoading(false)
  }, [id, router])

  useEffect(() => { loadInv() }, [loadInv])

  // ─── Load persons list ─────────────────────────────────────────────────────
  async function loadPersons(ids: string[]) {
    if (!ids.length) { setPersons([]); return }
    try {
      const res = await fetch(`/api/persons?ids=${ids.join(',')}`)
      const data = await res.json()
      const list: PersonSummary[] = (data.data || []).map((p: PersonSummary) => ({
        id: p.id,
        name: p.name_ukr || p.name_rus || p.name || 'Невідомо',
        threat_level: p.threat_level,
        threat_score: p.threat_score,
        photo_url: p.photo_url,
      }))
      setPersons(list)
    } catch {}
  }

  // ─── Load graph ────────────────────────────────────────────────────────────
  const loadGraph = useCallback(async () => {
    if (!inv?.person_ids?.length) { setGraphElements([]); return }
    setGraphLoading(true)
    try {
      const res = await fetch(`/api/investigations/${id}/graph`)
      const data = await res.json()
      const elements = [
        ...(data.nodes || []),
        ...(data.edges || []),
      ]
      setGraphElements(elements)
    } catch {}
    setGraphLoading(false)
  }, [id, inv?.person_ids])

  useEffect(() => { if (activeTab === 'graph') loadGraph() }, [activeTab, loadGraph])

  // ─── Save title ─────────────────────────────────────────────────────────────
  async function saveTitle() {
    if (!titleDraft.trim() || !inv) return
    setEditTitle(false)
    await fetch(`/api/investigations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleDraft }),
    })
    setInv(prev => prev ? { ...prev, title: titleDraft } : prev)
  }

  // ─── Save notes ─────────────────────────────────────────────────────────────
  async function saveNotes() {
    setNotesSaving(true)
    await fetch(`/api/investigations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notesDraft }),
    })
    setNotesSaving(false)
    setInv(prev => prev ? { ...prev, notes: notesDraft } : prev)
  }

  // ─── Toggle status ───────────────────────────────────────────────────────────
  async function toggleStatus() {
    if (!inv) return
    const next = inv.status === 'active' ? 'archived' : 'active'
    await fetch(`/api/investigations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    setInv(prev => prev ? { ...prev, status: next } : prev)
  }

  // ─── Remove person ───────────────────────────────────────────────────────────
  async function removePerson(personId: string) {
    if (!inv) return
    const updated = inv.person_ids.filter(pid => pid !== personId)
    await fetch(`/api/investigations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_ids: updated }),
    })
    setInv(prev => prev ? { ...prev, person_ids: updated } : prev)
    setPersons(prev => prev.filter(p => p.id !== personId))
    setGraphElements([])
  }

  // ─── Search persons to add ───────────────────────────────────────────────────
  useEffect(() => {
    if (!addPersonQuery.trim() || addPersonQuery.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/persons?q=${encodeURIComponent(addPersonQuery)}&limit=10`)
        const data = await res.json()
        const existing = new Set(inv?.person_ids || [])
        setSearchResults((data.data || [])
          .filter((p: PersonSummary) => !existing.has(p.id))
          .map((p: PersonSummary) => ({
            id: p.id,
            name: p.name_ukr || p.name_rus || p.name || 'Невідомо',
            threat_level: p.threat_level,
          }))
        )
      } catch {}
      setSearching(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [addPersonQuery, inv?.person_ids])

  async function addPerson(person: PersonSummary) {
    if (!inv) return
    const updated = [...new Set([...inv.person_ids, person.id])]
    await fetch(`/api/investigations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_ids: updated }),
    })
    setInv(prev => prev ? { ...prev, person_ids: updated } : prev)
    setPersons(prev => [...prev, person])
    setAddPersonQuery('')
    setSearchResults([])
    setGraphElements([])
  }

  // ─── Delete investigation ────────────────────────────────────────────────────
  async function deleteInv() {
    if (!confirm('Видалити розслідування назавжди?')) return
    await fetch(`/api/investigations/${id}`, { method: 'DELETE' })
    router.push('/investigations')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)' }}>
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--odb-accent-hi)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    )
  }

  if (!inv) return null

  const TABS = [
    { id: 'graph',   label: '🕸️ Граф' },
    { id: 'persons', label: `👤 Особи (${persons.length})` },
    { id: 'notes',   label: '📝 Нотатки' },
  ] as const

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)', color: 'var(--odb-text)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="px-6 py-4 shrink-0"
          style={{ background: 'var(--odb-surface)', borderBottom: '1px solid var(--odb-border)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <button onClick={() => router.push('/investigations')}
                className="mt-1 p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0">
                <Icon name="chevron-right" size={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <div className="flex-1 min-w-0">
                {editTitle ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={titleDraft}
                      onChange={e => setTitleDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditTitle(false) }}
                      className="flex-1 px-2 py-1 rounded-lg text-base font-bold border outline-none"
                      style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-accent-lo)', color: 'var(--odb-text)' }}
                    />
                    <button onClick={saveTitle} className="px-3 py-1 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--odb-accent-glow)', color: 'var(--odb-accent-hi)' }}>Зберегти</button>
                    <button onClick={() => setEditTitle(false)} className="p-1 rounded-lg hover:bg-white/10">
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-bold truncate">{inv.title}</h1>
                    <button onClick={() => setEditTitle(true)}
                      className="p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                      style={{ color: 'var(--odb-text-faint)' }}>
                      <Icon name="edit" size={14} />
                    </button>
                  </div>
                )}
                {inv.description && (
                  <p className="text-xs mt-1 truncate" style={{ color: 'var(--odb-text-dim)' }}>{inv.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                inv.status === 'active'
                  ? 'bg-emerald-900/40 text-emerald-400'
                  : 'bg-gray-700 text-gray-400'
              }`}>
                {inv.status === 'active' ? 'Активне' : 'Архів'}
              </span>
              <button onClick={toggleStatus}
                className="px-3 py-1.5 rounded-lg text-xs border transition-all hover:bg-white/5"
                style={{ borderColor: 'var(--odb-border-soft)', color: 'var(--odb-text-dim)' }}>
                {inv.status === 'active' ? 'В архів' : 'Відновити'}
              </button>
              <button onClick={deleteInv}
                className="p-1.5 rounded-lg transition-all hover:bg-red-900/20"
                style={{ color: 'var(--odb-danger)' }}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={activeTab === tab.id
                  ? { background: 'var(--odb-accent-glow)', color: 'var(--odb-accent-hi)' }
                  : { color: 'var(--odb-text-dim)' }}
                onMouseEnter={e => { if (activeTab !== tab.id) (e.currentTarget as HTMLElement).style.background = 'var(--odb-surface-3)' }}
                onMouseLeave={e => { if (activeTab !== tab.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {/* Tab: Graph */}
        {activeTab === 'graph' && (
          <div className="flex-1 relative" style={{ minHeight: '500px' }}>
            {graphLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 animate-spin"
                  style={{ borderColor: 'var(--odb-accent-hi)', borderTopColor: 'transparent' }} />
              </div>
            ) : graphElements.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--odb-surface-2)' }}>
                  <span className="text-3xl">🕸️</span>
                </div>
                <p style={{ color: 'var(--odb-text-dim)' }} className="text-sm">
                  {inv.person_ids.length === 0
                    ? 'Додайте осіб до розслідування щоб побачити граф'
                    : 'Граф порожній — немає даних для відображення'}
                </p>
                <button onClick={() => setActiveTab('persons')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--odb-accent-glow)', color: 'var(--odb-accent-hi)' }}>
                  <Icon name="plus" size={14} />
                  Додати особу
                </button>
              </div>
            ) : (
              <>
                <CytoscapeComponent
                  cy={(cy: unknown) => { cyRef.current = cy }}
                  elements={graphElements}
                  stylesheet={CY_STYLESHEET}
                  layout={{ name: 'cose', nodeRepulsion: 10000, idealEdgeLength: 140, padding: 60, animate: false }}
                  style={{ width: '100%', height: '100%', minHeight: '500px', background: '#0a0f1a' }}
                  minZoom={0.3}
                  maxZoom={3}
                />
                {/* Controls */}
                <div className="absolute bottom-4 right-4 flex flex-col gap-2">
                  <button
                    onClick={() => cyRef.current?.fit(undefined, 60)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold border transition-all hover:scale-110"
                    style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}
                    title="Вмістити всіх">⊞</button>
                  <button
                    onClick={() => cyRef.current?.zoom({ level: (cyRef.current?.zoom() ?? 1) * 1.3 })}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold border transition-all hover:scale-110"
                    style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>+</button>
                  <button
                    onClick={() => cyRef.current?.zoom({ level: (cyRef.current?.zoom() ?? 1) / 1.3 })}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold border transition-all hover:scale-110"
                    style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>−</button>
                </div>
                {/* Legend */}
                <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                  {[
                    { color: '#6366f1', label: 'Особа' },
                    { color: '#15803d', label: 'Телефон' },
                    { color: '#c2410c', label: 'Адреса' },
                    { color: '#7e22ce', label: 'Гаманець' },
                  ].map(l => (
                    <span key={l.label} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg"
                      style={{ background: 'rgba(10,15,26,0.85)', color: '#94a3b8' }}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                      {l.label}
                    </span>
                  ))}
                </div>
                <div className="absolute top-3 right-3 text-xs px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(10,15,26,0.85)', color: '#64748b' }}>
                  {graphElements.filter((e: object) => !('data' in e && (e as { data: { source?: string } }).data.source)).length} вузлів
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab: Persons */}
        {activeTab === 'persons' && (
          <div className="flex-1 p-6">
            {/* Add person panel */}
            <div className="mb-6 p-4 rounded-2xl border"
              style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--odb-text-dim)' }}>
                Додати особу до розслідування
              </p>
              <div className="relative">
                <input
                  value={addPersonQuery}
                  onChange={e => setAddPersonQuery(e.target.value)}
                  placeholder="Пошук по ПІБ…"
                  className="w-full px-3 py-2 pl-9 rounded-lg text-sm border outline-none"
                  style={{
                    background: 'var(--odb-surface-2)',
                    borderColor: 'var(--odb-border-soft)',
                    color: 'var(--odb-text)',
                  }}
                />
                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--odb-text-faint)' }} />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'var(--odb-accent-hi)', borderTopColor: 'transparent' }} />
                )}
              </div>
              {searchResults.length > 0 && (
                <div className="mt-2 rounded-xl border overflow-hidden"
                  style={{ borderColor: 'var(--odb-border-soft)' }}>
                  {searchResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addPerson(p)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm transition-all hover:bg-white/5 text-left"
                      style={{ borderBottom: '1px solid var(--odb-border-soft)' }}>
                      <span className="flex items-center gap-2">
                        <Icon name="user" size={14} style={{ color: 'var(--odb-text-faint)' }} />
                        {p.name}
                      </span>
                      {p.threat_level && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--odb-surface-3)', color: 'var(--odb-text-faint)' }}>
                          {p.threat_level}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Persons list */}
            {persons.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <span className="text-4xl">👤</span>
                <p style={{ color: 'var(--odb-text-dim)' }} className="text-sm">
                  Жодної особи у розслідуванні
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {persons.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border"
                    style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>
                    <button
                      onClick={() => window.open(`/persons/${p.id}`, '_blank')}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(99,102,241,0.15)' }}>
                        <Icon name="user" size={16} style={{ color: '#818cf8' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        {p.threat_level && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--odb-text-faint)' }}>
                            {p.threat_level}
                          </p>
                        )}
                      </div>
                      <Icon name="arrow-right" size={14} style={{ color: 'var(--odb-text-faint)', flexShrink: 0 }} />
                    </button>
                    <button
                      onClick={() => removePerson(p.id)}
                      className="ml-2 p-1.5 rounded-lg hover:bg-red-900/20 transition-colors shrink-0"
                      style={{ color: 'var(--odb-danger)' }}
                      title="Видалити зі справи">
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Notes */}
        {activeTab === 'notes' && (
          <div className="flex-1 p-6">
            <div className="max-w-3xl">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold" style={{ color: 'var(--odb-text-dim)' }}>
                  Нотатки слідчого
                </p>
                <button
                  onClick={saveNotes}
                  disabled={notesSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: 'var(--odb-accent-glow)', color: 'var(--odb-accent-hi)' }}>
                  {notesSaving ? 'Збереження…' : <><Icon name="check" size={12} /> Зберегти</>}
                </button>
              </div>
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                rows={20}
                placeholder="Хронологія подій, докази, висновки, наступні кроки…"
                className="w-full px-4 py-3 rounded-xl text-sm border outline-none resize-none font-mono leading-relaxed"
                style={{
                  background: 'var(--odb-surface)',
                  borderColor: 'var(--odb-border-soft)',
                  color: 'var(--odb-text)',
                }}
              />
              <p className="text-xs mt-2" style={{ color: 'var(--odb-text-faint)' }}>
                {notesDraft.length} символів
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
