// POST /api/search/unified
// Єдина точка пошуку: ПІБ, ДН, телефон, email, ІПН, паспорт
// Паралельно шукає: OsintKit + LeakOsint + Telegram LEAK_BOTS
// Sherlock Bot — тільки якщо явно передано { sherlock: true }

import { NextRequest, NextResponse } from 'next/server'

const VPS_URL          = process.env.VPS_URL          || 'https://evidencebases.com/odb-api'
const LEAKOSINT_TOKEN  = process.env.LEAKOSINT_TOKEN  || ''
const OSINTKIT_KEY     = process.env.OSINTKIT_API_KEY || ''

async function safeFetch(url: string, opts: RequestInit, ms = 15000): Promise<any> {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) })
    if (!res.ok) return { error: `HTTP ${res.status}`, entries: [] }
    return await res.json()
  } catch (e: any) {
    return { error: e.message, entries: [] }
  }
}

// ── OsintKit (731 Russian DB) ──────────────────────────────────────────────
async function searchOsintKit(name: string) {
  if (!OSINTKIT_KEY || !name) return { source: 'osintkit', error: 'no_key', entries: [] }
  const params = new URLSearchParams()
  params.append('filters[names]', name)
  const data = await safeFetch(
    `https://api.osintkit.net/v1/search?${params}`,
    { headers: { 'X-API-KEY': OSINTKIT_KEY, Accept: 'application/json' } },
    15000
  )
  if (data.error) return { source: 'osintkit', error: data.error, entries: [] }
  const raw = Array.isArray(data?.data) ? data.data : (data?.data?.data || [])
  const entries = raw.map((e: any) => ({
    database: e.database || e.source || '—',
    name:     e.name || e.full_name,
    phone:    e.phone || (Array.isArray(e.phones) ? e.phones[0] : null),
    extra_phones: Array.isArray(e.phones) && e.phones.length > 1 ? e.phones.slice(1).join(', ') : null,
    email:    e.email,
    dob:      e.dob || e.BDay,
    address:  Array.isArray(e.address) ? e.address[0] : e.address,
    inn:      e.inn,
    passport: e.passport,
    as_of:    e.as_of || e.year,
  }))
  return { source: 'osintkit', label: 'OsintKit (731 RU DB)', entries, total: entries.length }
}

// ── LeakOsint (800+ DB) ────────────────────────────────────────────────────
async function searchLeakOsint(query: string) {
  if (!LEAKOSINT_TOKEN || !query) return { source: 'leakosint', error: 'no_key', entries: [] }
  const data = await safeFetch(
    'https://leakosintapi.com/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: LEAKOSINT_TOKEN, request: query, limit: 50, lang: 'ru' }),
    },
    15000
  )
  if (data.error) return { source: 'leakosint', error: data.error, entries: [] }
  const entries: any[] = []
  for (const [src, srcData] of Object.entries(data as Record<string, any>)) {
    if (src === 'Num_Results' || src === 'message') continue
    const list = Array.isArray(srcData) ? srcData : ((srcData as any)?.List || (srcData as any)?.data || [])
    for (const e of list) entries.push({ database: src, ...e })
  }
  return { source: 'leakosint', label: 'LeakOsint (800+ RU DB)', entries, total: entries.length }
}

// ── Telegram LEAK_BOTS (VPS :8001) ────────────────────────────────────────
async function searchTelegramBots(name: string, dob: string) {
  if (!name) return { source: 'telegram_bots', error: 'no_name', entries: [] }
  const query = dob ? `${name} ${dob}` : name
  const data = await safeFetch(
    `${VPS_URL}/presence/search`,
    {
      method:  'GET',
      headers: { 'Content-Type': 'application/json' },
    },
    55000
  )
  // Actually use GET with query params
  try {
    const url = new URL(`${VPS_URL}/presence/search`)
    url.searchParams.set('q', name)
    if (dob) url.searchParams.set('dob', dob)
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(55000) })
    if (!res.ok) return { source: 'telegram_bots', error: `HTTP ${res.status}`, entries: [] }
    const d = await res.json()
    const entries = (d.results || []).map((r: any) => ({
      database: r.source_label || r.source,
      name:     r.fields?.name,
      phone:    r.fields?.phone,
      dob:      r.fields?.dob,
      passport: r.fields?.passport,
      inn:      r.fields?.inn,
      address:  r.fields?.address,
      snippet:  r.snippet,
      url:      r.url,
      _raw:     r,
    }))
    return { source: 'telegram_bots', label: 'Telegram LEAK_BOTS (10 ботів)', entries, total: entries.length }
  } catch (e: any) {
    return { source: 'telegram_bots', error: e.message, entries: [] }
  }
}

// ── Sherlock Bot (@SHERLOCK_626jqxevxx_bot) ────────────────────────────────
async function searchSherlockBot(full_name: string, dob: string) {
  const res = await safeFetch(
    `${VPS_URL}/presence/search/sherlock-bot`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ full_name: full_name.toUpperCase(), dob }),
    },
    65000
  )
  return { source: 'sherlock_bot', label: 'Sherlock Bot (~$0.28)', ...res }
}

// ── Main handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name     = '',
      dob      = '',   // ДД.ММ.РРРР або YYYY-MM-DD
      phone    = '',
      email    = '',
      inn      = '',
      passport = '',
      sherlock = false,  // явний opt-in ($0.28/запит)
    } = body

    if (!name && !phone && !email && !inn && !passport) {
      return NextResponse.json({ error: 'Потрібен хоча б один параметр' }, { status: 400 })
    }

    // Normalize DOB: YYYY-MM-DD → ДД.ММ.РРРР for Telegram bots
    let dobFormatted = dob
    if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      const [y, m, d] = dob.split('-')
      dobFormatted = `${d}.${m}.${y}`
    }

    // Determine primary search query for LeakOsint (can use phone/email too)
    const leakQuery = phone || email || name

    // Launch parallel searches
    const tasks: Promise<any>[] = [
      name ? searchOsintKit(name) : Promise.resolve({ source: 'osintkit', skipped: true, entries: [] }),
      leakQuery ? searchLeakOsint(leakQuery) : Promise.resolve({ source: 'leakosint', skipped: true, entries: [] }),
      name ? searchTelegramBots(name, dobFormatted) : Promise.resolve({ source: 'telegram_bots', skipped: true, entries: [] }),
    ]

    if (sherlock && name) {
      tasks.push(searchSherlockBot(name, dobFormatted))
    }

    const results = await Promise.allSettled(tasks)
    const sources: Record<string, any> = {}

    for (const r of results) {
      if (r.status === 'fulfilled' && !r.value.skipped) {
        sources[r.value.source] = r.value
      }
    }

    const total = Object.values(sources).reduce((s: number, r: any) => s + (r.total || 0), 0)

    return NextResponse.json({
      success: true,
      query: { name, dob: dobFormatted, phone, email, inn, passport },
      total,
      sources,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
