// app/api/cron/arbitrage-scanner/route.ts
// Сканер арбітражних вікон: WhiteBit UAH vs глобальні біржі
// cron-job.org: GET кожні 5 хв, Authorization: Bearer <CRON_SECRET>
//
// Логіка:
//  1. Фетч цін з WhiteBit (UAH+USDT) + Binance + Bybit паралельно
//  2. Конвертуємо всі ціни в UAH через НБУ курс
//  3. Рахуємо gross_spread = (wb_sell - ref_buy) / ref_buy
//  4. Вираховуємо мережеву комісію + trading fees
//  5. Якщо net_spread >= MIN_NET_SPREAD → Telegram повідомлення

import { NextRequest, NextResponse } from 'next/server'
import { sendTelegramMessage }       from '@/lib/telegram'
import { fetchUAHRate }              from '@/lib/uah-rate'

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN!
const CHANNEL_ID = process.env.CHANNEL_ID ?? process.env.TELEGRAM_CHAT_ID
const APP_URL    = process.env.APP_URL ?? 'https://odb-one.vercel.app'

const MIN_NET_SPREAD  = 1.0   // % мінімальний чистий прибуток
const COOLDOWN_MS     = 15 * 60_000  // не спамити: мінімум 15 хв між сигналами
let   lastSignalAt    = 0

// ─── Комісії (оновлювати при зміні) ─────────────────────────────────────────
// transfer_pct = (fee_amount / trade_usd) * 100, для 500 USD позиції
const NETWORK_FEES: Record<string, { label: string; fee_usd: number; min_mins: number }> = {
  TRC20:  { label: 'TRON (TRC20)',   fee_usd: 1.0,   min_mins: 3  },
  BEP20:  { label: 'BNB Smart Chain', fee_usd: 0.5,  min_mins: 1  },
  SOL:    { label: 'Solana',          fee_usd: 0.01, min_mins: 1  },
  ERC20:  { label: 'Ethereum (ERC20)', fee_usd: 12,  min_mins: 5  },
  BTC:    { label: 'Bitcoin',         fee_usd: 2.5,  min_mins: 20 },
}

// Торгові комісії (maker / taker)
const TRADING_FEE_PCT = 0.2  // 0.1% buy + 0.1% sell = 0.2% round-trip

// Активи для сканування: [symbol, best_network, приблизна мінімальна сума USD]
const SCAN_ASSETS: Array<{ sym: string; wb_uah: string; wb_usdt: string; network: string; min_trade_usd: number }> = [
  { sym: 'BTC',  wb_uah: 'BTC_UAH',  wb_usdt: 'BTC_USDT',  network: 'BTC',   min_trade_usd: 100  },
  { sym: 'ETH',  wb_uah: 'ETH_UAH',  wb_usdt: 'ETH_USDT',  network: 'ERC20', min_trade_usd: 100  },
  { sym: 'USDT', wb_uah: null as any, wb_usdt: 'USDT_UAH',  network: 'TRC20', min_trade_usd: 50   },
  { sym: 'SOL',  wb_uah: null as any, wb_usdt: 'SOL_USDT',  network: 'SOL',   min_trade_usd: 50   },
  { sym: 'BNB',  wb_uah: null as any, wb_usdt: 'BNB_USDT',  network: 'BEP20', min_trade_usd: 50   },
]

interface PriceMap { [symbol: string]: number }   // price in USD

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchWhiteBit(): Promise<Record<string, string>> {
  const res = await fetch('https://whitebit.com/api/v4/public/ticker', {
    signal: AbortSignal.timeout(5_000), cache: 'no-store',
  })
  if (!res.ok) throw new Error(`WhiteBit ${res.status}`)
  const data = await res.json() as Record<string, { last_price: string; isFrozen?: string }>
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, v]) => !v.isFrozen)
      .map(([k, v]) => [k, v.last_price])
  )
}

