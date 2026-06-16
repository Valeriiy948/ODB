// app/api/cron/whale-alert/route.ts
// Intelligence Engine v3:
//   - Market Signal Engine (BULLISH/BEARISH/NEUTRAL per tx + aggregate per asset)
//   - Smart Digest: групування SANCTIONS > CLUSTER > TRANSIT > SMART MONEY > решта
//   - Auto-flag: risk >= 80 → auto-upsert до crypto_wallets
//   - Платний канал: тільки HIGH confidence сигнали для трейдерів
//
// cron-job.org: * * * * * → https://odb-one.vercel.app/api/cron/whale-alert

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import { sendTelegramMessage }       from '@/lib/telegram'

export const runtime     = 'nodejs'
export const maxDuration = 55

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const WHALE_API      = 'https://api.whale-alert.io/v1'
const MIN_USD        = Number(process.env.WHALE_ALERT_MIN_USD         ?? 500_000)
const TG_THRESH      = Number(process.env.WHALE_ALERT_TG_THRESHOLD    ?? 1_000_000)
const DIGEST_COOL_MS = Number(process.env.WHALE_ALERT_DIGEST_COOLDOWN ?? 5) * 60_000
const APP_URL        = process.env.APP_URL ?? 'https://odb-one.vercel.app'
const CHANNEL_ID       = process.env.WHALE_ALERT_CHANNEL_ID ?? ''
const OFAC_SERVICE_URL = process.env.OFAC_SERVICE_URL ?? 'http://161.35.86.145:8012'

// ─── Auth ─────────────────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  if (req.headers.get('x-vercel-cron-signature')) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface WhaleTxParty {
  address?:    string
  owner?:      string
  owner_type?: string
}

interface WhaleAlertTx {
  id:               number
  blockchain:       string
  symbol:           string
  transaction_type: string
  hash:             string
  from:             WhaleTxParty
  to:               WhaleTxParty
  timestamp:        number
  amount:           number
  amount_usd:       number
}

interface WhaleAlertResponse {
  result:       string
  count:        number
  transactions: WhaleAlertTx[]
}

interface StoredWhaleTx {
  whale_alert_id:  string
  blockchain:      string
  symbol:          string
  amount:          number
  amount_usd:      number
  tx_type:         string
  hash:            string | null
  from_address:    string | null
  from_owner:      string | null
  from_owner_type: string | null
  to_address:      string | null
  to_owner:        string | null
  to_owner_type:   string | null
  tx_timestamp:    string
  created_at:      string
}

interface MarketSignal {
  direction:  'BULLISH' | 'BEARISH' | 'NEUTRAL'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  reason:     string
}

interface OfacVerdict {
  address:         string
  sanctioned:      boolean
  entity_name?:    string
  asset?:          string
  programs:        string[]
  sdn_profile_id?: string
}

interface TransitInfo {
  transit_addr:       string
  time_delta_seconds: number | null
  received_usd:       number | null
  sent_usd:           number | null
  amount_delta_usd:   number | null
  is_comingling:      boolean
}

interface TxIntel {
  tx:             StoredWhaleTx
  is_sanctioned:  boolean
  sanction_label: string
  ofac_hit:       OfacVerdict | null
  is_structuring: boolean
  struct_group:   string
  is_transit:     boolean
  transit_addr:   string
  transit_info:   TransitInfo | null
  is_smart_money: boolean
  seen_before:    number
  risk_score:     number
  signal:         MarketSignal
}

// ─── URL Helpers ──────────────────────────────────────────────────────────────
function explorerTxUrl(blockchain: string, hash: string | null): string {
  if (!hash) return 'https://whale-alert.io'
  switch (blockchain) {
    case 'ethereum':  return `https://etherscan.io/tx/${hash}`
    case 'bitcoin':   return `https://mempool.space/tx/${hash}`
    case 'tron':      return `https://tronscan.org/#/transaction/${hash}`
    case 'solana':    return `https://solscan.io/tx/${hash}`
    case 'ripple':    return `https://xrpscan.com/tx/${hash}`
    case 'stellar':   return `https://stellarscan.io/tx/${hash}`
    case 'binance':   return `https://bscscan.com/tx/${hash}`
    default:          return 'https://whale-alert.io'
  }
}

function explorerAddrUrl(blockchain: string, address: string): string {
  switch (blockchain) {
    case 'ethereum': return `https://etherscan.io/address/${address}`
    case 'bitcoin':  return `https://mempool.space/address/${address}`
    case 'tron':     return `https://tronscan.org/#/address/${address}`
    case 'solana':   return `https://solscan.io/account/${address}`
    case 'ripple':   return `https://xrpscan.com/account/${address}`
    case 'binance':  return `https://bscscan.com/address/${address}`
    default:         return 'https://whale-alert.io'
  }
}

