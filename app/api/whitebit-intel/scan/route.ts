// app/api/whitebit-intel/scan/route.ts
// WhiteBit Intelligence Engine — моніторинг ринкових аномалій
// Сигнали: стрибок обсягу, різкий рух ціни, UAH аномалії

import { NextResponse }  from 'next/server'
import { createClient }  from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WHITEBIT_API = 'https://whitebit.com/api/v4/public'

// Ринки які відстежуємо (найліквідніші + UAH пари)
const WATCH_MARKETS = [
  'BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'BNB_USDT', 'XRP_USDT',
  'BTC_UAH',  'ETH_UAH',
]

// Пороги для сигналів
const THRESHOLDS = {
  volume_spike_multiplier: 2.5,   // обсяг в 2.5x вище середнього = сигнал
  price_move_pct:          2.0,   // ±2% за 5 хв = сигнал
  uah_volume_spike:        1.8,   // UAH пари — нижчий поріг
  min_volume_usd:          50_000, // мінімальний обсяг щоб не реагувати на мікро-ринки
}

interface Ticker {
  last_price:   string
  base_volume:  string
  quote_volume: string
  change:       string
}

interface Snapshot {
  market:      string
  last_price:  number
  base_volume: number
  quote_volume:number
  change_pct:  number
  captured_at: string
}

