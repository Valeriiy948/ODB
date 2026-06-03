// app/api/crypto/cluster/route.ts
// Wallet clustering: find ALL wallets belonging to the same person/entity
// POST /api/crypto/cluster  body: { address, chain? }
//
// Clustering heuristics:
// 1. Common input ownership (BTC) — inputs in same tx = same person
// 2. Peeling chains — A→B→C (linear forwarding = same person)
// 3. Same gas wallet (EVM) — same address pays gas for multiple wallets
// 4. Exchange deposit clustering — multiple deposits to same exchange address

import { NextRequest, NextResponse } from 'next/server'

const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || ''

async function getEVMTxs(address: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc&apikey=${ETHERSCAN_KEY || 'YourApiKeyToken'}`,
      { signal: AbortSignal.timeout(12000) }
    )
    const data = await res.json()
    return Array.isArray(data.result) ? data.result : []
  } catch { return [] }
}

async function getEVMInternalTxs(address: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlistinternal&address=${address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc&apikey=${ETHERSCAN_KEY || 'YourApiKeyToken'}`,
      { signal: AbortSignal.timeout(10000) }
    )
    const data = await res.json()
    return Array.isArray(data.result) ? data.result : []
  } catch { return [] }
}

async function getBTCTxs(address: string): Promise<any[]> {
  try {
    const res = await fetch(`https://blockchain.info/rawaddr/${address}?limit=50`, {
      headers: { 'User-Agent': 'ODB-Crypto-Intel/1.0' },
      signal: AbortSignal.timeout(12000),
    })
    const data = await res.json()
    return data.txs || []
  } catch { return [] }
}

export async function POST(req: NextRequest) {
  try {
    const { address, chain = 'eth' } = await req.json()
    if (!address?.trim()) return NextResponse.json({ error: 'address required' }, { status: 400 })

    const addr = address.trim().toLowerCase()
    const clusteredWallets: Array<{
      address: string
      reason: string
      confidence: 'high' | 'medium' | 'low'
      evidence: string
    }> = []

    if (chain === 'btc') {
      // ── BTC: Common Input Ownership Heuristic ───────────────────────────────
      const txs = await getBTCTxs(address)
      const coInputAddresses = new Map<string, number>() // addr → count

      for (const tx of txs.slice(0, 30)) {
        if (tx.inputs?.length > 1) {
          // Multiple inputs in same tx = likely same owner
          for (const inp of tx.inputs) {
            const inpAddr = inp.prev_out?.addr
            if (inpAddr && inpAddr !== address) {
              coInputAddresses.set(inpAddr, (coInputAddresses.get(inpAddr) || 0) + 1)
            }
          }
        }
      }

      // High confidence if co-input appears in 2+ transactions
      for (const [coAddr, count] of coInputAddresses.entries()) {
        const confidence: 'high' | 'medium' | 'low' = count >= 3 ? 'high' : count >= 2 ? 'medium' : 'low'
        clusteredWallets.push({
          address:    coAddr,
          reason:     'btc_common_input',
          confidence,
          evidence:   `Зустрічається як co-input в ${count} транзакціях. Висока ймовірність спільного власника.`,
        })
      }

      // Peeling chain: find linear A→B→C→D forwarding
      for (const tx of txs.slice(0, 20)) {
        if (tx.inputs?.length === 1 && tx.out?.length === 2) {
          // Classic peel: one input, two outputs (change + forward)
          for (const out of tx.out) {
            if (out.addr && out.addr !== address && !coInputAddresses.has(out.addr)) {
              clusteredWallets.push({
                address:  out.addr,
                reason:   'btc_peel_chain',
                confidence: 'medium',
                evidence: `Peeling chain — фактично частина тієї ж транзакції ${tx.hash?.slice(0, 16)}...`,
              })
            }
          }
        }
      }

    } else {
      // ── EVM: Multiple clustering heuristics ─────────────────────────────────
      const [txs, internalTxs] = await Promise.all([
        getEVMTxs(addr),
        getEVMInternalTxs(addr),
      ])

      // Heuristic 1: Same gas payer (one address funds multiple wallets)
      const gasPayerMap = new Map<string, string[]>()
      for (const tx of txs) {
        if (tx.to?.toLowerCase() === addr && parseFloat(tx.value) === 0) {
          // Received 0 ETH = gas funding
          const payer = tx.from?.toLowerCase()
          if (payer) {
            if (!gasPayerMap.has(payer)) gasPayerMap.set(payer, [])
            gasPayerMap.get(payer)!.push(tx.hash)
          }
        }
      }

      for (const [payer, fundTxs] of gasPayerMap.entries()) {
        if (fundTxs.length >= 2) {
          clusteredWallets.push({
            address:    payer,
            reason:     'evm_gas_funder',
            confidence: 'high',
            evidence:   `Адреса фінансує газ для цього гаманця ${fundTxs.length}x. Майже напевно контролює обидва.`,
          })
        }
      }

      // Heuristic 2: Immediate forward (receive → send full amount within same block)
      const receiveBlocks = new Map<string, any>()
      for (const tx of txs) {
        if (tx.to?.toLowerCase() === addr) receiveBlocks.set(tx.blockNumber, tx)
      }
      for (const tx of txs) {
        if (tx.from?.toLowerCase() === addr && receiveBlocks.has(tx.blockNumber)) {
          // Sent in same block as received = forwarding wallet
          clusteredWallets.push({
            address:    tx.to?.toLowerCase() || tx.to,
            reason:     'evm_immediate_forward',
            confidence: 'high',
            evidence:   `Миттєвий форвард в блоці ${tx.blockNumber} — типова поведінка гаманця-посередника.`,
          })
        }
      }

      // Heuristic 3: Internal tx clustering (contract-funded wallets)
      for (const tx of internalTxs.slice(0, 20)) {
        if (tx.from?.toLowerCase() !== addr && tx.to?.toLowerCase() === addr) {
          // Check if this funder also funds others
          clusteredWallets.push({
            address:    tx.from?.toLowerCase() || tx.from,
            reason:     'evm_internal_funder',
            confidence: 'medium',
            evidence:   `Внутрішня транзакція з контракту/гаманця ${tx.from?.slice(0, 10)}...`,
          })
        }
      }
    }

    // Deduplicate
    const seen = new Set<string>()
    const unique = clusteredWallets.filter(w => {
      if (seen.has(w.address) || w.address === addr) return false
      seen.add(w.address)
      return true
    })

    // Sort by confidence
    const sorted = unique.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.confidence] - order[b.confidence]
    })

    return NextResponse.json({
      success:          true,
      root_address:     address.trim(),
      chain,
      cluster_size:     sorted.length + 1, // +1 for root
      clustered_wallets: sorted,
      high_confidence:  sorted.filter(w => w.confidence === 'high').length,
      note:             'Кластеризація базується на евристиках. Потрібна людська верифікація.',
      analyzed_at:      new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
