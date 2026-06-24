import { NextResponse }         from 'next/server'
import { createClient }         from '@supabase/supabase-js'
import { sendTelegramMessage }  from '@/lib/telegram'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USDT_MARKETS = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'BNB_USDT', 'XRP_USDT', 'ADA_USDT']
const UAH_MARKETS  = ['BTC_UAH', 'ETH_UAH', 'ADA_UAH', 'LTC_UAH', 'NEAR_UAH', 'SHIB_UAH']
const WATCH_MARKETS = [...USDT_MARKETS, ...UAH_MARKETS]

const T = {
  volume_spike:  2.5,
  price_move:    2.0,
  uah_anomaly:   3.0,
  uah_premium:   1.5,   // % відхилення від НБУ курсу
  min_vol_usd:   50_000,
}

interface Ticker  { last_price: string; base_volume: string; quote_volume: string; change: string }
interface Snapshot { market: string; last_price: number; base_volume: number; change_pct: number; captured_at: string }
interface Mover   { market: string; change: number; price: number }

async function fetchNBURate(): Promise<number | null> {
  try {
    const res  = await fetch('https://bank.gov.ua/NBUStatWeb/v1/statdirectory/exchange?valcode=usd&json', {
      signal: AbortSignal.timeout(5_000), cache: 'no-store',
    })
    const data = await res.json() as Array<{ rate: number }>
    return data[0]?.rate ?? null
  } catch { return null }
}

