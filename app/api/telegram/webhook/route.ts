// app/api/telegram/webhook/route.ts
// Telegram Bot Webhook — @odb_osint_monitor_bot
//
// Реєстрація (виконати один раз у терміналі):
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://odb-one.vercel.app/api/telegram/webhook"
//
// Команди:
//   /help        — список команд
//   /whale [chain] — останні whale транзакції (btc/eth/tron/sol/xrp/bnb)
//   /stats       — статистика Whale Alert за 24h
//   /suspicious  — підозрілі транзакції за 24h (unknown→unknown або ≥$10M)
//   /watchlist   — список відстежуваних адрес
//   /add <addr> [chain] [назва] — додати адресу до watchlist
//   /pause <addr>  — призупинити моніторинг
//   /resume <addr> — відновити моніторинг
//   /remove <addr> — видалити адресу

import { NextRequest, NextResponse }              from 'next/server'
import { createClient }                           from '@supabase/supabase-js'
import { sendTelegramMessage, answerCallbackQuery } from '@/lib/telegram'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const APP_URL = process.env.APP_URL ?? 'https://odb-one.vercel.app'
const TG_API  = 'https://api.telegram.org'

// ─── Types ────────────────────────────────────────────────────────────────────
interface TgUpdate {
  update_id:      number
  message?:       { message_id: number; from: TgUser; chat: TgChat; date: number; text?: string }
  callback_query?: { id: string; from: TgUser; message?: { chat: TgChat }; data?: string }
}
interface TgUser { id: number; username?: string; first_name: string }
interface TgChat { id: number; type: string }

// ─── Auth ─────────────────────────────────────────────────────────────────────
function isAllowedChat(chatId: number): boolean {
  const allowed = process.env.TELEGRAM_CHAT_ID ?? ''
  return String(chatId) === String(allowed)
}

// ─── Core reply ───────────────────────────────────────────────────────────────
async function reply(
  chatId:   number,
  text:     string,
  keyboard?: object,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? ''
  if (!token) return
  await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      chat_id:                  chatId,
      text,
      parse_mode:               'HTML',
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: keyboard } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function usdFmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const CHAIN_LABELS: Record<string, string> = {
  ethereum: 'ETH', bitcoin: 'BTC', tron: 'TRON',
  solana: 'SOL', ripple: 'XRP', binance: 'BNB',
}
const CHAIN_ALIASES: Record<string, string> = {
  btc: 'bitcoin', eth: 'ethereum', tron: 'tron',
  sol: 'solana',  xrp: 'ripple',  bnb: 'binance',
}

function chainLabel(c: string): string {
  return CHAIN_LABELS[c] ?? c.toUpperCase()
}

function explorerUrl(blockchain: string, hash: string | null): string {
  if (!hash) return 'https://whale-alert.io'
  switch (blockchain) {
    case 'ethereum': return `https://etherscan.io/tx/${hash}`
    case 'bitcoin':  return `https://mempool.space/tx/${hash}`
    case 'tron':     return `https://tronscan.org/#/transaction/${hash}`
    case 'solana':   return `https://solscan.io/tx/${hash}`
    case 'ripple':   return `https://xrpscan.com/tx/${hash}`
    case 'binance':  return `https://bscscan.com/tx/${hash}`
    default:         return 'https://whale-alert.io'
  }
}

// ─── /help ────────────────────────────────────────────────────────────────────
async function cmdHelp(chatId: number): Promise<void> {
  const text = [
    `🤖 <b>ODB OSINT Bot — команди</b>`,
    ``,
    `<b>🐋 Whale Alert</b>`,
    `/whale          — останні 5 whale транзакцій`,
    `/whale btc      — тільки Bitcoin`,
    `/whale eth      — тільки Ethereum`,
    `/whale tron     — тільки TRON`,
    `/stats          — статистика за 24h`,
    `/suspicious     — підозрілі рухи за 24h`,
    ``,
    `<b>📋 Watchlist</b>`,
    `/watchlist      — список відстежуваних адрес`,
    `/add &lt;addr&gt; [chain] [назва] — додати адресу`,
    `/pause &lt;addr&gt;  — призупинити`,
    `/resume &lt;addr&gt; — відновити`,
    `/remove &lt;addr&gt; — видалити`,
    ``,
    `<i>Мережі watchlist: tron, eth, btc, bsc, sol</i>`,
  ].join('\n')

  await reply(chatId, text, {
    inline_keyboard: [[
      { text: '🔎 Whale Dashboard', url: `${APP_URL}/admin/whale-alert` },
      { text: '📊 Crypto Intel',    url: `${APP_URL}/crypto-intel` },
    ]],
  })
}

