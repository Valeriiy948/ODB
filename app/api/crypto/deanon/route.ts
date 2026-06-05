// app/api/crypto/deanon/route.ts
// De-anonymization engine: wallet address → real person / entity
//
// Pipeline:
// 1. Exchange identification — which exchange received funds (has KYC)
// 2. Drop detection          — is this a money-mule wallet?
// 3. ODB persons search      — is address in our 520k+ breach database?
// 4. Blockchair entity label — public address labels

import { NextRequest, NextResponse } from 'next/server'
import { labelCounterparties, lookupAddress } from '@/lib/crypto/exchange-labels'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ETHERSCAN_KEY    = process.env.ETHERSCAN_API_KEY || ''

// ─── 1. Blockchair entity label ───────────────────────────────────────────────
async function getBlockchairLabel(address: string, chain: string): Promise<string | null> {
  const slugMap: Record<string, string> = {
    eth: 'ethereum', bsc: 'bnb', btc: 'bitcoin', polygon: 'matic',
  }
  const slug = slugMap[chain] || 'ethereum'
  try {
    const res = await fetch(
      `https://api.blockchair.com/${slug}/dashboards/address/${address}`,
      { signal: AbortSignal.timeout(10000), cache: 'no-store' }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data?.data?.[address]?.address?.label || null
  } catch { return null }
}

// ─── 2. Etherscan name tag ─────────────────────────────────────────────────────
async function getEtherscanNameTag(address: string): Promise<string | null> {
  if (!ETHERSCAN_KEY) return null
  try {
    // Etherscan V2: get address info (includes name tag for labeled addresses)
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=balance&address=${address}&tag=latest&apikey=${ETHERSCAN_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    )
    const data = await res.json()
    // Note: name tag is only in pro API. We use blockchair as primary fallback.
    return null
  } catch { return null }
}

// ─── 3. Get counterparties from blockchain ────────────────────────────────────
async function getCounterparties(address: string, chain: string): Promise<string[]> {
  const addr = address.toLowerCase()
  try {
    if (chain === 'btc') {
      const res = await fetch(
        `https://blockchain.info/rawaddr/${address}?limit=50`,
        { headers: { 'User-Agent': 'ODB/1.0' }, signal: AbortSignal.timeout(12000) }
      )
      const data = await res.json()
      const addrs = new Set<string>()
      ;(data.txs || []).forEach((tx: any) => {
        tx.inputs?.forEach((i: any) => { if (i.prev_out?.addr && i.prev_out.addr !== address) addrs.add(i.prev_out.addr) })
        tx.out?.forEach((o: any)     => { if (o.addr && o.addr !== address) addrs.add(o.addr) })
      })
      return [...addrs].slice(0, 30)
    }

    if (chain === 'tron') {
      const res = await fetch(
        `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=50&order_by=block_timestamp,desc`,
        { signal: AbortSignal.timeout(10000) }
      )
      const data = await res.json()
      const addrs = new Set<string>()
      ;(data.data || []).forEach((tx: any) => {
        if (tx.from !== address) addrs.add(tx.from)
        if (tx.to   !== address) addrs.add(tx.to)
      })
      return [...addrs].slice(0, 30)
    }

    if (chain === 'ton') {
      const res = await fetch(
        `https://tonapi.io/v2/accounts/${encodeURIComponent(address)}/events?limit=50`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }
      )
      const data = await res.json()
      const addrs = new Set<string>()
      ;(data.events || []).forEach((ev: any) => {
        const t = ev.actions?.[0]?.TonTransfer
        if (!t) return
        if (t.sender?.address    && t.sender.address    !== address) addrs.add(t.sender.address)
        if (t.recipient?.address && t.recipient.address !== address) addrs.add(t.recipient.address)
      })
      return [...addrs].slice(0, 30)
    }

    // EVM (ETH/BSC/Polygon)
    const chainIds: Record<string, string> = { eth: '1', bsc: '56', polygon: '137' }
    const chainId = chainIds[chain] || '1'
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=txlist&address=${addr}&page=1&offset=50&sort=desc&apikey=${ETHERSCAN_KEY || 'YourApiKeyToken'}`,
      { signal: AbortSignal.timeout(12000) }
    )
    const data = await res.json()
    const addrs = new Set<string>()
    ;(Array.isArray(data.result) ? data.result : []).forEach((tx: any) => {
      if (tx.from && tx.from !== addr) addrs.add(tx.from)
      if (tx.to   && tx.to   !== addr) addrs.add(tx.to)
    })
    return [...addrs].slice(0, 30)
  } catch { return [] }
}

// ─── 4. Drop detection ────────────────────────────────────────────────────────
interface DropAnalysis {
  is_drop:    boolean
  drop_score: number   // 0-100
  flags:      string[]
  pattern:    'clean' | 'suspicious' | 'drop' | 'mixer'
}

async function analyzeDropPattern(address: string, chain: string): Promise<DropAnalysis> {
  const flags: string[] = []
  let score = 0

  try {
    if (['eth', 'bsc', 'polygon'].includes(chain)) {
      const addr    = address.toLowerCase()
      const chainId = { eth: '1', bsc: '56', polygon: '137' }[chain] || '1'
      const apiKey  = ETHERSCAN_KEY || 'YourApiKeyToken'
      const base    = `https://api.etherscan.io/v2/api?chainid=${chainId}&apikey=${apiKey}`

      const [txRes, tokenRes] = await Promise.all([
        fetch(`${base}&module=account&action=txlist&address=${addr}&page=1&offset=100&sort=asc`).then(r => r.json()).catch(() => null),
        fetch(`${base}&module=account&action=tokentx&address=${addr}&page=1&offset=100&sort=asc`).then(r => r.json()).catch(() => null),
      ])

      const txs: any[]      = Array.isArray(txRes?.result)   ? txRes.result   : []
      const tokenTxs: any[] = Array.isArray(tokenRes?.result) ? tokenRes.result : []
      const allTxs          = [...txs, ...tokenTxs]

      if (allTxs.length === 0) return { is_drop: false, drop_score: 0, flags: [], pattern: 'clean' }

      const sent     = txs.filter(t => t.from === addr)
      const received = txs.filter(t => t.to   === addr)

      // ── Flag: quick forward (receive → send < 2 hours)
      const timestamps = allTxs.map(t => parseInt(t.timeStamp)).sort((a, b) => a - b)
      const firstTs = timestamps[0]
      const lastTs  = timestamps[timestamps.length - 1]
      const lifeHours = (lastTs - firstTs) / 3600

      if (lifeHours < 2 && sent.length > 0 && received.length > 0) {
        flags.push('quick_forward')
        score += 40
      }

      // ── Flag: aggregator (many in → few out)
      const inAddrs  = new Set(received.map((t: any) => t.from))
      const outAddrs = new Set(sent.map((t: any) => t.to))
      if (inAddrs.size >= 5 && outAddrs.size <= 2) {
        flags.push('aggregator')
        score += 30
      }

      // ── Flag: account fully emptied
      const lastBalance = txs[txs.length - 1]
      if (sent.length > 0 && received.length > 0 && sent.length >= received.length) {
        flags.push('fully_emptied')
        score += 25
      }

      // ── Flag: young wallet with high volume
      const walletAgeDays = lifeHours / 24
      const usdtTxs = tokenTxs.filter((t: any) => ['USDT', 'USDC', 'BUSD'].includes(t.tokenSymbol))
      if (walletAgeDays < 30 && usdtTxs.length > 10) {
        flags.push('new_wallet_high_volume')
        score += 20
      }

      // ── Flag: mixer interaction
      const MIXER_ADDRS = new Set([
        '0x722122df12d4e14e13ac3b6895a86e84145b6967',
        '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
        '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf',
        '0xa160cdab225685da1d56aa342ad8841c3b53f291',
      ])
      const touchedMixer = allTxs.some((t: any) =>
        MIXER_ADDRS.has(t.from?.toLowerCase()) || MIXER_ADDRS.has(t.to?.toLowerCase())
      )
      if (touchedMixer) {
        flags.push('mixer_interaction')
        score += 50
      }
    }

    if (chain === 'tron') {
      const res  = await fetch(
        `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=100&order_by=block_timestamp,asc`,
        { signal: AbortSignal.timeout(12000) }
      )
      const data = await res.json()
      const txs: any[] = data.data || []
      if (txs.length === 0) return { is_drop: false, drop_score: 0, flags: [], pattern: 'clean' }

      const received = txs.filter((t: any) => t.to === address)
      const sent     = txs.filter((t: any) => t.from === address)

      const firstTs  = txs[0]?.block_timestamp || 0
      const lastTs   = txs[txs.length - 1]?.block_timestamp || 0
      const lifeHours = (lastTs - firstTs) / 3_600_000

      if (lifeHours < 2 && sent.length > 0 && received.length > 0) { flags.push('quick_forward'); score += 40 }

      const inAddrs  = new Set(received.map((t: any) => t.from))
      const outAddrs = new Set(sent.map((t: any) => t.to))
      if (inAddrs.size >= 5 && outAddrs.size <= 2) { flags.push('aggregator'); score += 30 }
      if (sent.length >= received.length && sent.length > 0) { flags.push('fully_emptied'); score += 20 }
    }

  } catch { /* graceful */ }

  const capped   = Math.min(score, 100)
  const is_drop  = capped >= 50
  const pattern  = capped >= 75 ? 'drop'
                 : capped >= 50 ? 'suspicious'
                 : flags.includes('mixer_interaction') ? 'mixer'
                 : 'clean'

  return { is_drop, drop_score: capped, flags, pattern }
}

