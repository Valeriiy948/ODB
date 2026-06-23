// app/api/whitebit-intel/tickers/route.ts
// Проксі для WhiteBit тікерів (обходить CORS)

import { NextResponse } from 'next/server'

const MARKETS = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'BTC_UAH', 'ETH_UAH']

export async function GET() {
  try {
    const res = await fetch('https://whitebit.com/api/v4/public/ticker', {
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    })
    const all = await res.json() as Record<string, { last_price: string; quote_volume: string; base_volume: string; change: string }>
    const filtered: Record<string, object> = {}
    MARKETS.forEach(m => { if (all[m]) filtered[m] = all[m] })
    return NextResponse.json(filtered)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