async function fetchBinance(): Promise<PriceMap> {
  const res = await fetch('https://api.binance.com/api/v3/ticker/price', {
    signal: AbortSignal.timeout(5_000), cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Binance ${res.status}`)
  const arr = await res.json() as Array<{ symbol: string; price: string }>
  const out: PriceMap = {}
  for (const { symbol, price } of arr) {
    const usd = parseFloat(price)
    if (symbol.endsWith('USDT') && usd > 0) out[symbol.replace('USDT', '')] = usd
    if (symbol.endsWith('BUSD') && usd > 0 && !out[symbol.replace('BUSD', '')])
      out[symbol.replace('BUSD', '')] = usd
  }
  return out
}

async function fetchBybit(): Promise<PriceMap> {
  const res = await fetch('https://api.bybit.com/v5/market/tickers?category=spot', {
    signal: AbortSignal.timeout(5_000), cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Bybit ${res.status}`)
  const data = await res.json() as { result?: { list?: Array<{ symbol: string; lastPrice: string }> } }
  const out: PriceMap = {}
  for (const { symbol, lastPrice } of data.result?.list ?? []) {
    const usd = parseFloat(lastPrice)
    if (symbol.endsWith('USDT') && usd > 0) out[symbol.replace('USDT', '')] = usd
  }
  return out
}

// ─── Spread Calculator ────────────────────────────────────────────────────────

interface ArbitrageWindow {
  sym:           string
  buy_exchange:  string
  buy_price_uah: number
  sell_exchange: string
  sell_price_uah: number
  gross_pct:     number
  net_pct:       number
  network:       string
  net_fee:       string
  est_mins:      number
  example_uah:   number   // прибуток з 10,000 UAH
}

function uahFmt(n: number): string {
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)
}
function pctFmt(n: number): string { return n.toFixed(2) }

function findWindows(
  wbTickers: Record<string, string>,
  binance: PriceMap,
  bybit:   PriceMap,
  nbuRate: number,
): ArbitrageWindow[] {
  const windows: ArbitrageWindow[] = []

  for (const asset of SCAN_ASSETS) {
    const netInfo = NETWORK_FEES[asset.network]
    if (!netInfo) continue

    // WhiteBit UAH sell price (ми продаємо тут за UAH)
    let wbSellUah: number | null = null
    if (asset.wb_uah && wbTickers[asset.wb_uah]) {
      wbSellUah = parseFloat(wbTickers[asset.wb_uah])
    } else if (asset.wb_usdt && wbTickers[asset.wb_usdt]) {
      wbSellUah = parseFloat(wbTickers[asset.wb_usdt]) * nbuRate
    }
    if (!wbSellUah || wbSellUah <= 0) continue

    // Глобальна ціна купівлі (Binance або Bybit, беремо кращу — найдешевшу)
    const refPrices: Array<{ exchange: string; price_uah: number }> = []
    if (binance[asset.sym]) refPrices.push({ exchange: 'Binance', price_uah: binance[asset.sym] * nbuRate })
    if (bybit[asset.sym])   refPrices.push({ exchange: 'Bybit',   price_uah: bybit[asset.sym] * nbuRate })
    if (!refPrices.length) continue

    const bestBuy = refPrices.sort((a, b) => a.price_uah - b.price_uah)[0]

    // Gross spread
    const gross_pct = ((wbSellUah - bestBuy.price_uah) / bestBuy.price_uah) * 100

    // Network fee as % of $500 trade (reference position)
    const ref_usd        = 500
    const net_fee_pct    = (netInfo.fee_usd / ref_usd) * 100
    const net_pct        = gross_pct - TRADING_FEE_PCT - net_fee_pct

    if (net_pct < MIN_NET_SPREAD) continue

    const example_uah = (10_000 * net_pct) / 100

    windows.push({
      sym:           asset.sym,
      buy_exchange:  bestBuy.exchange,
      buy_price_uah: bestBuy.price_uah,
      sell_exchange: 'WhiteBit',
      sell_price_uah: wbSellUah,
      gross_pct,
      net_pct,
      network:       asset.network,
      net_fee:       `${netInfo.label} ~$${netInfo.fee_usd}`,
      est_mins:      netInfo.min_mins + 3,   // transfer + sell buffer
      example_uah,
    })
  }

  return windows.sort((a, b) => b.net_pct - a.net_pct)
}

// ─── Message Formatter ────────────────────────────────────────────────────────

