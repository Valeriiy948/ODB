// app/api/persons/bulk-enrich/route.ts
// Масове автозбагачення всіх осіб через Serper/Myrotvorets

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function serperSearch(query: string) {
  const key = process.env.SERPER_API_KEY
  if (!key) return null
  try {
    const resp = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'ua', hl: 'uk', num: 5 }),
      signal: AbortSignal.timeout(8000),
    })
    return resp.ok ? await resp.json() : null
  } catch { return null }
}

// ─── GET: статус прогресу ──────────────────────────────────────────────────
export async function GET() {
  const { count: total } = await supabase
    .from('persons').select('id', { count: 'exact', head: true })

  const { count: enriched } = await supabase
    .from('persons').select('id', { count: 'exact', head: true })
    .not('myrotvorets_url', 'is', null)

  const { count: withPhoto } = await supabase
    .from('persons').select('id', { count: 'exact', head: true })
    .not('photo_url', 'is', null)

  return NextResponse.json({ total, enriched, withPhoto, pending: (total || 0) - (enriched || 0) })
}

// ─── POST: запустити батч збагачення ──────────────────────────────────────
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const batchSize = Math.min(body.batchSize || 10, 20) // максимум 20 за раз
  const onlyWithoutMyrotvorets = body.onlyWithoutMyrotvorets !== false

  // Беремо осіб без myrotvorets_url
  let query = supabase
    .from('persons')
    .select('id, name_ukr, name_rus, name')
    .limit(batchSize)

  if (onlyWithoutMyrotvorets) {
    query = query.is('myrotvorets_url', null)
  }

  const { data: persons } = await query

  if (!persons || persons.length === 0) {
    return NextResponse.json({ done: true, message: 'Всіх оброблено' })
  }

  const results: any[] = []

  // Обробляємо по одному з затримкою щоб не перевищити rate limit
  for (const person of persons) {
    const nameRus = person.name_rus || person.name_ukr || person.name
    const nameUkr = person.name_ukr || person.name

    if (!nameRus && !nameUkr) {
      results.push({ id: person.id, status: 'skipped', reason: 'no_name' })
      continue
    }

    let found = false

    // Шукаємо в Myrotvorets
    const queries = [
      nameRus && `"${nameRus}" site:myrotvorets.center`,
      nameUkr && nameUkr !== nameRus && `"${nameUkr}" site:myrotvorets.center`,
    ].filter(Boolean) as string[]

    for (const q of queries) {
      const data = await serperSearch(q)
      const match = (data?.organic || []).find((r: any) =>
        r.link?.includes('myrotvorets.center/criminal/')
      )

      if (match) {
        // Витягуємо дані зі сніпета
        const snippet = match.snippet || ''
        const title = (match.title || '').replace(/\s*-\s*.*Миротворець.*/i, '').trim()
        const nameParts = title.split(/\s*[\/|]\s*/).map((s: string) => s.trim()).filter(Boolean)

        const updates: Record<string, any> = {
          myrotvorets_url: match.link,
          verified: true,
        }

        const dobM = snippet.match(/(?:народж|рожд|born)[^.]{0,30}(\d{2}\.\d{2}\.\d{4})/i)
          || snippet.match(/(\d{2}\.\d{2}\.\d{4})/)
        if (dobM) updates.dob = dobM[1]

        if (!person.name_ukr && nameParts[0]) updates.name_ukr = nameParts[0]
        if (!person.name_rus && nameParts[1]) updates.name_rus = nameParts[1]

        const descClean = snippet.replace(/\s+/g, ' ').trim().slice(0, 400)
        if (descClean.length > 30) updates.description = descClean

        updates.sources = [`Миротворець: ${match.link}`]

        await supabase.from('persons').update(updates).eq('id', person.id)

        results.push({ id: person.id, status: 'enriched', url: match.link })
        found = true
        break
      }
    }

    if (!found) {
      results.push({ id: person.id, status: 'not_found' })
    }

    // Затримка між запитами (не перевищуємо Serper rate limit)
    await new Promise(r => setTimeout(r, 300))
  }

  const enrichedCount = results.filter(r => r.status === 'enriched').length

  return NextResponse.json({
    processed: persons.length,
    enriched: enrichedCount,
    notFound: results.filter(r => r.status === 'not_found').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    results,
  })
}
