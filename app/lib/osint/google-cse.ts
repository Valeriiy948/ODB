// app/lib/osint/google-cse.ts
// Ланцюг пошукових провайдерів:
//   1. Serper (Google proxy) — 2500 безкоштовних всього (одноразово)
//   2. Google CSE Direct    — 100/день безкоштовно  → GOOGLE_CSE_KEY + GOOGLE_CSE_CX
//   3. Tavily               — 1000/місяць безкоштовно → TAVILY_API_KEY
//   4. Brave                — 2000/місяць (заблоковано в UA) → BRAVE_SEARCH_API_KEY

export interface SearchResult {
  title: string
  link: string
  snippet: string
  source: string
  query: string
  vector: string
  relevanceScore?: number
}

const NOISE_KEYWORDS = [
  'актер', 'актриса', 'певец', 'певица', 'художник', 'поэт', 'писатель',
  'режиссер', 'сериал', 'театр', 'концерт', 'шоу', 'клип', 'мюзикл',
  'спортсмен', 'футболист', 'боксер', 'чемпион', 'тренер', 'стадион',
  'номинант', 'премия', 'победитель', 'лауреат', 'биография', 'фильм',
  'инстаграм-блогер', 'блогер', 'тиктокер', 'ютубер', 'influencer',
]
const SIGNAL_KEYWORDS = [
  'военный', 'военнослужащий', 'солдат', 'офицер', 'призван', 'мобилизован',
  'в/ч', 'воинская часть', 'батальон', 'бригада', 'полк', 'дивизия',
  'задержан', 'арестован', 'осужден', 'разыскивается', 'военный преступник',
  'паспорт', 'снилс', 'инн', 'военный билет', 'личный номер',
  'участник', 'агрессия', 'оккупант', 'росгвардия', 'фсб', 'гру',
]

export function scoreResult(title: string, snippet: string): number {
  const text = (title + ' ' + snippet).toLowerCase()
  let score = 50
  for (const kw of NOISE_KEYWORDS) if (text.includes(kw)) score -= 15
  for (const kw of SIGNAL_KEYWORDS) if (text.includes(kw)) score += 12
  return Math.max(0, Math.min(100, score))
}

// ─── 1. Serper ────────────────────────────────────────────────────────────────
let serperQuotaExhausted = false

async function serperSearch(
  query: string, vector: string, lang: 'ua' | 'ru' | 'en' = 'ua',
): Promise<{ results: SearchResult[]; quotaExceeded: boolean }> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey || serperQuotaExhausted) return { results: [], quotaExceeded: serperQuotaExhausted }

  const langConfig = { ua: { gl: 'ua', hl: 'uk' }, ru: { gl: 'ru', hl: 'ru' }, en: { gl: 'us', hl: 'en' } }
  const { gl, hl } = langConfig[lang]

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl, hl, num: 10 }),
    })

    const body = await res.text()

    if (res.status === 429 || res.status === 402 || res.status === 403 ||
        (res.status === 400 && (body.includes('credits') || body.includes('quota') || body.includes('limit')))) {
      console.warn(`Serper quota exhausted (${res.status}): ${body}`)
      serperQuotaExhausted = true
      return { results: [], quotaExceeded: true }
    }
    if (!res.ok) {
      console.error(`Serper error [${lang}]: ${res.status} ${body}`)
      return { results: [], quotaExceeded: false }
    }

    const data = JSON.parse(body)
    if (!data.organic?.length) return { results: [], quotaExceeded: false }

    return {
      quotaExceeded: false,
      results: data.organic.map((item: any) => {
        let source = item.link || ''; try { source = new URL(item.link).hostname } catch {}
        const title = item.title || ''; const snippet = item.snippet || ''
        return { title, link: item.link || '', snippet, source, query, vector, relevanceScore: scoreResult(title, snippet) }
      }),
    }
  } catch (err) {
    console.error('serperSearch error:', err)
    return { results: [], quotaExceeded: false }
  }
}

