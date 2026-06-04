// app/api/breach/pivot/route.ts
// Авто-пошук по знайдених ідентифікаторах (телефон, email, IP, паспорт...)
// POST /api/breach/pivot  body: { identifiers: [{value, type}] }

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT  = process.env.TELEGRAM_SEARCH_PORT || '8001'

// Reuse same search logic — simple inline fetch to /api/breach/search
async function searchOne(query: string, type: string): Promise<any> {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${base}/api/breach/search`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, type }),
    signal:  AbortSignal.timeout(30000),
  })
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const { identifiers } = await req.json()
    // identifiers = [ { value: '79888385632', type: 'phone' }, { value: 'romanov@mail.ru', type: 'email' }, ... ]
    if (!Array.isArray(identifiers) || identifiers.length === 0) {
      return NextResponse.json({ error: 'identifiers array required' }, { status: 400 })
    }

    // Limit to 10 pivots to avoid abuse
    const limited = identifiers.slice(0, 10)

    // Run all pivot searches in parallel
    const results = await Promise.all(
      limited.map(async ({ value, type }: { value: string; type: string }) => {
        try {
          const data = await searchOne(value, type)
          return { pivot_value: value, pivot_type: type, ...data }
        } catch (e: any) {
          return { pivot_value: value, pivot_type: type, error: e.message, sources: {} }
        }
      })
    )

    // Merge all entries into flat list tagged with pivot
    const allEntries: any[] = []
    for (const r of results) {
      for (const [srcName, srcData] of Object.entries((r.sources || {}) as Record<string, any>)) {
        for (const entry of (srcData?.entries || [])) {
          allEntries.push({
            _pivot_from: `${r.pivot_type}:${r.pivot_value}`,
            _source: srcName,
            ...entry,
          })
        }
      }
    }

    return NextResponse.json({
      success:     true,
      pivot_count: limited.length,
      total_new:   allEntries.length,
      pivots:      results,
      all_entries: allEntries,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
