// app/api/osint/search4faces/[id]/route.ts
// Пошук профілів по фото через VPS Telegram @SearchFaceBot
// Також підтримує прямий пошук через search4faces.com API (якщо є ключ)

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT  = process.env.TELEGRAM_SEARCH_PORT || '8001'
const S4F_KEY  = process.env.SEARCH4FACES_API_KEY || ''

interface FaceMatch {
  source:       'vk' | 'ok' | 'telegram' | 'search4faces'
  profile_url:  string
  photo_url?:   string
  name?:        string
  similarity?:  number
  raw?:         string
}

// ─── Search4Faces.com API (якщо є ключ) ──────────────────────────────────────
async function searchViaApi(photoBase64: string): Promise<FaceMatch[]> {
  try {
    const res = await fetch('https://search4faces.com/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${S4F_KEY}`,
      },
      body: JSON.stringify({ photo: photoBase64, top_k: 10, networks: ['vk', 'ok'] }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).map((r: any) => ({
      source:      r.network === 'ok' ? 'ok' : 'vk',
      profile_url: r.profile_url || r.url || '',
      photo_url:   r.photo_url || r.face_url || '',
      name:        r.name || '',
      similarity:  r.similarity || r.score || null,
    }))
  } catch (err) {
    console.warn('Search4Faces API error:', err)
    return []
  }
}

// ─── Через VPS @SearchFaceBot ─────────────────────────────────────────────────
async function searchViaTelegram(photoBuffer: Buffer): Promise<FaceMatch[]> {
  try {
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(photoBuffer)], { type: 'image/jpeg' })
    formData.append('photo', blob, 'face.jpg')

    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/search/face`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) return []
    const data = await res.json()

    return (data.results || []).map((r: any) => ({
      source:      r.source === 'ok' ? 'ok' : 'vk',
      profile_url: r.url || '',
      similarity:  r.similarity || null,
      raw:         r.text || r.raw || '',
    }))
  } catch (err) {
    console.warn('VPS face search error:', err)
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

  // Перевіряємо що є фото
  if (!person.photo_url) {
    return NextResponse.json({
      error: 'Фото відсутнє. Спочатку додайте фото до картки особи.',
      success: false,
    }, { status: 400 })
  }

  let photoBuffer: Buffer | null = null
  let photoBase64: string = ''

  // Завантажуємо фото
  try {
    const photoRes = await fetch(person.photo_url, { signal: AbortSignal.timeout(15000) })
    if (!photoRes.ok) throw new Error(`Фото недоступне: ${photoRes.status}`)
    const arrayBuf = await photoRes.arrayBuffer()
    photoBuffer = Buffer.from(arrayBuf)
    photoBase64 = photoBuffer.toString('base64')
  } catch (err: any) {
    return NextResponse.json({
      error: `Не вдалось завантажити фото: ${err.message}`,
      success: false,
    }, { status: 400 })
  }

  const results: FaceMatch[] = []

  // 1. Search4Faces.com API (якщо є ключ)
  if (S4F_KEY) {
    const apiResults = await searchViaApi(photoBase64)
    results.push(...apiResults)
    console.log(`Search4Faces API: ${apiResults.length} matches`)
  }

  // 2. VPS Telegram @SearchFaceBot (якщо API не дав результатів або немає ключа)
  if (results.length === 0 && photoBuffer) {
    const tgResults = await searchViaTelegram(photoBuffer)
    results.push(...tgResults)
    console.log(`Telegram face search: ${tgResults.length} matches`)
  }

  // Дедублікуємо за profile_url
  const seen = new Set<string>()
  const deduped = results.filter(r => {
    if (!r.profile_url) return false
    if (seen.has(r.profile_url)) return false
    seen.add(r.profile_url)
    return true
  })

  // Сортуємо за similarity (desc)
  deduped.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))

  // Зберігаємо в person_photos
  if (deduped.length > 0) {
    const photoEntries = deduped.map(r => ({
      source:      r.source,
      profile_url: r.profile_url,
      photo_url:   r.photo_url || null,
      name:        r.name || null,
      similarity:  r.similarity || null,
      found_at:    new Date().toISOString(),
    }))

    // Зберігаємо в person_photos
    const existing = person.person_photos || []
    const merged = [...existing, ...photoEntries].slice(0, 50) // max 50

    await supabaseAdmin.from('persons')
      .update({ person_photos: merged })
      .eq('id', id)

    // Якщо є VK профіль з > 70% схожість — зберігаємо як vk_url
    const topVk = deduped.find(r => r.source === 'vk' && (r.similarity || 0) >= 70)
    if (topVk && !person.vk_url) {
      await supabaseAdmin.from('persons')
        .update({ vk_url: topVk.profile_url })
        .eq('id', id)
    }
  }

  return NextResponse.json({
    success: true,
    found: deduped.length,
    results: deduped,
    method: S4F_KEY ? 'search4faces_api' : 'telegram_bot',
    note: !S4F_KEY && !person.photo_url
      ? 'Додайте SEARCH4FACES_API_KEY у .env.local для прямого API пошуку'
      : undefined,
  })
}
