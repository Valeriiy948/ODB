// app/api/osint/kadaster/[id]/route.ts
// Пошук нерухомості через Кадастровий реєстр (hsc.gov.ua)

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_HOST      = process.env.VPS_HOST || '161.35.86.145'
const KADASTER_PORT = process.env.KADASTER_PORT || '8002'

interface RealEstateResult {
  cadastral_number?: string
  address?:          string
  area?:             string
  type?:             string
  owner?:            string
  source:            string
}

// ─── Через VPS Node.js kadaster_scraper.js ───────────────────────────────────
async function searchKadasterVPS(name: string, dob?: string): Promise<RealEstateResult[]> {
  try {
    const res = await fetch(`http://${VPS_HOST}:${KADASTER_PORT}/search/kadaster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, dob }),
      signal: AbortSignal.timeout(60000),  // Puppeteer потребує часу
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).map((r: any) => ({ ...r, source: data.source || 'kadaster' }))
  } catch {
    return []
  }
}

// ─── Fallback: публічна кадастрова карта API ──────────────────────────────────
async function searchPublicCadaster(name: string): Promise<RealEstateResult[]> {
  try {
    // Відкриті дані: реєстр земельних ділянок
    const res = await fetch(
      `https://e.land.gov.ua/back/cadaster/?fullname=${encodeURIComponent(name)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.features || []).slice(0, 10).map((f: any) => ({
      cadastral_number: f.properties?.cadnum,
      address:          f.properties?.address,
      area:             f.properties?.area_ha ? `${f.properties.area_ha} га` : undefined,
      type:             f.properties?.use_code_ua,
      source:           'e.land.gov.ua',
    }))
  } catch {
    return []
  }
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

  const name = person.name_ukr || person.name_rus || person.name_eng || person.name
  if (!name) {
    return NextResponse.json({ error: 'Ім\'я відсутнє', success: false }, { status: 400 })
  }

  const dob = person.dob

  // Паралельний пошук
  const [vpsResults, publicResults] = await Promise.all([
    searchKadasterVPS(name, dob),
    searchPublicCadaster(name),
  ])

  // Дедублікація за кадастровим номером
  const seen = new Set<string>()
  const allResults = [...vpsResults, ...publicResults].filter(r => {
    const key = r.cadastral_number || r.address || JSON.stringify(r)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Зберігаємо
  if (allResults.length > 0) {
    const existing = person.real_estate || []
    const merged = [...existing, ...allResults].slice(0, 50)
    await supabaseAdmin.from('persons')
      .update({ real_estate: merged })
      .eq('id', id)
  }

  return NextResponse.json({
    success:    true,
    found:      allResults.length,
    results:    allResults,
    vps_used:   vpsResults.length > 0,
    note:       allResults.length === 0
      ? 'Нерухомість не знайдено. Переконайтеся що сервіс кадастру запущений: node kadaster_scraper.js --server'
      : undefined,
  })
}
