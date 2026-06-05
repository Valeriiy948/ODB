// app/api/telegram/webhook/route.ts
// Telegram Bot webhook — handles incoming commands from @odb_osint_monitor_bot
//
// Commands:
//   /status          — кількість адрес на моніторингу
//   /watchlist       — список активних цілей
//   /add <addr> [chain] [label] — додати адресу (default chain: tron)
//   /pause <addr>    — призупинити моніторинг
//   /resume <addr>   — відновити моніторинг
//   /remove <addr>   — видалити з watchlist
//
// Register webhook once:
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://odb-one.vercel.app/api/telegram/webhook"

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import { sendTelegramMessage, answerCallbackQuery } from '@/lib/telegram'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Only allow messages from the configured chat
function isAllowedChat(chatId: number): boolean {
  const allowed = process.env.TELEGRAM_CHAT_ID || ''
  return String(chatId) === String(allowed)
}

async function reply(chatId: number, text: string): Promise<void> {
  await sendTelegramMessage(text, 'HTML', {
    token:   process.env.TELEGRAM_BOT_TOKEN || '',
    chat_id: String(chatId),
  })
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function cmdStatus(chatId: number): Promise<void> {
  const { data, error } = await supabase
    .from('crypto_watchlist')
    .select('status', { count: 'exact' })

  if (error) { await reply(chatId, '❌ Помилка БД'); return }

  const rows   = data || []
  const active = rows.filter(r => r.status === 'active').length
  const paused = rows.filter(r => r.status === 'paused').length
  const total  = rows.length

  await reply(chatId,
    `📊 <b>ODB Watchlist — статус</b>\n\n` +
    `✅ Активних: <b>${active}</b>\n` +
    `⏸ Призупинено: <b>${paused}</b>\n` +
    `📁 Всього: <b>${total}</b>\n\n` +
    `<i>Моніторинг кожні 15 хв</i>`
  )
}

async function cmdWatchlist(chatId: number): Promise<void> {
  const { data, error } = await supabase
    .from('crypto_watchlist')
    .select('address, chain, label, risk_level, status')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error || !data?.length) {
    await reply(chatId, '📭 Watchlist порожній'); return
  }

  const lines = [`📋 <b>Watchlist (${data.length})</b>\n`]
  for (const e of data) {
    const statusIcon = e.status === 'active' ? '✅' : '⏸'
    const riskIcon   = e.risk_level === 'critical' ? '🔴'
                     : e.risk_level === 'high'     ? '🟠'
                     : e.risk_level === 'medium'   ? '🟡' : '⚪'
    const short = e.address.slice(0, 8) + '…' + e.address.slice(-6)
    lines.push(`${statusIcon}${riskIcon} <b>${e.label || 'без назви'}</b>`)
    lines.push(`   <code>${short}</code> [${(e.chain || 'tron').toUpperCase()}]`)
  }

  await reply(chatId, lines.join('\n'))
}

async function cmdAdd(chatId: number, args: string[]): Promise<void> {
  if (!args.length) {
    await reply(chatId,
      '❌ Формат: <code>/add &lt;адреса&gt; [chain] [назва]</code>\n' +
      'Приклад: <code>/add TXxx...xxx tron Garantex</code>'
    ); return
  }

  const address = args[0]
  const chain   = args[1] || 'tron'
  const label   = args.slice(2).join(' ') || address.slice(0, 12) + '…'

  const validChains = ['tron', 'eth', 'btc', 'ton', 'bsc', 'polygon']
  if (!validChains.includes(chain)) {
    await reply(chatId, `❌ Невідома мережа: ${chain}\nДозволено: ${validChains.join(', ')}`); return
  }

  const { error } = await supabase.from('crypto_watchlist').insert({
    address,
    chain,
    label,
    status:       'active',
    alert_new_tx: true,
    risk_level:   'unknown',
  })

  if (error) {
    await reply(chatId, `❌ Помилка: ${error.message}`); return
  }

  await reply(chatId,
    `✅ <b>Додано в watchlist</b>\n\n` +
    `<b>Адреса:</b> <code>${address}</code>\n` +
    `<b>Мережа:</b> ${chain.toUpperCase()}\n` +
    `<b>Назва:</b> ${label}\n\n` +
    `<i>Перший алерт прийде при наступній транзакції</i>`
  )
}

