'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Edge {
  id: string
  source: string
  target: string
  rel_type: string
  direction: string
  evidence_url?: string
  notes?: string
  confidence: number
  neighbor: {
    id: string
    name_ukr?: string
    name_rus?: string
    name?: string
    rank?: string
    unit?: string
    photo_url?: string
    verified?: boolean
  } | null
}

interface Props {
  personId: string
  personName: string
}

const REL_TYPES = [
  { value: 'командир', label: 'Командир', color: '#ef4444' },
  { value: 'підлеглий', label: 'Підлеглий', color: '#f97316' },
  { value: 'родич', label: 'Родич', color: '#22c55e' },
  { value: 'колега', label: 'Колега', color: '#3b82f6' },
  { value: 'однокласник', label: 'Однокласник', color: '#a855f7' },
  { value: 'знайомий', label: 'Знайомий', color: '#6b7280' },
  { value: 'unknown', label: 'Невідомо', color: '#4b5563' },
]

function relColor(type: string) {
  return REL_TYPES.find(r => r.value === type)?.color || '#4b5563'
}

function pName(p: { name_ukr?: string; name_rus?: string; name?: string } | null) {
  if (!p) return 'Невідомо'
  return p.name_rus || p.name_ukr || p.name || 'Невідомо'
}

export default function ConnectionsGraph({ personId, personName }: Props) {
  const router = useRouter()
  const cyRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [edges, setEdges] = useState<Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null)

  // Форма додавання
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState<any>(null)
  const [newRelType, setNewRelType] = useState('unknown')
  const [newDirection, setNewDirection] = useState('both')
  const [newEvidenceUrl, setNewEvidenceUrl] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newConfidence, setNewConfidence] = useState(0.5)
  const [saving, setSaving] = useState(false)

  const loadEdges = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/persons/${personId}/connections`)
      const data = await res.json()
      setEdges(data.edges || [])
    } catch {}
    setLoading(false)
  }, [personId])

  useEffect(() => { loadEdges() }, [loadEdges])

  // Колір вузла за threat score
  function threatNodeColor(score?: number, myrotvorets?: boolean): string {
    if (myrotvorets) return '#7f0000'
    if (!score) return '#1e40af'
    if (score >= 75) return '#7f1d1d'
    if (score >= 50) return '#c41e3a'
    if (score >= 25) return '#b45309'
    return '#1e40af'
  }

  function threatBorderColor(score?: number, myrotvorets?: boolean): string {
    if (myrotvorets) return '#ef4444'
    if (!score) return '#3b82f6'
    if (score >= 75) return '#ef4444'
    if (score >= 50) return '#f97316'
    if (score >= 25) return '#eab308'
    return '#3b82f6'
  }

  // Ініціалізація Cytoscape
  useEffect(() => {
    if (!containerRef.current || loading) return

    let cy: any = null

    const initCy = async () => {
      const cytoscape = (await import('cytoscape')).default

      // Центральний вузол
      const nodes: any[] = [{
        data: {
          id: personId,
          label: personName,
          isCenter: true,
          threatColor: '#7c3aed',
          borderColor: '#a855f7',
          size: 56,
        },
      }]

      for (const edge of edges) {
        const neighbor = edge.neighbor
        if (!neighbor) continue
        const nid = neighbor.id
        if (!nodes.find(n => n.data.id === nid)) {
          const score = (neighbor as any).threat_score
          const myr = !!(neighbor as any).myrotvorets_url
          const connCount = edges.filter(e => e.source === nid || e.target === nid).length
          nodes.push({
            data: {
              id: nid,
              label: pName(neighbor),
              isCenter: false,
              rank: neighbor.rank || '',
              threatScore: score || 0,
              myrotvorets: myr,
              threatColor: threatNodeColor(score, myr),
              borderColor: threatBorderColor(score, myr),
              size: Math.max(36, Math.min(52, 36 + (score || 0) / 5)),
              connCount,
            },
          })
        }
      }

      const cyEdges: any[] = edges.map(e => ({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.rel_type,
          color: relColor(e.rel_type),
          confidence: e.confidence,
          width: Math.max(1, Math.round(e.confidence * 3)),
        },
      }))

      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null }

      cy = cytoscape({
        container: containerRef.current,
        elements: { nodes, edges: cyEdges },
        style: [
          {
            selector: 'node',
            style: {
              'background-color': 'data(threatColor)',
              'label': 'data(label)',
              'color': '#fff',
              'font-size': '10px',
              'text-valign': 'bottom',
              'text-margin-y': 5,
              'text-wrap': 'wrap',
              'text-max-width': '110px',
              'text-background-color': '#0f172a',
              'text-background-opacity': 0.8,
              'text-background-padding': '2px',
              'text-background-shape': 'roundrectangle',
              'width': 'data(size)',
              'height': 'data(size)',
              'border-width': 2,
              'border-color': 'data(borderColor)',
            },
          },
          {
            selector: 'node[?isCenter]',
            style: {
              'background-color': '#7c3aed',
              'border-color': '#a855f7',
              'border-width': 3,
              'width': 60,
              'height': 60,
              'font-size': '12px',
              'font-weight': 'bold',
            },
          },
          {
            selector: 'node[?myrotvorets]',
            style: {
              'border-style': 'double',
              'border-width': 4,
            },
          },
          {
            selector: 'node:selected',
            style: {
              'border-color': '#fbbf24',
              'border-width': 4,
              'overlay-color': '#fbbf24',
              'overlay-opacity': 0.1,
            },
          },
          {
            selector: 'edge',
            style: {
              'width': 'data(width)',
              'line-color': 'data(color)',
              'target-arrow-color': 'data(color)',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'label': 'data(label)',
              'color': '#9ca3af',
              'font-size': '9px',
              'text-background-color': '#0f172a',
              'text-background-opacity': 0.85,
              'text-background-padding': '2px',
            },
          },
          {
            selector: 'edge:selected',
            style: {
              'line-color': '#fbbf24',
              'target-arrow-color': '#fbbf24',
              'width': 3,
            },
          },
        ],
        layout: {
          name: edges.length === 0 ? 'grid' : 'cose',
          padding: 50,
          nodeRepulsion: () => 12000,
          idealEdgeLength: () => 160,
          gravity: 0.8,
          animate: edges.length < 20,
          animationDuration: 500,
        },
      })

      // Подвійний клік — відкрити картку
      cy.on('dblclick', 'node', (evt: any) => {
        const nodeId = evt.target.data('id')
        if (nodeId !== personId) router.push(`/persons/${nodeId}`)
      })

      // Одинарний клік по вузлу — показати деталі
      cy.on('tap', 'node', (evt: any) => {
        setSelectedEdge(null)
      })

      cy.on('tap', 'edge', (evt: any) => {
        const edgeId = evt.target.data('id')
        const edge = edges.find(e => e.id === edgeId)
        if (edge) setSelectedEdge(edge)
      })

      cy.on('tap', (evt: any) => {
        if (evt.target === cy) setSelectedEdge(null)
      })

      cyRef.current = cy
    }

    initCy()

    return () => {
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null }
    }
  }, [edges, loading, personId, personName, router])

  async function searchPersons(q: string) {
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/persons?q=${encodeURIComponent(q)}&limit=10`)
      const data = await res.json()
      setSearchResults((data.persons || data.data || []).filter((p: any) => p.id !== personId))
    } catch {}
    setSearching(false)
  }

  async function addConnection() {
    if (!selectedTarget) return
    setSaving(true)
    try {
      const res = await fetch(`/api/persons/${personId}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_id: selectedTarget.id,
          rel_type: newRelType,
          direction: newDirection,
          evidence_url: newEvidenceUrl || null,
          notes: newNotes || null,
          confidence: newConfidence,
        }),
      })
      if (res.ok) {
        setShowAddForm(false)
        setSelectedTarget(null)
        setSearchQuery('')
        setSearchResults([])
        setNewRelType('unknown')
        setNewDirection('both')
        setNewEvidenceUrl('')
        setNewNotes('')
        setNewConfidence(0.5)
        await loadEdges()
      }
    } finally { setSaving(false) }
  }

  async function deleteEdge(edgeId: string) {
    if (!confirm('Видалити цей зв\'язок?')) return
    await fetch(`/api/connections/${edgeId}`, { method: 'DELETE' })
    setSelectedEdge(null)
    await loadEdges()
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-gray-300 font-semibold">
            🔗 Зв'язки: {edges.length}
          </span>
          <div className="flex gap-2 flex-wrap">
            {REL_TYPES.slice(0, 5).map(rt => (
              <span key={rt.value} className="flex items-center gap-1 text-xs text-gray-400">
                <span className="inline-block w-3 h-0.5" style={{ backgroundColor: rt.color }}/>
                {rt.label}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium transition">
          + Додати зв'язок
        </button>
      </div>

      {/* Форма додавання */}
      {showAddForm && (
        <div className="bg-gray-800 border border-blue-700 rounded-xl p-5 space-y-4">
          <h4 className="text-blue-400 font-semibold text-sm">Новий зв'язок</h4>

          {/* Пошук особи */}
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Особа</label>
            {selectedTarget ? (
              <div className="flex items-center gap-3 bg-gray-900 rounded-lg px-4 py-2 border border-blue-600">
                <span className="text-white text-sm">{pName(selectedTarget)}</span>
                {selectedTarget.rank && <span className="text-gray-500 text-xs">{selectedTarget.rank}</span>}
                <button onClick={() => setSelectedTarget(null)} className="ml-auto text-gray-500 hover:text-red-400 text-xs">✕</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); searchPersons(e.target.value) }}
                  placeholder="Пошук за ПІБ..."
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                />
                {searching && <p className="text-gray-500 text-xs mt-1">Пошук...</p>}
                {searchResults.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-gray-900 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {searchResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedTarget(p); setSearchResults([]) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-800 text-sm transition border-b border-gray-700 last:border-0">
                        <span className="text-white">{pName(p)}</span>
                        {p.rank && <span className="text-gray-500 ml-2 text-xs">{p.rank}</span>}
                        {p.unit && <span className="text-gray-600 ml-2 text-xs">{p.unit}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Тип зв'язку */}
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Тип зв'язку</label>
              <select
                value={newRelType}
                onChange={e => setNewRelType(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none">
                {REL_TYPES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            {/* Напрямок */}
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Напрямок</label>
              <select
                value={newDirection}
                onChange={e => setNewDirection(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none">
                <option value="both">Двосторонній</option>
                <option value="a_to_b">A → B (поточна → ціль)</option>
                <option value="b_to_a">B → A (ціль → поточна)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Джерело / Доказ (URL)</label>
              <input type="text" value={newEvidenceUrl} onChange={e => setNewEvidenceUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Впевненість: {Math.round(newConfidence * 100)}%</label>
              <input type="range" min="0" max="1" step="0.1" value={newConfidence}
                onChange={e => setNewConfidence(parseFloat(e.target.value))}
                className="w-full mt-2" />
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Нотатки</label>
            <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2}
              placeholder="Додаткова інформація..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none resize-none" />
          </div>

          <div className="flex gap-3">
            <button
              onClick={addConnection}
              disabled={!selectedTarget || saving}
              className="px-5 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-sm font-medium transition">
              {saving ? 'Збереження...' : '💾 Зберегти'}
            </button>
            <button onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition">
              Скасувати
            </button>
          </div>
        </div>
      )}

      {/* Граф */}
      {loading ? (
        <div className="h-96 bg-gray-800 rounded-xl flex items-center justify-center">
          <p className="text-gray-400">Завантаження графу...</p>
        </div>
      ) : edges.length === 0 ? (
        <div className="h-64 bg-gray-800 rounded-xl flex flex-col items-center justify-center border border-gray-700 border-dashed">
          <p className="text-4xl mb-3">🕸️</p>
          <p className="text-gray-400 font-medium">Зв'язків ще не додано</p>
          <p className="text-gray-600 text-sm mt-1">Натисніть "+ Додати зв'язок" для початку</p>
        </div>
      ) : (
        <div className="relative">
          {/* Кнопки управління */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
            <button
              onClick={() => cyRef.current?.fit(undefined, 40)}
              className="w-8 h-8 bg-gray-800/90 hover:bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm transition flex items-center justify-center"
              title="Вписати всі">⊞</button>
            <button
              onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)}
              className="w-8 h-8 bg-gray-800/90 hover:bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm transition flex items-center justify-center"
              title="Збільшити">+</button>
            <button
              onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
              className="w-8 h-8 bg-gray-800/90 hover:bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm transition flex items-center justify-center"
              title="Зменшити">−</button>
            <button
              onClick={() => {
                const png = cyRef.current?.png({ scale: 2, bg: '#0f172a' })
                if (png) { const a = document.createElement('a'); a.href = png; a.download = 'graph.png'; a.click() }
              }}
              className="w-8 h-8 bg-gray-800/90 hover:bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-xs transition flex items-center justify-center"
              title="Зберегти PNG">📷</button>
          </div>

          {/* Легенда */}
          <div className="absolute bottom-3 left-3 z-10 bg-gray-900/90 border border-gray-700 rounded-lg p-2.5 text-xs space-y-1">
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#7c3aed] inline-block"/><span className="text-gray-400">Центральна особа</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#7f1d1d] inline-block"/><span className="text-gray-400">Критична загроза</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#c41e3a] inline-block"/><span className="text-gray-400">Висока загроза</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#1e40af] inline-block"/><span className="text-gray-400">Низька/невідома</span></div>
            <div className="flex items-center gap-2 pt-0.5 border-t border-gray-700"><span className="text-gray-500 text-xs">Подвійний клік → картка</span></div>
          </div>

          <div
            ref={containerRef}
            className="w-full h-[560px] bg-gray-900 rounded-xl border border-gray-700"
            style={{ cursor: 'grab' }}
          />
        </div>
      )}

      {/* Панель вибраного зв'язку */}
      {selectedEdge && (
        <div className="bg-gray-800 border border-gray-600 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-200 font-medium text-sm">
              Зв'язок: <span style={{ color: relColor(selectedEdge.rel_type) }}>{selectedEdge.rel_type}</span>
            </span>
            <button onClick={() => setSelectedEdge(null)} className="text-gray-500 hover:text-white text-xs">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div>
              <p className="text-gray-500 text-xs">Особа A</p>
              <p className="text-white">{selectedEdge.source === personId ? personName : pName(selectedEdge.neighbor)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Особа B</p>
              <p className="text-white">{selectedEdge.target === personId ? personName : pName(selectedEdge.neighbor)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Впевненість</p>
              <p className="text-white">{Math.round(selectedEdge.confidence * 100)}%</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Напрямок</p>
              <p className="text-white">{selectedEdge.direction === 'both' ? 'Двосторонній' : selectedEdge.direction}</p>
            </div>
          </div>
          {selectedEdge.notes && (
            <p className="text-gray-400 text-sm mb-2">{selectedEdge.notes}</p>
          )}
          {selectedEdge.evidence_url && (
            <a href={selectedEdge.evidence_url} target="_blank" rel="noopener noreferrer"
              className="text-blue-400 text-xs hover:underline block mb-3">
              🔗 Джерело: {selectedEdge.evidence_url}
            </a>
          )}
          <div className="flex gap-2">
            {selectedEdge.neighbor && (
              <button
                onClick={() => router.push(`/persons/${selectedEdge.neighbor!.id}`)}
                className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-blue-300 rounded-lg text-xs transition">
                👤 Відкрити картку
              </button>
            )}
            <button
              onClick={() => deleteEdge(selectedEdge.id)}
              className="px-3 py-1.5 bg-red-950 hover:bg-red-900 text-red-400 rounded-lg text-xs transition">
              🗑️ Видалити зв'язок
            </button>
          </div>
        </div>
      )}

      {/* Список зв'язків */}
      {edges.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="bg-gray-700/50 px-5 py-3 border-b border-gray-700">
            <h4 className="text-gray-300 text-sm font-medium">Список зв'язків ({edges.length})</h4>
          </div>
          <div className="divide-y divide-gray-700/50">
            {edges.map(edge => (
              <div key={edge.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-700/30 transition">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: relColor(edge.rel_type) }}/>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium truncate">
                      {pName(edge.neighbor)}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full border"
                      style={{ color: relColor(edge.rel_type), borderColor: relColor(edge.rel_type) + '50', backgroundColor: relColor(edge.rel_type) + '15' }}>
                      {edge.rel_type}
                    </span>
                  </div>
                  {edge.neighbor?.rank && (
                    <p className="text-gray-500 text-xs">{edge.neighbor.rank}</p>
                  )}
                </div>
                <span className="text-gray-600 text-xs">{Math.round(edge.confidence * 100)}%</span>
                <div className="flex gap-2">
                  {edge.neighbor && (
                    <button onClick={() => router.push(`/persons/${edge.neighbor!.id}`)}
                      className="px-2.5 py-1 bg-blue-900/50 hover:bg-blue-900 text-blue-400 rounded text-xs transition">
                      →
                    </button>
                  )}
                  <button onClick={() => deleteEdge(edge.id)}
                    className="px-2.5 py-1 bg-red-950/50 hover:bg-red-950 text-red-500 rounded text-xs transition">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
