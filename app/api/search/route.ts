// app/api/search/route.ts
// Уніфікований пошук: спочатку локальна база, потім інтернет

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Serper.dev пошук ──────────────────────────────────────────────────────
async function serperSearch(query: string) {
  const key = process.env.SERPER_API_KEY
  if (!key) return null
  try {
    const resp = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'ua', hl: 'uk', num: 5 }),
      signal: AbortSignal.timeout(6000),
    })
    if (!resp.ok) return null
    return await resp.json()
  } catch { return null }
}

// ─── Витяг даних зі сніпета для попереднього перегляду ────────────────────
function parseInternetResult(r: any, source: string) {
  const title = (r.title || '').replace(/\s*[-–—|]\s*(Миротворець|VKontakte|ВКонтакте|Одноклассники|poteru\.net).*/i, '').trim()
  const snippet = r.snippet || ''

  // Дата народження зі сніпета
  const dobM = snippet.match(/(\d{2}\.\d{2}\.\d{4})/)
  const dob = dobM ? dobM[1] : null

  // Місто/адреса
  const addrM = snippet.match(/(?:адрес[аи]?|місто|город|проживает)[:\s]+([^\n,\.]{3,40})/i)
  const addr = addrM ? addrM[1].trim() : null

  return { title, snippet: snippet.slice(0, 200), dob, addr }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() || ''
  const internetOnly = searchParams.get('internet') === '1'

  if (q.length < 2) {
    return NextResponse.json({
      local: { results: [], total: 0 },
      internet: { results: [], searched: false },
    })
  }

  // ── 1. Пошук у локальній базі ──────────────────────────────────────────
  let localResults: any[] = []
  let localTotal = 0

  if (!internetOnly) {
    // Use trigram index on `name` (unified field) — OR across 6 columns bypasses indexes and times out
    const { data, count } = await supabase
      .from('persons')
      .select('id, name, name_ukr, name_rus, name_eng, dob, rank, unit, photo_url, threat_level, status, verified', { count: 'estimated' })
      .ilike('name', `%${q}%`)
      .limit(30)

    localResults = data || []
    localTotal = count || 0
  }

  // ── 2. Інтернет-пошук (якщо мало локальних результатів або явно запитано) ──
  const shouldSearchInternet = internetOnly || localTotal < 5

  let internetResults: any[] = []

  if (shouldSearchInternet) {
    // Послідовний пошук (уникаємо rate limit Serper)
    // Спочатку загальний пошук — найбільше шансів знайти
    const [generalData, myrotvoretsData, vkData] = await Promise.all([
      serperSearch(`"${q}"`),
      serperSearch(`"${q}" site:myrotvorets.center`),
      serperSearch(`"${q}" site:vk.com OR site:ok.ru`),
    ])

    // Додатково: витоки і бази (якщо перші 3 не дали результатів)
    let leaksData: any = null
    let poteruData: any = null
    if ((generalData?.organic || []).length < 3) {
      ;[leaksData, poteruData] = await Promise.all([
        serperSearch(`"${q}" (паспорт OR СНІЛС OR ІПН OR ГИБДД OR розшук OR арешт)`),
        serperSearch(`"${q}" site:poteru.net OR site:war-crimes.in.ua`),
      ])
    }

    // ── Загальний веб — ПЕРШИЙ (найважливіший для будь-якої людини) ──
    const knownUrls = new Set<string>()
    for (const r of generalData?.organic || []) {
      if (!r.link || knownUrls.has(r.link)) continue
      knownUrls.add(r.link)
      const parsed = parseInternetResult(r, 'web')

      // Визначаємо джерело по URL
      let source = 'web', label = '🌐 Веб', color = 'gray'
      if (r.link.includes('myrotvorets.center/criminal/')) { source = 'myrotvorets'; label = '🇺🇦 Миротворець'; color = 'yellow' }
      else if (r.link.includes('vk.com/')) { source = 'vk'; label = '📘 VK'; color = 'blue' }
      else if (r.link.includes('ok.ru/')) { source = 'ok'; label = '📙 OK.ru'; color = 'blue' }
      else if (r.link.includes('facebook.com/')) { source = 'fb'; label = '📘 Facebook'; color = 'blue' }
      else if (r.link.includes('instagram.com/')) { source = 'ig'; label = '📸 Instagram'; color = 'blue' }
      else if (r.link.includes('poteru.net')) { source = 'poteru'; label = '⚰️ Poteru.net'; color = 'gray' }
      else if (r.link.includes('war-crimes.in.ua')) { source = 'warcrimes'; label = '⚖️ War-Crimes'; color = 'red' }
      else if (r.link.includes('opensanctions.org')) { source = 'sanctions'; label = '🚫 Санкції'; color = 'red' }

      internetResults.push({
        source, source_label: label, source_color: color,
        url: r.link,
        myrotvorets_url: source === 'myrotvorets' ? r.link : undefined,
        name: parsed.title,
        snippet: parsed.snippet,
        dob: parsed.dob,
        addr: parsed.addr,
        canImport: source === 'myrotvorets',
      })
    }

    // ── Myrotvorets специфічний пошук ──
    for (const r of myrotvoretsData?.organic || []) {
      if (!r.link?.includes('myrotvorets.center/criminal/') || knownUrls.has(r.link)) continue
      knownUrls.add(r.link)
      const parsed = parseInternetResult(r, 'myrotvorets')
      internetResults.unshift({ // додаємо на початок
        source: 'myrotvorets', source_label: '🇺🇦 Миротворець', source_color: 'yellow',
        url: r.link, myrotvorets_url: r.link,
        name: parsed.title, snippet: parsed.snippet, dob: parsed.dob, addr: parsed.addr,
        canImport: true,
      })
    }

    // ── VK/OK специфічний пошук ──
    for (const r of vkData?.organic || []) {
      if (!r.link || knownUrls.has(r.link)) continue
      knownUrls.add(r.link)
      const parsed = parseInternetResult(r, 'vk')
      const isVk = r.link.includes('vk.com/')
      internetResults.push({
        source: isVk ? 'vk' : 'ok', source_label: isVk ? '📘 VK' : '📙 OK.ru', source_color: 'blue',
        url: r.link, name: parsed.title, snippet: parsed.snippet, canImport: false,
      })
    }

    // ── Витоки / документи ──
    for (const r of leaksData?.organic || []) {
      if (!r.link || knownUrls.has(r.link)) continue
      knownUrls.add(r.link)
      const parsed = parseInternetResult(r, 'web')
      internetResults.push({
        source: 'leak', source_label: '📋 Документи', source_color: 'red',
        url: r.link, name: parsed.title, snippet: parsed.snippet, dob: parsed.dob, canImport: false,
      })
    }

    // ── Poteru/War-crimes специфічний ──
    for (const r of poteruData?.organic || []) {
      if (!r.link || knownUrls.has(r.link)) continue
      knownUrls.add(r.link)
      const parsed = parseInternetResult(r, 'poteru')
      const isWarCrimes = r.link.includes('war-crimes.in.ua')
      internetResults.push({
        source: isWarCrimes ? 'warcrimes' : 'poteru',
        source_label: isWarCrimes ? '⚖️ War-Crimes' : '⚰️ Poteru.net',
        source_color: isWarCrimes ? 'red' : 'gray',
        url: r.link, name: parsed.title, snippet: parsed.snippet, dob: parsed.dob, canImport: false,
      })
    }

  }

  return NextResponse.json({
    local: {
      results: localResults,
      total: localTotal,
    },
    internet: {
      results: internetResults,
      searched: shouldSearchInternet,
    },
  })
}
