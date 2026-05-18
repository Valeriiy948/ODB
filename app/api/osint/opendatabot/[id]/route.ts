// app/api/osint/opendatabot/[id]/route.ts
// Пошук по ЄДР, ФОП, бізнес-зв'язки через OpenDataBot API + data.gov.ua

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── data.gov.ua — ЄДР (безкоштовно, без ключів) ─────────────────────────────
async function searchEdr(name: string): Promise<any[]> {
  try {
    // Шукаємо в реєстрі ЄДР за ПІБ
    const url = new URL('https://data.gov.ua/api/3/action/datastore_search')
    // Resource ID для ЄДР юрособи: 1c7f3815-3259-45e0-bdf1-64dca07ddc10
    url.searchParams.set('resource_id', '1c7f3815-3259-45e0-bdf1-64dca07ddc10')
    url.searchParams.set('q', name)
    url.searchParams.set('limit', '10')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []

    const data = await res.json()
    return (data.result?.records || []).map((r: any) => ({
      type: 'edr_legal',
      name: r['full_name'] || r['name'] || '',
      code: r['edrpou'] || r['code'] || '',
      status: r['status'] || '',
      address: r['address'] || '',
      role: 'засновник/директор',
    }))
  } catch { return [] }
}

// ─── OpenDataBot API ──────────────────────────────────────────────────────────
async function searchOpenDataBot(ipn: string, apiKey: string): Promise<any[]> {
  try {
    // Пошук по ІПН → ФОП статус та пов'язані юрособи
    const res = await fetch(`https://api.opendatabot.ua/v2/fop/${ipn}`, {
      headers: {
        'apikey': apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      console.warn(`OpenDataBot: ${res.status}`)
      return []
    }

    const data = await res.json()
    const results: any[] = []

    if (data.data) {
      const d = data.data
      results.push({
        type: 'fop',
        name: d.full_name || d.name || '',
        code: d.code || ipn,
        status: d.status_text || d.status || '',
        address: d.address || '',
        activity: d.primary_activity_text || '',
        registration_date: d.registration_date || '',
        role: 'ФОП (підприємець)',
      })
    }

    // Пов'язані юрособи
    if (data.companies?.length) {
      for (const c of data.companies.slice(0, 5)) {
        results.push({
          type: 'company',
          name: c.full_name || c.name || '',
          code: c.code || '',
          status: c.status_text || '',
          address: c.address || '',
          role: c.role || 'пов\'язана особа',
          ownership_percent: c.percent || null,
        })
      }
    }

    return results
  } catch (err) {
    console.warn('OpenDataBot error:', err)
    return []
  }
}

// ─── Пошук у компаніях (засновник/директор) ──────────────────────────────────
async function searchCompanyFounder(name: string, apiKey: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.opendatabot.ua/v2/company/search?q=${encodeURIComponent(name)}&limit=5`,
      {
        headers: { 'apikey': apiKey, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.data || []).map((c: any) => ({
      type: 'company_search',
      name: c.full_name || c.name || '',
      code: c.code || '',
      status: c.status_text || '',
      address: c.address || '',
      role: 'засновник/директор',
    }))
  } catch { return [] }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: person, error } = await supabaseAdmin
    .from('persons').select('*').eq('id', id).single()
  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const results: any[] = []
  const apiKey = process.env.OPENDATABOT_API_KEY || ''

  // 1. ЄДР пошук за ім'ям (безкоштовно)
  const nameToSearch = person.name_ukr || person.name_rus || person.name || ''
  if (nameToSearch) {
    const edrResults = await searchEdr(nameToSearch)
    results.push(...edrResults)
  }

  // 2. OpenDataBot (якщо є ключ і ІПН)
  if (apiKey && person.ipn) {
    const odbResults = await searchOpenDataBot(person.ipn, apiKey)
    results.push(...odbResults)
  }

  // 3. Пошук в компаніях за ім'ям (OpenDataBot)
  if (apiKey && nameToSearch) {
    const companyResults = await searchCompanyFounder(nameToSearch, apiKey)
    results.push(...companyResults)
  }

  // Зберігаємо результати
  if (results.length > 0) {
    await supabaseAdmin.from('persons')
      .update({ business_connections: results })
      .eq('id', id)
  }

  return NextResponse.json({
    success: true,
    found: results.length,
    results,
    searched_name: nameToSearch,
    searched_ipn: person.ipn || null,
    opendatabot_available: !!apiKey,
    note: !apiKey ? 'OpenDataBot API key не налаштовано. ЄДР пошук (data.gov.ua) доступний безкоштовно.' : undefined,
  })
}