function chainLabel(chain: string): string {
  const m: Record<string, string> = {
    ethereum: 'ETH', bitcoin: 'BTC', tron: 'TRON',
    solana: 'SOL', ripple: 'XRP', stellar: 'XLM',
    binance: 'BNB', polygon: 'MATIC',
  }
  return m[chain] ?? chain.toUpperCase()
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function usdFmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function isUnknown(owner: string | null): boolean {
  return !owner || owner.toLowerCase() === 'unknown'
}

function addrShort(address: string): string {
  return address.slice(0, 8) + '…' + address.slice(-6)
}

function partyDisplay(
  owner: string | null,
  ownerType: string | null,
  address: string | null,
  blockchain: string,
): string {
  if (!isUnknown(owner)) return `<b>${htmlEscape(owner!)}</b>`
  if (ownerType === 'exchange') return '🏦 ?Біржа'
  if (address) {
    const url   = explorerAddrUrl(blockchain, address)
    const short = addrShort(address)
    return `<a href="${url}"><code>${htmlEscape(short)}</code></a>`
  }
  return '❓'
}

// ─── Exchange Detection ───────────────────────────────────────────────────────
const EXCHANGE_NAMES = ['binance','coinbase','okex','okx','kraken','bitfinex',
  'huobi','bybit','kucoin','gate','gemini','crypto.com','bitmex','bitstamp','bitget']

function isExchange(owner: string | null): boolean {
  if (!owner || isUnknown(owner)) return false
  const lo = owner.toLowerCase()
  return EXCHANGE_NAMES.some(e => lo.includes(e))
}

function exchangeName(owner: string | null): string {
  if (!owner) return ''
  const lo = owner.toLowerCase()
  return EXCHANGE_NAMES.find(e => lo.includes(e)) ?? ''
}

// ─── Asset Class (стейблкоїн vs volatile) ─────────────────────────────────────
const STABLE_ASSETS = new Set(['USDT','USDC','DAI','BUSD','TUSD','FDUSD'])

function getAssetClass(symbol: string): 'stable' | 'volatile' {
  return STABLE_ASSETS.has(symbol.toUpperCase()) ? 'stable' : 'volatile'
}

// ─── Flow Direction (WhaleFlowEngine port) ────────────────────────────────────
type FlowDir = 'outflow' | 'inflow' | 'internal' | 'inter_exchange' | 'wallet_to_wallet'

function getFlowDir(tx: StoredWhaleTx): { dir: FlowDir; labelConf: number } {
  const fromEx = isExchange(tx.from_owner)
  const toEx   = isExchange(tx.to_owner)

  if (fromEx && toEx) {
    const same = exchangeName(tx.from_owner) === exchangeName(tx.to_owner)
    return { dir: same ? 'internal' : 'inter_exchange', labelConf: 1.0 }
  }
  if (fromEx) return { dir: 'outflow', labelConf: 1.0 }
  if (toEx)   return { dir: 'inflow',  labelConf: 1.0 }
  return { dir: 'wallet_to_wallet', labelConf: 0.0 }
}

// ─── Per-tx signal (AML override + flow direction) ────────────────────────────
function classifySignal(
  tx: StoredWhaleTx,
  intel: { is_structuring: boolean; is_smart_money: boolean; is_transit: boolean },
): MarketSignal {
  // AML overrides мають пріоритет над ринковою логікою
  if (intel.is_structuring) {
    const toEx = isExchange(tx.to_owner)
    return {
      direction:  'BEARISH', confidence: 'HIGH',
      reason: toEx
        ? `Structuring → ${htmlEscape(tx.to_owner ?? 'Exchange')} (координований вихід)`
        : 'Structuring — дроблення суми, приховування руху коштів',
    }
  }
  if (intel.is_transit) {
    return { direction: 'BEARISH', confidence: 'MEDIUM', reason: 'Chain-hop — отримав і одразу переслав далі' }
  }
  if (intel.is_smart_money) {
    return {
      direction: 'BEARISH',
      confidence: tx.amount_usd >= 10_000_000 ? 'HIGH' : 'MEDIUM',
      reason: `Кит → ${htmlEscape(tx.to_owner ?? 'Exchange')} (продажний тиск)`,
    }
  }

  // Flow direction логіка (як у Python WhaleFlowEngine)
  const { dir } = getFlowDir(tx)
  const ac       = getAssetClass(tx.symbol)

  if (dir === 'outflow') {
    // Стейблкоїн з біржі = OTC/custody розрахунок, НЕ sell pressure (аналітична помилка якщо позначати BEARISH)
    if (ac === 'stable') return { direction: 'NEUTRAL', confidence: 'LOW', reason: `${tx.symbol} виходить з ${htmlEscape(tx.from_owner ?? 'Exchange')} — OTC / custody, без ринкового сигналу` }
    // Volatile виходить з біржі = накопичення = BULLISH
    return { direction: 'BULLISH',
      confidence: tx.amount_usd >= 5_000_000 ? 'MEDIUM' : 'LOW',
      reason: `${htmlEscape(tx.from_owner ?? 'Exchange')} → холодний гаманець (накопичення)` }
  }
  if (dir === 'inflow') {
    // Стейблкоїн на біржу = поповнення для торгів = BULLISH (сухий порох)
    if (ac === 'stable') return { direction: 'BULLISH',
      confidence: tx.amount_usd >= 5_000_000 ? 'MEDIUM' : 'LOW',
      reason: `${tx.symbol} → ${htmlEscape(tx.to_owner ?? 'Exchange')} (купівельна сила)` }
    // Volatile приходить на біржу = BEARISH (продаж)
    return { direction: 'BEARISH',
      confidence: tx.amount_usd >= 5_000_000 ? 'MEDIUM' : 'LOW',
      reason: `${tx.symbol} → ${htmlEscape(tx.to_owner ?? 'Exchange')} (продажний тиск)` }
  }
  if (dir === 'internal' || dir === 'inter_exchange') {
    return { direction: 'NEUTRAL', confidence: 'LOW',
             reason: `${htmlEscape(tx.from_owner ?? '')} → ${htmlEscape(tx.to_owner ?? '')} (ребалансування)` }
  }
  // wallet_to_wallet — стейблкоїн між гаманцями ≠ ринковий сигнал (OTC/custody/розрахунок)
  if (getAssetClass(tx.symbol) === 'stable') {
    return { direction: 'NEUTRAL', confidence: 'LOW', reason: `${tx.symbol} OTC / custody потік — без ринкового сигналу` }
  }
  return { direction: 'NEUTRAL', confidence: 'LOW', reason: 'OTC / P2P / невідомий рух' }
}

// ─── Net Flow Engine (WhaleFlowEngine port) ───────────────────────────────────
// Замість "більшість голосів" — рахує нетто-потік (outflows - inflows) по активу
// і дає сигнал лише якщо достатньо помічених адрес.
interface AssetFlow {
  asset:             string
  asset_class:       'stable' | 'volatile'
  net_flow_usd:      number   // позитивний = бичачий напрямок
  inflow_usd:        number
  outflow_usd:       number
  w2w_usd:           number
  labelled_fraction: number   // частка помічених (exchange-tagged) коштів
  confidence:        number   // labelled_fraction * min(n/20, 1)
  signal:            'BULLISH' | 'BEARISH' | 'NEUTRAL'
  strength:          'HIGH' | 'MEDIUM' | 'LOW'
  n_transfers:       number
}

function computeFlowSignals(txs: StoredWhaleTx[]): Map<string, AssetFlow> {
  const byAsset = new Map<string, StoredWhaleTx[]>()
  for (const tx of txs) {
    const key = tx.symbol.toUpperCase()
    const arr = byAsset.get(key) ?? []
    arr.push(tx)
    byAsset.set(key, arr)
  }

  const result = new Map<string, AssetFlow>()

  for (const [asset, items] of byAsset) {
    const ac = getAssetClass(asset)
    let netFlow = 0, inflow = 0, outflow = 0, w2w = 0
    let labelledUsd = 0, totalUsd = 0

    for (const tx of items) {
      const { dir, labelConf } = getFlowDir(tx)
      totalUsd += tx.amount_usd

      if (dir === 'outflow') {
        outflow     += tx.amount_usd
        labelledUsd += tx.amount_usd
        // VOLATILE: outflow = +bullish; STABLE: outflow = -bearish
        netFlow += ac === 'volatile' ? +tx.amount_usd : -tx.amount_usd
      } else if (dir === 'inflow') {
        inflow      += tx.amount_usd
        labelledUsd += tx.amount_usd
        // STABLE: inflow = +bullish; VOLATILE: inflow = -bearish
        netFlow += ac === 'stable' ? +tx.amount_usd : -tx.amount_usd
      } else if (dir === 'internal' || dir === 'inter_exchange') {
        labelledUsd += tx.amount_usd * labelConf // помічені, але не рахуємо в нетто
      } else {
        w2w += tx.amount_usd
      }
    }

    const labelledFraction = totalUsd > 0 ? labelledUsd / totalUsd : 0
    const sampleFactor     = Math.min(1, items.length / 20)
    const confidence       = Math.round(labelledFraction * sampleFactor * 100) / 100

    // Сигнал: фіксовані пороги (z-score потребує historical data — TODO фаза 2)
    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL'
    let strength: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'

    if (confidence >= 0.25) {                     // мін 25% помічених коштів
      const abs = Math.abs(netFlow)
      // Стейблкоїн outflow з біржі ≠ ринковий сигнал (OTC/custody).
      // Для стейблів тільки BULLISH (нетто-приплив = купівельна сила), ніколи BEARISH.
      const dir = netFlow > 0 ? 'BULLISH' : (ac === 'volatile' ? 'BEARISH' : 'NEUTRAL')
      if (abs >= 10_000_000) { signal = dir; strength = 'HIGH' }
      else if (abs >= 3_000_000) { signal = dir; strength = 'MEDIUM' }
      else if (abs >= 1_000_000) { signal = dir; strength = 'LOW' }
    }

    result.set(asset, {
      asset, asset_class: ac,
      net_flow_usd:      Math.round(netFlow),
      inflow_usd:        Math.round(inflow),
      outflow_usd:       Math.round(outflow),
      w2w_usd:           Math.round(w2w),
      labelled_fraction: Math.round(labelledFraction * 100) / 100,
      confidence, signal, strength,
      n_transfers: items.length,
    })
  }
  return result
}

function formatFlowSummary(flows: Map<string, AssetFlow>): string {
  const lines: string[] = []
  for (const flow of flows.values()) {
    const { asset, signal, strength, net_flow_usd, confidence, labelled_fraction, inflow_usd, outflow_usd } = flow
    const emoji  = signal === 'BULLISH' ? '🟢' : signal === 'BEARISH' ? '🔴' : '⚪'
    const netAbs = Math.abs(net_flow_usd)
    const netStr = netAbs >= 1_000_000
      ? ` · нетто ${net_flow_usd >= 0 ? '+' : '-'}$${usdFmt(netAbs)}`
      : ''

    if (signal !== 'NEUTRAL') {
      lines.push(`  ${asset} ${emoji} ${signal} ${strength}${netStr}`)
      if (confidence < 0.3) {
        lines.push(`    ⚠️ confidence ${Math.round(labelled_fraction*100)}% — мало помічених адрес`)
      }
    } else if (inflow_usd > 0 || outflow_usd > 0) {
      lines.push(`  ${asset} ⚪ NEUTRAL — in $${usdFmt(inflow_usd)} / out $${usdFmt(outflow_usd)}`)
    }
  }
  return lines.join('\n')
}

// ─── Cross-referencing ────────────────────────────────────────────────────────
interface WalletRecord {
  address:          string
  label:            string | null
  risk_score:       number | null
  is_sanctioned:    boolean | null
  linked_person_id: string | null
}

// ─── OFAC SDN Screening (VPS :8010) ─────────────────────────────────────────
async function screenOFAC(addresses: string[]): Promise<Map<string, OfacVerdict>> {
  const unique = [...new Set(addresses.filter(Boolean))]
  if (!unique.length) return new Map()
  try {
    const res = await fetch(`${OFAC_SERVICE_URL}/v1/screening/check`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ addresses: unique }),
      signal:  AbortSignal.timeout(5_000),
    })
    if (!res.ok) return new Map()
    const data = await res.json() as { results: OfacVerdict[] }
    const map  = new Map<string, OfacVerdict>()
    for (const v of data.results) if (v.sanctioned) map.set(v.address, v)
    return map
  } catch {
    return new Map()  // graceful degradation: continue without OFAC if service is down
  }
}

