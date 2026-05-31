// app/api/breach/catalog/route.ts
// Каталог відомих витоків з known-breaches (181k записів)
// GET /api/breach/catalog?q=facebook&limit=20
// GET /api/breach/catalog/stats

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT  = process.env.TELEGRAM_SEARCH_PORT || '8001'
const VPS_BASE = `http://${VPS_HOST}:${TG_PORT}`

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q     = searchParams.get('q')
  const limit = searchParams.get('limit') || '20'
  const stats = searchParams.get('stats')

  try {
    if (stats || !q) {
      // Return catalog stats
      const res = await fetch(`${VPS_BASE}/breaches/stats`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`VPS HTTP ${res.status}`)
      const data = await res.json()
      return NextResponse.json({ success: true, ...data })
    }

    // Search catalog
    const url = `${VPS_BASE}/breaches/search?q=${encodeURIComponent(q)}&limit=${limit}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`VPS HTTP ${res.status}`)
    const data = await res.json()

    return NextResponse.json({ success: true, ...data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
