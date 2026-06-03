// app/api/vk/search/route.ts
// VK (ВКонтакте) — пошук профілів через Google/Yandex дорки
// НЕ потребує токена! Використовує пошукові движки для знаходження VK профілів.
// Це ефективніше ніж VK API для OSINT — знаходить навіть приховані профілі.

import { NextRequest, NextResponse } from 'next/server'

const TAVILY_KEY = process.env.TAVILY_API_KEY
const SERPER_KEY = process.env.SERPER_API_KEY

// VPS для додаткових запитів (VK доступний з NL)
const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'

// Пошук VK профілів через Tavily (site:vk.com)
async function searchViaGoogle(query: string, type: string): Promise<any[]> {
  if (!SERPER_KEY) return []

  // Формуємо Google дорк для VK
  const dorkQuery = type === 'phone'
    ? `site:vk.com "${query}"`
    : type === 'username'
    ? `site:vk.com/${query}`
    : `site:vk.com "${query}"`

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: dorkQuery, num: 10, gl: 'ru', hl: 'ru' }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return (data.organic || [])
      .filter((r: any) => r.link?.includes('vk.com/'))
      .map((r: any) => parseVkResult(r))
      .filter(Boolean)
  } catch { return [] }
}

// Пошук через Tavily
async function searchViaTavily(query: string, type: string): Promise<any[]> {
  if (!TAVILY_KEY) return []

  const searchQuery = type === 'phone'
    ? `vk.com ${query} профиль`
    : `vk.com "${query}" профиль страница`

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:        TAVILY_KEY,
        query:          searchQuery,
        search_depth:   'basic',
        max_results:    8,
        include_domains: ['vk.com'],
      }),
      signal: AbortSignal.timeout(12000),
    })
    const data = await res.json()
    return (data.results || [])
      .filter((r: any) => r.url?.includes('vk.com/'))
      .map((r: any) => parseVkResult({ link: r.url, title: r.title, snippet: r.content }))
      .filter(Boolean)
  } catch { return [] }
}

// Парсинг VK результату з пошукової видачі
function parseVkResult(r: any): any | null {
  const url   = r.link || r.url || ''
  const title = r.title || ''
  const snippet = r.snippet || r.description || ''

  if (!url.includes('vk.com/')) return null

  // Витягуємо username з URL: vk.com/username або vk.com/id123456
  const urlMatch = url.match(/vk\.com\/([a-zA-Z0-9_.]+)/)
  const username  = urlMatch ? urlMatch[1] : null

  if (!username || username === 'share' || username === 'wall' ||
      username === 'photo' || username === 'video' || username === 'club' ||
      username === 'public' || username === 'event') return null

  // Витягуємо ім'я з заголовку (зазвичай "Ім'я Прізвище | ВКонтакте")
  const name = title
    .replace(/\s*[|–—]\s*ВКонтакте.*$/i, '')
    .replace(/\s*[|–—]\s*VK.*$/i, '')
    .trim()

  // Витягуємо локацію зі сніпету
  const cityMatch = snippet.match(/(?:город|місто|city)[:\s]+([А-ЯA-Zа-яa-z\s]+)/i)
  const city = cityMatch ? cityMatch[1].trim() : null

  return {
    url,
    name:     name || username,
    username: username.startsWith('id') ? null : username,
    vk_id:    username.startsWith('id') ? username.replace('id', '') : null,
    city,
    snippet:  snippet.slice(0, 150),
    source:   'search',
  }
}

// Пошук через VPS (якщо VK API доступний без токена)
async function searchViaVPS(query: string, type: string): Promise<any[]> {
  try {
    // VK API без токена — деякі методи працюють публічно
    const res = await fetch(`http://${VPS_HOST}:8001/vk/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, type }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.entries || []
  } catch { return [] }
}

export async function POST(req: NextRequest) {
  try {
    const { query, type = 'name' } = await req.json()
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query required' }, { status: 400 })
    }

    const q = String(query).trim()

    // Паралельний пошук через всі доступні джерела
    const [googleResults, tavilyResults, vpsResults] = await Promise.all([
      searchViaGoogle(q, type),
      searchViaTavily(q, type),
      searchViaVPS(q, type),
    ])

    // Об'єднуємо та дедублікуємо за URL
    const seen = new Set<string>()
    const all: any[] = []

    for (const item of [...vpsResults, ...googleResults, ...tavilyResults]) {
      const key = item.url || item.username
      if (key && !seen.has(key)) {
        seen.add(key)
        all.push(item)
      }
    }

    // Завжди додаємо прямі посилання для ручного пошуку
    const searchLinks = [
      {
        label: 'Пошук у VK',
        url:   `https://vk.com/search?c[q]=${encodeURIComponent(q)}&c[section]=people`,
      },
      {
        label: 'Yandex → VK',
        url:   `https://yandex.ru/search/?text=site%3Avk.com+${encodeURIComponent(q)}`,
      },
      {
        label: 'Google → VK',
        url:   `https://www.google.com/search?q=site%3Avk.com+${encodeURIComponent(q)}`,
      },
    ]

    return NextResponse.json({
      success:      true,
      query:        q,
      total:        all.length,
      entries:      all,
      search_links: searchLinks,
      method:       'search_engine_dorking',
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message, entries: [] }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    method:   'search_engine_dorking',
    requires_token: false,
    sources:  ['google_serper', 'tavily', 'vps_proxy'],
    note:     'VK пошук через Google/Yandex дорки — не потребує токена',
  })
}
