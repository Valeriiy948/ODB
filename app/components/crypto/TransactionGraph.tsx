'use client'

import { useEffect, useRef } from 'react'

interface TxNode {
  address: string
  depth:   number
  sent:    number
  received:number
  txs:     number
  flags:   string[]
}

interface TxEdge {
  from: string
  to:   string
}

interface Props {
  nodes:  Record<string, TxNode>
  edges:  TxEdge[]
  root:   string
  chain?: string
}

export default function TransactionGraph({ nodes, edges, root }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const nodeList = Object.values(nodes)
    if (!nodeList.length) return

    let cy: any

    async function init() {
      const cytoscape = (await import('cytoscape')).default

      const cyNodes = nodeList.map(n => ({
        data: {
          id:      n.address,
          label:   n.address.slice(0, 6) + '…' + n.address.slice(-4),
          isRoot:  n.address === root ? 'yes' : 'no',
          risk:    n.flags.length > 1 ? 'high' : n.flags.length > 0 ? 'med' : 'ok',
          txs:     n.txs,
        },
      }))

      const cyEdges = edges.map((e, i) => ({
        data: { id: `e${i}`, source: e.from, target: e.to },
      }))

      cy = cytoscape({
        container: containerRef.current,
        elements:  [...cyNodes, ...cyEdges],
        style: [
          {
            selector: 'node',
            style: {
              'background-color':    '#1f2937',
              'border-color':        '#4b5563',
              'border-width':        2,
              'label':               'data(label)',
              'color':               '#9ca3af',
              'font-size':           '9px',
              'font-family':         'monospace',
              'text-valign':         'bottom',
              'text-margin-y':       6,
              'width':               34,
              'height':              34,
            },
          },
          {
            selector: 'node[isRoot = "yes"]',
            style: {
              'background-color': '#1e3a8a',
              'border-color':     '#3b82f6',
              'border-width':     3,
              'width':            46,
              'height':           46,
              'color':            '#93c5fd',
            },
          },
          {
            selector: 'node[risk = "high"]',
            style: {
              'background-color': '#7f1d1d',
              'border-color':     '#ef4444',
              'color':            '#fca5a5',
            },
          },
          {
            selector: 'node[risk = "med"]',
            style: {
              'background-color': '#78350f',
              'border-color':     '#f97316',
              'color':            '#fdba74',
            },
          },
          {
            selector: 'edge',
            style: {
              'line-color':           '#374151',
              'target-arrow-color':   '#374151',
              'target-arrow-shape':   'triangle',
              'curve-style':          'bezier',
              'width':                1.5,
              'arrow-scale':          0.8,
            },
          },
          {
            selector: ':selected',
            style: {
              'border-color':     '#60a5fa',
              'border-width':     3,
              'background-color': '#1e40af',
            },
          },
        ],
        layout: {
          name:           'breadthfirst',
          directed:       true,
          padding:        24,
          spacingFactor:  1.5,
          roots:          [`#${root}`],
        },
        userZoomingEnabled:    true,
        userPanningEnabled:    true,
        boxSelectionEnabled:   false,
        minZoom:               0.3,
        maxZoom:               3,
      })

      cy.on('tap', 'node', (evt: any) => {
        navigator.clipboard.writeText(evt.target.id()).catch(() => {})
      })
    }

    init()
    return () => { try { cy?.destroy() } catch {} }
  }, [nodes, edges, root])

  const count = Object.keys(nodes).length
  if (!count) return null

  return (
    <div className="space-y-1.5">
      <div
        ref={containerRef}
        style={{ width: '100%', height: '400px' }}
        className="bg-gray-950/60 border border-gray-700/50 rounded-xl overflow-hidden"
      />
      <p className="text-gray-600 text-xs text-right pr-1">
        {count} вузлів · клік на вузол = скопіювати адресу · скрол = масштаб
      </p>
    </div>
  )
}
