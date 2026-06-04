// app/api/nazk/corruption/route.ts
// НАЗК — Єдиний державний реєстр осіб, що вчинили корупційні правопорушення
// https://corruptinfo.nazk.gov.ua/ (безплатно, публічний API)

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 })

    const q = String(query).trim()

    // Спробуємо corruptinfo API
    try {
      const res = await fetch(
        `https://corruptinfo.nazk.gov.ua/p/1/1/${encodeURIComponent(q)}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; ODB/1.0)',
            Referer: 'https://corruptinfo.nazk.gov.ua/',
          },
          signal: AbortSignal.timeout(10000),
        }
      )

      if (res.ok) {
        const data = await res.json()
        const items: any[] = Array.isArray(data) ? data : (data.data || data.results || [])

        if (items.length > 0) {
          return NextResponse.json({
            success: true,
            total: items.length,
            query: q,
            results: items.slice(0, 20).map((item: any) => ({
              name: [item.full_name, item.fullName, item.name].find(Boolean) || q,
              offense: item.offense || item.offenseName || item.corpus_delicti || null,
              court: item.court || item.courtName || null,
              sentence_date: item.sentence_date || item.sentenceDate || null,
              punishment: item.punishment || null,
              status: item.status || 'Вчинив корупційне правопорушення',
              url: item.url || `https://corruptinfo.nazk.gov.ua/`,
            })),
            source: 'nazk_corruption',
            source_url: `https://corruptinfo.nazk.gov.ua/`,
          })
        }
      }
    } catch { /* fallback */ }

    // Fallback: direct web link
    return NextResponse.json({
      success: false,
      total: 0,
      query: q,
      results: [],
      note: 'API corruptinfo.nazk.gov.ua тимчасово недоступний. Перевірте вручну:',
      fallback_url: `https://corruptinfo.nazk.gov.ua/`,
      source: 'nazk_corruption',
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', source: 'corruptinfo.nazk.gov.ua', free: true })
}
