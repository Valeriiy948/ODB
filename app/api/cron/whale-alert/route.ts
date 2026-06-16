// app/api/cron/whale-alert/route.ts
// Cron: poll Whale Alert API, зберігати в Supabase, надсилати Telegram
//
// Vercel Hobby: тільки daily crons — використовуй зовнішній сервіс:
//   https://cron-job.org  (безкоштовно, кожну хвилину)
//   URL:  https://odb-one.vercel.app/api/cron/whale-alert
//   Auth: Header → Authorization: Bearer <CRON_SECRET>
//   Schedule: * * * * *
//
// ENV:
//   WHALE_ALERT_API_KEY       — з whale-alert.io → Account → API Keys
//   WHALE_ALERT_MIN_USD       — мінімальна сума моніторингу (default: 500000)
//   WHALE_ALERT_TG_THRESHOLD  — поріг Telegram повідомлення (default: 1000000)
//   CRON_SECRET               — для авторизації (будь-який рядок)
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import { sendTelegramMessage }       from '@/lib/telegram'

export const runtime    = 'nodejs'
export const maxDuration = 55

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const WHALE_API = 'https://api.whale-alert.io/v1'
const MIN_USD   = Number(process.env.WHALE_ALERT_MIN_USD     ?? 500_000)
const TG_THRESH = Number(process.env.WHALE_ALERT_TG_THRESHOLD ?? 1_000_000)
const APP_URL   = process.env.APP_URL ?? 'https://odb-one.vercel.app'

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function explorerUrl(tx: WhaleAlertTx): string {
  const h = tx.hash ?? ''
  switch (tx.blockchain) {
    case 'ethereum':  return `https://etherscan.io/tx/${h}`
    case 'bitcoin':   return `https://mempool.space/tx/${h}`
    case 'tron':      return `https://tronscan.org/#/transaction/${h}`
    case 'solana':    return `https://solscan.io/tx/${h}`
    case 'ripple':    return `https://xrpscan.com/tx/${h}`
    case 'stellar':   return `https://stellarscan.io/tx/${h}`
    case 'binance':   return `https://bscscan.com/tx/${h}`
    default:          return 'https://whale-alert.io'
  }
}

function chainLabel(chain: string): string {
  const m: Record<string, string> = {
    ethereum: 'Ethereum', bitcoin: 'Bitcoin', tron: 'TRON',
    solana: 'Solana', ripple: 'XRP', stellar: 'Stellar',
    binance: 'BNB Chain', polygon: 'Polygon', avalanche: 'Avalanche',
  }
  return m[chain] ?? chain.toUpperCase()
}

function ownerLabel(owner?: string, ownerType?: string): string {
  if (owner) return owner
  if (ownerType === 'exchange') return 'Невідома біржа'
  if (ownerType === 'wallet')   return 'Невідомий гаманець'
  return 'Невідомий'
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatWhaleMessage(tx: WhaleAlertTx): string {
  const amtFmt = tx.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })
  const usdFmt = tx.amount_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const symbol  = tx.symbol.toUpperCase()
  const chain   = chainLabel(tx.blockchain)

  const fromLabel = htmlEscape(ownerLabel(tx.from?.owner, tx.from?.owner_type))
  const toLabel   = htmlEscape(ownerLabel(tx.to?.owner,   tx.to?.owner_type))
  const fromType  = tx.from?.owner_type ? ` (${tx.from.owner_type})` : ''
  const toType    = tx.to?.owner_type   ? ` (${tx.to.owner_type})`   : ''

  const txTime = new Date(tx.timestamp * 1000).toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv', hour12: false,
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const emo  = tx.amount_usd >= 10_000_000 ? '🚨🚨🚨'
             : tx.amount_usd >= 5_000_000  ? '🚨🚨'
             : tx.amount_usd >= 1_000_000  ? '🚨'
             : '⚠️'

  const shortHash = tx.hash
    ? tx.hash.slice(0, 14) + '…' + tx.hash.slice(-6)
    : 'N/A'

  return [
    `${emo} <b>WHALE ALERT — Велика транзакція</b>`,
    ``,
    `💸 <b>${amtFmt} ${symbol}</b> (~$${usdFmt})`,
    `🌐 Мережа: ${chain}`,
    ``,
    `📤 <b>Від:</b> ${fromLabel}${fromType}`,
    `📥 <b>До:</b>  ${toLabel}${toType}`,
    ``,
    `🔗 <a href="${explorerUrl(tx)}">${shortHash}</a>`,
    `⏰ ${txTime} (Kyiv)`,
    ``,
    `<i>ODB Platform · Whale Alert Monitor</i>`,
  ].join('\n')
}

