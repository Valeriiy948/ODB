// app/api/persons/[id]/enrich/route.ts
// Автоматичне збагачення з Миротворця через Serper.dev
// Нуль ручних дій — все через Google Search API

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Serper.dev пошук ──────────────────────────────────────────────────────
async function serperSearch(query: string, type: 'search' | 'images' = 'search') {
  const key = process.env.SERPER_API_KEY
  if (!key) return null
  try {
    const resp = await fetch(`https://google.serper.dev/${type}`, {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'ua', hl: 'uk', num: 10 }),
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) return null
    return await resp.json()
  } catch { return null }
}

// ─── Парсинг сніпета Google → дані особи ──────────────────────────────────
function parseSnippet(snippet: string, title: string, url: string) {
  const result: Record<string, any> = { myrotvorets_url: url }

  // ── Імена з заголовку (формат: "Укр Ім'я / Рос Ім'я / Eng Name") ──
  const titleClean = title.replace(/\s*-\s*.*Миротворець.*$/i, '').trim()
  const nameParts = titleClean.split(/\s*[\/|]\s*/).map(s => s.trim()).filter(Boolean)
  if (nameParts[0]) result.name_ukr = nameParts[0]
  if (nameParts[1] && nameParts[1] !== nameParts[0]) result.name_rus = nameParts[1]
  if (nameParts[2]) result.name_eng = nameParts[2]

  // ── Дата народження ──
  const dobPatterns = [
    /(?:дата\s*(?:народження|рождения)|born|dob)[:\s]+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{4})/i,
    /(\d{2}\.\d{2}\.\d{4})/,
  ]
  for (const p of dobPatterns) {
    const m = snippet.match(p)
    if (m) { result.dob = m[1]; break }
  }

  // ── Країна ──
  const countryM = snippet.match(/(?:країна|страна|country)[:\s]+([^\n,\.]{2,30})/i)
  if (countryM) result.country = countryM[1].trim()

  // ── Адреса ──
  const addrM = snippet.match(/(?:адрес[аи]?|address|місце\s*проживання)[:\s]+([^\n]{5,100})/i)
  if (addrM) result.addr_live = addrM[1].trim()

  // ── Опис (весь сніпет без зайвого) ──
  const descClean = snippet
    .replace(/(?:дата\s*(?:народження|рождения)|країна|адрес[аи]?)[:\s]+[^\n]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
  if (descClean.length > 30) result.description = descClean

  return result
}

// ─── Перевірка: чи результат відповідає особі ─────────────────────────────
function resultMatchesPerson(personName: string, title: string, snippet: string): boolean {
  if (!personName) return true
  // Прізвище — перше слово; перевіряємо що є в заголовку/сніпеті
  const surname = personName.toLowerCase().split(/\s+/).find(w => w.length > 2)
  if (!surname) return true
  const text = (title + ' ' + snippet).toLowerCase()
  return text.includes(surname)
}

// ─── GET: Автопошук URL + витяг даних з Google сніпета ───────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: person, error } = await supabaseAdmin
    .from('persons')
    .select('id, name_ukr, name_rus, name, myrotvorets_url')
    .eq('id', id)
    .single()

  if (error || !person) {
    return NextResponse.json({ error: 'Особу не знайдено' }, { status: 404 })
  }

  if (person.myrotvorets_url) {
    return NextResponse.json({ found: true, url: person.myrotvorets_url, cached: true })
  }

  const nameRus = person.name_rus || person.name_ukr || person.name
  const nameUkr = person.name_ukr || person.name
  if (!nameRus && !nameUkr) {
    return NextResponse.json({ found: false, error: "Ім'я не вказано" })
  }

  // Шукаємо через Serper.dev (рос + укр варіанти)
  const queries = [
    nameRus && `"${nameRus}" site:myrotvorets.center`,
    nameUkr && nameUkr !== nameRus && `"${nameUkr}" site:myrotvorets.center`,
  ].filter(Boolean) as string[]

  for (const q of queries) {
    const data = await serperSearch(q, 'search')
    const results = data?.organic || []
    for (const r of results) {
      if (!r.link?.includes('myrotvorets.center/criminal/')) continue
      // Перевіряємо що знайдений результат є для правильної особи
      const checkName = nameRus || nameUkr || ''
      if (!resultMatchesPerson(checkName, r.title || '', r.snippet || '')) continue
      const extracted = parseSnippet(r.snippet || '', r.title || '', r.link)
      return NextResponse.json({
        found: true,
        url: r.link,
        title: r.title,
        snippet: r.snippet,
        extracted,
      })
    }
  }

  return NextResponse.json({ found: false, message: 'Не знайдено у Миротворці' })
}