// ─── GET /api/whitebit-intel/scan ────────────────────────────────────────────
export async function GET() {
  const startedAt = Date.now()
  const signals: object[] = []
  const errors:  string[] = []
  let   snapshots_saved = 0

  try {
    // 1. Отримуємо поточні ціни з WhiteBit
    const res = await fetch(`${WHITEBIT_API}/ticker`, {
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`WhiteBit API error: ${res.status}`)
    const allTickers = await res.json() as Record<string, Ticker>

    // 2. Отримуємо останні знімки з Supabase (за останні 30 хв)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: recentSnaps } = await supabase
      .from('whitebit_snapshots')
      .select('*')
      .in('market', WATCH_MARKETS)
      .gte('captured_at', thirtyMinAgo)
      .order('captured_at', { ascending: false })

    // Групуємо попередні знімки по ринку
    const prevByMarket: Record<string, Snapshot[]> = {}
    for (const snap of recentSnaps || []) {
      if (!prevByMarket[snap.market]) prevByMarket[snap.market] = []
      prevByMarket[snap.market].push(snap as Snapshot)
    }

    // 3. Аналізуємо кожен ринок
    const newSnaps: object[] = []
    for (const market of WATCH_MARKETS) {
      const ticker = allTickers[market]
      if (!ticker) continue

      const price      = parseFloat(ticker.last_price)
      const baseVol    = parseFloat(ticker.base_volume)
      const quoteVol   = parseFloat(ticker.quote_volume)
      const changePct  = parseFloat(ticker.change)

      // Зберігаємо поточний знімок
      newSnaps.push({ market, last_price: price, base_volume: baseVol, quote_volume: quoteVol, change_pct: changePct })

      const isUAH = market.endsWith('_UAH')
      const prevSnaps = prevByMarket[market] || []

      // ── Сигнал 1: Різкий рух ціни (порівняно з 5 хв тому) ──────────────
      const fiveMinAgo = prevSnaps.find(s =>
        Date.now() - new Date(s.captured_at).getTime() >= 4 * 60 * 1000
      )
      if (fiveMinAgo && fiveMinAgo.last_price > 0) {
        const priceChangePct = ((price - fiveMinAgo.last_price) / fiveMinAgo.last_price) * 100
        const threshold = THRESHOLDS.price_move_pct
        if (Math.abs(priceChangePct) >= threshold) {
          const isUp = priceChangePct > 0
          signals.push({
            market,
            signal_type: 'price_move',
            emoji: isUp ? '🚀' : '📉',
            severity: Math.abs(priceChangePct) >= 5 ? 'high' : 'medium',
            message: `${isUp ? '🚀' : '📉'} <b>${market}</b>: різкий ${isUp ? 'ріст' : 'падіння'} на <b>${priceChangePct > 0 ? '+' : ''}${priceChangePct.toFixed(2)}%</b> за 5 хв\nПоточна ціна: ${formatPrice(price, isUAH)}\n\n<i>WhiteBit Intelligence · ODB Platform</i>`,
            change_pct: priceChangePct,
            price,
          })
        }
      }

      // ── Сигнал 2: Стрибок обсягу (порівняно зі середнім) ───────────────
      if (prevSnaps.length >= 3) {
        // Середній обсяг за останні 30 хв (на інтервал)
        const avgVol = prevSnaps.reduce((s, p) => s + p.base_volume, 0) / prevSnaps.length
        const volMultiplier = isUAH ? THRESHOLDS.uah_volume_spike : THRESHOLDS.volume_spike_multiplier

        // Конвертуємо мінімальний обсяг в базову валюту (приблизно)
        const minVol = isUAH ? 0.1 : THRESHOLDS.min_volume_usd / price

        if (avgVol > minVol && baseVol > avgVol * volMultiplier) {
          const multiplier = (baseVol / avgVol).toFixed(1)
          signals.push({
            market,
            signal_type: 'volume_spike',
            emoji: '🔥',
            severity: parseFloat(multiplier) >= 4 ? 'high' : 'medium',
            message: `🔥 <b>${market}</b>: стрибок обсягу в <b>${multiplier}x</b> вище середнього!\nОбсяг 24h: ${formatVolume(baseVol, market)}\n\n<i>WhiteBit Intelligence · ODB Platform</i>`,
            change_pct: ((baseVol / avgVol - 1) * 100),
            price,
            volume_usd: quoteVol,
          })
        }
      }

      // ── Сигнал 3: UAH аномалія (великий рух на гривневих парах) ─────────
      if (isUAH && Math.abs(changePct) >= 3) {
        signals.push({
          market,
          signal_type: 'uah_anomaly',
          emoji: '🇺🇦',
          severity: Math.abs(changePct) >= 5 ? 'high' : 'medium',
          message: `🇺🇦 <b>UAH пара ${market}</b>: зміна за 24h: <b>${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%</b>\nПоточна ціна: ${formatPrice(price, true)}\nОбсяг: ${formatVolume(baseVol, market)}\n\n<i>WhiteBit Intelligence · ODB Platform</i>`,
          change_pct: changePct,
          price,
          volume_usd: quoteVol,
        })
      }
    }

    // 4. Зберігаємо нові знімки
    if (newSnaps.length) {
      const { error } = await supabase.from('whitebit_snapshots').insert(newSnaps)
      if (!error) snapshots_saved = newSnaps.length
    }

    // 5. Зберігаємо сигнали і надсилаємо в Telegram
    let tg_sent = 0
    for (const signal of signals as Array<Record<string, unknown>>) {
      // Перевіряємо чи не надсилали такий самий сигнал за останні 30 хв
      const { data: existing } = await supabase
        .from('whitebit_signals')
        .select('id')
        .eq('market', signal.market)
        .eq('signal_type', signal.signal_type)
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .limit(1)

      if (existing?.length) continue // вже надсилали нещодавно

      const { error } = await supabase.from('whitebit_signals').insert({
        market:      signal.market,
        signal_type: signal.signal_type,
        emoji:       signal.emoji,
        message:     signal.message,
        severity:    signal.severity,
        price:       signal.price,
        change_pct:  signal.change_pct,
        volume_usd:  signal.volume_usd,
        sent_to_tg:  false,
      })

      if (!error && signal.severity !== 'low') {
        const sent = await sendTelegramMessage(signal.message as string, 'HTML')
        if (sent) {
          await supabase
            .from('whitebit_signals')
            .update({ sent_to_tg: true })
            .eq('market', signal.market as string)
            .eq('signal_type', signal.signal_type as string)
            .order('created_at', { ascending: false })
            .limit(1)
          tg_sent++
        }
      }
    }

    return NextResponse.json({
      ok: true,
      elapsed_ms:     Date.now() - startedAt,
      markets_scanned: WATCH_MARKETS.length,
      snapshots_saved,
      signals_found:  signals.length,
      tg_sent,
      errors,
    })

  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatPrice(price: number, isUAH: boolean): string {
  if (isUAH) return `${price.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} ₴`
  return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

function formatVolume(vol: number, market: string): string {
  const base = market.split('_')[0]
  if (vol >= 1000) return `${(vol / 1000).toFixed(2)}K ${base}`
  return `${vol.toFixed(4)} ${base}`
}
