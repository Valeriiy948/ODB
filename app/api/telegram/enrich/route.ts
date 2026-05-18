import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// GET /api/telegram/enrich?q=+79001234567
// Поглиблений пошук по телефону / email / ІНН через PHONE_BOTS (~40s)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')

  if (!q || q.length < 3) {
    return NextResponse.json({ error: 'Query too short' }, { status: 400 })
  }

  const vpsHost      = process.env.VPS_HOST || '161.35.86.145'
  const telegramPort = process.env.TELEGRAM_SEARCH_PORT || '8001'

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55000)

    const url = `http://${vpsHost}:${telegramPort}/enrich?q=${encodeURIComponent(q)}`
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) {
      return NextResponse.json({ error: 'Telegram service error', status: res.status }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Enrich search timeout', results: [] }, { status: 504 })
    }
    return NextResponse.json(
      { error: 'Telegram service unavailable', results: [] },
      { status: 503 }
    )
  }
}
