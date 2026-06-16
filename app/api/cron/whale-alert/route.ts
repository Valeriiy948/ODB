// app/api/cron/whale-alert/route.ts
// Cron: poll Whale Alert API → Supabase + Telegram digest
//
// Vercel Hobby: тільки daily crons — використовуй зовнішній сервіс:
//   https://cron-job.org  (безкоштовно, кожну хвилину)
//   URL:  https://odb-one.vercel.app/api/cron/whale-alert
//   Schedule: * * * * *
//
// ENV:
//   WHALE_ALERT_API_KEY         — ключ Whale Alert (developer.whale-alert.io)
//   WHALE_ALERT_MIN_USD         — мінімум для збереження (default: 500_000)
//   WHALE_ALERT_TG_THRESHOLD    — поріг для Telegram (default: 1_000_000)
//   WHALE_ALERT_DIGEST_COOLDOWN — хвилини між дайджестами (default: 5)
//   WHALE_ALERT_CHANNEL_ID      — ID Telegram каналу монетизації (опційно)
//   CRON_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

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

// DB row type (from whale_transactions table)
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function explorerUrl(blockchain: string, hash: string | null): string {
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

function chainLabel(chain: string): string {
  const m: Record<string, string> = {
    ethereum: 'ETH', bitcoin: 'BTC', tron: 'TRON',
    solana: 'SOL', ripple: 'XRP', stellar: 'XLM',
    binance: 'BNB', polygon: 'MATIC', avalanche: 'AVAX',
  }
  return m[chain] ?? chain.toUpperCase()
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isUnknown(owner: string | null): boolean {
  return !owner || owner.toLowerCase() === 'unknown'
}

function ownerShort(owner: string | null, ownerType: string | null): string {
  if (!isUnknown(owner)) return htmlEscape(owner!)
  if (ownerType === 'exchange') return '?Біржа'
  return 'Невідомий'
}

function usdFmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// ─── Smart Filter: визначає підозрілу транзакцію ──────────────────────────────
// "unknown" може бути null АБО рядком "unknown" — перевіряємо обидва випадки
function isSuspicious(tx: StoredWhaleTx): boolean {
  const unknownFrom = isUnknown(tx.from_owner)
  const unknownTo   = isUnknown(tx.to_owner)

  if (tx.amount_usd >= 10_000_000) return true
  if (unknownFrom && unknownTo && tx.amount_usd >= 2_000_000) return true
  if (unknownFrom && unknownTo && tx.amount_usd >= TG_THRESH) return true
  return false
}

function suspiciousTag(tx: StoredWhaleTx): string {
  const unknownFrom = isUnknown(tx.from_owner)
  const unknownTo   = isUnknown(tx.to_owner)
  if (unknownFrom && unknownTo && tx.amount_usd >= 2_000_000) return ' 🔴'
  if (unknownFrom && unknownTo) return ' ⚠️'
  return ''
}

function txEmoji(amtUsd: number): string {
  if (amtUsd >= 10_000_000) return '🚨🚨🚨'
  if (amtUsd >= 5_000_000)  return '🚨🚨'
  return '🚨'
}

// ─── Digest formatter (кілька транзакцій) ────────────────────────────────────
function formatDigest(txs: StoredWhaleTx[]): string {
  const total    = txs.reduce((s, t) => s + t.amount_usd, 0)
  const susCount = txs.filter(isSuspicious).length

  const lines: string[] = [
    `🐋 <b>Whale Digest — ${txs.length} транзакції</b>`,
    `💰 Загалом: <b>$${usdFmt(total)}</b>` +
      (susCount > 0 ? ` · 🔴 <b>${susCount} підозрілих</b>` : ''),
    ``,
  ]

  for (let i = 0; i < txs.length; i++) {
    const tx  = txs[i]
    const url = explorerUrl(tx.blockchain, tx.hash)
    const sus = suspiciousTag(tx)
    const from = ownerShort(tx.from_owner, tx.from_owner_type)
    const to   = ownerShort(tx.to_owner,   tx.to_owner_type)
    const link = tx.hash ? ` <a href="${url}">↗</a>` : ''

    lines.push(
      `${i + 1}. ${txEmoji(tx.amount_usd)} <b>$${usdFmt(tx.amount_usd)} ${tx.symbol}</b>` +
      ` (${chainLabel(tx.blockchain)})${sus}`
    )
    lines.push(`   ${from} → ${to}${link}`)
    if (i < txs.length - 1) lines.push(``)
  }

  lines.push(``)
  lines.push(`<i>ODB Platform · Whale Alert Monitor</i>`)
  return lines.join('\n')
}

// ─── Single tx formatter (одна транзакція, деталі) ───────────────────────────
function formatSingleTx(tx: StoredWhaleTx): string {
  const from     = ownerShort(tx.from_owner, tx.from_owner_type)
  const to       = ownerShort(tx.to_owner,   tx.to_owner_type)
  const fromType = tx.from_owner_type ? ` (${tx.from_owner_type})` : ''
  const toType   = tx.to_owner_type   ? ` (${tx.to_owner_type})`   : ''
  const shortH   = tx.hash
    ? tx.hash.slice(0, 14) + '…' + tx.hash.slice(-6)
    : 'N/A'
  const url    = explorerUrl(tx.blockchain, tx.hash)
  const txTime = new Date(tx.tx_timestamp).toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv', hour12: false,
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  const sus = isSuspicious(tx)

  return [
    `${txEmoji(tx.amount_usd)} <b>WHALE ALERT — Велика транзакція</b>` +
      (sus ? ' 🔴 <b>ПІДОЗРІЛИЙ</b>' : ''),
    ``,
    `💸 <b>${usdFmt(tx.amount)} ${tx.symbol}</b> (~$${usdFmt(tx.amount_usd)})`,
    `🌐 Мережа: ${chainLabel(tx.blockchain)}`,
    ``,
    `📤 <b>Від:</b> ${from}${fromType}`,
    `📥 <b>До:</b>  ${to}${toType}`,
    ``,
    `🔗 <a href="${url}">${shortH}</a>`,
    `⏰ ${txTime} (Kyiv)`,
    ``,
    `<i>ODB Platform · Whale Alert Monitor</i>`,
  ].join('\n')
}

// ─── Channel formatter (стисло для каналу, заклик підписатися) ───────────────
function formatChannelAlert(txs: StoredWhaleTx[]): string {
  const total    = txs.reduce((s, t) => s + t.amount_usd, 0)
  const biggest  = txs[0]

  const lines: string[] = [
    `🔴 <b>ODB Crypto Intel — Підозрілі рухи</b>`,
    ``,
    `Виявлено ${txs.length} підозрілих транзакцій на $${usdFmt(total)}`,
    ``,
  ]

  for (const tx of txs) {
    const from = ownerShort(tx.from_owner, tx.from_owner_type)
    const to   = ownerShort(tx.to_owner,   tx.to_owner_type)
    const url  = explorerUrl(tx.blockchain, tx.hash)
    lines.push(
      `• <b>$${usdFmt(tx.amount_usd)} ${tx.symbol}</b> (${chainLabel(tx.blockchain)}) — ` +
      `${from} → ${to} <a href="${url}">↗</a>`
    )
  }

  lines.push(``)
  lines.push(
    `🔎 Повний аналіз, граф транзакцій та санкційна перевірка — ` +
    `в ODB Platform. Доступ → @odb_osint_monitor_bot`
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
    return NextResponse.json(
      { error: 'WHALE_ALERT_API_KEY не встановлено' },
      { status: 503 },
    )
  }

  const startedAt = Date.now()
  const log: string[] = []
  let saved = 0, telegramSent = 0, errors = 0

  // ── 1. Fetch from Whale Alert API (останні 2 хв) ──────────────────────────
  const start  = Math.floor(Date.now() / 1000) - 120
  const apiUrl =
    `${WHALE_API}/transactions` +
    `?api_key=${apiKey}&start=${start}&min_value=${MIN_USD}&limit=100`

  let txsFromApi: WhaleAlertTx[] = []
  try {
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'ODB-Crypto-Intel/1.0' },
      signal:  AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      log.push(`❌ Whale Alert API помилка ${res.status}: ${body.slice(0, 200)}`)
      errors++
    } else {
      const data = await res.json() as WhaleAlertResponse
      if (data.result === 'success') {
        txsFromApi = data.transactions ?? []
        log.push(`▶ Whale Alert: ${txsFromApi.length} транзакцій отримано`)
      } else {
        log.push(`❌ Whale Alert result="${data.result}"`)
        errors++
      }
    }
  } catch (err) {
    log.push(`💥 Fetch помилка: ${(err as Error).message}`)
    errors++
  }

  // ── 2. Upsert до Supabase ─────────────────────────────────────────────────
  for (const tx of txsFromApi) {
    const { error: upsertErr } = await supabase
      .from('whale_transactions')
      .upsert(
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

    if (upsertErr) {
      log.push(`  ⚠ upsert помилка: ${upsertErr.message}`)
      errors++
    } else {
      saved++
    }
  }
  log.push(`▶ Збережено: ${saved} нових транзакцій`)

  // ── 3. Digest: надіслати Telegram якщо пройшло >= DIGEST_COOLDOWN ─────────
  try {
    // Коли востаннє надсилали?
    const { data: lastSentRow } = await supabase
      .from('whale_transactions')
      .select('created_at')
      .eq('telegram_sent', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastSentMs   = lastSentRow?.created_at
      ? new Date(lastSentRow.created_at).getTime()
      : 0
    const msSinceSent  = Date.now() - lastSentMs
    const cooldownLeft = Math.max(0, DIGEST_COOL_MS - msSinceSent)

    log.push(
      cooldownLeft > 0
        ? `▶ Digest cooldown: ${Math.round(cooldownLeft / 1000)}с залишилось — пропускаємо`
        : `▶ Digest cooldown пройшов (${Math.round(msSinceSent / 1000)}с назад) — перевіряємо unsent`
    )

    if (cooldownLeft === 0) {
      // Всі unsent txs >= TG_THRESH за останні 60 хв
      const { data: unsent } = await supabase
        .from('whale_transactions')
        .select('*')
        .eq('telegram_sent', false)
        .gte('amount_usd', TG_THRESH)
        .gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString())
        .order('amount_usd', { ascending: false })
        .limit(10)

      if (!unsent || unsent.length === 0) {
        log.push(`▶ Unsent txs: 0 — нічого надсилати`)
      } else {
        log.push(`▶ Unsent txs >= $${usdFmt(TG_THRESH)}: ${unsent.length}`)

        // Формат: digest для 2+, детальний для 1
        const text = unsent.length === 1
          ? formatSingleTx(unsent[0] as StoredWhaleTx)
          : formatDigest(unsent as StoredWhaleTx[])

        const keyboard = unsent.length === 1
          ? [[
              { text: '🔍 Explorer', url: explorerUrl(unsent[0].blockchain, unsent[0].hash) },
              { text: '🔎 ODB Dashboard', url: `${APP_URL}/admin/whale-alert` },
            ]]
          : [[{ text: '🔎 ODB Whale Dashboard', url: `${APP_URL}/admin/whale-alert` }]]

        // Надсилаємо до основного чату
        const mainSent = await sendTelegramMessage(text, 'HTML', undefined, { inline_keyboard: keyboard })

        // Надсилаємо підозрілі до каналу монетизації
        if (CHANNEL_ID) {
          const suspicious = (unsent as StoredWhaleTx[]).filter(isSuspicious)
          if (suspicious.length > 0) {
            const channelText = formatChannelAlert(suspicious)
            await sendTelegramMessage(
              channelText,
              'HTML',
              { chat_id: CHANNEL_ID },
              { inline_keyboard: [[
                { text: '📊 Аналіз в ODB Platform', url: `${APP_URL}/admin/whale-alert` },
              ]]},
            )
            log.push(`▶ Канал монетизації: ${suspicious.length} підозрілих надіслано`)
          }
        }

        // Позначаємо як надіслані
        if (mainSent) {
          const ids = (unsent as StoredWhaleTx[]).map(t => t.whale_alert_id)
          await supabase
            .from('whale_transactions')
            .update({ telegram_sent: true })
            .in('whale_alert_id', ids)
          telegramSent = unsent.length
          log.push(`✅ Telegram: надіслано digest (${unsent.length} txs)`)
        }
      }
    }
  } catch (err) {
    log.push(`⚠ Digest error: ${(err as Error).message}`)
    errors++
  }

  const elapsed = Date.now() - startedAt
  log.push(`▶ Завершено: ${saved} збережено, ${telegramSent} TG, ${errors} помилок — ${elapsed}мс`)

  return NextResponse.json({
    success:       errors === 0,
    saved,
    telegram_sent: telegramSent,
    errors,
    elapsed_ms:    elapsed,
    log,
    ran_at:        new Date().toISOString(),
  })
}
