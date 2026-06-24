import { NextResponse } from 'next/server'

const MARKETS = [
  'BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'BNB_USDT', 'XRP_USDT', 'ADA_USDT',
  'BTC_UAH',  'ETH_UAH',  'ADA_UAH',  'LTC_UAH',  'NEAR_UAH', 'SHIB_UAH',
]

export async function GET() {
  try {
    const res = await fetch('https://whitebit.com/api/v4/public/ticker', {
      signal: AbortSignal.timeout(8_000), cache: 'no-store',
    })
    const all = await res.json() as Record<string, object>
    const out: Record<string, object> = {}
    MARKETS.forEach(m => { if (all[m]) out[m] = all[m] })
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
