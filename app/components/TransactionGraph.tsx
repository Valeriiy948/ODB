'use client'

// components/TransactionGraph.tsx
// Граф транзакцій між крипто-гаманцями на основі Cytoscape

import { useState, useRef, useCallback } from 'react'
import CytoscapeComponent from 'react-cytoscapejs'
import type { ElementDefinition, StylesheetStyle } from 'cytoscape'
import type Cytoscape from 'cytoscape'
import type { Transaction } from '@/app/api/wallet/analyze/route'

interface CryptoWallet {
  id: string
  wallet_address: string
  network: string
  balance_usd: number | null
  risk_score: number | null
  ofac_hit: boolean
  risk_labels: string[]
}

interface NodeDetails {
  address: string
  balance_usd: number | null
  risk_score: number | null
  ofac_hit: boolean
  risk_labels: string[]
}

interface Props {
  wallets: CryptoWallet[]
  transactions: Transaction[]
}

// Скорочення адреси: 0x1234...abcd
function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

// Колір вузла залежно від ризику
function nodeColor(wallet: CryptoWallet): string {
  if (wallet.ofac_hit) return '#7f1d1d'
  if ((wallet.risk_score ?? 0) > 40) return '#78350f'
  return '#14532d'
}

// Розмір вузла: 40px базовий + ризик / 10
function nodeSize(wallet: CryptoWallet): number {
  return 40 + (wallet.risk_score ?? 0) / 10
}

// Ширина ребра: log10(value + 1) * 2
function edgeWidth(valueUsd: number | null): number {
  return Math.log10((valueUsd ?? 0) + 1) * 2
}

