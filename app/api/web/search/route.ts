// app/api/web/search/route.ts
// Веб-пошук через Tavily API (з fallback на Serper/Google)
// POST /api/web/search  body: { query, type? }

import { NextRequest, NextResponse } from 'next/server'

const TAVILY_KEY = () => process.env.TAVILY_API_KEY || ''
const SERPER_KEY = () => process.env.SERPER_API_KEY || ''

// Build smart queries for the type — returns [primary, fallback]
function buildQueries(query: string, type: string): string[] {
  switch (type) {
    case 'name':
      return [
        `${query} Україна особа`,
        `${query} military Ukraine war`,
        `${query}`,
      ]
    case 'phone':
      return [`${query} телефон номер`, query]
    case 'email':
      return [`${query} email контакт`, query]
    case 'username':
      return [`${query} profile account social`, query]
    case 'domain':
      return [`site:${query}`, query]
    case 'ip':
      return [`${query} IP server`, query]
    case 'edrpou':
      return [`ЄДРПОУ ${query}`, `код ${query} Україна`]
    case 'inn':
      return [`ІПН ${query}`, `ИНН ${query}`]
    default:
      return [query]
  }
}

// ── Tavily ────────────────────────────────────────────────────────────────────
async function searchTavily(query: string): Promise<any> {
  const key = TAVILY_KEY()
  if (!key) return null

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: 'basic',
      include_answer: false,
      include_raw_content: false,
      max_results: 10,
    }),
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) return null
  const data = await res.json()
  return (data.results || []).map((r: any) => ({
    title:   r.title   || '',
    url:     r.url     || '',
    content: r.content || r.snippet || '',
    score:   r.score,
    source:  'tavily',
  }))
}

// ── Serper (Google) ───────────────────────────────────────────────────────────
async function searchSerper(query: string): Promise<any> {
  const key = SERPER_KEY()
  if (!key) return null

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': key,
    },
    body: JSON.stringify({ q: query, num: 10, gl: 'ua', hl: 'uk' }),
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) return null
  const data = await res.json()
  const organic = data.organic || []
  return organic.map((r: any) => ({
    title:   r.title   || '',
    url:     r.link    || '',
    content: r.snippet || '',
    source:  'serper',
  }))
}

export async function POST(req: NextRequest) {
  try {
    const { query, type = 'name' } = await req.json()
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query required' }, { status: 400 })
    }

    const queries = buildQueries(query.trim(), type)
    let results: any[] | null = null

    for (const q of queries) {
      // Try Tavily first
      results = await searchTavily(q).catch(() => null)
      if (results && results.length > 0) break

      // Fallback to Serper
      results = await searchSerper(q).catch(() => null)
      if (results && results.length > 0) break
    }

    if (!results || results.length === 0) {
      // Return empty but valid, with direct Google search link
      return NextResponse.json({
        results: [],
        total: 0,
        google_url: `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`,
      })
    }

    // Deduplicate by URL
    const seen = new Set<string>()
    const unique = results.filter(r => {
      if (seen.has(r.url)) return false
      seen.add(r.url)
      return true
    })

    return NextResponse.json({
      results: unique,
      total: unique.length,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 })
  }
}
