import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120

// GET /api/telegram/quick?q=ПІБ&dob=14.03.1972
// Повний пошук: всі сторінки бота + завантаження документа (~2 хв макс)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q   = searchParams.get('q')
  const dob = searchParams.get('dob') || ''

  if (!q || q.length < 3) {
    return NextResponse.json({ error: 'Query too short' }, { status: 400 })
  }

  const vpsHost      = process.env.VPS_HOST || '161.35.86.145'
  const telegramPort = process.env.TELEGRAM_SEARCH_PORT || '8001'

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 110000)

    const url = `http://${vpsHost}:${telegramPort}/search/quick?q=${encodeURIComponent(q)}&dob=${encodeURIComponent(dob)}`
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) {
      return NextResponse.json({ error: 'Telegram service error', status: res.status }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Telegram quick search timeout', results: [] }, { status: 504 })
    }
    return NextResponse.json(
      { error: 'Telegram service unavailable', results: [] },
      { status: 503 }
    )
  }
}