async function crossRefAddresses(addresses: string[]): Promise<Map<string, WalletRecord>> {
  const unique = [...new Set(addresses.filter(Boolean))]
  if (!unique.length) return new Map()

  const { data } = await supabase
    .from('crypto_wallets')
    .select('address, label, risk_score, is_sanctioned, linked_person_id')
    .in('address', unique)

  const map = new Map<string, WalletRecord>()
  for (const w of (data ?? [])) map.set(w.address, w as WalletRecord)
  return map
}

async function getAddressSeen(address: string): Promise<number> {
  const { count } = await supabase
    .from('whale_transactions')
    .select('id', { count: 'exact', head: true })
    .or(`from_address.eq.${address},to_address.eq.${address}`)
  return count ?? 0
}

// ─── Auto-flag High Risk Wallets to DB ───────────────────────────────────────
async function autoFlagHighRisk(intels: TxIntel[]): Promise<number> {
  const toFlag = intels.filter(i => i.risk_score >= 80)
  let flagged = 0

  for (const intel of toFlag) {
    const addresses = [intel.tx.from_address, intel.tx.to_address].filter(Boolean) as string[]
    for (const addr of addresses) {
      const reason = intel.is_sanctioned
        ? `Sanctions: ${intel.sanction_label}`
        : intel.is_structuring
        ? 'Structuring/Chain-hopping'
        : intel.is_smart_money
        ? `Smart Money exit (${intel.signal.confidence})`
        : `High risk ${intel.risk_score}/100`

      const { error } = await supabase.from('crypto_wallets').upsert(
        {
          address:       addr,
          blockchain:    intel.tx.blockchain,
          risk_score:    intel.risk_score,
          is_sanctioned: intel.is_sanctioned,
          label:         `Auto: ${reason}`,
        },
        { onConflict: 'address', ignoreDuplicates: true },
      )
      if (!error) flagged++
    }
  }
  return flagged
}