// ─── 2. Google Custom Search Engine (пряме Google API) ───────────────────────
// Отримати ключ: https://developers.google.com/custom-search/v1/introduction
// Створити CSE:  https://programmablesearchengine.google.com/ (поставте "Шукати по всьому Інтернету")
async function googleCseSearch(query: string, vector: string, lang: 'ua' | 'ru' | 'en'): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_CSE_KEY
  const cx = process.env.GOOGLE_CSE_CX
  if (!apiKey || !cx) return []

  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('cx', cx)
    url.searchParams.set('q', query)
    url.searchParams.set('num', '10')
    const lrMap = { ua: 'lang_uk', ru: 'lang_ru', en: 'lang_en' }
    url.searchParams.set('lr', lrMap[lang])

    const res = await fetch(url.toString())
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`Google CSE error: ${res.status} ${body}`)
      return []
    }
    const data = await res.json()
    return (data.items || []).map((item: any) => {
      let source = item.link || ''; try { source = new URL(item.link).hostname } catch {}
      const title = item.title || ''; const snippet = item.snippet || ''
      return { title, link: item.link || '', snippet, source, query, vector, relevanceScore: scoreResult(title, snippet) }
    })
  } catch (err) {
    console.error('googleCseSearch error:', err)
    return []
  }
}

// ─── 3. Tavily ────────────────────────────────────────────────────────────────
// Реєстрація: https://app.tavily.com/sign-up  (1000 безкоштовних/місяць, працює в Україні)
async function tavilySearch(query: string, vector: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return []

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 10,
        include_answer: false,
      }),
    })
    if (!res.ok) {
      console.error(`Tavily error: ${res.status} ${await res.text().catch(() => '')}`)
      return []
    }
    const data = await res.json()
    return (data.results || []).map((item: any) => {
      let source = item.url || ''; try { source = new URL(item.url).hostname } catch {}
      const title = item.title || ''; const snippet = item.content || ''
      return { title, link: item.url || '', snippet, source, query, vector, relevanceScore: scoreResult(title, snippet) }
    })
  } catch (err) {
    console.error('tavilySearch error:', err)
    return []
  }
}

// ─── 4. Brave (може бути заблоковано в UA) ───────────────────────────────────
async function braveSearch(query: string, vector: string): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY
  if (!apiKey) return []
  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q', query); url.searchParams.set('count', '10'); url.searchParams.set('text_decorations', 'false')
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
    })
    if (!res.ok) { console.error(`Brave error: ${res.status}`); return [] }
    const data = await res.json()
    return (data.web?.results ?? []).map((item: any) => {
      let source = item.url || ''; try { source = new URL(item.url).hostname } catch {}
      const title = item.title || ''; const snippet = item.description || ''
      return { title, link: item.url || '', snippet, source, query, vector, relevanceScore: scoreResult(title, snippet) }
    })
  } catch (err) { console.error('braveSearch error:', err); return [] }
}

// ─── Публічна функція — перебирає провайдерів по черзі ───────────────────────
export async function googleSearch(
  query: string,
  vector: string,
  lang: 'ua' | 'ru' | 'en' = 'ua',
): Promise<SearchResult[]> {
  // 1. Serper
  if (!serperQuotaExhausted && process.env.SERPER_API_KEY) {
    const { results, quotaExceeded } = await serperSearch(query, vector, lang)
    if (!quotaExceeded && results.length > 0) return results
    if (quotaExceeded) console.warn('Serper вичерпано — переходимо на Google CSE / Tavily')
  }

  // 2. Google CSE Direct
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) {
    const results = await googleCseSearch(query, vector, lang)
    if (results.length > 0) return results
  }

  // 3. Tavily
  if (process.env.TAVILY_API_KEY) {
    const results = await tavilySearch(query, vector)
    if (results.length > 0) return results
  }

  // 4. Brave
  if (process.env.BRAVE_SEARCH_API_KEY) {
    return braveSearch(query, vector)
  }

  // Нічого не налаштовано
  if (!process.env.GOOGLE_CSE_KEY && !process.env.TAVILY_API_KEY && !process.env.BRAVE_SEARCH_API_KEY) {
    console.error(
      'OSINT: Немає активного пошукового API.\n' +
      '  → Tavily (1000/міс, безкоштовно, UA): https://app.tavily.com/sign-up → TAVILY_API_KEY\n' +
      '  → Google CSE (100/день): https://programmablesearchengine.google.com → GOOGLE_CSE_KEY + GOOGLE_CSE_CX'
    )
  }
  return []
}
