// app/api/company/search/route.ts
// Бізнес-розвідка: YouControl + Opendatabot + ЄДРПОУ data.gov.ua + ФОП
// POST /api/company/search  body: { query, type?: 'name'|'edrpou'|'director' }

import { NextRequest, NextResponse } from 'next/server'

const YOUCONTROL_KEY   = () => process.env.YOUCONTROL_API_KEY || ''
const OPENDATABOT_KEY  = () => process.env.OPENDATABOT_API_KEY || ''

// ─── data.gov.ua — ЄДР безкоштовно ───────────────────────────────────────────
async function searchEdrFree(query: string, type: string): Promise<any[]> {
  const isCode = /^\d{8}$/.test(query.trim())

  // Спочатку пробуємо пряме API ЄДР (НАІС)
  try {
    const apiUrl = isCode
      ? `https://usr.minjust.gov.ua/api/1.0/uk/subjects?edrpou=${query.trim()}&limit=10`
      : `https://usr.minjust.gov.ua/api/1.0/uk/subjects?name=${encodeURIComponent(query.trim())}&limit=10`

    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://usr.minjust.gov.ua/',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const text = await res.text()
      if (text.startsWith('[') || text.startsWith('{')) {
        const data = JSON.parse(text)
        const items = Array.isArray(data) ? data : (data.items || data.subjects || [])
        if (items.length > 0) {
          return items.map((r: any) => ({
            type:    'legal',
            name:    r.name || r.full_name || '',
            edrpou:  r.edrpou || r.code || '',
            status:  r.status || '',
            address: r.address || r.location || '',
            director: r.director || r.boss || '',
            kved:    r.kved || r.primary_activity || '',
            source:  'ЄДР НАІС',
          }))
        }
      }
    }
  } catch {}

  // Fallback: opendatabot.ua public search (без ключа — базовий результат)
  try {
    const url = `https://opendatabot.ua/search?q=${encodeURIComponent(query.trim())}&type=company`
    // це redirect to UI, але headers дають JSON якщо Accept: application/json
    const res = await fetch(url.replace('opendatabot.ua', 'api.opendatabot.ua').replace('/search', '/v1/company') + `?q=${encodeURIComponent(query.trim())}&limit=10`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      const items = data.data || []
      if (items.length > 0) {
        return items.map((r: any) => ({
          type:    'legal',
          name:    r.name || '',
          edrpou:  r.code || '',
          status:  r.status || '',
          address: r.address || '',
          director: r.director?.name || '',
          source:  'Opendatabot (free)',
          url:     `https://opendatabot.ua/c/${r.code}`,
        }))
      }
    }
  } catch {}

  // Повертаємо fallback посилання якщо нічого не знайдено
  return [{
    type: 'fallback',
    name: `Пошук «${query}» на YouControl`,
    url: `https://youcontrol.com.ua/search/?q=${encodeURIComponent(query)}`,
    source: 'fallback',
  }, {
    type: 'fallback',
    name: `Пошук «${query}» на Opendatabot`,
    url: `https://opendatabot.ua/search?q=${encodeURIComponent(query)}`,
    source: 'fallback',
  }]
}

// ─── data.gov.ua — ФОП безкоштовно ───────────────────────────────────────────
async function searchFopFree(query: string): Promise<any[]> {
  try {
    // resource_id для ФОП: efa3eaa1-826c-4e8f-aaee-fd795f8d2745
    const url = new URL('https://data.gov.ua/api/3/action/datastore_search')
    url.searchParams.set('resource_id', 'efa3eaa1-826c-4e8f-aaee-fd795f8d2745')
    url.searchParams.set('q', query.trim())
    url.searchParams.set('limit', '20')

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.result?.records || []).map((r: any) => ({
      type:   'fop',
      name:   [r.last_name, r.first_name, r.middle_name].filter(Boolean).join(' ') || r.fio || '',
      inn:    r.tin || r.inn || '',
      status: r.status || '',
      kved:   r.primary_activity || r.kved || '',
      source: 'ФОП (data.gov.ua)',
    }))
  } catch { return [] }
}

