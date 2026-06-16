// app/api/cron/whale-alert/route.ts
// Intelligence Engine v2:
//   - Адреси замість "Невідомий" з посиланнями на Explorer
//   - Cross-referencing з crypto_wallets (sanctions, risk_score)
//   - Structuring/chain-hopping detection
//   - Пріоритизований дайджест (SANCTIONS > AML > SMART MONEY > regular)
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
const CHANNEL_ID     = process.env.WHALE_ALERT_CHANNEL_ID ?? ''

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

// Результат аналізу транзакції
interface TxIntel {
  tx:             StoredWhaleTx
  is_sanctioned:  boolean
  sanction_label: string        // ім'я особи з ODB або назва санкційного списку
  is_structuring: boolean       // chain-hopping / structuring паттерн
  struct_group:   string        // адреса яка структурує
  is_smart_money: boolean       // unknown → відома біржа >= $5M
  seen_before:    number        // скільки разів бачили цю адресу раніше
  risk_score:     number        // 0-100
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

// Адреса скорочена: перші 8 + … + останні 6 символів
function addrShort(address: string): string {
  return address.slice(0, 8) + '…' + address.slice(-6)
}

// Відображення сторони транзакції:
// - відома назва (Binance, Garantex) → жирний текст
// - невідомий власник → скорочена адреса з посиланням на Explorer
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

// ─── Cross-referencing: перевірка адрес у crypto_wallets ─────────────────────
interface WalletRecord {
  address:          string
  label:            string | null
  risk_score:       number | null
  is_sanctioned:    boolean | null
  linked_person_id: string | null
}

async function crossRefAddresses(
  addresses: string[],
): Promise<Map<string, WalletRecord>> {
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

// Підрахунок скільки разів бачили адресу в нашій БД whale_transactions
async function getAddressSeen(address: string): Promise<number> {
  const { count } = await supabase
    .from('whale_transactions')
    .select('id', { count: 'exact', head: true })
    .or(`from_address.eq.${address},to_address.eq.${address}`)
  return count ?? 0
}

// ─── AML: Structuring Detection ──────────────────────────────────────────────
// Визначає "structuring" (дроблення суми):
//   3+ транзакції з однієї адреси в поточному батчі з однаковою сумою (±5%)
function detectStructuring(txs: StoredWhaleTx[]): Map<string, string> {
  // Повертає Map<whale_alert_id, from_address> для підозрілих txs
  const byFrom = new Map<string, StoredWhaleTx[]>()
  for (const tx of txs) {
    if (!tx.from_address) continue
    const arr = byFrom.get(tx.from_address) ?? []
    arr.push(tx)
    byFrom.set(tx.from_address, arr)
  }

  const flagged = new Map<string, string>() // whale_alert_id → from_address
  for (const [addr, addrTxs] of byFrom) {
    if (addrTxs.length < 3) continue
    const amounts = addrTxs.map(t => t.amount_usd).sort((a, b) => a - b)
    const median  = amounts[Math.floor(amounts.length / 2)]
    const similar = addrTxs.filter(
      t => Math.abs(t.amount_usd - median) / median < 0.08
    )
    if (similar.length >= 3) {
      for (const t of similar) flagged.set(t.whale_alert_id, addr)
    }
  }
  return flagged
}

// ─── Smart Money Signal ───────────────────────────────────────────────────────
// unknown → відома біржа + сума >= $5M → підготовка до продажу / ліквідності
function isSmartMoney(tx: StoredWhaleTx): boolean {
  const unknownFrom = isUnknown(tx.from_owner)
  const knownTo     = !isUnknown(tx.to_owner)
  const toBigExchange = tx.to_owner_type === 'exchange' || (
    tx.to_owner && ['binance','coinbase','okex','okx','kraken','bitfinex','huobi']
      .some(e => tx.to_owner!.toLowerCase().includes(e))
  )
  return unknownFrom && knownTo && toBigExchange && tx.amount_usd >= 5_000_000
}

// ─── Risk Score Calculation ───────────────────────────────────────────────────
function calcRiskScore(tx: StoredWhaleTx, intel: Partial<TxIntel>): number {
  let score = 0
  if (intel.is_sanctioned)    score += 90
  if (intel.is_structuring)   score += 60
  if (isUnknown(tx.from_owner) && isUnknown(tx.to_owner)) score += 40
  if (tx.amount_usd >= 10_000_000) score += 20
  if (tx.amount_usd >= 5_000_000)  score += 10
  if ((intel.seen_before ?? 0) > 5) score += 15
  if (isSmartMoney(tx))        score += 25
  return Math.min(score, 100)
}

// ─── Digest Formatter (Intelligence Engine) ───────────────────────────────────
function formatDigest(intels: TxIntel[]): string {
  const total      = intels.reduce((s, i) => s + i.tx.amount_usd, 0)
  const sanctioned = intels.filter(i => i.is_sanctioned).length
  const structuring = intels.filter(i => i.is_structuring).length
  const suspicious = intels.filter(i => i.risk_score >= 40).length

  // Пріоритизація: санкції → AML → ризик → smart money → решта
  const sorted = [...intels].sort((a, b) => {
    if (a.is_sanctioned !== b.is_sanctioned) return a.is_sanctioned ? -1 : 1
    if (a.is_structuring !== b.is_structuring) return a.is_structuring ? -1 : 1
    return b.risk_score - a.risk_score
  })

  const headerLines: string[] = [
    `🐋 <b>Whale Digest — ${intels.length} транзакції</b>`,
    `💰 Загалом: <b>$${usdFmt(total)}</b>`,
  ]
  if (sanctioned > 0)  headerLines.push(`🚨 <b>${sanctioned} ЗБІГ З САНКЦІЙНИМ СПИСКОМ!</b>`)
  if (structuring > 0) headerLines.push(`🕵️ <b>${structuring} підозрілих (structuring)</b>`)
  else if (suspicious > 0) headerLines.push(`🔴 <b>${suspicious} підозрілих</b>`)
  headerLines.push(``)

  const lines: string[] = [...headerLines]

  for (let i = 0; i < sorted.length; i++) {
    const { tx, is_sanctioned, sanction_label, is_structuring, is_smart_money, seen_before, risk_score } = sorted[i]

    const txUrl  = explorerTxUrl(tx.blockchain, tx.hash)
    const txLink = tx.hash ? ` <a href="${txUrl}">↗</a>` : ''

    const from = partyDisplay(tx.from_owner, tx.from_owner_type, tx.from_address, tx.blockchain)
    const to   = partyDisplay(tx.to_owner,   tx.to_owner_type,   tx.to_address,   tx.blockchain)

    // Маркер пріоритету
    const amtEmoji = tx.amount_usd >= 10_000_000 ? '🚨🚨🚨'
                   : tx.amount_usd >= 5_000_000  ? '🚨🚨'
                   : '🚨'

    lines.push(`${i + 1}. ${amtEmoji} <b>$${usdFmt(tx.amount_usd)} ${tx.symbol}</b> (${chainLabel(tx.blockchain)})${txLink}`)

    // AML маркери
    if (is_sanctioned) {
      lines.push(`   🚨 <b>ЗБІГ З ODB:</b> ${htmlEscape(sanction_label)}`)
    }
    if (is_structuring) {
      lines.push(`   🕵️ <b>Structuring/Chain-hopping</b> — дроблення суми`)
    }
    if (is_smart_money) {
      lines.push(`   🐋 <b>Smart Money:</b> підготовка до продажу?`)
    }
    if (seen_before > 3 && !is_sanctioned) {
      lines.push(`   👁 Адреса бачена ${seen_before}× у нашій БД`)
    }

    lines.push(`   ${from} → ${to}`)
    if (risk_score >= 70) lines.push(`   ⚠️ Risk score: <b>${risk_score}/100</b>`)
    if (i < sorted.length - 1) lines.push(``)
  }

  lines.push(``)
  lines.push(`<i>ODB Intelligence Engine · Whale Alert Monitor</i>`)
  return lines.join('\n')
}

// ─── Single TX formatter ──────────────────────────────────────────────────────
function formatSingleTx(intel: TxIntel): string {
  const { tx, is_sanctioned, sanction_label, is_structuring, is_smart_money, seen_before, risk_score } = intel
  const from    = partyDisplay(tx.from_owner, tx.from_owner_type, tx.from_address, tx.blockchain)
  const to      = partyDisplay(tx.to_owner,   tx.to_owner_type,   tx.to_address,   tx.blockchain)
  const txUrl   = explorerTxUrl(tx.blockchain, tx.hash)
  const shortH  = tx.hash ? tx.hash.slice(0, 14) + '…' + tx.hash.slice(-6) : 'N/A'
  const txTime  = new Date(tx.tx_timestamp).toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv', hour12: false,
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const amtEmoji = tx.amount_usd >= 10_000_000 ? '🚨🚨🚨'
                 : tx.amount_usd >= 5_000_000  ? '🚨🚨'
                 : '🚨'

  const lines: string[] = [
    `${amtEmoji} <b>WHALE ALERT</b>` +
      (is_sanctioned ? ' 🚨 <b>SANCTIONS HIT!</b>' : risk_score >= 70 ? ' 🔴 <b>HIGH RISK</b>' : ''),
    ``,
    `💸 <b>$${usdFmt(tx.amount_usd)} ${tx.symbol}</b> (${chainLabel(tx.blockchain)})`,
    ``,
    `📤 <b>Від:</b> ${from}`,
    `📥 <b>До:</b>  ${to}`,
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
    `<i>ODB Intelligence Engine · Whale Alert Monitor</i>`,
  )
  return lines.join('\n')
}

// ─── Channel formatter ────────────────────────────────────────────────────────
function formatChannelAlert(intels: TxIntel[]): string {
  const total   = intels.reduce((s, i) => s + i.tx.amount_usd, 0)
  const lines: string[] = [
    `🔴 <b>ODB Crypto Intel — Підозрілі рухи</b>`,
    ``,
    `Виявлено ${intels.length} підозрілих транзакцій · $${usdFmt(total)}`,
    ``,
  ]
  for (const { tx, is_sanctioned, is_structuring, risk_score } of intels) {
    const url  = explorerTxUrl(tx.blockchain, tx.hash)
    const from = partyDisplay(tx.from_owner, tx.from_owner_type, tx.from_address, tx.blockchain)
    const to   = partyDisplay(tx.to_owner,   tx.to_owner_type,   tx.to_address,   tx.blockchain)
    const mark = is_sanctioned ? '🚨' : is_structuring ? '🕵️' : '🔴'
    lines.push(
      `${mark} <b>$${usdFmt(tx.amount_usd)} ${tx.symbol}</b> (${chainLabel(tx.blockchain)}) ` +
      `<a href="${url}">↗</a>`,
      `   ${from} → ${to}`,
      ``,
    )
  }
  lines.push(
    `🔎 Повний аналіз → ODB Platform · @odb_osint_monitor_bot`
  )
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
  let saved = 0, telegramSent = 0, errors = 0

  // ── 1. Fetch Whale Alert API ───────────────────────────────────────────────
  const start  = Math.floor(Date.now() / 1000) - 120
  const apiUrl = `${WHALE_API}/transactions?api_key=${apiKey}&start=${start}&min_value=${MIN_USD}&limit=100`

  let txsFromApi: WhaleAlertTx[] = []
  try {
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'ODB-Crypto-Intel/2.0' },
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

  // ── 3. Digest: перевірка cooldown та відправка ────────────────────────────
  try {
    const { data: lastSentRow } = await supabase
      .from('whale_transactions')
      .select('created_at')
      .eq('telegram_sent', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastSentMs  = lastSentRow?.created_at ? new Date(lastSentRow.created_at).getTime() : 0
    const cooldownLeft = Math.max(0, DIGEST_COOL_MS - (Date.now() - lastSentMs))

    if (cooldownLeft > 0) {
      log.push(`▶ Cooldown: ${Math.round(cooldownLeft / 1000)}с залишилось`)
    } else {
      // Unsent txs >= TG_THRESH за останню годину
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
        log.push(`▶ Unsent: ${unsent.length} txs — запускаємо Intelligence Engine`)

        // ── Cross-referencing ─────────────────────────────────────────────
        const addresses = unsent.flatMap(t => [t.from_address, t.to_address]).filter(Boolean) as string[]
        const walletMap = await crossRefAddresses(addresses)

        // ── Structuring detection ─────────────────────────────────────────
        const structuringMap = detectStructuring(unsent as StoredWhaleTx[])

        // ── Збираємо Intel для кожної транзакції ──────────────────────────
        const intels: TxIntel[] = []
        for (const rawTx of unsent as StoredWhaleTx[]) {
          const fromWallet = rawTx.from_address ? walletMap.get(rawTx.from_address) : null
          const toWallet   = rawTx.to_address   ? walletMap.get(rawTx.to_address)   : null
          const isSanctioned = !!(fromWallet?.is_sanctioned || toWallet?.is_sanctioned)
          const sanctionLabel = fromWallet?.label || toWallet?.label || ''

          const isStructuring = structuringMap.has(rawTx.whale_alert_id)
          const structGroup   = structuringMap.get(rawTx.whale_alert_id) ?? ''
          const smartMoney    = isSmartMoney(rawTx)

          // Seen before: тільки для підозрілих адрес (оптимізація)
          let seenBefore = 0
          if (isStructuring || (isUnknown(rawTx.from_owner) && isUnknown(rawTx.to_owner))) {
            const checkAddr = rawTx.from_address || rawTx.to_address
            if (checkAddr) seenBefore = await getAddressSeen(checkAddr)
          }

          const intel: TxIntel = {
            tx:             rawTx,
            is_sanctioned:  isSanctioned,
            sanction_label: sanctionLabel,
            is_structuring: isStructuring,
            struct_group:   structGroup,
            is_smart_money: smartMoney,
            seen_before:    seenBefore,
            risk_score:     0,
          }
          intel.risk_score = calcRiskScore(rawTx, intel)
          intels.push(intel)
        }

        const sanctionedCount = intels.filter(i => i.is_sanctioned).length
        const structCount     = intels.filter(i => i.is_structuring).length
        log.push(`▶ Intel: ${sanctionedCount} sanctioned, ${structCount} structuring`)

        // ── Формат та відправка ───────────────────────────────────────────
        const text = intels.length === 1
          ? formatSingleTx(intels[0])
          : formatDigest(intels)

        const keyboard = intels.length === 1
          ? [[
              { text: '🔍 Explorer',       url: explorerTxUrl(intels[0].tx.blockchain, intels[0].tx.hash) },
              { text: '🔎 ODB Dashboard',  url: `${APP_URL}/admin/whale-alert` },
            ]]
          : [[{ text: '🔎 ODB Whale Dashboard', url: `${APP_URL}/admin/whale-alert` }]]

        const mainSent = await sendTelegramMessage(text, 'HTML', undefined, { inline_keyboard: keyboard })

        // ── Канал монетизації: тільки high-risk ───────────────────────────
        if (CHANNEL_ID) {
          const highRisk = intels.filter(i => i.risk_score >= 50 || i.is_sanctioned || i.is_structuring)
          if (highRisk.length > 0) {
            await sendTelegramMessage(
              formatChannelAlert(highRisk),
              'HTML',
              { chat_id: CHANNEL_ID },
              { inline_keyboard: [[
                { text: '📊 ODB Crypto Intel', url: `${APP_URL}/admin/whale-alert` },
              ]]},
            )
            log.push(`▶ Канал: ${highRisk.length} high-risk надіслано`)
          }
        }

        // ── Позначаємо як надіслані ───────────────────────────────────────
        if (mainSent) {
          await supabase
            .from('whale_transactions')
            .update({ telegram_sent: true })
            .in('whale_alert_id', (unsent as StoredWhaleTx[]).map(t => t.whale_alert_id))
          telegramSent = unsent.length
          log.push(`✅ Telegram digest надіслано (${unsent.length} txs)`)
        }
      }
    }
  } catch (err) {
    log.push(`⚠ Digest error: ${(err as Error).message}`)
    errors++
  }

  const elapsed = Date.now() - startedAt
  log.push(`▶ Завершено: ${saved} saved, ${telegramSent} TG, ${errors} err — ${elapsed}ms`)

  return NextResponse.json({
    success: errors === 0, saved, telegram_sent: telegramSent,
    errors, elapsed_ms: elapsed, log, ran_at: new Date().toISOString(),
  })
}