// ─── AML: Transit Chain-hop Detection ────────────────────────────────────────
// Адреса є одночасно to і from в одному батчі → transit/relay вузол.
// Повертає TransitInfo з часовою дельтою та різницею сум (co-mingling detection).
function detectTransitChain(txs: StoredWhaleTx[]): Map<string, TransitInfo> {
  const receivedAt = new Map<string, { id: string; ts: Date; amount_usd: number }>()
  const sentFrom   = new Map<string, { id: string; ts: Date; amount_usd: number }>()

  for (const tx of txs) {
    if (tx.to_address   && isUnknown(tx.to_owner))
      receivedAt.set(tx.to_address,   { id: tx.whale_alert_id, ts: new Date(tx.tx_timestamp), amount_usd: tx.amount_usd })
    if (tx.from_address && isUnknown(tx.from_owner))
      sentFrom.set(tx.from_address, { id: tx.whale_alert_id, ts: new Date(tx.tx_timestamp), amount_usd: tx.amount_usd })
  }

  const flagged = new Map<string, TransitInfo>()
  for (const [addr, rx] of receivedAt) {
    const tx = sentFrom.get(addr)
    if (!tx || tx.id === rx.id) continue

    const timeDelta   = Math.abs(tx.ts.getTime() - rx.ts.getTime()) / 1000
    const amountDelta = tx.amount_usd - rx.amount_usd  // + = co-mingling; - = fees/partial

    const info: TransitInfo = {
      transit_addr:       addr,
      time_delta_seconds: timeDelta,
      received_usd:       rx.amount_usd,
      sent_usd:           tx.amount_usd,
      amount_delta_usd:   amountDelta,
      is_comingling:      amountDelta > 100,  // відправив більше ніж отримав → мав залишок
    }
    flagged.set(rx.id, info)
    flagged.set(tx.id, info)
  }
  return flagged
}

// ─── AML: Structuring Detection ──────────────────────────────────────────────
function detectStructuring(txs: StoredWhaleTx[]): Map<string, string> {
  const byFrom = new Map<string, StoredWhaleTx[]>()
  for (const tx of txs) {
    if (!tx.from_address) continue
    const arr = byFrom.get(tx.from_address) ?? []
    arr.push(tx)
    byFrom.set(tx.from_address, arr)
  }

  const flagged = new Map<string, string>()
  for (const [addr, addrTxs] of byFrom) {
    if (addrTxs.length < 3) continue
    const amounts = addrTxs.map(t => t.amount_usd).sort((a, b) => a - b)
    const median  = amounts[Math.floor(amounts.length / 2)]
    const similar = addrTxs.filter(t => Math.abs(t.amount_usd - median) / median < 0.08)
    if (similar.length >= 3) {
      for (const t of similar) flagged.set(t.whale_alert_id, addr)
    }
  }
  return flagged
}

// ─── Smart Money ──────────────────────────────────────────────────────────────
function isSmartMoney(tx: StoredWhaleTx): boolean {
  const unknownFrom   = isUnknown(tx.from_owner)
  const knownTo       = !isUnknown(tx.to_owner)
  const toBigExchange = tx.to_owner_type === 'exchange' || (
    tx.to_owner && ['binance','coinbase','okex','okx','kraken','bitfinex','huobi','bybit']
      .some(e => tx.to_owner!.toLowerCase().includes(e))
  )
  return unknownFrom && knownTo && !!toBigExchange && tx.amount_usd >= 5_000_000
}

// ─── Risk Score ───────────────────────────────────────────────────────────────
function calcRiskScore(tx: StoredWhaleTx, intel: Partial<TxIntel>): number {
  let score = 0
  if (intel.is_sanctioned)    score += 90
  if (intel.is_structuring)   score += 60
  if (intel.is_transit)       score += 45
  if (isUnknown(tx.from_owner) && isUnknown(tx.to_owner)) score += 40
  if (tx.amount_usd >= 10_000_000) score += 20
  if (tx.amount_usd >= 5_000_000)  score += 10

  const seen = intel.seen_before ?? 0
  if (seen > 5 && seen <= 100) score += 15  // підозріла частота
  // seen > 100: дуже ймовірно хаб/OTC-сервіс — без додаткового бонусу

  if (isSmartMoney(tx)) score += 25

  let capped = Math.min(score, 100)
  // Хаб-дисконт: дуже висока частота + транзит = операційна інфраструктура, не разовий злочин
  if (seen > 100 && intel.is_transit) capped = Math.max(capped - 20, 60)
  return capped
}

// ─── Plain-language conclusion (на основі net flow, не голосування) ───────────
function buildConclusion(intels: TxIntel[], flows: Map<string, AssetFlow>): string {
  const parts: string[] = []

  const sanctioned  = intels.filter(i => i.is_sanctioned)
  const structuring = intels.filter(i => i.is_structuring)
  const transit     = intels.filter(i => i.is_transit && !i.is_structuring)

  if (sanctioned.length) {
    parts.push(`🚨 Виявлено ${sanctioned.length} збіг з санкційним списком — потребує перевірки.`)
  }
  if (structuring.length) {
    const vol = structuring.reduce((s, i) => s + i.tx.amount_usd, 0)
    parts.push(`🕵️ Structuring: ${structuring.length} tx · $${usdFmt(vol)} — дроблення суми, приховування руху.`)
  }
  if (transit.length) {
    const addrs = new Set(transit.map(i => i.transit_addr).filter(Boolean))
    parts.push(`⚠️ Chain-hop: ${addrs.size || transit.length} транзитних адреси отримали і одразу переслали.`)
  }

  // Ринковий висновок базується на нетто-потоці, не на голосуванні
  const bullishFlows = [...flows.values()].filter(f => f.signal === 'BULLISH' && f.confidence >= 0.25)
  const bearishFlows = [...flows.values()].filter(f => f.signal === 'BEARISH' && f.confidence >= 0.25)
  const lowConfFlows = [...flows.values()].filter(f => f.signal === 'NEUTRAL' && f.labelled_fraction < 0.2 && f.n_transfers >= 3)

  if (bullishFlows.length && !bearishFlows.length) {
    for (const f of bullishFlows) {
      const net = `+$${usdFmt(f.net_flow_usd)}`
      const why = f.asset_class === 'volatile'
        ? `відтік з бірж ${net} — накопичення`
        : `стейблкоїн приходить на біржі ${net} — купівельна сила`
      parts.push(`🟢 ${f.asset} ${f.strength}: ${why}.`)
    }
  } else if (bearishFlows.length && !bullishFlows.length) {
    for (const f of bearishFlows) {
      const net = `-$${usdFmt(Math.abs(f.net_flow_usd))}`
      const why = f.asset_class === 'volatile'
        ? `приплив на біржі ${net} — продажний тиск`
        : `стейблкоїн виходить з бірж ${net}`
      parts.push(`🔴 ${f.asset} ${f.strength}: ${why}.`)
    }
  } else if (bullishFlows.length && bearishFlows.length) {
    const bul = bullishFlows.map(f => f.asset).join(', ')
    const ber = bearishFlows.map(f => f.asset).join(', ')
    parts.push(`⚪ Змішані: ${bul} бичачі, ${ber} ведмежі.`)
  }

  if (lowConfFlows.length && !parts.length) {
    parts.push(`ℹ️ Мало помічених адрес — сигнал ненадійний (переважно OTC/гаманець→гаманець).`)
  }

  return parts.join('\n')
}

