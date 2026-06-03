import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 90

// GET /api/telegram/search?q=ПІБ&dob=14.03.1972
// Пріоритет: Telethon MTProto (8008) → fallback на старий бот-сервіс (8001)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q   = searchParams.get('q')
  const dob = searchParams.get('dob') || ''

  if (!q || q.length < 3) {
    return NextResponse.json({ error: 'Query too short' }, { status: 400 })
  }

  const vpsHost         = process.env.VPS_HOST || '161.35.86.145'
  const telethonPort    = process.env.TELETHON_PORT || '8008'
  const legacyPort      = process.env.TELEGRAM_SEARCH_PORT || '8001'

  // ── 1. Спробуємо Telethon MTProto (швидко, прямий доступ) ──
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000) // 15с для MTProto

    const res = await fetch(
      `http://${vpsHost}:${telethonPort}/search/quick?q=${encodeURIComponent(q)}&dob=${encodeURIComponent(dob)}`,
      { signal: ctrl.signal }
    )
    clearTimeout(t)

    if (res.ok) {
      const data = await res.json()
      // Додаємо мітку джерела
      if (data.results) {
        data.results = data.results.map((r: any) => ({ ...r, via: 'mtproto' }))
      }
      return NextResponse.json({ ...data, engine: 'telethon' })
    }
  } catch (_) {
    // Telethon недоступний — fallback
  }

  // ── 2. Fallback: старий бот-сервіс ──
  try {
    const ctrl2 = new AbortController()
    const t2 = setTimeout(() => ctrl2.abort(), 80000)

    const res2 = await fetch(
      `http://${vpsHost}:${legacyPort}/search?q=${encodeURIComponent(q)}&dob=${encodeURIComponent(dob)}`,
      { signal: ctrl2.signal }
    )
    clearTimeout(t2)

    if (!res2.ok) {
      return NextResponse.json({ error: 'Telegram service error', results: [] }, { status: 502 })
    }

    const data2 = await res2.json()
    return NextResponse.json({ ...data2, engine: 'legacy_bot' })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Telegram service timeout', results: [] }, { status: 504 })
    }
    return NextResponse.json(
      { error: 'Telegram service unavailable. Start telethon_service.py or telegram_search.py on VPS.', results: [] },
      { status: 503 }
    )
  }
}
