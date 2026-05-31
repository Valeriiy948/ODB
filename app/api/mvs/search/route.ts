// app/api/mvs/search/route.ts — MVS OpenData + fallback links
import { NextRequest, NextResponse } from 'next/server'

const MVS_RESOURCES: Record<string, { id: string; label: string; fallback: string }> = {
  wanted: {
    id: '34c38865-bff2-4e5a-be71-3d4e79524dfc',
    label: 'МВС Розшук',
    fallback: 'https://wanted.mvs.gov.ua/searchperson/',
  },
  stolen_cars: {
    id: '06779371-308f-42d5-895a-6e7f3e7cc90f',
    label: 'Авто в розшуку',
    fallback: 'https://wanted.mvs.gov.ua/searchvehicle/',
  },
  lost_docs: {
    id: '2fcc8b42-91a2-4d86-b05c-e79e39f98c5e',
    label: 'Втрачені документи',
    fallback: 'https://wanted.mvs.gov.ua/searchdocument/',
  },
  missing: {
    id: 'a3f1e04b-7b25-4591-a7a0-f73f5f3c7dbc',
    label: 'МВС Зниклі безвісти',
    fallback: 'https://wanted.mvs.gov.ua/searchmissing/',
  },
}

export async function POST(req: NextRequest) {
  try {
    const { query, resource = 'wanted' } = await req.json()
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ error: 'Введіть запит' }, { status: 400 })
    }

    const cfg = MVS_RESOURCES[resource]
    if (!cfg) return NextResponse.json({ error: `Невідомий ресурс: ${resource}` }, { status: 400 })

    const q = query.trim()
    const fallback_url = `${cfg.fallback}?q=${encodeURIComponent(q)}`

    const params = new URLSearchParams({ resource_id: cfg.id, q, limit: '25' })

    // Try data.gov.ua CKAN API
    for (const base of ['https://data.gov.ua', 'https://opendata.mvs.gov.ua']) {
      try {
        const res = await fetch(`${base}/api/3/action/datastore_search?${params}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) continue
        const txt = await res.text()
        if (txt.includes('error code:')) continue  // Cloudflare error
        const data = JSON.parse(txt)
        if (data.success && data.result) {
          const records = data.result.records || []
          const total   = data.result.total   || 0
          return NextResponse.json({ success: true, records, total, source: cfg.label, resource })
        }
      } catch { continue }
    }

    // Fallback — send browser URL
    return NextResponse.json({
      success: false, records: [], total: 0,
      source: cfg.label, resource,
      message: `OpenData MVS тимчасово недоступний. Перевірте вручну:`,
      fallback_url,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, records: [] }, { status: 500 })
  }
}