// ─── Smart Digest Formatter (Intelligence Engine v3) ─────────────────────────
function formatSmartDigest(intels: TxIntel[]): string {
  const total = intels.reduce((s, i) => s + i.tx.amount_usd, 0)

  // Групування
  const sanctioned = intels.filter(i => i.is_sanctioned)
  const clusters   = intels.filter(i => i.is_structuring && !i.is_sanctioned)
  const transit    = intels.filter(i =>
    !i.is_structuring && !i.is_sanctioned &&
    (i.is_transit || (i.seen_before > 10 && i.risk_score >= 70)),
  )
  const smartMoney = intels.filter(i =>
    i.is_smart_money && !i.is_structuring && !i.is_sanctioned &&
    !transit.find(t => t.tx.whale_alert_id === i.tx.whale_alert_id),
  )
  const regularSet = new Set([...sanctioned, ...clusters, ...transit, ...smartMoney])
  const regular    = intels.filter(i => !regularSet.has(i))

  // Net flow engine — один раз для всього батчу
  const flows         = computeFlowSignals(intels.map(i => i.tx))
  const conclusion    = buildConclusion(intels, flows)
  const signalSummary = formatFlowSummary(flows)

  const lines: string[] = [
    `🐋 <b>Whale Intelligence Report</b>`,
    `💰 <b>$${usdFmt(total)}</b> · ${intels.length} транзакцій`,
    ``,
  ]

  if (conclusion) {
    lines.push(`<b>ВИСНОВОК:</b>`)
    lines.push(conclusion)
    lines.push(``)
  }

  if (signalSummary) {
    lines.push(`📊 <b>Нетто-потік по активах:</b>`)
    lines.push(signalSummary)
    lines.push(``)
  }

  // ── SANCTIONS ──────────────────────────────────────────────────────────────
  if (sanctioned.length) {
    lines.push(`━━━━━━━━━━━━`)
    lines.push(`🚨 <b>САНКЦІЙНІ ЗБІГИ (${sanctioned.length})</b>`)
    for (const { tx, sanction_label, risk_score } of sanctioned) {
      const from   = partyDisplay(tx.from_owner, tx.from_owner_type, tx.from_address, tx.blockchain)
      const to     = partyDisplay(tx.to_owner, tx.to_owner_type, tx.to_address, tx.blockchain)
      const txUrl  = explorerTxUrl(tx.blockchain, tx.hash)
      const addr   = tx.from_address || tx.to_address
      lines.push(
        `  🚨 <b>$${usdFmt(tx.amount_usd)} ${tx.symbol}</b> (${chainLabel(tx.blockchain)}) <a href="${txUrl}">↗</a>`,
        `  ⛔ ${htmlEscape(sanction_label)} · Risk ${risk_score}/100`,
        `  ${from} → ${to}`,
        addr ? `  🔍 <a href="${APP_URL}/crypto-intel?address=${encodeURIComponent(addr)}">Розслідувати →</a>` : '',
        ``,
      )
    }
  }

  // ── STRUCTURING CLUSTERS ───────────────────────────────────────────────────
  if (clusters.length) {
    const clusterGroups = new Map<string, TxIntel[]>()
    for (const intel of clusters) {
      const key = intel.struct_group || 'unknown'
      const arr = clusterGroups.get(key) ?? []
      arr.push(intel)
      clusterGroups.set(key, arr)
    }

    lines.push(`━━━━━━━━━━━━`)
    lines.push(`🕵️ <b>КЛАСТЕРИ / STRUCTURING (${clusters.length} tx)</b>`)

    for (const [addr, group] of clusterGroups) {
      const totalGroup = group.reduce((s, i) => s + i.tx.amount_usd, 0)
      const seenMax    = Math.max(...group.map(i => i.seen_before))
      const chain      = group[0].tx.blockchain
      const signal     = group[0].signal
      const toOwners   = [...new Set(group.map(i => i.tx.to_owner).filter(o => !isUnknown(o)))]
      const sigEmoji   = signal.direction === 'BEARISH' ? '🔴' : signal.direction === 'BULLISH' ? '🟢' : '⚪'

      const addrLink = addr !== 'unknown'
        ? `<a href="${explorerAddrUrl(chain, addr)}"><code>${addrShort(addr)}</code></a>`
        : '?'

      lines.push(
        `  📍 ${addrLink}` + (seenMax > 0 ? ` · 👁 ${seenMax}× у БД` : '') + ` · Risk ${group[0].risk_score}/100`,
        addr !== 'unknown' ? `  <code>${htmlEscape(addr)}</code>` : '',
        `  ${group.length} транзакцій · <b>$${usdFmt(totalGroup)}</b>` +
          (toOwners.length ? ` → ${toOwners.map(htmlEscape).join(', ')}` : ''),
        `  ${sigEmoji} <b>${signal.direction}</b> ${signal.confidence} · ${signal.reason}`,
        addr !== 'unknown'
          ? `  🔍 <a href="${APP_URL}/crypto-intel?address=${encodeURIComponent(addr)}">Розслідувати →</a>`
          : '',
        ``,
      )
    }
  }

  // ── TRANSIT WALLETS ────────────────────────────────────────────────────────
  if (transit.length) {
    // Сортуємо: найбільший ланцюг першим
    const sortedTransit = [...transit].sort((a, b) => {
      const aAmt = a.transit_info?.received_usd ?? a.tx.amount_usd
      const bAmt = b.transit_info?.received_usd ?? b.tx.amount_usd
      return bAmt - aAmt
    })

    const shownTransitAddrs = new Set<string>()
    lines.push(`━━━━━━━━━━━━`)
    lines.push(`⚠️ <b>CHAIN-HOP / ТРАНЗИТ (${transit.length} tx)</b>`)

    for (const { tx, seen_before, risk_score, signal, transit_addr, transit_info } of sortedTransit) {
      const from     = partyDisplay(tx.from_owner, tx.from_owner_type, tx.from_address, tx.blockchain)
      const to       = partyDisplay(tx.to_owner,   tx.to_owner_type,   tx.to_address,   tx.blockchain)
      const txUrl    = explorerTxUrl(tx.blockchain, tx.hash)
      const addr     = transit_addr || tx.from_address || tx.to_address
      const sigEmoji = signal.direction === 'BEARISH' ? '🔴' : signal.direction === 'BULLISH' ? '🟢' : '⚪'

      // Часова дельта між отриманням і відправкою
      let timeLine = ''
      if (transit_info?.time_delta_seconds != null) {
        const mins = Math.round(transit_info.time_delta_seconds / 60)
        timeLine = mins < 1
          ? `⏱ &lt;1хв між отриманням і відправкою`
          : `⏱ ${mins}хв між отриманням і відправкою`
      }

      // Co-mingling або неповна передача
      let amountLine = ''
      const delta = transit_info?.amount_delta_usd
      if (delta != null && Math.abs(delta) > 100) {
        if (transit_info!.is_comingling) {
          amountLine = `⚠️ Co-mingling: $${usdFmt(transit_info!.received_usd ?? 0)} → $${usdFmt(transit_info!.sent_usd ?? 0)} <b>(+$${usdFmt(delta)} зайвих)</b>`
        } else {
          amountLine = `ℹ️ $${usdFmt(transit_info!.received_usd ?? 0)} → $${usdFmt(transit_info!.sent_usd ?? 0)} (-$${usdFmt(Math.abs(delta))} комісія/часткова)`
        }
      }

      const hubNote = seen_before > 100 ? ` · 🔄 хаб (${seen_before}×)` : ''

      lines.push(
        `  💸 <b>$${usdFmt(tx.amount_usd)} ${tx.symbol}</b> (${chainLabel(tx.blockchain)}) <a href="${txUrl}">↗</a>`,
        seen_before > 0 ? `  👁 ${seen_before}× у БД${hubNote} · Risk ${risk_score}/100` : `  Risk ${risk_score}/100`,
        `  ${from} → ${to}`,
        timeLine   ? `  ${timeLine}`   : '',
        amountLine ? `  ${amountLine}` : '',
        `  ${sigEmoji} ${signal.reason}`,
      )
      if (addr && !shownTransitAddrs.has(addr)) {
        shownTransitAddrs.add(addr)
        lines.push(`  <code>${htmlEscape(addr)}</code>`)
        lines.push(`  🔍 <a href="${APP_URL}/crypto-intel?address=${encodeURIComponent(addr)}">Розслідувати →</a>`)
      }
      lines.push(``)
    }
  }

  // ── SMART MONEY ────────────────────────────────────────────────────────────
  if (smartMoney.length) {
    lines.push(`━━━━━━━━━━━━`)
    lines.push(`🐋 <b>SMART MONEY (${smartMoney.length})</b>`)
    for (const { tx, signal } of smartMoney) {
      const from  = partyDisplay(tx.from_owner, tx.from_owner_type, tx.from_address, tx.blockchain)
      const to    = partyDisplay(tx.to_owner, tx.to_owner_type, tx.to_address, tx.blockchain)
      const txUrl = explorerTxUrl(tx.blockchain, tx.hash)
      lines.push(
        `  🐋 <b>$${usdFmt(tx.amount_usd)} ${tx.symbol}</b> (${chainLabel(tx.blockchain)}) <a href="${txUrl}">↗</a>`,
        `  ${from} → ${to}`,
        `  🔴 ${signal.reason}`,
        ``,
      )
    }
  }

  // ── REGULAR (compact) ──────────────────────────────────────────────────────
  if (regular.length) {
    const regularTotal = regular.reduce((s, i) => s + i.tx.amount_usd, 0)
    lines.push(`━━━━━━━━━━━━`)
    lines.push(`📋 <b>Решта (${regular.length} · $${usdFmt(regularTotal)})</b>`)
    for (const { tx, signal } of regular) {
      const from     = partyDisplay(tx.from_owner, tx.from_owner_type, tx.from_address, tx.blockchain)
      const to       = partyDisplay(tx.to_owner, tx.to_owner_type, tx.to_address, tx.blockchain)
      const sigEmoji = signal.direction === 'BEARISH' ? '🔴' : signal.direction === 'BULLISH' ? '🟢' : '⚪'
      lines.push(`  ${sigEmoji} <b>$${usdFmt(tx.amount_usd)}</b> ${tx.symbol} · ${from} → ${to}`)
      // Повна адреса для деанонімізації — тільки якщо обидві сторони невідомі
      const unknownAddr = isUnknown(tx.from_owner) ? tx.from_address
                        : isUnknown(tx.to_owner)   ? tx.to_address
                        : null
      if (unknownAddr) {
        lines.push(`     <code>${htmlEscape(unknownAddr)}</code> <a href="${APP_URL}/crypto-intel?address=${encodeURIComponent(unknownAddr)}">🔍</a>`)
      }
    }
    lines.push(``)
  }

  lines.push(`<i>ODB Intelligence Engine v3 · Whale Alert Monitor</i>`)
  return lines.filter(l => l !== null && l !== undefined).join('\n')
}

