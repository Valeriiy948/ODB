// POST /api/whitebit-intel/send-brief
// Запускає ранковий брифінг вручну з адмін-панелі.
// Захищено auth middleware — CRON_SECRET не потрібен.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USDT_MARKETS = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'BNB_USDT', 'XRP_USDT', 'ADA_USDT']

interface Ticker { last_price: string; change: string }

async function fetchNBURate(): Promise<number | null> {
  try {
    const r = await fetch('https://bank.gov.ua/NBUStatWeb/v1/statdirectory/exchange?valcode=usd&json', { signal: AbortSignal.timeout(5_000) })
    const d = await r.json() as Array<{ rate: number }>
    return d[0]?.rate ?? null
  } catch { return null }
}

export async function POST() {
  try {
    const [tickerRes, nbuRate] = await Promise.all([
      fetch('https://whitebit.com/api/v4/public/ticker', { signal: AbortSignal.timeout(10_000), cache: 'no-store' }),
      fetchNBURate(),
    ])
    if (!tickerRes.ok) throw new Error(`WhiteBit ${tickerRes.status}`)
    const all = await tickerRes.json() as Record<string, Ticker>

    const markets = USDT_MARKETS.filter(m => all[m]).map(m => ({
      base: m.replace('_USDT', ''),
      price: parseFloat(all[m].last_price),
      change: parseFloat(all[m].change),
    })).sort((a, b) => b.change - a.change)

    let premiumLine = ''
    if (nbuRate && all['BTC_USDT'] && all['BTC_UAH']) {
      const fair    = parseFloat(all['BTC_USDT'].last_price) * nbuRate
      const premium = ((parseFloat(all['BTC_UAH'].last_price) / fair) - 1) * 100
      const label   = premium > 3 ? '🔴 перегрів' : premium > 1 ? '🟡 підвищений попит' : premium < -1 ? '🟢 арбітраж' : '✅ норма'
      premiumLine = [
        '', '━━━━━━━━━━━━━━━━━━━', '🇺🇦 <b>UAH ІНДИКАТОРИ</b>', '━━━━━━━━━━━━━━━━━━━', '',
        `💱 Курс НБУ: <b>${nbuRate.toFixed(2)} ₴/USD</b>`,
        `📊 BTC WhiteBit: <b>${parseFloat(all['BTC_UAH'].last_price).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴</b>`,
        `📐 Справедлива: <b>${fair.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴</b>`,
        `💰 Премія: <b>${premium >= 0 ? '+' : ''}${premium.toFixed(2)}%</b> ${label}`,
      ].join('\n')
    }

    const tenHAgo = new Date(Date.now() - 10 * 60 * 60_000).toISOString()
    const { data: nightSignals } = await supabase
      .from('whitebit_signals').select('signal_type, severity, market').gte('created_at', tenHAgo)
    const signalCount = nightSignals?.length ?? 0
    const highCount   = nightSignals?.filter(s => s.severity === 'high').length ?? 0

    const now = new Date()
    const days   = ['Неділя','Понеділок','Вівторок','Середа','Четвер','Пʼятниця','Субота']
    const months = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня']
    const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`

    const em: Record<string, string> = { BTC: '₿', ETH: 'Ξ', SOL: '◎', BNB: '●', XRP: '✕', ADA: '₳' }
    const marketLines = markets.map(m => {
      const dir = m.change >= 2 ? '🟢' : m.change >= 0 ? '🟡' : m.change >= -3 ? '🟠' : '🔴'
      const fmt = m.price < 1 ? m.price.toFixed(4) : m.price.toLocaleString('en-US', { maximumFractionDigits: 2 })
      return `${em[m.base] ?? '•'} <b>${m.base}</b>  $${fmt}  ${dir} ${m.change >= 0 ? '+' : ''}${m.change.toFixed(2)}%`
    }).join('\n')

    const message = [
      `🌅 <b>РАНКОВИЙ БРИФІНГ WhiteBit</b>`,
      `📅 ${dateStr}`,
      '', '━━━━━━━━━━━━━━━━━━━', '💹 <b>РИНОК ЗАРАЗ</b>', '━━━━━━━━━━━━━━━━━━━', '',
      marketLines,
      premiumLine,
      '', '━━━━━━━━━━━━━━━━━━━', '',
      `🏆 Лідер: <b>${markets[0].base}</b> ${markets[0].change >= 0 ? '+' : ''}${markets[0].change.toFixed(2)}%`,
      `📉 Аутсайдер: <b>${markets[markets.length - 1].base}</b> ${markets[markets.length - 1].change.toFixed(2)}%`,
      '',
      signalCount > 0
        ? `🔔 Сигналів за 10 год: <b>${signalCount}</b>${highCount > 0 ? ` (HIGH: <b>${highCount}</b>)` : ''}`
        : '🔕 Значних сигналів за останні 10 год не було',
      '', '<i>WhiteBit Intelligence · ODB Platform</i>',
    ].join('\n')

    const sent = await sendTelegramMessage(message, 'HTML')
    return NextResponse.json({ ok: true, sent })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
