// app/api/fns/search/route.ts
// ФНС Росії — ЄГРЮЛ / ЄГРІП (безплатно, публічний API egrul.nalog.ru)
// Пошук російських юридичних осіб та ІП за назвою або ІПН/ОГРН

import { NextRequest, NextResponse } from 'next/server'

// VPS в NL для запитів до .ru ресурсів
const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'

async function searchViaVPS(query: string): Promise<any | null> {
  try {
    const res = await fetch(`http://${VPS_HOST}:8006/registry/fns/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 20 }),
      signal: AbortSignal.timeout(12000),
    })
    if (res.ok) {
      const data = await res.json()
      if (!data.error) return data
    }
  } catch { /* continue */ }
  return null
}

async function searchEGRUL(query: string): Promise<any[]> {
  // egrul.nalog.ru API — безплатно, не потребує авторизації
  try {
    const res = await fetch('https://egrul.nalog.ru/search.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://egrul.nalog.ru',
        'Referer': 'https://egrul.nalog.ru/',
        'Accept': 'application/json, text/javascript, */*',
      },
      body: new URLSearchParams({ query, page: '1' }).toString(),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.rows || []
  } catch { return [] }
}

async function getEGRULDocs(t: string): Promise<any[]> {
  // Отримати список документів ЮО
  try {
    const res = await fetch(`https://egrul.nalog.ru/vyp-request/${t}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.rows || []
  } catch { return [] }
}

export async function POST(req: NextRequest) {
  try {
    const { query, type = 'name' } = await req.json()
    if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 })

    const q = String(query).trim()

    // Спробуємо через VPS (якщо egrul.nalog.ru доступний через NL)
    const vpsResult = await searchViaVPS(q)
    if (vpsResult) {
      return NextResponse.json({ ...vpsResult, source: 'fns_egrul_vps' })
    }

    // Прямий запит до ЄГРЮЛ
    const rows = await searchEGRUL(q)

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        total: 0,
        query: q,
        results: [],
        note: 'ЄГРЮЛ не повернув результатів або API тимчасово недоступний (заблокований для UA IP)',
        fallback_url: `https://egrul.nalog.ru/`,
        fallback_url2: `https://www.rusprofile.ru/search?query=${encodeURIComponent(q)}`,
        source: 'fns_egrul',
      })
    }

    const results = rows.slice(0, 20).map((row: any) => ({
      name: row.n || row.name || '?',
      inn: row.i || row.inn || null,
      ogrn: row.o || row.ogrn || null,
      kpp: row.k || row.kpp || null,
      region: row.r || row.region || null,
      address: row.a || row.address || null,
      status: row.e ? 'ЛІКВІДОВАНА' : (row.p ? 'У ПРОЦЕСІ ЛІКВІДАЦІЇ' : 'ДІЮЧА'),
      type: row.y === 'fl' ? 'ІП / ФОП' : 'Юридична особа',
      okved: row.okved || null,
      reg_date: row.d || null,
      url: `https://egrul.nalog.ru/search.json?query=${encodeURIComponent(row.i || row.inn || q)}`,
    }))

    return NextResponse.json({
      success: true,
      total: rows.length,
      query: q,
      results,
      source: 'fns_egrul',
      source_url: 'https://egrul.nalog.ru/',
      note: 'Дані ЄГРЮЛ/ЄГРІП ФНС Росії. Лише юридичні особи та ІП.',
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', source: 'egrul.nalog.ru', free: true })
}