// ─── POST: Повне автоматичне збагачення ────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()
    const { url, force = false } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL не вказано' }, { status: 400 })
    }

    const { data: currentPerson, error: fetchError } = await supabaseAdmin
      .from('persons').select('*').eq('id', id).single()

    if (fetchError || !currentPerson) {
      return NextResponse.json({ error: 'Особу не знайдено' }, { status: 404 })
    }

    if (currentPerson.myrotvorets_url && !force) {
      return NextResponse.json({
        error: 'Дані вже імпортовано.',
        myrotvorets_url: currentPerson.myrotvorets_url,
      }, { status: 409 })
    }

    // ── Крок 1: Дані зі сніпета Google ──
    const nameRus = currentPerson.name_rus || currentPerson.name_ukr || currentPerson.name
    const nameUkr = currentPerson.name_ukr || currentPerson.name

    let snippetData: Record<string, any> = {}
    const queries = [
      nameRus && `"${nameRus}" site:myrotvorets.center`,
      nameUkr && nameUkr !== nameRus && `"${nameUkr}" site:myrotvorets.center`,
    ].filter(Boolean) as string[]

    for (const q of queries) {
      const searchResult = await serperSearch(q, 'search')
      const match = (searchResult?.organic || []).find((r: any) =>
        r.link?.includes('myrotvorets.center/criminal/') &&
        (url === 'auto' || r.link === url || url.includes(r.link) || r.link.includes(url.split('/').filter(Boolean).pop() || ''))
      ) || (searchResult?.organic || []).find((r: any) => r.link?.includes('myrotvorets.center/criminal/'))

      if (match && resultMatchesPerson(nameRus || nameUkr || '', match.title || '', match.snippet || '')) {
        snippetData = parseSnippet(match.snippet || '', match.title || '', match.link)
        break
      }
    }

    // ── Крок 2: Фото через Google Images ──
    let photoUrl: string | undefined
    const photoQueries = [
      nameRus && `"${nameRus}" site:myrotvorets.center`,
      nameUkr && `"${nameUkr}" myrotvorets criminal photo`,
    ].filter(Boolean) as string[]

    for (const q of photoQueries) {
      const imgResult = await serperSearch(q, 'images')
      const images = imgResult?.images || []
      for (const img of images) {
        const imgUrl: string = img.imageUrl || img.thumbnailUrl || ''
        // Беремо тільки зображення з CDN Миротворця або перший валідний результат
        if (imgUrl && /\.(jpg|jpeg|png|webp)/i.test(imgUrl) && !imgUrl.includes('placeholder')) {
          // Пріоритет — CDN Миротворця
          if (imgUrl.includes('myrotvorets') || imgUrl.includes('cdn.')) {
            photoUrl = imgUrl
            break
          }
          // Fallback — перше зображення пошуку
          if (!photoUrl) photoUrl = imgUrl
        }
      }
      if (photoUrl?.includes('myrotvorets')) break
    }

    // ── Крок 3: Завантаження фото в Supabase Storage ──
    let storedPhotoUrl: string | undefined
    if (photoUrl) {
      try {
        const photoResp = await fetch(photoUrl, {
          headers: { 'Referer': 'https://google.com/' },
          signal: AbortSignal.timeout(10000),
        })
        if (photoResp.ok) {
          const contentType = photoResp.headers.get('content-type') || ''
          if (contentType.startsWith('image/')) {
            const photoBuffer = await photoResp.arrayBuffer()
            const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
            const fileName = `persons/${id}/myrotvorets_photo.${ext}`
            const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
              .from('media').upload(fileName, photoBuffer, { contentType, upsert: true })
            if (!uploadError && uploadData) {
              const { data: pub } = supabaseAdmin.storage.from('media').getPublicUrl(fileName)
              storedPhotoUrl = pub.publicUrl
            }
          }
        }
      } catch { /* фото не критично */ }
    }

    // ── Крок 4: Формуємо оновлення ──
    const updates: Record<string, any> = {}

    function setIfNew(field: string, value: any) {
      if (!value || value === '') return
      if (!force && currentPerson[field] && currentPerson[field] !== '') return
      updates[field] = value
    }

    // Імена — не перезаписуємо
    if (!currentPerson.name_ukr && snippetData.name_ukr) updates.name_ukr = snippetData.name_ukr
    if (!currentPerson.name_rus && snippetData.name_rus) updates.name_rus = snippetData.name_rus
    if (!currentPerson.name_eng && snippetData.name_eng) updates.name_eng = snippetData.name_eng

    setIfNew('dob', snippetData.dob)
    setIfNew('addr_live', snippetData.addr_live)
    setIfNew('description', snippetData.description)

    if (storedPhotoUrl) updates.photo_url = storedPhotoUrl
    else if (photoUrl && !currentPerson.photo_url) updates.photo_url = photoUrl

    updates.myrotvorets_url = url === 'auto' ? (snippetData.myrotvorets_url || url) : url
    updates.verified = true

    // Джерела
    if (url) {
      const existing = Array.isArray(currentPerson.sources) ? currentPerson.sources : []
      updates.sources = [...new Set([...existing, `Миротворець: ${updates.myrotvorets_url}`])]
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('persons').update(updates).eq('id', id)
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      method: 'serper_auto',
      imported: Object.keys(updates).length,
      fields: Object.keys(updates),
      photo_saved: !!storedPhotoUrl,
      photo_url: storedPhotoUrl || photoUrl,
      myrotvorets_url: updates.myrotvorets_url,
      data: {
        name_ukr: snippetData.name_ukr || currentPerson.name_ukr,
        name_rus: snippetData.name_rus || currentPerson.name_rus,
        name_eng: snippetData.name_eng,
        dob: snippetData.dob,
        addr_live: snippetData.addr_live,
        photo_url: storedPhotoUrl || photoUrl,
      },
    })

  } catch (err: any) {
    console.error('Enrich error:', err)
    return NextResponse.json({ error: err.message || 'Внутрішня помилка' }, { status: 500 })
  }
}
