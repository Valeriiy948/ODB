// app/api/court/search/route.ts
// Єдиний державний реєстр судових рішень України (ЄДРСР)
// https://reyestr.court.gov.ua/ — безплатно, публічний

import { NextRequest, NextResponse } from 'next/server'

const COURT_API = 'https://reyestr.court.gov.ua/api/open-api'

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 })

    const q = String(query).trim()

    // Спробуємо ЄДРСР API
    try {
      const res = await fetch(`${COURT_API}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          'Origin': 'https://reyestr.court.gov.ua',
          'Referer': 'https://reyestr.court.gov.ua/',
        },
        body: JSON.stringify({
          query:    q,
          page:     1,
          pageSize: 20,
          sort:     'date:desc',
        }),
        signal: AbortSignal.timeout(15000),
      })

      if (res.ok) {
        const data = await res.json()
        const items: any[] = data.results || data.docs || data.data || []
        const total: number = data.total || data.totalHits || items.length

        if (items.length > 0) {
          return NextResponse.json({
            success: true,
            total,
            query: q,
            results: items.slice(0, 20).map((item: any) => ({
              id:        item.id || item.docId || null,
              title:     item.title || item.number || 'Рішення суду',
              court:     item.court || item.courtName || null,
              date:      item.date || item.judDate || null,
              category:  item.category || item.categoryName || null,
              judge:     item.judge || null,
              verdict:   item.verdict || item.resultType || null,
              excerpt:   (item.text || item.fullText || '').slice(0, 300),
              url:       item.url || (item.id ? `https://reyestr.court.gov.ua/Review/${item.id}` : `https://reyestr.court.gov.ua/`),
            })),
            source: 'court_reyestr',
            source_url: `https://reyestr.court.gov.ua/search#searchText=${encodeURIComponent(q)}`,
          })
        }
      }
    } catch { /* fallback */ }

    // Fallback — пряме посилання
    return NextResponse.json({
      success: false,
      total: 0,
      query: q,
      results: [],
      note: 'ЄДРСР API тимчасово недоступний. Перейдіть на сайт вручну:',
      fallback_url: `https://reyestr.court.gov.ua/search#searchText=${encodeURIComponent(q)}`,
      source: 'court_reyestr',
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', source: 'reyestr.court.gov.ua', free: true })
}