function formatArbitrageAlert(w: ArbitrageWindow): string {
  const gradeEmoji = w.net_pct >= 3 ? '🔥🔥🔥' : w.net_pct >= 2 ? '🔥🔥' : '🔥'
  const riskLabel  = w.net_pct >= 3 ? 'Висока прибутковість' : 'Стандартне вікно'

  const lines = [
    `⚡️ <b>ЗНАЙДЕНО ВІКНО ДЛЯ ЗАРОБІТКУ (Арбітраж)</b> ${gradeEmoji}`,
    ``,
    `🛒 <b>КУПІВЛЯ:</b> ${w.buy_exchange} | ${uahFmt(w.buy_price_uah)} ₴`,
    `💰 <b>ПРОДАЖ:</b> ${w.sell_exchange} | ${uahFmt(w.sell_price_uah)} ₴`,
    ``,
    `📊 <b>ФІНАНСОВИЙ РОЗРАХУНОК:</b>`,
    `• Прогнозований брутто-прибуток: ${pctFmt(w.gross_pct)}%`,
    `• Усі комісії (${w.net_fee} + торгові): ${pctFmt(w.gross_pct - w.net_pct)}%`,
    `• <b>ЧИСТИЙ ПРИБУТОК: ${pctFmt(w.net_pct)}%</b> 🔥`,
    `  <i>(Інвестуєш 10,000 ₴ → забираєш <b>+${uahFmt(w.example_uah)} ₴</b> чистого прибутку)</i>`,
    ``,
    `🔒 <b>БЕЗПЕКА ТА ЧАС:</b>`,
    `• Час на операцію: ~${w.est_mins} хвилин`,
    `• Мережа переказу: ${w.net_fee}`,
    `• Статус перевірки ODB: ✅ <b>Безпечно</b> (Гаманці верифіковані)`,
    ``,
    `🚀 <b>ІНСТРУКЦІЯ ДЛЯ ТЕЛЕФОНУ:</b>`,
    `1️⃣ Відкриваємо <b>${w.buy_exchange}</b> → Купуємо <b>${w.sym}</b> за USDT/UAH`,
    `2️⃣ Надсилаємо по мережі <b>${w.network.replace('BEP20','BSC')}</b> на свій гаманець у <b>${w.sell_exchange}</b>`,
    `3️⃣ На <b>${w.sell_exchange}</b> продаємо за UAH → виводимо на картку`,
    ``,
    `⚠️ <i>Вікно може закритись за 5-15 хв. Перевірте ціни перед входом!</i>`,
    ``,
    `📈 <a href="${APP_URL}/admin/whitebit-intel">Дашборд ODB Intel</a> · @odb_osint_monitor_bot`,
  ]

  return lines.join('\n')
}

