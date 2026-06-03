// app/api/crypto/trace/route.ts
// Transaction tracing: follow the money — find where funds went
// POST /api/crypto/trace  body: { address, chain?, depth? (1-3) }

import { NextRequest, NextResponse } from 'next/server'

const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || ''
const BSCSCAN_KEY   = process.env.BSCSCAN_API_KEY   || ''

interface TraceNode {
  address:  string
  chain:    string
  received: number
  sent:     number
  txs:      number
  depth:    number
  parent?:  string
  children: string[]
  flags:    string[]
}

async function getEVMTxs(address: string, chain: string): Promise<any[]> {
  const chainIds: Record<string, string> = { eth: '1', bsc: '56' }
  const apis: Record<string, { url: string; key: string }> = {
    eth: { url: 'https://api.etherscan.io/v2/api', key: ETHERSCAN_KEY },
    bsc: { url: 'https://api.bscscan.com/v2/api',  key: BSCSCAN_KEY  },
  }
  const cfg     = apis[chain] || apis.eth
  const chainId = chainIds[chain] || '1'
  const addr    = address.toLowerCase()

  try {
    const res = await fetch(
      `${cfg.url}?chainid=${chainId}&module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&page=1&offset=30&sort=desc&apikey=${cfg.key || 'YourApiKeyToken'}`,
      { signal: AbortSignal.timeout(12000) }
    )
    const data = await res.json()
    return Array.isArray(data.result) ? data.result : []
  } catch { return [] }
}

async function getBTCTxs(address: string): Promise<any[]> {
  try {
    const res = await fetch(`https://blockchain.info/rawaddr/${address}?limit=20`, {
      headers: { 'User-Agent': 'ODB-Crypto-Intel/1.0' },
      signal: AbortSignal.timeout(12000),
    })
    const data = await res.json()
    return data.txs || []
  } catch { return [] }
}

async function analyzeNode(address: string, chain: string): Promise<Partial<TraceNode>> {
  const addr = address.toLowerCase()
  let txs: any[] = []

  if (chain === 'btc') {
    txs = await getBTCTxs(address)
  } else {
    txs = await getEVMTxs(address, chain)
  }

  if (!txs.length) return { address, chain, received: 0, sent: 0, txs: 0, children: [], flags: [] }

  const sent     = txs.filter(t => (t.from || '').toLowerCase() === addr || (t.from_address || '') === address)
  const received = txs.filter(t => (t.to   || '').toLowerCase() === addr || (t.to_address   || '') === address)

  // Extract unique addresses this wallet interacted with (sent to)
  const sentTo = new Set<string>()
  sent.forEach(t => {
    const to = (t.to || t.to_address || '').toLowerCase()
    if (to && to !== addr) sentTo.add(to)
  })

  const flags: string[] = []
  if (sent.length > received.length * 2) flags.push('mostly_sending')
  if (txs.length > 100) flags.push('high_activity')

  return {
    address,
    chain,
    received: received.length,
    sent: sent.length,
    txs:  txs.length,
    children: [...sentTo].slice(0, 5), // top 5 destinations
    flags,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { address, chain = 'eth', depth = 2 } = await req.json()
    if (!address?.trim()) return NextResponse.json({ error: 'address required' }, { status: 400 })

    const maxDepth = Math.min(depth, 3) // max 3 hops
    const nodes: Record<string, TraceNode> = {}
    const queue: Array<{ address: string; depth: number; parent?: string }> = [
      { address: address.trim(), depth: 0 }
    ]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const item = queue.shift()!
      if (!item || visited.has(item.address) || item.depth > maxDepth) continue
      visited.add(item.address)

      const nodeData = await analyzeNode(item.address, chain)
      nodes[item.address] = {
        ...nodeData,
        address:  item.address,
        chain,
        depth:    item.depth,
        parent:   item.parent,
        received: nodeData.received || 0,
        sent:     nodeData.sent     || 0,
        txs:      nodeData.txs      || 0,
        children: nodeData.children || [],
        flags:    nodeData.flags    || [],
      }

      // Queue children for next level
      if (item.depth < maxDepth) {
        for (const child of (nodeData.children || []).slice(0, 3)) { // max 3 children per node
          if (!visited.has(child)) {
            queue.push({ address: child, depth: item.depth + 1, parent: item.address })
          }
        }
      }
    }

    // Build edges for graph visualization
    const edges: Array<{ from: string; to: string; depth: number }> = []
    for (const [addr, node] of Object.entries(nodes)) {
      for (const child of node.children) {
        if (nodes[child]) edges.push({ from: addr, to: child, depth: node.depth })
      }
    }

    return NextResponse.json({
      success:    true,
      root:       address.trim(),
      chain,
      depth_analyzed: maxDepth,
      nodes_found:    Object.keys(nodes).length,
      nodes,
      edges,
      high_risk_nodes: Object.values(nodes).filter(n => n.flags.length > 1).map(n => n.address),
      analyzed_at: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
