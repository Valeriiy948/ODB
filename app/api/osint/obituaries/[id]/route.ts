// app/api/osint/obituaries/[id]/route.ts
// Пошук некрологів / підтвердження загибелі через відкриті джерела
// Джерела: pomnim.pro, memory.gov.ua, поиск через Tavily

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TAVILY_KEY = process.env.TAVILY_API_KEY || ''
const VPS_HOST   = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT    = process.env.TELEGRAM_SEARCH_PORT || '8001'

interface ObituaryResult {
  source:      string
  source_label: string
  url?:        string
  name?:       string
  dob?:        string
  dod?:        string    // date of death
  snippet?:    string
  confirmed:   boolean   // висока впевненість = є ім'я+рік загибелі
}

// ─── Tavily пошук некрологів ──────────────────────────────────────────────────
async function searchObituariesWeb(name: string, dob?: string): Promise<ObituaryResult[]> {
  if (!TAVILY_KEY) return []
  try {
    const year = dob?.slice(0, 4)
    const queries = [
      `"${name}" загинув некролог`,
      `"${name}" погиб некролог память`,
      `site:pomnim.pro "${name}"`,
    ]

    const results: ObituaryResult[] = []

    for (const q of queries) {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: TAVILY_KEY,
          query: q,
          search_depth: 'basic',
          max_results: 5,
          include_domains: ['pomnim.pro', 'memory.gov.ua', 'поминальник.укр', 'nekrolog.ua'],
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) continue
      const data = await res.json()

      for (const r of (data.results || [])) {
        const snippet = (r.content || r.snippet || '').toLowerCase()
        const isObituaryPage = r.url?.includes('pomnim.pro') ||
          r.url?.includes('memory.gov.ua') ||
          snippet.includes('загин') || snippet.includes('погиб') ||
          snippet.includes('некролог') || snippet.includes('пам')

        if (!isObituaryPage) continue

        // Перевіряємо чи є ім'я особи в результаті
        const nameParts = name.toLowerCase().split(/\s+/).filter(p => p.length > 3)
        const nameMatches = nameParts.filter(p => snippet.includes(p) || (r.title || '').toLowerCase().includes(p))
        const confirmed = nameMatches.length >= 2

        results.push({
          source:       'web_obituary',
          source_label: r.url?.includes('pomnim.pro') ? 'pomnim.pro' :
                        r.url?.includes('memory.gov.ua') ? 'memory.gov.ua' : 'Web',
          url:          r.url,
          name:         r.title,
          snippet:      (r.content || r.snippet || '').slice(0, 300),
          confirmed,
        })
      }
    }

    return results
  } catch (err) {
    console.warn('Obituary web search error:', err)
    return []
  }
}

// ─── Пошук через pomnim.pro напряму ──────────────────────────────────────────
async function searchPomnim(name: string): Promise<ObituaryResult[]> {
  try {
    const url = `https://pomnim.pro/search/?q=${encodeURIComponent(name)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const html = await res.text()

    const results: ObituaryResult[] = []
    // Парсимо картки результатів
    const cardRegex = /<div[^>]*class="[^"]*person-card[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
    const nameRegex = /<[^>]*class="[^"]*person-name[^"]*"[^>]*>([^<]+)</i
    const dateRegex = /(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})/g
    const linkRegex = /href="(\/person\/[^"]+)"/

    let match
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1]
      const nameMatch = nameRegex.exec(card)
      const linkMatch = linkRegex.exec(card)
      const dates = card.match(dateRegex) || []

      if (nameMatch || linkMatch) {
        results.push({
          source:       'pomnim_pro',
          source_label: 'pomnim.pro',
          url:          linkMatch ? `https://pomnim.pro${linkMatch[1]}` : undefined,
          name:         nameMatch?.[1]?.trim(),
          dob:          dates[0],
          dod:          dates[1],
          snippet:      card.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
          confirmed:    Boolean(nameMatch && dates.length >= 1),
        })
      }
    }
    return results.slice(0, 5)
  } catch (err) {
    console.warn('pomnim.pro search error:', err)
    return []
  }
}

// ─── Пошук через memory.gov.ua ────────────────────────────────────────────────
async function searchMemoryGov(name: string): Promise<ObituaryResult[]> {
  try {
    const url = `https://memory.gov.ua/api/heroes?search=${encodeURIComponent(name)}&limit=5`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const data = await res.json()

    return ((data.data || data.items || data || []) as any[]).slice(0, 5).map((r: any) => ({
      source:       'memory_gov',
      source_label: 'memory.gov.ua',
      url:          r.url || (r.slug ? `https://memory.gov.ua/heroes/${r.slug}` : undefined),
      name:         [r.last_name, r.first_name, r.middle_name].filter(Boolean).join(' ') || r.name,
      dob:          r.birth_date || r.dob,
      dod:          r.death_date || r.dod,
      snippet:      r.description || r.bio || '',
      confirmed:    true,
    }))
  } catch (err) {
    console.warn('memory.gov.ua search error:', err)
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

  const name = person.name_rus || person.name_ukr || person.name_eng || person.name
  if (!name) {
    return NextResponse.json({ error: 'Ім\'я особи відсутнє', success: false }, { status: 400 })
  }

  // Паралельний пошук у всіх джерелах
  const [webResults, pomnimResults, memoryResults] = await Promise.all([
    searchObituariesWeb(name, person.dob),
    searchPomnim(name),
    searchMemoryGov(name),
  ])

  const allResults = [...memoryResults, ...pomnimResults, ...webResults]

  // Дедублікація за URL
  const seen = new Set<string>()
  const deduped = allResults.filter(r => {
    const key = r.url || `${r.source}:${r.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Перевіряємо чи є підтверджена загибель
  const confirmed = deduped.some(r => r.confirmed)

  // Зберігаємо в persons.obituary_data
  if (deduped.length > 0) {
    await supabaseAdmin.from('persons')
      .update({
        obituary_data: deduped,
        // Якщо підтверджено — позначаємо статус
        ...(confirmed ? { status: 'загинув' } : {}),
      })
      .eq('id', id)
  }

  return NextResponse.json({
    success: true,
    found:     deduped.length,
    confirmed,
    results:   deduped,
    note: confirmed
      ? '⚠️ Знайдено підтвердження загибелі'
      : deduped.length > 0 ? 'Знайдено згадки, потребують перевірки' : 'Некрологів не знайдено',
  })
}