// ─── 5. ODB persons DB search ─────────────────────────────────────────────────
async function searchODBPersons(address: string): Promise<any[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE) return []
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)
    // Search in notes / extra fields where wallet addresses might be stored
    const { data } = await supabase
      .from('persons')
      .select('id, name, name_rus, phones, dob, source')
      .or(`notes.ilike.%${address}%,extra.ilike.%${address}%`)
      .limit(10)
    return data || []
  } catch { return [] }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { address, chain = 'eth', counterparties: providedCounterparties } = await req.json()
    if (!address?.trim()) return NextResponse.json({ error: 'address required' }, { status: 400 })

    const addr = address.trim()

    // Check if the address itself is a known entity
    const selfLabel = lookupAddress(addr)

    // Run all lookups in parallel
    const [
      blockchairLabel,
      counterparties,
      odbPersons,
    ] = await Promise.all([
      getBlockchairLabel(addr, chain),
      providedCounterparties ? Promise.resolve(providedCounterparties as string[]) : getCounterparties(addr, chain),
      searchODBPersons(addr),
    ])

    // Label all counterparties
    const labeledCounterparties = labelCounterparties(counterparties)

    // Drop detection (run after we have counterparties context)
    const dropAnalysis = await analyzeDropPattern(addr, chain)

    // Separate exchanges from other labeled entities
    const exchanges   = labeledCounterparties.filter(c => c.label.type === 'exchange')
    const mixers      = labeledCounterparties.filter(c => c.label.type === 'mixer')
    const sanctioned  = labeledCounterparties.filter(c => c.label.type === 'sanctioned')
    const darknet     = labeledCounterparties.filter(c => c.label.type === 'darknet')

    // Build entity profile
    const entityLabel = selfLabel
      ? { name: selfLabel.name, type: selfLabel.type, kyc: selfLabel.kyc, source: 'known_db' }
      : blockchairLabel
      ? { name: blockchairLabel, type: 'unknown', kyc: false, source: 'blockchair' }
      : null

    // Deanon confidence
    let deanonScore = 0
    let deanonClues: Array<{ type: string; value: string; confidence: 'high' | 'medium' | 'low' }> = []

    if (odbPersons.length > 0) {
      deanonScore += 80
      odbPersons.forEach(p => deanonClues.push({
        type:       'odb_person',
        value:      `${p.name || p.name_rus || '—'} (ID: ${p.id})`,
        confidence: 'high',
      }))
    }
    if (exchanges.length > 0) {
      deanonScore += 40
      exchanges.forEach(e => deanonClues.push({
        type:       'exchange_deposit',
        value:      `${e.label.name} (${e.address.slice(0, 10)}…) — KYC: ${e.label.kyc ? 'YES' : 'NO'}`,
        confidence: 'high',
      }))
    }
    if (entityLabel?.kyc) {
      deanonScore += 30
      deanonClues.push({ type: 'self_entity', value: entityLabel.name, confidence: 'high' })
    }
    if (dropAnalysis.is_drop) {
      deanonClues.push({ type: 'drop_wallet', value: `Drop score: ${dropAnalysis.drop_score}/100`, confidence: 'medium' })
    }

    // Subpoena targets — exchanges with KYC that interacted with this wallet
    const subpoenaTargets = [
      ...exchanges.filter(e => e.label.kyc).map(e => ({
        entity:  e.label.name,
        address: e.address,
        country: e.label.country || null,
        reason:  'KYC data available — deposited or withdrew funds',
      })),
      ...(entityLabel?.kyc ? [{
        entity:  entityLabel.name,
        address: addr,
        country: selfLabel?.country || null,
        reason:  'This address IS the exchange/entity',
      }] : []),
    ]

    // Risk assessment
    const riskFlags: string[] = [
      ...dropAnalysis.flags,
      mixers.length > 0      ? 'mixer_contact'    : null,
      sanctioned.length > 0  ? 'sanctioned_contact': null,
      darknet.length > 0     ? 'darknet_contact'   : null,
      odbPersons.length > 0  ? 'found_in_odb'      : null,
    ].filter(Boolean) as string[]

    return NextResponse.json({
      success:         true,
      address:         addr,
      chain,

      // Entity identification
      entity_label:    entityLabel,

      // De-anonymization
      deanon_score:    Math.min(deanonScore, 100),
      deanon_clues:    deanonClues,

      // Subpoena-worthy targets
      subpoena_targets: subpoenaTargets,

      // Counterparty analysis
      counterparties_analyzed: counterparties.length,
      labeled_exchanges:  exchanges,
      labeled_mixers:     mixers,
      labeled_sanctioned: sanctioned,
      labeled_darknet:    darknet,

      // Drop / money mule analysis
      drop_analysis: dropAnalysis,

      // ODB database hits
      odb_persons: odbPersons,

      // Risk
      risk_flags: riskFlags,

      analyzed_at: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