// ─── /whale [chain] ───────────────────────────────────────────────────────────
async function cmdWhale(chatId: number, chainArg?: string): Promise<void> {
  const normalized = chainArg ? (CHAIN_ALIASES[chainArg] ?? chainArg) : null

  let query = supabase
    .from('whale_transactions')
    .select('blockchain, symbol, amount, amount_usd, from_owner, to_owner, hash, tx_timestamp')
    .order('tx_timestamp', { ascending: false })
    .limit(5)

  if (normalized) query = query.eq('blockchain', normalized)

  const { data: txs, error } = await query

  if (error || !txs?.length) {
    const msg = normalized
      ? `⚠️ Транзакцій <b>${chainArg!.toUpperCase()}</b> ще немає в базі.`
      : `⚠️ Whale транзакцій ще немає. Перевір, що cron активний.`
    await reply(chatId, msg)
    return
  }

  const chainTitle = chainArg ? ` (${chainArg.toUpperCase()})` : ''
  const lines: string[] = [
    `🐋 <b>Останні ${txs.length} whale транзакцій${chainTitle}</b>`,
    ``,
  ]

  for (const tx of txs) {
    const from = tx.from_owner ? htmlEscape(tx.from_owner) : '❓Невідомий'
    const to   = tx.to_owner   ? htmlEscape(tx.to_owner)   : '❓Невідомий'
    const url  = explorerUrl(tx.blockchain, tx.hash)
    const link = tx.hash ? ` <a href="${url}">↗</a>` : ''
    const time = new Date(tx.tx_timestamp).toLocaleString('uk-UA', {
      timeZone: 'Europe/Kyiv', hour12: false,
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
    lines.push(
      `• <b>$${usdFmt(tx.amount_usd)} ${tx.symbol}</b> (${chainLabel(tx.blockchain)})${link}`,
      `  ${from} → ${to}`,
      `  <i>${time} (Kyiv)</i>`,
      ``,
    )
  }

  lines.push(`<i>ODB Platform · Whale Alert Monitor</i>`)
  await reply(chatId, lines.join('\n'), {
    inline_keyboard: [[
      { text: '🔎 Whale Dashboard', url: `${APP_URL}/admin/whale-alert` },
    ]],
  })
}

// ─── /stats ───────────────────────────────────────────────────────────────────
async function cmdStats(chatId: number): Promise<void> {
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString()

  const { data, error } = await supabase
    .from('whale_transactions')
    .select('amount_usd, blockchain, symbol')
    .gte('tx_timestamp', since24h)

  if (error || !data) {
    await reply(chatId, `❌ Помилка отримання статистики`)
    return
  }

  const totalUsd  = data.reduce((s, t) => s + (t.amount_usd as number), 0)
  const count     = data.length
  const suspicious = data.filter(t =>
    t.amount_usd >= 10_000_000
  ).length

  const byChain = data.reduce((acc: Record<string, number>, t) => {
    acc[t.blockchain as string] = (acc[t.blockchain as string] ?? 0) + 1
    return acc
  }, {})
  const topChains = Object.entries(byChain)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([c, n]) => `${chainLabel(c)}: ${n}`)
    .join(' | ')

  const now = new Date().toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv', hour12: false,
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  const text = [
    `📊 <b>Whale Alert — Статистика 24h</b>`,
    ``,
    `🔢 Транзакцій: <b>${count}</b>`,
    `💰 Загальний обсяг: <b>$${usdFmt(totalUsd)}</b>`,
    `🔴 Мегатранзакцій (≥$10M): <b>${suspicious}</b>`,
    ``,
    `🌐 Розподіл по ланцюгах:`,
    `   ${topChains || '—'}`,
    ``,
    `<i>ODB Platform · ${now} (Kyiv)</i>`,
  ].join('\n')

  await reply(chatId, text, {
    inline_keyboard: [[
      { text: '🔎 Whale Dashboard', url: `${APP_URL}/admin/whale-alert` },
    ]],
  })
}

// ─── /suspicious ──────────────────────────────────────────────────────────────
async function cmdSuspicious(chatId: number): Promise<void> {
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString()

  // unknown→unknown АБО мегатранзакція >= $10M
  // from_owner може бути null АБО рядком "unknown"
  const { data, error } = await supabase
    .from('whale_transactions')
    .select('blockchain, symbol, amount_usd, from_owner, to_owner, hash, tx_timestamp')
    .gte('tx_timestamp', since24h)
    .or(
      'amount_usd.gte.10000000,' +
      'and(or(from_owner.is.null,from_owner.eq.unknown),or(to_owner.is.null,to_owner.eq.unknown))'
    )
    .order('amount_usd', { ascending: false })
    .limit(8)

  if (error || !data?.length) {
    await reply(chatId,
      `✅ <b>Підозрілих транзакцій за 24h не виявлено</b>\n` +
      `<i>Всі великі рухи між відомими суб'єктами</i>`
    )
    return
  }

  const lines: string[] = [
    `🔴 <b>Підозрілі транзакції за 24h</b>`,
    `<i>unknown→unknown або ≥$10M</i>`,
    ``,
  ]

  for (const tx of data) {
    const from  = tx.from_owner ? htmlEscape(tx.from_owner as string) : '❓Невідомий'
    const to    = tx.to_owner   ? htmlEscape(tx.to_owner   as string) : '❓Невідомий'
    const url   = explorerUrl(tx.blockchain as string, tx.hash as string | null)
    const link  = tx.hash ? ` <a href="${url}">↗</a>` : ''
    const mega  = (tx.amount_usd as number) >= 10_000_000 ? ' 🚨🚨🚨' : ' 🔴'
    lines.push(
      `• <b>$${usdFmt(tx.amount_usd as number)} ${tx.symbol}</b>` +
      ` (${chainLabel(tx.blockchain as string)})${mega}${link}`,
      `  ${from} → ${to}`,
      ``,
    )
  }

  lines.push(`<i>ODB Platform · Crypto Forensics</i>`)
  await reply(chatId, lines.join('\n'), {
    inline_keyboard: [[
      { text: '🔎 Whale Dashboard', url: `${APP_URL}/admin/whale-alert` },
      { text: '🕵️ Crypto Intel',   url: `${APP_URL}/crypto-intel` },
    ]],
  })
}

// ─── /watchlist ───────────────────────────────────────────────────────────────
async function cmdWatchlist(chatId: number): Promise<void> {
  const { data, error } = await supabase
    .from('crypto_watchlist')
    .select('address, chain, label, risk_level, status')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(15)

  if (error || !data?.length) {
    await reply(chatId,
      `📭 <b>Watchlist порожній</b>\n\n` +
      `Додайте адресу: <code>/add TXxx...xxx tron Назва</code>`,
    )
    return
  }

  const lines: string[] = [`📋 <b>Watchlist (${data.length})</b>\n`]
  for (const e of data) {
    const statusIcon = e.status === 'active' ? '✅' : '⏸'
    const riskIcon   = e.risk_level === 'critical' ? '🔴'
                     : e.risk_level === 'high'     ? '🟠'
                     : e.risk_level === 'medium'   ? '🟡' : '⚪'
    const short = (e.address as string).slice(0, 8) + '…' + (e.address as string).slice(-6)
    lines.push(
      `${statusIcon}${riskIcon} <b>${htmlEscape(e.label ?? 'без назви')}</b>`,
      `   <code>${short}</code> [${((e.chain as string) ?? 'tron').toUpperCase()}]`,
    )
  }

  await reply(chatId, lines.join('\n'), {
    inline_keyboard: [[
      { text: '📊 Crypto Intel', url: `${APP_URL}/crypto-intel` },
    ]],
  })
}

// ─── /add <addr> [chain] [label] ─────────────────────────────────────────────
async function cmdAdd(chatId: number, args: string[]): Promise<void> {
  if (!args.length) {
    await reply(chatId,
      `❌ Формат: <code>/add &lt;адреса&gt; [chain] [назва]</code>\n` +
      `Приклад: <code>/add TXxx...xxx tron Garantex</code>`
    )
    return
  }

  const address     = args[0]
  const chain       = args[1] ?? 'tron'
  const label       = args.slice(2).join(' ') || address.slice(0, 12) + '…'
  const validChains = ['tron', 'eth', 'btc', 'bsc', 'sol', 'polygon']

  if (!validChains.includes(chain)) {
    await reply(chatId, `❌ Невідома мережа: <b>${chain}</b>\nДозволено: ${validChains.join(', ')}`)
    return
  }

  const { error } = await supabase.from('crypto_watchlist').insert({
    address, chain, label, status: 'active', alert_new_tx: true, risk_level: 'unknown',
  })

  if (error) {
    await reply(chatId, `❌ Помилка: ${htmlEscape(error.message)}`)
    return
  }

  await reply(chatId,
    `✅ <b>Додано в watchlist</b>\n\n` +
    `<b>Адреса:</b> <code>${htmlEscape(address)}</code>\n` +
    `<b>Мережа:</b> ${chain.toUpperCase()}\n` +
    `<b>Назва:</b> ${htmlEscape(label)}\n\n` +
    `<i>Алерт прийде при наступній транзакції</i>`
  )
}

// ─── /pause <addr> ────────────────────────────────────────────────────────────
async function cmdPause(chatId: number, addr: string): Promise<void> {
  const { error, count } = await supabase
    .from('crypto_watchlist').update({ status: 'paused' }).eq('address', addr)
  if (error || !count) { await reply(chatId, `❌ Адреса не знайдена`); return }
  await reply(chatId, `⏸ Моніторинг призупинено: <code>${htmlEscape(addr.slice(0, 14))}…</code>`)
}

// ─── /resume <addr> ───────────────────────────────────────────────────────────
async function cmdResume(chatId: number, addr: string): Promise<void> {
  const { error, count } = await supabase
    .from('crypto_watchlist').update({ status: 'active' }).eq('address', addr)
  if (error || !count) { await reply(chatId, `❌ Адреса не знайдена`); return }
  await reply(chatId, `✅ Моніторинг відновлено: <code>${htmlEscape(addr.slice(0, 14))}…</code>`)
}

// ─── /remove <addr> ───────────────────────────────────────────────────────────
async function cmdRemove(chatId: number, addr: string): Promise<void> {
  const { error, count } = await supabase
    .from('crypto_watchlist').update({ status: 'archived' }).eq('address', addr)
  if (error || !count) { await reply(chatId, `❌ Адреса не знайдена`); return }
  await reply(chatId, `🗑 Видалено з watchlist: <code>${htmlEscape(addr.slice(0, 14))}…</code>`)
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  let update: TgUpdate
  try {
    update = await req.json() as TgUpdate
  } catch {
    return NextResponse.json({ ok: true })
  }

  // ── Callback query (inline button presses) ──────────────────────────────────
  if (update.callback_query) {
    const cq     = update.callback_query
    const chatId = cq.message?.chat?.id
    const data   = cq.data ?? ''
    await answerCallbackQuery(cq.id)
    if (chatId && isAllowedChat(chatId)) {
      if (data.startsWith('pause:'))  await cmdPause(chatId,  data.slice(6))
      if (data.startsWith('resume:')) await cmdResume(chatId, data.slice(7))
    }
    return NextResponse.json({ ok: true })
  }

  // ── Regular message ─────────────────────────────────────────────────────────
  const msg = update.message
  if (!msg?.text) return NextResponse.json({ ok: true })

  const chatId = msg.chat.id
  if (!isAllowedChat(chatId)) return NextResponse.json({ ok: true })

  const parts = msg.text.trim().split(/\s+/)
  const cmd   = parts[0].split('@')[0].toLowerCase()
  const args  = parts.slice(1)

  // Fire-and-forget so Telegram gets 200 immediately, no timeout risk
  ;(async () => {
    switch (cmd) {
      case '/help':
      case '/start':       await cmdHelp(chatId);                break
      case '/whale':       await cmdWhale(chatId, args[0]);      break
      case '/whale_btc':   await cmdWhale(chatId, 'btc');        break
      case '/whale_eth':   await cmdWhale(chatId, 'eth');        break
      case '/whale_tron':  await cmdWhale(chatId, 'tron');       break
      case '/whale_sol':   await cmdWhale(chatId, 'sol');        break
      case '/whale_xrp':   await cmdWhale(chatId, 'xrp');       break
      case '/stats':       await cmdStats(chatId);               break
      case '/suspicious':  await cmdSuspicious(chatId);          break
      case '/watchlist':   await cmdWatchlist(chatId);           break
      case '/add':         await cmdAdd(chatId, args);           break
      case '/pause':       if (args[0]) await cmdPause(chatId, args[0]);  break
      case '/resume':      if (args[0]) await cmdResume(chatId, args[0]); break
      case '/remove':      if (args[0]) await cmdRemove(chatId, args[0]); break
    }
  })().catch(() => {})

  return NextResponse.json({ ok: true })
}