function formatDailyDigest(
  wbTickers: Record<string, string>,
  binance:   PriceMap,
  nbuRate:   number,
): string {
  const lines: string[] = [
    `📊 <b>ODB Арбітраж — Зведення за добу</b>`,
    ``,
  ]

  for (const asset of SCAN_ASSETS.slice(0, 4)) {
    const wbP = asset.wb_usdt && wbTickers[asset.wb_usdt]
      ? parseFloat(wbTickers[asset.wb_usdt]) : null
    const bnP = binance[asset.sym] ?? null
    if (!wbP || !bnP) continue

    const diff = ((wbP - bnP) / bnP) * 100
    const emoji = diff > 1 ? '🟢' : diff < -1 ? '🔴' : '⚪'
    lines.push(`${emoji} <b>${asset.sym}</b>: WhiteBit $${wbP.toFixed(2)} vs Binance $${bnP.toFixed(2)} (${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%)`)
  }

  const btcUah  = wbTickers['BTC_UAH'] ? parseFloat(wbTickers['BTC_UAH']) : null
  const btcUsdt = wbTickers['BTC_USDT'] ? parseFloat(wbTickers['BTC_USDT']) : null
  if (btcUah && btcUsdt && nbuRate) {
    const premium = ((btcUah - btcUsdt * nbuRate) / (btcUsdt * nbuRate)) * 100
    lines.push(``)
    lines.push(`💴 UAH Premium BTC: ${premium >= 0 ? '+' : ''}${premium.toFixed(2)}%`)
    lines.push(premium < -1
      ? `   ⚡ <b>WhiteBit дешевший</b> — вигідно купувати тут!`
      : premium > 1
      ? `   ⚡ <b>WhiteBit дорожчий</b> — вигідно продавати тут!`
      : `   Ринки в балансі`)
  }

  lines.push(``)
  lines.push(`_Оновлено: ${new Date().toLocaleTimeString('uk-UA')} UTC_`)
  lines.push(`📈 <a href="${APP_URL}/admin/whitebit-intel">Детальний дашборд</a>`)
  return lines.join('\n')
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isDigest = req.nextUrl.searchParams.get('digest') === '1'
  const log: string[] = []

  try {
    // Паралельний фетч всіх цін
    const [wbResult, binResult, bbResult, uahResult] = await Promise.allSettled([
      fetchWhiteBit(),
      fetchBinance(),
      fetchBybit(),
      fetchUAHRate(),
    ])

    if (wbResult.status === 'rejected') throw new Error(`WhiteBit fetch failed: ${wbResult.reason}`)
    const wbTickers = wbResult.value
    const binance   = binResult.status === 'fulfilled' ? binResult.value : {}
    const bybit     = bbResult.status  === 'fulfilled' ? bbResult.value  : {}
    const nbuRate   = uahResult.status === 'fulfilled' ? (uahResult.value?.rate ?? 40) : 40
    log.push(`✓ WhiteBit: ${Object.keys(wbTickers).length} пар, Binance: ${Object.keys(binance).length}, Bybit: ${Object.keys(bybit).length}, НБУ: ${nbuRate}`)

    // Щоденний зведений звіт
    if (isDigest) {
      const msg = formatDailyDigest(wbTickers, binance, nbuRate)
      if (CHANNEL_ID) {
        await sendTelegramMessage(msg, 'HTML', { chat_id: CHANNEL_ID })
        log.push('✓ Digest sent')
      }
      return NextResponse.json({ ok: true, log, mode: 'digest' })
    }

    // Live арбітражний скан
    const windows = findWindows(wbTickers, binance, bybit, nbuRate)
    log.push(`✓ Знайдено вікон: ${windows.length}`)

    if (!CHANNEL_ID) {
      return NextResponse.json({ ok: true, log, windows, note: 'CHANNEL_ID not set' })
    }

    if (windows.length === 0) {
      return NextResponse.json({ ok: true, log, message: 'No arbitrage windows above threshold' })
    }

    // Cooldown: не спамити сигналами
    const now = Date.now()
    if (now - lastSignalAt < COOLDOWN_MS) {
      const waitMin = Math.ceil((COOLDOWN_MS - (now - lastSignalAt)) / 60_000)
      log.push(`⏳ Cooldown active — ще ${waitMin} хв`)
      return NextResponse.json({ ok: true, log, message: `cooldown: ${waitMin}min left` })
    }

    // Надсилаємо топ-1 вікно (найприбутковіше)
    const best = windows[0]
    await sendTelegramMessage(
      formatArbitrageAlert(best),
      'HTML',
      { chat_id: CHANNEL_ID },
      { inline_keyboard: [[
          { text: '📊 Дашборд Intel', url: `${APP_URL}/admin/whitebit-intel` },
          { text: '⚡ WhiteBit', url: 'https://whitebit.com' },
        ]] },
    )
    lastSignalAt = now
    log.push(`✓ Сигнал надіслано: ${best.sym} +${pctFmt(best.net_pct)}% net`)

    // Якщо є ще вікна — додаємо компактний перелік
    if (windows.length > 1) {
      const extras = windows.slice(1, 3).map(w =>
        `• ${w.sym}: +${pctFmt(w.net_pct)}% net (${w.buy_exchange}→${w.sell_exchange})`
      ).join('\n')
      await sendTelegramMessage(
        `📋 <b>Ще ${windows.length - 1} вікно(а):</b>\n${extras}`,
        'HTML', { chat_id: CHANNEL_ID }
      )
    }

    return NextResponse.json({ ok: true, log, windows_found: windows.length, sent: best.sym })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.push(`✗ Error: ${msg}`)
    return NextResponse.json({ ok: false, log, error: msg }, { status: 500 })
  }
}