// ─── Single TX Formatter ──────────────────────────────────────────────────────
function formatSingleTx(intel: TxIntel): string {
  const { tx, is_sanctioned, sanction_label, is_structuring, is_smart_money, seen_before, risk_score, signal } = intel
  const from   = partyDisplay(tx.from_owner, tx.from_owner_type, tx.from_address, tx.blockchain)
  const to     = partyDisplay(tx.to_owner, tx.to_owner_type, tx.to_address, tx.blockchain)
  const txUrl  = explorerTxUrl(tx.blockchain, tx.hash)
  const shortH = tx.hash ? tx.hash.slice(0, 14) + '…' + tx.hash.slice(-6) : 'N/A'
  const txTime = new Date(tx.tx_timestamp).toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv', hour12: false,
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const sigEmoji = signal.direction === 'BEARISH' ? '🔴' : signal.direction === 'BULLISH' ? '🟢' : '⚪'

  const lines: string[] = [
    `🐋 <b>WHALE ALERT</b>` +
      (is_sanctioned ? ' 🚨 <b>SANCTIONS!</b>' : risk_score >= 70 ? ' 🔴 <b>HIGH RISK</b>' : ''),
    ``,
    `💸 <b>$${usdFmt(tx.amount_usd)} ${tx.symbol}</b> (${chainLabel(tx.blockchain)})`,
    ``,
    `📤 <b>Від:</b> ${from}`,
    `📥 <b>До:</b>  ${to}`,
    ``,
    `${sigEmoji} <b>Сигнал:</b> ${signal.direction} ${signal.confidence}`,
    `   ${signal.reason}`,
    ``,
  ]

  if (is_sanctioned)  lines.push(`🚨 <b>ЗБІГ З ODB:</b> ${htmlEscape(sanction_label)}`, ``)
  if (is_structuring) lines.push(`🕵️ <b>Structuring:</b> дроблення суми (chain-hopping)`, ``)
  if (is_smart_money) lines.push(`🐋 <b>Smart Money:</b> підготовка до продажу на біржі`, ``)
  if (seen_before > 0) lines.push(`👁 <b>Бачили раніше:</b> ${seen_before} транзакцій у базі`, ``)

  lines.push(
    `🔗 <a href="${txUrl}">${shortH}</a>`,
    `⏰ ${txTime} (Kyiv)`,
    `⚠️ Risk score: <b>${risk_score}/100</b>`,
    ``,
    `<i>ODB Intelligence Engine v3 · Whale Alert Monitor</i>`,
  )
  return lines.join('\n')
}