export async function GET() {
  const t0      = Date.now()
  const signals: object[] = []
  let snapshots_saved = 0

  try {
    const [tickerRes, nbuRate] = await Promise.all([
      fetch('https://whitebit.com/api/v4/public/ticker', { signal: AbortSignal.timeout(10_000), cache: 'no-store' }),
      fetchNBURate(),
    ])
    if (!tickerRes.ok) throw new Error(`WhiteBit ${tickerRes.status}`)
    const all = await tickerRes.json() as Record<string, Ticker>

    // Останні знімки (30 хв)
    const ago30 = new Date(Date.now() - 30 * 60_000).toISOString()
    const { data: recentSnaps } = await supabase
      .from('whitebit_snapshots').select('*')
      .in('market', WATCH_MARKETS).gte('captured_at', ago30)
      .order('captured_at', { ascending: false })

    const prevBy: Record<string, Snapshot[]> = {}
    for (const s of recentSnaps || []) {
      if (!prevBy[s.market]) prevBy[s.market] = []
      prevBy[s.market].push(s as Snapshot)
    }

    // Відносна сила USDT ринків (від кращого до гіршого за 24h)
    const movers: Mover[] = USDT_MARKETS
      .filter(m => all[m])
      .map(m => ({ market: m, change: parseFloat(all[m].change), price: parseFloat(all[m].last_price) }))
      .sort((a, b) => b.change - a.change)

    const strongest = movers[0]
    const weakest   = movers[movers.length - 1]

    // Міні-гітмапа для Telegram
    const heatmap = movers.map(m => {
      const e = m.change >= 3 ? '🟢' : m.change >= 0 ? '🟡' : m.change >= -3 ? '🟠' : '🔴'
      return `${e} ${m.market.replace('_USDT', '')} ${m.change >= 0 ? '+' : ''}${m.change.toFixed(1)}%`
    }).join('\n')

    // ─── Аналіз кожного ринку ──────────────────────────────────────────────
    const newSnaps: object[] = []

    for (const market of WATCH_MARKETS) {
      const tick = all[market]
      if (!tick) continue

      const price     = parseFloat(tick.last_price)
      const baseVol   = parseFloat(tick.base_volume)
      const quoteVol  = parseFloat(tick.quote_volume)
      const changePct = parseFloat(tick.change)
      const isUAH     = market.endsWith('_UAH')

      newSnaps.push({ market, last_price: price, base_volume: baseVol, quote_volume: quoteVol, change_pct: changePct })

      const prev = prevBy[market] || []

      // Сигнал 1: Різкий рух ціни за 5 хв
      const snap5m = prev.find(s => Date.now() - new Date(s.captured_at).getTime() >= 4 * 60_000)
      if (snap5m && snap5m.last_price > 0) {
        const delta = ((price - snap5m.last_price) / snap5m.last_price) * 100
        if (Math.abs(delta) >= T.price_move) {
          const isUp   = delta > 0
          const base   = market.replace(/_USDT|_UAH/, '')
          const refChg = movers.find(m => m.market === `${base}_USDT`)?.change
          const ctx    = refChg !== undefined && !isUAH
            ? `\n📊 Найсильніший: <b>${strongest.market.replace('_USDT', '')}</b> ${strongest.change >= 0 ? '+' : ''}${strongest.change.toFixed(2)}% · Найслабший: <b>${weakest.market.replace('_USDT', '')}</b> ${weakest.change.toFixed(2)}%`
            : ''
          signals.push({
            market, signal_type: 'price_move',
            emoji: isUp ? '🚀' : '📉',
            severity: Math.abs(delta) >= 5 ? 'high' : 'medium',
            message: `${isUp ? '🚀' : '📉'} <b>${market}</b> — різкий ${isUp ? 'ріст' : 'падіння'} за 5 хв\n💹 <b>${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%</b>  Ціна: ${fmt(price, isUAH)}${ctx}\n\n<b>Ринок зараз:</b>\n${heatmap}\n\n<i>WhiteBit Intelligence · ODB Platform</i>`,
            change_pct: delta, price,
          })
        }
      }

      // Сигнал 2: Стрибок обсягу
      if (prev.length >= 3) {
        const avgVol = prev.reduce((s, p) => s + p.base_volume, 0) / prev.length
        const mult   = isUAH ? 1.8 : T.volume_spike
        const minVol = isUAH ? 0.1 : T.min_vol_usd / price
        if (avgVol > minVol && baseVol > avgVol * mult) {
          const mx = (baseVol / avgVol).toFixed(1)
          signals.push({
            market, signal_type: 'volume_spike',
            emoji: '🔥', severity: parseFloat(mx) >= 4 ? 'high' : 'medium',
            message: `🔥 <b>${market}</b> — стрибок обсягу\n📦 <b>${mx}x</b> вище середнього за 30 хв\nОбсяг: ${fmtVol(baseVol, market)} · Ціна: ${fmt(price, isUAH)}\n\n<b>Ринок зараз:</b>\n${heatmap}\n\n<i>WhiteBit Intelligence · ODB Platform</i>`,
            change_pct: (baseVol / avgVol - 1) * 100, price, volume_usd: quoteVol,
          })
        }
      }

      // Сигнал 3: UAH аномалія (порівняння з USDT аналогом)
      if (isUAH && Math.abs(changePct) >= T.uah_anomaly) {
        const base       = market.replace('_UAH', '')
        const usdtChange = all[`${base}_USDT`] ? parseFloat(all[`${base}_USDT`].change) : null
        const spread     = usdtChange !== null ? changePct - usdtChange : null
        const spreadLine = spread !== null
          ? `\n🔀 <b>${base}_USDT</b> за 24h: ${usdtChange! >= 0 ? '+' : ''}${usdtChange!.toFixed(2)}% → ${Math.abs(spread) > 1.5 ? `⚠️ UAH відхилення <b>${spread >= 0 ? '+' : ''}${spread.toFixed(2)}%</b>` : 'в межах норми'}`
          : ''
        signals.push({
          market, signal_type: 'uah_anomaly',
          emoji: '🇺🇦', severity: Math.abs(changePct) >= 5 ? 'high' : 'medium',
          message: `🇺🇦 <b>${market}</b> — аномалія за 24h\n💹 <b>${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</b> → ${fmt(price, true)}\n📦 Обсяг: ${fmtVol(baseVol, market)}${spreadLine}\n\n<i>WhiteBit Intelligence · ODB Platform</i>`,
          change_pct: changePct, price, volume_usd: quoteVol,
        })
      }
    }

    // ─── Сигнал 4: UAH ПРЕМІЯ (унікальна фіча) ───────────────────────────────
    let uah_premium: number | null = null
    if (nbuRate && all['BTC_USDT'] && all['BTC_UAH']) {
      const btcUsdt   = parseFloat(all['BTC_USDT'].last_price)
      const btcUah    = parseFloat(all['BTC_UAH'].last_price)
      const fairPrice = btcUsdt * nbuRate
      uah_premium     = ((btcUah / fairPrice) - 1) * 100

      if (Math.abs(uah_premium) >= T.uah_premium) {
        const pos = uah_premium > 0
        signals.push({
          market: 'BTC_UAH', signal_type: 'uah_premium',
          emoji:    pos ? '💰' : '💸',
          severity: Math.abs(uah_premium) >= 3 ? 'high' : 'medium',
          message: [
            `${pos ? '💰' : '💸'} <b>UAH ПРЕМІЯ — ${pos ? 'ринок перегрітий' : 'арбітражна можливість'}</b>`,
            '',
            `📊 BTC на WhiteBit:      <b>${fmt(btcUah, true)}</b>`,
            `📐 Справедлива ціна:     <b>${fmt(fairPrice, true)}</b> (BTC × НБУ)`,
            `💱 Курс НБУ USD/UAH:    <b>${nbuRate.toFixed(2)} ₴</b>`,
            `💹 Премія:               <b>${pos ? '+' : ''}${uah_premium.toFixed(2)}%</b>`,
            '',
            pos
              ? '⚠️ Українці платять більше за ринок\nМожлива причина: попит на хеджування гривні, очікування девальвації, відтік капіталу'
              : '✅ BTC в гривні дешевший за ринок\nМожлива причина: надлишок пропозиції, арбітражна можливість',
            '',
            '<i>WhiteBit Intelligence · ODB Platform</i>',
          ].join('\n'),
          change_pct: uah_premium, price: nbuRate,
          volume_usd: parseFloat(all['BTC_UAH'].quote_volume),
        })
      }
    }

    // ─── Зберігаємо знімки ────────────────────────────────────────────────────
    if (newSnaps.length) {
      const { error } = await supabase.from('whitebit_snapshots').insert(newSnaps)
      if (!error) snapshots_saved = newSnaps.length
    }

    // ─── Зберігаємо сигнали + Telegram ───────────────────────────────────────
    let tg_sent = 0
    for (const sig of signals as Array<Record<string, unknown>>) {
      const { data: dup } = await supabase
        .from('whitebit_signals').select('id')
        .eq('market', sig.market).eq('signal_type', sig.signal_type)
        .gte('created_at', new Date(Date.now() - 30 * 60_000).toISOString()).limit(1)
      if (dup?.length) continue

      await supabase.from('whitebit_signals').insert({
        market: sig.market, signal_type: sig.signal_type,
        emoji: sig.emoji, message: sig.message, severity: sig.severity,
        price: sig.price, change_pct: sig.change_pct, volume_usd: sig.volume_usd,
        sent_to_tg: false,
      })

      if (sig.severity !== 'low') {
        const ok = await sendTelegramMessage(sig.message as string, 'HTML')
        if (ok) {
          await supabase.from('whitebit_signals')
            .update({ sent_to_tg: true })
            .eq('market', sig.market as string).eq('signal_type', sig.signal_type as string)
            .order('created_at', { ascending: false }).limit(1)
          tg_sent++
        }
      }
    }

    return NextResponse.json({
      ok: true,
      elapsed_ms:      Date.now() - t0,
      markets_scanned: WATCH_MARKETS.length,
      snapshots_saved,
      signals_found:   signals.length,
      tg_sent,
      uah_premium,
      nbu_rate: nbuRate,
      movers,
    })

  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

function fmt(price: number, isUAH: boolean): string {
  return isUAH
    ? `${price.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} ₴`
    : `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

function fmtVol(vol: number, market: string): string {
  const base = market.split('_')[0]
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M ${base}`
  if (vol >= 1_000)     return `${(vol / 1_000).toFixed(2)}K ${base}`
  return `${vol.toFixed(4)} ${base}`
}