// ─── YouControl API ───────────────────────────────────────────────────────────
async function searchYouControl(query: string, type: string): Promise<any> {
  const key = YOUCONTROL_KEY()
  if (!key) return { error: 'no_key', companies: [] }

  try {
    // YouControl has different endpoints
    const endpoint = /^\d{8}$/.test(query)
      ? `https://youcontrol.com.ua/api/v4/company/${query}/`
      : `https://youcontrol.com.ua/api/v4/search/company/?q=${encodeURIComponent(query)}`

    const res = await fetch(endpoint, {
      headers: {
        'Authorization': `Token ${key}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return { error: `YouControl HTTP ${res.status}`, companies: [] }
    const data = await res.json()

    if (Array.isArray(data)) {
      // Search results
      return {
        companies: data.slice(0, 10).map((c: any) => ({
          name:    c.name || '',
          edrpou:  c.edrpou || '',
          status:  c.status || '',
          address: c.address || '',
          director: c.director || '',
          founded: c.registration_date || '',
          capital: c.authorized_capital,
          source:  'YouControl',
          url:     `https://youcontrol.com.ua/catalog/company_details/${c.edrpou}/`,
        })),
      }
    } else {
      // Single company detail
      return {
        companies: [{
          name:        data.name || '',
          edrpou:      data.edrpou || '',
          status:      data.status || '',
          address:     data.address || '',
          director:    data.director || '',
          founded:     data.registration_date || '',
          capital:     data.authorized_capital,
          activity:    data.activity || '',
          founders:    (data.founders || []).map((f: any) => ({ name: f.name, share: f.share })),
          contacts:    data.contacts || {},
          source:      'YouControl',
          url:         `https://youcontrol.com.ua/catalog/company_details/${data.edrpou}/`,
          // Додаткова аналітика
          tax_debts:   data.tax_debts,
          court_cases: data.court_cases,
          sanctions:   data.sanctions,
        }],
      }
    }
  } catch (err: any) {
    return { error: err.message, companies: [] }
  }
}

// ─── Opendatabot API ──────────────────────────────────────────────────────────
async function searchOpendatabot(query: string): Promise<any> {
  const key = OPENDATABOT_KEY()
  if (!key) return { error: 'no_key', companies: [] }

  try {
    const isCode = /^\d{8,10}$/.test(query.trim())
    const url = isCode
      ? `https://api.opendatabot.ua/v2/company/${query.trim()}`
      : `https://api.opendatabot.ua/v2/company?q=${encodeURIComponent(query.trim())}&limit=10`

    const res = await fetch(url, {
      headers: { 'apikey': key, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return { error: `Opendatabot HTTP ${res.status}`, companies: [] }
    const data = await res.json()

    const items = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : [])
    return {
      companies: items.map((c: any) => ({
        name:     c.name || c.full_name || '',
        edrpou:   c.code || '',
        status:   c.status || '',
        address:  c.address || '',
        director: c.director?.name || '',
        founded:  c.registration_date || '',
        kved:     c.kved?.name || '',
        source:   'Opendatabot',
        url:      `https://opendatabot.ua/c/${c.code}`,
      })),
    }
  } catch (err: any) {
    return { error: err.message, companies: [] }
  }
}

// ─── Related persons (директор → особи в ODB) ─────────────────────────────────
async function findRelatedPersons(directorName: string): Promise<any[]> {
  if (!directorName || directorName.length < 3) return []
  try {
    const parts = directorName.trim().split(/\s+/)
    const lastName = parts[0]
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/persons?` +
      `or=(name_rus.ilike.${encodeURIComponent('%' + lastName + '%')},name_ukr.ilike.${encodeURIComponent('%' + lastName + '%')})` +
      `&select=id,name_rus,name_ukr,rank,unit,threat_score&limit=5`,
      {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { query, type = 'auto' } = await req.json()
    if (!query || String(query).trim().length < 2) {
      return NextResponse.json({ error: 'query required' }, { status: 400 })
    }

    const q = String(query).trim()
    const isCode = /^\d{8}$/.test(q)
    const isInn  = /^\d{10}$/.test(q)

    // Паралельний пошук
    const [edrResults, fopResults, youcontrol, opendatabot] = await Promise.all([
      isInn ? Promise.resolve([]) : searchEdrFree(q, type),
      !isCode ? searchFopFree(q) : Promise.resolve([]),
      searchYouControl(q, type),
      searchOpendatabot(q),
    ])

    // Aggregate all companies
    const allCompanies = [
      ...edrResults,
      ...fopResults,
      ...(youcontrol.companies || []),
      ...(opendatabot.companies || []),
    ]

    // Find directors mentioned in ODB
    const directorNames = allCompanies
      .map(c => c.director).filter(Boolean).slice(0, 3)
    const relatedPersons = directorNames.length > 0
      ? await findRelatedPersons(directorNames[0])
      : []

    return NextResponse.json({
      success:          true,
      query:            q,
      total:            allCompanies.length,
      companies:        allCompanies,
      related_persons:  relatedPersons,
      sources: {
        edr:         { count: edrResults.length,  ok: true },
        fop:         { count: fopResults.length,  ok: true },
        youcontrol:  { count: (youcontrol.companies||[]).length, ok: !youcontrol.error, error: youcontrol.error },
        opendatabot: { count: (opendatabot.companies||[]).length, ok: !opendatabot.error, error: opendatabot.error },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    configured: {
      edr_free:    true,
      fop_free:    true,
      youcontrol:  !!process.env.YOUCONTROL_API_KEY,
      opendatabot: !!process.env.OPENDATABOT_API_KEY,
    },
    note: 'ЄДР та ФОП через data.gov.ua безкоштовно. YouControl та Opendatabot потребують API ключів.',
  })
}