// ─── Paid Channel Formatter (signal-focused, for traders) ────────────────────
function formatChannelSignal(intels: TxIntel[]): string {
  const total = intels.reduce((s, i) => s + i.tx.amount_usd, 0)
  const flows = computeFlowSignals(intels.map(i => i.tx))

  const bullishFlows = [...flows.values()].filter(f => f.signal === 'BULLISH')
  const bearishFlows = [...flows.values()].filter(f => f.signal === 'BEARISH')

  let dominantEmoji = '⚪'
  let dominantLabel = 'MIXED'
  if (bearishFlows.length > bullishFlows.length) { dominantEmoji = '🔴'; dominantLabel = 'BEARISH' }
  else if (bullishFlows.length > bearishFlows.length) { dominantEmoji = '🟢'; dominantLabel = 'BULLISH' }

  const highConf = intels.filter(i => i.signal.confidence === 'HIGH')

  const netLines = [...flows.values()]
    .filter(f => f.signal !== 'NEUTRAL')
    .map(f => {
      const e = f.signal === 'BULLISH' ? '🟢' : '🔴'
      return `  ${f.asset} ${e} нетто ${f.net_flow_usd >= 0 ? '+' : ''}$${usdFmt(f.net_flow_usd)} (conf ${Math.round(f.confidence*100)}%)`
    })

  const lines: string[] = [
    `📡 <b>ODB Crypto Signal</b> · ${dominantEmoji} ${dominantLabel}`,
    `💰 $${usdFmt(total)} · ${intels.length} транзакцій`,
    ...(netLines.length ? [``, ...netLines] : []),
    ``,
  ]

  if (highConf.length) {
    lines.push(`🎯 <b>HIGH CONFIDENCE сигнали:</b>`)
    for (const { tx, signal, risk_score } of highConf) {
      const sigEmoji = signal.direction === 'BEARISH' ? '🔴' : '🟢'
      const from = partyDisplay(tx.from_owner, tx.from_owner_type, tx.from_address, tx.blockchain)
      const to   = partyDisplay(tx.to_owner, tx.to_owner_type, tx.to_address, tx.blockchain)
      lines.push(
        `${sigEmoji} <b>$${usdFmt(tx.amount_usd)} ${tx.symbol}</b> · Risk ${risk_score}/100`,
        `   ${from} → ${to}`,
        `   ${signal.reason}`,
        ``,
      )
    }
  }

  // Решта high-risk
  const rest = intels.filter(i => i.signal.confidence !== 'HIGH' && i.risk_score >= 50)
  if (rest.length) {
    lines.push(`⚠️ <b>Підозрілі (${rest.length}):</b>`)
    for (const { tx, signal, risk_score } of rest) {
      const sigEmoji = signal.direction === 'BEARISH' ? '🔴' : signal.direction === 'BULLISH' ? '🟢' : '⚪'
      const from = partyDisplay(tx.from_owner, tx.from_owner_type, tx.from_address, tx.blockchain)
      const to   = partyDisplay(tx.to_owner, tx.to_owner_type, tx.to_address, tx.blockchain)
      lines.push(`  ${sigEmoji} $${usdFmt(tx.amount_usd)} ${tx.symbol} · ${from} → ${to} · Risk ${risk_score}/100`)
    }
    lines.push(``)
  }

  lines.push(`🔎 Деталі → ODB Platform · @odb_osint_monitor_bot`)
  return lines.join('\n')
}

