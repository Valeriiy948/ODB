// app/api/telegram/setup/route.ts
// Одноразовий ендпоінт для налаштування бота:
//   1. Реєструє webhook
//   2. Встановлює список команд (меню "/" в Telegram)
//   3. Встановлює кнопку меню (синя кнопка біля поля вводу)
//
// Відкрий у браузері:
//   https://odb-one.vercel.app/api/telegram/setup
//
// Захищено INTERNAL_API_KEY — передай як ?key=<INTERNAL_API_KEY>

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const TG_API  = 'https://api.telegram.org'
const APP_URL = process.env.APP_URL ?? 'https://odb-one.vercel.app'

const BOT_COMMANDS = [
  { command: 'whale',      description: '🐋 Останні 5 whale транзакцій' },
  { command: 'whale_btc',  description: '₿  Whale транзакції Bitcoin' },
  { command: 'whale_eth',  description: 'Ξ  Whale транзакції Ethereum' },
  { command: 'whale_tron', description: '⚡ Whale транзакції TRON' },
  { command: 'stats',      description: '📊 Статистика Whale Alert за 24h' },
  { command: 'suspicious', description: '🔴 Підозрілі рухи за 24h' },
  { command: 'watchlist',  description: '📋 Список відстежуваних адрес' },
  { command: 'help',       description: '🤖 Список всіх команд' },
]

async function tgPost(token: string, method: string, body: object): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(10_000),
  })
  return res.json()
}

export async function GET(req: NextRequest) {
  // Auth
  const key = req.nextUrl.searchParams.get('key') ?? ''
  const internalKey = process.env.INTERNAL_API_KEY ?? ''
  if (internalKey && key !== internalKey) {
    return NextResponse.json({ error: 'Unauthorized. Pass ?key=<INTERNAL_API_KEY>' }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN ?? ''
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 503 })
  }

  const results: Record<string, unknown> = {}

  // 1. Реєстрація webhook
  const webhookUrl = `${APP_URL}/api/telegram/webhook`
  results.setWebhook = await tgPost(token, 'setWebhook', {
    url:             webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  })

  // 2. Список команд (з'являється при натисканні "/" в чаті)
  results.setMyCommands = await tgPost(token, 'setMyCommands', {
    commands: BOT_COMMANDS,
    scope:    { type: 'all_private_chats' },
  })

  // 3. Кнопка меню — "команди" (синя кнопка біля поля вводу)
  results.setChatMenuButton = await tgPost(token, 'setChatMenuButton', {
    menu_button: { type: 'commands' },
  })

  // 4. Перевірка webhook info
  const webhookInfo = await fetch(`${TG_API}/bot${token}/getWebhookInfo`).then(r => r.json())
  results.webhookInfo = webhookInfo.result

  const allOk = (results.setWebhook as { ok: boolean }).ok &&
                (results.setMyCommands as { ok: boolean }).ok &&
                (results.setChatMenuButton as { ok: boolean }).ok

  return NextResponse.json({
    success:    allOk,
    webhook:    webhookUrl,
    commands:   BOT_COMMANDS.length,
    results,
  }, { status: allOk ? 200 : 500 })
}
