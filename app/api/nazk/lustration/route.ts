// app/api/nazk/lustration/route.ts
// НАЗК — Реєстр люстрованих осіб (безплатно, публічний API)
// https://public-api.nazk.gov.ua/v2/lustration/

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 })

    const q = String(query).trim()

    // НАЗК public API
    try {
      const res = await fetch(
        `https://public-api.nazk.gov.ua/v2/lustration/?page=0&limit=20&search=${encodeURIComponent(q)}`,
        {
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000),
        }
      )
      if (res.ok) {
        const data = await res.json()
        const items: any[] = data.data || data.results || data || []
        if (Array.isArray(items) && items.length > 0) {
          return NextResponse.json({
            success: true,
            total: data.total || items.length,
            query: q,
            results: items.slice(0, 20).map((item: any) => ({
              name: [item.full_name, item.fullName, item.name].find(Boolean) || q,
              position: item.position || item.positionName || null,
              organ: item.organ || item.organName || null,
              basis: item.basis || null,
              date: item.date || item.lustrationDate || null,
              status: item.status || 'Люстрований',
              url: `https://nazk.gov.ua/uk/reestri/lustraciya/`,
            })),
            source: 'nazk_lustration',
            source_url: `https://nazk.gov.ua/uk/reestri/lustraciya/?search=${encodeURIComponent(q)}`,
          })
        }
      }
    } catch { /* fallback below */ }

    // Fallback: Web scraping НАЗК website
    return NextResponse.json({
      success: false,
      total: 0,
      query: q,
      results: [],
      note: 'НАЗК API тимчасово недоступний. Перевірте вручну:',
      fallback_url: `https://nazk.gov.ua/uk/reestri/lustraciya/?search=${encodeURIComponent(q)}`,
      source: 'nazk_lustration',
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', source: 'nazk.gov.ua/lustration', free: true })
}
