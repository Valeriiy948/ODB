'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/app/lib/supabase/client'
import Icon from '@/app/components/Icon'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CytoscapeComponent = dynamic(() => import('react-cytoscapejs'), { ssr: false }) as any

// ─── Types ────────────────────────────────────────────────────────────────────
type NodeType = 'person' | 'related_person' | 'phone' | 'address' | 'wallet' | 'incident'

interface NodeData {
  id:         string
  label:      string
  type:       NodeType
  sublabel?:  string
  href?:      string
  risk?:      number
  [key: string]: unknown
}

interface GraphTabProps {
  person:    any
  personId:  string
  incidents: any[]
  onNavigate?: (href: string) => void
}

// ─── Node colors ──────────────────────────────────────────────────────────────
const NODE_STYLE: Record<NodeType, { bg: string; border: string; size: number }> = {
  person:         { bg: '#6366f1', border: '#818cf8', size: 60 },
  related_person: { bg: '#1e40af', border: '#3b82f6', size: 44 },
  phone:          { bg: '#15803d', border: '#4ade80', size: 36 },
  address:        { bg: '#c2410c', border: '#fb923c', size: 36 },
  wallet:         { bg: '#7e22ce', border: '#a855f7', size: 36 },
  incident:       { bg: '#991b1b', border: '#f87171', size: 36 },
}

const NODE_EMOJI: Record<NodeType, string> = {
  person:         '👤',
  related_person: '👤',
  phone:          '📱',
  address:        '🏠',
  wallet:         '💰',
  incident:       '⚖️',
}

// ─── Cytoscape stylesheet ─────────────────────────────────────────────────────
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
      'font-size':          11,
      'font-family':        'Inter, sans-serif',
      'text-valign':        'bottom',
      'text-halign':        'center',
      'text-margin-y':      6,
      'text-wrap':          'wrap',
      'text-max-width':     100,
      'text-overflow-wrap': 'anywhere',
    },
  },
  {
    selector: 'node[type = "person"]',
    style: {
      'font-size':   13,
      'font-weight': 700,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': '#f8fafc',
      'overlay-color': '#ffffff',
      'overlay-opacity': 0.08,
    },
  },
  {
    selector: 'edge',
    style: {
      'width':             1.5,
      'line-color':        '#334155',
      'target-arrow-color':'#334155',
      'target-arrow-shape':'triangle',
      'curve-style':       'bezier',
      'label':             'data(label)',
      'font-size':         9,
      'color':             '#64748b',
      'text-background-color': '#0f172a',
      'text-background-opacity': 0.8,
      'text-background-padding': '2px',
    },
  },
  {
    selector: 'edge:selected',
    style: { 'line-color': '#6366f1', 'target-arrow-color': '#6366f1' },
  },
]