// ─── GET handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.WHALE_ALERT_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'WHALE_ALERT_API_KEY не встановлено. Отримай ключ на whale-alert.io' },
      { status: 503 },
    )
  }

  const startedAt = Date.now()
  const log: string[] = []
  let saved = 0
  let telegramSent = 0
  let errors = 0

  // Запит за останні 2 хвилини (буфер на затримку cron)
  const start = Math.floor(Date.now() / 1000) - 120

  try {
    const apiUrl =
      `${WHALE_API}/transactions` +
      `?api_key=${apiKey}` +
      `&start=${start}` +
      `&min_value=${MIN_USD}` +
      `&limit=100`

    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'ODB-Crypto-Intel/1.0' },
      signal:  AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      log.push(`❌ Whale Alert API помилка ${res.status}: ${body.slice(0, 300)}`)
      errors++
      return NextResponse.json({ success: false, errors, log, elapsed_ms: Date.now() - startedAt })
    }

    const data = await res.json() as WhaleAlertResponse

    if (data.result !== 'success') {
      log.push(`❌ Whale Alert: result="${data.result}"`)
      return NextResponse.json({ success: false, log })
    }

    const txs = data.transactions ?? []
    log.push(`▶ Отримано ${txs.length} транзакцій від Whale Alert`)

    for (const tx of txs) {
      const whaleId = String(tx.id)

      // upsert — ігноруємо дублікати (ignoreDuplicates: true)
      const { error: upsertErr } = await supabase
        .from('whale_transactions')
        .upsert(
          {
            whale_alert_id:  whaleId,
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
        log.push(`  ⚠ upsert помилка tx=${whaleId}: ${upsertErr.message}`)
        errors++
        continue
      }

      saved++
      const usdStr = tx.amount_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })
      log.push(`  ✅ ${tx.symbol.toUpperCase()} $${usdStr} — ${chainLabel(tx.blockchain)}`)

      // Telegram для транзакцій >= TG_THRESH
      if (tx.amount_usd >= TG_THRESH) {
        const text = formatWhaleMessage(tx)
        const keyboard = [[
          { text: '🔍 Explorer',          url: explorerUrl(tx) },
          { text: '🔎 ODB Розслідування', url: `${APP_URL}/crypto-intel?address=${encodeURIComponent(tx.from?.address ?? '')}` },
        ]]
        const sent = await sendTelegramMessage(text, 'HTML', undefined, { inline_keyboard: keyboard })
        if (sent) {
          telegramSent++
          await supabase
            .from('whale_transactions')
            .update({ telegram_sent: true })
            .eq('whale_alert_id', whaleId)
        }
      }
    }

  } catch (err) {
    const e = err as Error
    log.push(`💥 Неочікувана помилка: ${e.message}`)
    errors++
  }

  const elapsed = Date.now() - startedAt
  log.push(`▶ Завершено: ${saved} збережено, ${telegramSent} Telegram, ${errors} помилок — ${elapsed}мс`)

  return NextResponse.json({
    success:       true,
    saved,
    telegram_sent: telegramSent,
    errors,
    elapsed_ms:    elapsed,
    log,
    ran_at:        new Date().toISOString(),
  })
}
