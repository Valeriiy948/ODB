// app/api/myrotvorets/search/route.ts — прямий виклик з Next.js (Ukrainian IP)
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    if (!query || query.trim().length < 3) {
      return NextResponse.json({ error: 'Мінімум 3 символи' }, { status: 400 })
    }

    const url = `https://myrotvorets.center/wp-json/wp/v2/posts?search=${encodeURIComponent(query.trim())}&per_page=15&_fields=id,title,link,excerpt,date,categories`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'uk,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) return NextResponse.json({ error: `Myrotvorets HTTP ${res.status}`, results: [] })

    const posts = await res.json()
    const results = posts.map((p: any) => ({
      id: p.id,
      title: p.title?.rendered?.replace(/<[^>]+>/g, '') || '',
      excerpt: p.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim().slice(0, 400) || '',
      url: p.link || '',
      date: (p.date || '').slice(0, 10),
    }))

    return NextResponse.json({
      success: true,
      found: results.length,
      results,
      source: 'Миротворець',
      query: query.trim(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 })
  }
}