// ─── GET handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.WHALE_ALERT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'WHALE_ALERT_API_KEY не встановлено' }, { status: 503 })
  }

  const startedAt = Date.now()
  const log: string[] = []
  let saved = 0, telegramSent = 0, autoFlagged = 0, errors = 0

  // ── 1. Fetch Whale Alert API ───────────────────────────────────────────────
  const start  = Math.floor(Date.now() / 1000) - 120
  const apiUrl = `${WHALE_API}/transactions?api_key=${apiKey}&start=${start}&min_value=${MIN_USD}&limit=100`

  let txsFromApi: WhaleAlertTx[] = []
  try {
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'ODB-Crypto-Intel/3.0' },
      signal:  AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      log.push(`❌ Whale Alert API ${res.status}`)
      errors++
    } else {
      const data = await res.json() as WhaleAlertResponse
      if (data.result === 'success') {
        txsFromApi = data.transactions ?? []
        log.push(`▶ Whale Alert: ${txsFromApi.length} транзакцій`)
      }
    }
  } catch (err) {
    log.push(`💥 Fetch: ${(err as Error).message}`)
    errors++
  }

  // ── 2. Upsert до Supabase ─────────────────────────────────────────────────
  for (const tx of txsFromApi) {
    const { error } = await supabase.from('whale_transactions').upsert(
      {
        whale_alert_id:  String(tx.id),
        blockchain:      tx.blockchain,
        symbol:          tx.symbol.toUpperCase(),
        amount:          tx.amount,
        amount_usd:      tx.amount_usd,
        tx_type:         tx.transaction_type ?? 'transfer',
        hash:            tx.hash   || null,
        from_address:    tx.from?.address    || null,
        from_owner:      tx.from?.owner      || null,
        from_owner_type: tx.from?.owner_type || null,
        to_address:      tx.to?.address      || null,
        to_owner:        tx.to?.owner        || null,
        to_owner_type:   tx.to?.owner_type   || null,
        tx_timestamp:    new Date(tx.timestamp * 1000).toISOString(),
        telegram_sent:   false,
      },
      { onConflict: 'whale_alert_id', ignoreDuplicates: true },
    )
    if (error) { errors++; log.push(`⚠ upsert: ${error.message}`) }
    else saved++
  }
  log.push(`▶ Збережено: ${saved}`)

  // ── 3. Digest: cooldown check + send ─────────────────────────────────────
  try {
    const { data: lastSentRow } = await supabase
      .from('whale_transactions')
      .select('created_at')
      .eq('telegram_sent', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastSentMs   = lastSentRow?.created_at ? new Date(lastSentRow.created_at).getTime() : 0
    const cooldownLeft = Math.max(0, DIGEST_COOL_MS - (Date.now() - lastSentMs))

    if (cooldownLeft > 0) {
      log.push(`▶ Cooldown: ${Math.round(cooldownLeft / 1000)}с залишилось`)
    } else {
      const { data: unsent } = await supabase
        .from('whale_transactions')
        .select('*')
        .eq('telegram_sent', false)
        .gte('amount_usd', TG_THRESH)
        .gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString())
        .order('amount_usd', { ascending: false })
        .limit(10)

      if (!unsent?.length) {
        log.push(`▶ Unsent: 0 — нічого надсилати`)
      } else {
        log.push(`▶ Unsent: ${unsent.length} txs — Intelligence Engine v3`)

        // ── Cross-referencing + OFAC screening (паралельно) ──────────────
        const addresses              = unsent.flatMap(t => [t.from_address, t.to_address]).filter(Boolean) as string[]
        const [walletMap, ofacMap]   = await Promise.all([
          crossRefAddresses(addresses),
          screenOFAC(addresses),
        ])

        // ── Structuring + Transit detection ───────────────────────────────
        const structuringMap = detectStructuring(unsent as StoredWhaleTx[])
        const transitMap     = detectTransitChain(unsent as StoredWhaleTx[])

        // ── Build Intel ────────────────────────────────────────────────────
        const intels: TxIntel[] = []
        for (const rawTx of unsent as StoredWhaleTx[]) {
          const fromWallet = rawTx.from_address ? walletMap.get(rawTx.from_address) : null
          const toWallet   = rawTx.to_address   ? walletMap.get(rawTx.to_address)   : null

          // OFAC SDN hit — перевіряємо обидві сторони
          const ofacHit     = (rawTx.from_address ? ofacMap.get(rawTx.from_address) : null)
                           ?? (rawTx.to_address   ? ofacMap.get(rawTx.to_address)   : null)
                           ?? null
          const isSanctioned  = !!(fromWallet?.is_sanctioned || toWallet?.is_sanctioned || ofacHit)
          const sanctionLabel = ofacHit
            ? `OFAC SDN: ${ofacHit.entity_name ?? 'Unknown Entity'} · ${ofacHit.programs.slice(0, 2).join(', ') || ofacHit.sdn_profile_id}`
            : fromWallet?.label || toWallet?.label || ''

          const isStructuring = structuringMap.has(rawTx.whale_alert_id)
          const structGroup   = structuringMap.get(rawTx.whale_alert_id) ?? ''
          const transitInfo   = transitMap.get(rawTx.whale_alert_id) ?? null
          const isTransit     = !!transitInfo
          const transitAddr   = transitInfo?.transit_addr ?? ''
          const smartMoney    = isSmartMoney(rawTx)

          let seenBefore = 0
          if (isStructuring || isTransit || (isUnknown(rawTx.from_owner) && isUnknown(rawTx.to_owner))) {
            const checkAddr = rawTx.from_address || rawTx.to_address
            if (checkAddr) seenBefore = await getAddressSeen(checkAddr)
          }

          const partialIntel = { is_structuring: isStructuring, is_smart_money: smartMoney, is_transit: isTransit }
          const intel: TxIntel = {
            tx:             rawTx,
            is_sanctioned:  isSanctioned,
            sanction_label: sanctionLabel,
            ofac_hit:       ofacHit,
            is_structuring: isStructuring,
            struct_group:   structGroup,
            is_transit:     isTransit,
            transit_addr:   transitAddr,
            transit_info:   transitInfo,
            is_smart_money: smartMoney,
            seen_before:    seenBefore,
            risk_score:     0,
            signal:         { direction: 'NEUTRAL', confidence: 'LOW', reason: '' },
          }
          intel.risk_score = calcRiskScore(rawTx, intel)
          intel.signal     = classifySignal(rawTx, partialIntel)
          intels.push(intel)
        }

        log.push(`▶ Intel: ${intels.filter(i => i.is_sanctioned).length} sanctioned, ` +
                 `${intels.filter(i => i.is_structuring).length} structuring, ` +
                 `${intels.filter(i => i.signal.direction === 'BEARISH').length} bearish`)

        // ── Auto-flag high risk до crypto_wallets ──────────────────────────
        autoFlagged = await autoFlagHighRisk(intels)
        if (autoFlagged > 0) log.push(`▶ Auto-flagged: ${autoFlagged} адрес → crypto_wallets`)

        // ── Форматування та відправка ──────────────────────────────────────
        const text = intels.length === 1
          ? formatSingleTx(intels[0])
          : formatSmartDigest(intels)

        const addr0 = intels[0]?.tx.from_address || intels[0]?.tx.to_address
        const keyboard = intels.length === 1
          ? [[
              { text: '🔍 Explorer',        url: explorerTxUrl(intels[0].tx.blockchain, intels[0].tx.hash) },
              { text: '🔬 Розслідувати',    url: addr0 ? `${APP_URL}/crypto-intel?address=${encodeURIComponent(addr0)}` : `${APP_URL}/admin/whale-alert` },
            ]]
          : [[{ text: '🔎 ODB Whale Dashboard', url: `${APP_URL}/admin/whale-alert` }]]

        const mainSent = await sendTelegramMessage(text, 'HTML', undefined, { inline_keyboard: keyboard })

        // ── Платний канал: HIGH confidence або sanctions ───────────────────
        if (CHANNEL_ID) {
          const signalWorthy = intels.filter(i =>
            i.signal.confidence === 'HIGH' ||
            i.is_sanctioned ||
            i.is_structuring ||
            i.risk_score >= 70,
          )
          if (signalWorthy.length > 0) {
            await sendTelegramMessage(
              formatChannelSignal(signalWorthy),
              'HTML',
              { chat_id: CHANNEL_ID },
              { inline_keyboard: [[
                  { text: '📊 ODB Crypto Intel', url: `${APP_URL}/admin/whale-alert` },
                ]] },
            )
            log.push(`▶ Канал: ${signalWorthy.length} сигналів надіслано`)
          }
        }

        // ── Позначаємо як надіслані ────────────────────────────────────────
        if (mainSent) {
          await supabase
            .from('whale_transactions')
            .update({ telegram_sent: true })
            .in('whale_alert_id', (unsent as StoredWhaleTx[]).map(t => t.whale_alert_id))
          telegramSent = unsent.length
          log.push(`✅ Telegram smart digest надіслано (${unsent.length} txs)`)
        }
      }
    }
  } catch (err) {
    log.push(`⚠ Digest error: ${(err as Error).message}`)
    errors++
  }

  const elapsed = Date.now() - startedAt
  log.push(`▶ Завершено: ${saved} saved, ${telegramSent} TG, ${autoFlagged} flagged, ${errors} err — ${elapsed}ms`)

  return NextResponse.json({
    success: errors === 0, saved, telegram_sent: telegramSent,
    auto_flagged: autoFlagged, errors, elapsed_ms: elapsed,
    log, ran_at: new Date().toISOString(),
  })
}