export default function TransactionGraph({ wallets, transactions }: Props) {
  const [selectedNode, setSelectedNode] = useState<NodeDetails | null>(null)
  const cyRef = useRef<Cytoscape.Core | null>(null)

  // ─── Побудова елементів графу ─────────────────────────────────────────────
  const elements: ElementDefinition[] = []

  // Вузли: тільки відомі гаманці особи
  const walletMap = new Map<string, CryptoWallet>(
    wallets.map(w => [w.wallet_address.toLowerCase(), w])
  )

  wallets.forEach(w => {
    elements.push({
      data: {
        id:           w.wallet_address,
        label:        shortAddr(w.wallet_address),
        bgColor:      nodeColor(w),
        size:         nodeSize(w),
        address:      w.wallet_address,
        balance_usd:  w.balance_usd,
        risk_score:   w.risk_score,
        ofac_hit:     w.ofac_hit,
        risk_labels:  w.risk_labels,
      },
    })
  })

  // Зовнішні вузли (контрагенти з транзакцій, яких немає у walletMap)
  const externalNodes = new Set<string>()
  transactions.forEach(tx => {
    const fromKey = tx.from?.toLowerCase()
    const toKey   = tx.to?.toLowerCase()
    if (fromKey && !walletMap.has(fromKey) && !externalNodes.has(fromKey)) {
      externalNodes.add(fromKey)
      elements.push({
        data: {
          id:          tx.from,
          label:       shortAddr(tx.from),
          bgColor:     '#1e293b',
          size:        30,
          address:     tx.from,
          balance_usd: null,
          risk_score:  null,
          ofac_hit:    false,
          risk_labels: [],
        },
      })
    }
    if (toKey && !walletMap.has(toKey) && !externalNodes.has(toKey)) {
      externalNodes.add(toKey)
      elements.push({
        data: {
          id:          tx.to,
          label:       shortAddr(tx.to),
          bgColor:     '#1e293b',
          size:        30,
          address:     tx.to,
          balance_usd: null,
          risk_score:  null,
          ofac_hit:    false,
          risk_labels: [],
        },
      })
    }
  })

  // Ребра: транзакції (унікальні за hash)
  const addedEdges = new Set<string>()
  transactions.forEach((tx, idx) => {
    if (!tx.from || !tx.to) return
    const edgeId = tx.hash || `edge-${idx}`
    if (addedEdges.has(edgeId)) return
    addedEdges.add(edgeId)

    const dateStr = tx.timestamp
      ? new Date(tx.timestamp).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })
      : ''
    const valueStr = tx.value_usd !== null ? `$${tx.value_usd.toLocaleString()}` : ''

    elements.push({
      data: {
        id:        edgeId,
        source:    tx.from,
        target:    tx.to,
        label:     valueStr ? `${valueStr}\n${dateStr}` : dateStr,
        width:     edgeWidth(tx.value_usd),
        lineColor: (tx.value_usd ?? 0) > 10_000 ? '#ef4444' : '#6b7280',
        value_usd: tx.value_usd,
      },
    })
  })

  // ─── Стилі Cytoscape ─────────────────────────────────────────────────────
  const stylesheet: StylesheetStyle[] = [
    {
      selector: 'node',
      style: {
        'background-color': 'data(bgColor)',
        'label':            'data(label)',
        'color':            '#e8edf4',
        'font-size':        '10px',
        'text-valign':      'center',
        'text-halign':      'center',
        'width':            'data(size)',
        'height':           'data(size)',
        'border-width':     2,
        'border-color':     '#3b82f6',
        'text-outline-color': '#07090d',
        'text-outline-width': 2,
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 3,
        'border-color': '#60a5fa',
      },
    },
    {
      selector: 'edge',
      style: {
        'width':               'data(width)',
        'line-color':          'data(lineColor)',
        'target-arrow-color':  'data(lineColor)',
        'target-arrow-shape':  'triangle',
        'curve-style':         'bezier',
        'label':               'data(label)',
        'font-size':           '8px',
        'color':               '#9aa6b6',
        'text-rotation':       'autorotate',
        'text-outline-color':  '#07090d',
        'text-outline-width':  1,
      },
    },
  ]

  // ─── Обробник кліку на вузол ─────────────────────────────────────────────
  const handleCyInit = useCallback((cy: Cytoscape.Core) => {
    cyRef.current = cy
    cy.on('tap', 'node', evt => {
      const node = evt.target as Cytoscape.NodeSingular
      setSelectedNode({
        address:     node.data('address') as string,
        balance_usd: node.data('balance_usd') as number | null,
        risk_score:  node.data('risk_score') as number | null,
        ofac_hit:    node.data('ofac_hit') as boolean,
        risk_labels: (node.data('risk_labels') as string[]) ?? [],
      })
    })
    cy.on('tap', evt => {
      if (evt.target === cy) setSelectedNode(null)
    })
  }, [])

  // ─── Порожній стан ───────────────────────────────────────────────────────
  if (wallets.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl text-sm"
        style={{
          width: '100%',
          height: '200px',
          background: 'var(--odb-bg)',
          border: '1px dashed var(--odb-border)',
          color: 'var(--odb-text-faint)',
        }}
      >
        Додайте гаманці для побудови графу
      </div>
    )
  }

  return (
    <div className="relative" style={{ width: '100%', height: '500px', borderRadius: '12px', overflow: 'hidden' }}>
      <CytoscapeComponent
        elements={elements}
        stylesheet={stylesheet}
        layout={{ name: 'cose', animate: true, randomize: false, idealEdgeLength: 150 } as Cytoscape.LayoutOptions}
        style={{ width: '100%', height: '100%', background: 'var(--odb-bg)' }}
        cy={handleCyInit}
      />

      {/* Панель деталей вузла */}
      {selectedNode && (
        <div
          className="absolute top-3 right-3 w-64 rounded-xl p-4 space-y-2 text-sm z-10"
          style={{
            background: 'var(--odb-surface-2)',
            border: '1px solid var(--odb-border)',
            boxShadow: 'var(--odb-shadow)',
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <span
              className="font-mono text-xs break-all"
              style={{ color: 'var(--odb-text)' }}
            >
              {selectedNode.address}
            </span>
            <button
              onClick={() => setSelectedNode(null)}
              className="shrink-0 text-[var(--odb-text-faint)] hover:text-[var(--odb-text)] text-base leading-none"
            >
              ✕
            </button>
          </div>

          {selectedNode.balance_usd !== null && (
            <div style={{ color: 'var(--odb-text-dim)' }}>
              Баланс: <span style={{ color: 'var(--odb-text)' }}>
                ${selectedNode.balance_usd.toLocaleString('uk-UA', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {selectedNode.risk_score !== null && (
            <div style={{ color: 'var(--odb-text-dim)' }}>
              Risk Score: <span style={{ color: selectedNode.risk_score > 70 ? '#f87171' : selectedNode.risk_score >= 40 ? '#fbbf24' : '#34d399' }}>
                {selectedNode.risk_score}/100
              </span>
            </div>
          )}

          {selectedNode.ofac_hit && (
            <div className="text-xs font-semibold text-red-400">🔴 OFAC HIT</div>
          )}

          {selectedNode.risk_labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedNode.risk_labels.map(label => (
                <span
                  key={label}
                  className="rounded-full bg-red-950/60 border border-red-500/30 px-2 py-0.5 text-xs text-red-300"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