async function cmdPause(chatId: number, args: string[]): Promise<void> {
  if (!args.length) { await reply(chatId, '❌ Вкажи адресу: /pause <адреса>'); return }
  const { error, count } = await supabase
    .from('crypto_watchlist')
    .update({ status: 'paused' })
    .eq('address', args[0])
  if (error || !count) { await reply(chatId, '❌ Адреса не знайдена'); return }
  await reply(chatId, `⏸ Моніторинг призупинено для <code>${args[0].slice(0, 12)}…</code>`)
}

async function cmdResume(chatId: number, args: string[]): Promise<void> {
  if (!args.length) { await reply(chatId, '❌ Вкажи адресу: /resume <адреса>'); return }
  const { error, count } = await supabase
    .from('crypto_watchlist')
    .update({ status: 'active' })
    .eq('address', args[0])
  if (error || !count) { await reply(chatId, '❌ Адреса не знайдена'); return }
  await reply(chatId, `✅ Моніторинг відновлено для <code>${args[0].slice(0, 12)}…</code>`)
}

async function cmdRemove(chatId: number, args: string[]): Promise<void> {
  if (!args.length) { await reply(chatId, '❌ Вкажи адресу: /remove <адреса>'); return }
  const { error, count } = await supabase
    .from('crypto_watchlist')
    .update({ status: 'archived' })
    .eq('address', args[0])
  if (error || !count) { await reply(chatId, '❌ Адреса не знайдена'); return }
  await reply(chatId, `🗑 Видалено: <code>${args[0].slice(0, 12)}…</code>`)
}

async function cmdHelp(chatId: number): Promise<void> {
  await reply(chatId,
    `🤖 <b>ODB OSINT Monitor — команди</b>\n\n` +
    `/status — статус моніторингу\n` +
    `/watchlist — список цілей\n` +
    `/add &lt;addr&gt; [chain] [назва] — додати адресу\n` +
    `/pause &lt;addr&gt; — призупинити\n` +
    `/resume &lt;addr&gt; — відновити\n` +
    `/remove &lt;addr&gt; — видалити\n\n` +
    `<i>Підтримувані мережі: tron, eth, btc, ton, bsc, polygon</i>`
  )
}

// ─── Main POST handler ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // ── Handle callback queries (inline button presses) ──────────────────────
    if (body.callback_query) {
      const cq     = body.callback_query
      const chatId = cq.message?.chat?.id
      const data   = cq.data as string || ''

      await answerCallbackQuery(cq.id)

      if (chatId && isAllowedChat(chatId)) {
        if (data.startsWith('pause:')) {
          await cmdPause(chatId, [data.replace('pause:', '')])
        } else if (data.startsWith('resume:')) {
          await cmdResume(chatId, [data.replace('resume:', '')])
        }
      }
      return NextResponse.json({ ok: true })
    }

    // ── Handle regular messages ───────────────────────────────────────────────
    const message = body.message
    if (!message?.text) return NextResponse.json({ ok: true })

    const chatId = message.chat?.id as number
    if (!isAllowedChat(chatId)) return NextResponse.json({ ok: true })

    const text  = (message.text as string).trim()
    const parts = text.split(/\s+/)
    const cmd   = parts[0].split('@')[0].toLowerCase() // remove @botname suffix
    const args  = parts.slice(1)

    switch (cmd) {
      case '/status':    await cmdStatus(chatId);         break
      case '/watchlist': await cmdWatchlist(chatId);      break
      case '/add':       await cmdAdd(chatId, args);      break
      case '/pause':     await cmdPause(chatId, args);    break
      case '/resume':    await cmdResume(chatId, args);   break
      case '/remove':    await cmdRemove(chatId, args);   break
      case '/start':
      case '/help':      await cmdHelp(chatId);           break
      default: break
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[ODB/Webhook]', err.message)
    return NextResponse.json({ ok: true }) // always 200 to Telegram
  }
}