// ─── Info panel ───────────────────────────────────────────────────────────────
function InfoPanel({ node, onClose, onNavigate }: {
  node: NodeData
  onClose: () => void
  onNavigate?: (href: string) => void
}) {
  const emoji = NODE_EMOJI[node.type]

  return (
    <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-72 rounded-xl border p-4 z-10"
         style={{ background: '#0f172a', borderColor: '#1e293b', boxShadow: '0 4px 32px rgba(0,0,0,0.5)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <span className="font-semibold text-white text-sm leading-tight">{node.label}</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white shrink-0">
          <Icon name="close" size={16} />
        </button>
      </div>
      {node.sublabel && (
        <p className="text-xs text-slate-400 mb-3 pl-7">{node.sublabel}</p>
      )}
      {node.risk != null && node.risk > 0 && (
        <div className="flex items-center gap-1.5 mb-3 pl-7">
          <span className="text-xs text-red-400">⚠️ Risk {node.risk}/100</span>
        </div>
      )}
      {node.href && (
        <button
          onClick={() => onNavigate?.(node.href!)}
          className="w-full mt-1 py-1.5 px-3 rounded-lg text-xs font-medium text-white transition"
          style={{ background: '#1e293b', border: '1px solid #334155' }}>
          Відкрити →
        </button>
      )}
      {node.type === 'phone' && (
        <button
          onClick={() => navigator.clipboard?.writeText(node.label)}
          className="w-full mt-1 py-1.5 px-3 rounded-lg text-xs font-medium text-slate-300 transition"
          style={{ background: '#1e293b', border: '1px solid #334155' }}>
          📋 Копіювати номер
        </button>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function GraphTab({ person, personId, incidents, onNavigate }: GraphTabProps) {
  const [elements,  setElements]  = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<NodeData | null>(null)
  const [nodeCount, setNodeCount] = useState(0)
  const cyRef = useRef<any>(null)

  const personName = person?.name_ukr || person?.name_rus || person?.name || 'Особа'

  const loadGraph = useCallback(async () => {
    setLoading(true)
    const nodes: any[] = []
    const edges: any[] = []
    const seen = new Set<string>()

    function addNode(id: string, data: Omit<NodeData, 'id'>) {
      if (seen.has(id)) return
      seen.add(id)
      const style = NODE_STYLE[data.type as NodeType]
      const riskNum = typeof data.risk === 'number' ? data.risk : 0
      nodes.push({ data: { id, ...data, bg: riskNum >= 70 ? '#7f1d1d' : style.bg, border: style.border, size: style.size } })
    }

    function addEdge(source: string, target: string, label: string) {
      if (!seen.has(source) || !seen.has(target)) return
      edges.push({ data: { source, target, label } })
    }

    // ── Center: person node ────────────────────────────────────────────────
    const centerId = `p_${personId}`
    addNode(centerId, {
      label:    personName,
      type:     'person',
      sublabel: [person?.rank, person?.unit].filter(Boolean).join(' · '),
      href:     `/persons/${personId}`,
    })

    // ── Phones ────────────────────────────────────────────────────────────
    for (const phone of (person?.phones || []).slice(0, 8)) {
      const id = `phone_${phone}`
      addNode(id, { label: phone, type: 'phone', href: `/dashboard?q=${encodeURIComponent(phone)}` })
      addEdge(centerId, id, 'телефон')
    }

    // ── Addresses ─────────────────────────────────────────────────────────
    const addrs = [
      person?.addr_live && { val: person.addr_live, label: 'прожив.' },
      person?.addr_reg  && { val: person.addr_reg,  label: 'реєстр.' },
    ].filter(Boolean) as { val: string; label: string }[]

    for (const { val, label } of addrs) {
      const id = `addr_${val.slice(0, 20)}`
      addNode(id, { label: val.length > 30 ? val.slice(0, 30) + '…' : val, type: 'address', sublabel: label })
      addEdge(centerId, id, 'адреса')
    }

    // ── Related persons ────────────────────────────────────────────────────
    try {
      const res = await fetch(`/api/persons/${personId}/connections`)
      if (res.ok) {
        const { edges: connEdges } = await res.json() as { edges: any[] }
        for (const edge of connEdges || []) {
          if (!edge.neighbor) continue
          const relId = `p_${edge.neighbor.id}`
          const relName = edge.neighbor.name_ukr || edge.neighbor.name_rus || edge.neighbor.name || '?'
          addNode(relId, {
            label:    relName,
            type:     'related_person',
            sublabel: edge.neighbor.rank || '',
            href:     `/persons/${edge.neighbor.id}`,
            risk:     edge.neighbor.threat_score,
          })
          addEdge(centerId, relId, edge.rel_type || "зв'язок")
        }
      }
    } catch { /* graceful */ }

    // ── Crypto wallets ────────────────────────────────────────────────────
    try {
      const supabase = createClient()
      const { data: wallets } = await supabase
        .from('crypto_wallets')
        .select('id, address, blockchain, label, risk_score')
        .eq('person_id', personId)
        .limit(10)

      for (const w of wallets || []) {
        const id = `w_${w.id}`
        const shortAddr = w.address ? w.address.slice(0, 10) + '…' : ''
        addNode(id, {
          label:    w.label || shortAddr,
          type:     'wallet',
          sublabel: w.blockchain || '',
          risk:     w.risk_score,
          href:     w.address ? `/crypto-intel?address=${encodeURIComponent(w.address)}` : undefined,
        })
        addEdge(centerId, id, w.blockchain || 'крипто')
      }
    } catch { /* graceful */ }

    // ── Incidents ─────────────────────────────────────────────────────────
    for (const inc of (incidents || []).slice(0, 6)) {
      const id = `inc_${inc.id}`
      const title = inc.title?.length > 28 ? inc.title.slice(0, 28) + '…' : (inc.title || 'Справа')
      addNode(id, { label: title, type: 'incident', sublabel: inc.incident_type || '' })
      addEdge(centerId, id, 'учасник')
    }

    setElements([...nodes, ...edges])
    setNodeCount(nodes.length)
    setLoading(false)
  }, [personId, personName, person, incidents])

  useEffect(() => { loadGraph() }, [loadGraph])

  function handleNodeTap(nodeData: NodeData) {
    setSelected(nodeData)
  }

  function handleNavigate(href: string) {
    setSelected(null)
    if (onNavigate) onNavigate(href)
    else window.location.href = href
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80 gap-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Будуємо граф зв'язків…</span>
      </div>
    )
  }

  if (nodeCount <= 1) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-3 text-slate-500">
        <span className="text-4xl">🕸️</span>
        <p className="text-sm">Немає даних для побудови графа</p>
        <p className="text-xs text-slate-600">Додайте телефони, адреси або зв'язки з особами</p>
      </div>
    )
  }

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ height: 560, background: '#080f1a', border: '1px solid #1e293b' }}>

      {/* Legend */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2">
        {([
          ['person',         '👤', 'Особа'],
          ['related_person', '👤', "Зв'язки"],
          ['phone',          '📱', 'Телефони'],
          ['address',        '🏠', 'Адреси'],
          ['wallet',         '💰', 'Крипто'],
          ['incident',       '⚖️', 'Справи'],
        ] as const).map(([type, emoji, label]) => {
          const s = NODE_STYLE[type as NodeType]
          return (
            <div key={type} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                 style={{ background: '#0f172a', border: `1px solid ${s.border}33` }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.bg }} />
              <span className="text-slate-400">{label}</span>
            </div>
          )
        })}
      </div>

      {/* Node count */}
      <div className="absolute top-3 right-3 z-10 text-xs text-slate-600">
        {nodeCount} вузлів
      </div>

      {/* Fit button */}
      <button
        onClick={() => cyRef.current?.fit(undefined, 40)}
        className="absolute bottom-3 right-3 z-10 px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-white transition"
        style={{ background: '#0f172a', border: '1px solid #1e293b' }}
        title="Вписати у вікно">
        ⊞ Fit
      </button>

      <CytoscapeComponent
        elements={elements}
        stylesheet={CY_STYLESHEET}
        layout={{
          name:            'cose',
          animate:         true,
          animationDuration: 600,
          nodeRepulsion:   () => 8000,
          idealEdgeLength: () => 120,
          gravity:         0.4,
          numIter:         1000,
          fit:             true,
          padding:         60,
        } as any}
        style={{ width: '100%', height: '100%' }}
        cy={cy => {
          cyRef.current = cy
          cy.removeAllListeners()
          cy.on('tap', 'node', evt => {
            handleNodeTap(evt.target.data() as NodeData)
          })
          cy.on('tap', evt => {
            if (evt.target === cy) setSelected(null)
          })
        }}
      />

      {selected && (
        <InfoPanel
          node={selected}
          onClose={() => setSelected(null)}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  )
}
