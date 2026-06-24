// app/api/cron/whitebit-brief/route.ts
// Ранковий брифінг WhiteBit — щодня о 09:00 Kyiv (07:00 UTC)
// Vercel cron або зовнішній cron-job.org
// Auth: Authorization: Bearer <CRON_SECRET>

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import { sendTelegramMessage }       from '@/lib/telegram'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USDT_MARKETS = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'BNB_USDT', 'XRP_USDT', 'ADA_USDT']

interface Ticker { last_price: string; change: string; quote_volume: string }

async function fetchNBURate(): Promise<number | null> {
  try {
    const r    = await fetch('https://bank.gov.ua/NBUStatWeb/v1/statdirectory/exchange?valcode=usd&json', { signal: AbortSignal.timeout(5_000) })
    const data = await r.json() as Array<{ rate: number }>
    return data[0]?.rate ?? null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  // Перевірка секрету
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Дані ринку + НБУ паралельно
    const [tickerRes, nbuRate] = await Promise.all([
      fetch('https://whitebit.com/api/v4/public/ticker', { signal: AbortSignal.timeout(10_000), cache: 'no-store' }),
      fetchNBURate(),
    ])

    if (!tickerRes.ok) throw new Error(`WhiteBit ${tickerRes.status}`)
    const all = await tickerRes.json() as Record<string, Ticker>

    // Збираємо дані ринку
    const markets = USDT_MARKETS
      .filter(m => all[m])
      .map(m => ({
        market: m,
        base:   m.replace('_USDT', ''),
        price:  parseFloat(all[m].last_price),
        change: parseFloat(all[m].change),
      }))
      .sort((a, b) => b.change - a.change)

    // UAH Premium
    let premiumLine = ''
    if (nbuRate && all['BTC_USDT'] && all['BTC_UAH']) {
      const btcUsdt    = parseFloat(all['BTC_USDT'].last_price)
      const btcUah     = parseFloat(all['BTC_UAH'].last_price)
      const fairPrice  = btcUsdt * nbuRate
      const premium    = ((btcUah / fairPrice) - 1) * 100
      const label      = premium > 3  ? '🔴 перегрів'
                        : premium > 1  ? '🟡 підвищений попит'
                        : premium < -1 ? '🟢 арбітражна можливість'
                        :               '✅ норма'
      premiumLine = [
        '',
        '━━━━━━━━━━━━━━━━━━━',
        '🇺🇦 <b>UAH ІНДИКАТОРИ</b>',
        '━━━━━━━━━━━━━━━━━━━',
        '',
        `💱 Курс НБУ: <b>${nbuRate.toFixed(2)} ₴/USD</b>`,
        `📊 BTC на WhiteBit: <b>${btcUah.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴</b>`,
        `📐 Справедлива ціна: <b>${fairPrice.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴</b>`,
        `💰 UAH Премія: <b>${premium >= 0 ? '+' : ''}${premium.toFixed(2)}%</b> ${label}`,
      ].join('\n')
    }

    // Сигнали за ніч (за останні 10 год)
    const tenHAgo = new Date(Date.now() - 10 * 60 * 60_000).toISOString()
    const { data: nightSignals } = await supabase
      .from('whitebit_signals')
      .select('signal_type, severity, market')
      .gte('created_at', tenHAgo)

    const signalCount = nightSignals?.length ?? 0
    const highCount   = nightSignals?.filter(s => s.severity === 'high').length ?? 0

    // Лідер/аутсайдер
    const leader   = markets[0]
    const laggard  = markets[markets.length - 1]

    // Дата по-українськи
    const now      = new Date()
    const dayNames = ['Неділя','Понеділок','Вівторок','Середа','Четвер','Пʼятниця','Субота']
    const monthNames = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня']
    const dateStr  = `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`

    // Будуємо повідомлення
    const emoji: Record<string, string> = {
      BTC: '₿', ETH: 'Ξ', SOL: '◎', BNB: '●', XRP: '✕', ADA: '₳',
    }
    const marketLines = markets.map(m => {
      const e    = emoji[m.base] ?? '•'
      const dir  = m.change >= 2 ? '🟢' : m.change >= 0 ? '🟡' : m.change >= -3 ? '🟠' : '🔴'
      const fmt  = m.price < 1 ? m.price.toFixed(4) : m.price.toLocaleString('en-US', { maximumFractionDigits: 2 })
      return `${e} <b>${m.base}</b>    $${fmt}  ${dir} ${m.change >= 0 ? '+' : ''}${m.change.toFixed(2)}%`
    }).join('\n')

    const message = [
      `🌅 <b>РАНКОВИЙ БРИФІНГ WhiteBit</b>`,
      `📅 ${dateStr}`,
      '',
      '━━━━━━━━━━━━━━━━━━━',
      '💹 <b>РИНОК ЗАРАЗ</b>',
      '━━━━━━━━━━━━━━━━━━━',
      '',
      marketLines,
      premiumLine,
      '',
      '━━━━━━━━━━━━━━━━━━━',
      '',
      `🏆 Лідер: <b>${leader.base}</b> ${leader.change >= 0 ? '+' : ''}${leader.change.toFixed(2)}%`,
      `📉 Аутсайдер: <b>${laggard.base}</b> ${laggard.change.toFixed(2)}%`,
      '',
      signalCount > 0
        ? `🔔 Сигналів за ніч: <b>${signalCount}</b>${highCount > 0 ? ` (з них HIGH: <b>${highCount}</b>)` : ''}`
        : '🔕 Значних сигналів за ніч не було',
      '',
      '<i>WhiteBit Intelligence · ODB Platform</i>',
    ].join('\n')

    const sent = await sendTelegramMessage(message, 'HTML')
    return NextResponse.json({ ok: true, sent, signal_count: signalCount })

  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
