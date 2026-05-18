// app/api/osint/photos/[id]/route.ts
// Авто-збір фото з VK, OK.ru, Instagram через VPS
// POST /api/osint/photos/[id]

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_HOST  = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT   = process.env.TELEGRAM_SEARCH_PORT || '8001'
const VK_TOKEN  = process.env.VK_ACCESS_TOKEN || ''

interface PhotoResult {
  url:          string
  source:       'vk' | 'ok' | 'instagram' | 'telegram'
  profile_url?: string
  date?:        string
  likes?:       number
  album?:       string
}

// ─── VK фото через API ────────────────────────────────────────────────────────
async function fetchVkPhotos(vkUrl: string): Promise<PhotoResult[]> {
  if (!VK_TOKEN) return []
  try {
    // Витягуємо VK ID з URL
    const vkIdMatch = vkUrl.match(/vk\.com\/(?:id(\d+)|([^/?]+))/)
    if (!vkIdMatch) return []
    const ownerId = vkIdMatch[1] ? vkIdMatch[1] : vkIdMatch[2]

    // Спочатку отримуємо числовий ID якщо це slug
    let numId = vkIdMatch[1] || ''
    if (!numId) {
      const userRes = await fetch(
        `https://api.vk.com/method/users.get?user_ids=${ownerId}&access_token=${VK_TOKEN}&v=5.131`,
        { signal: AbortSignal.timeout(10000) }
      )
      const userData = await userRes.json()
      numId = userData.response?.[0]?.id?.toString() || ''
    }
    if (!numId) return []

    // Фото зі стіни (album_id=-7) і фото профілю (-6)
    const photos: PhotoResult[] = []
    for (const albumId of ['-7', '-6', '-9']) {
      const res = await fetch(
        `https://api.vk.com/method/photos.get?owner_id=${numId}&album_id=${albumId}&count=20&rev=1&access_token=${VK_TOKEN}&v=5.131`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      for (const p of (data.response?.items || [])) {
        // Беремо найбільший розмір
        const sizes = p.sizes || []
        const best = sizes.sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0]
        if (best?.url) {
          photos.push({
            url:         best.url,
            source:      'vk',
            profile_url: vkUrl,
            date:        p.date ? new Date(p.date * 1000).toISOString() : undefined,
            likes:       p.likes?.count,
            album:       albumId === '-7' ? 'wall' : albumId === '-6' ? 'profile' : 'saved',
          })
        }
      }
    }
    return photos.slice(0, 30)
  } catch (err) {
    console.warn('VK photos error:', err)
    return []
  }
}

// ─── OK.ru фото (scraper через VPS) ──────────────────────────────────────────
async function fetchOkPhotos(okUrl: string): Promise<PhotoResult[]> {
  try {
    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/scrape/ok-photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_url: okUrl, limit: 20 }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.photos || []).map((p: any) => ({
      url:         p.url,
      source:      'ok' as const,
      profile_url: okUrl,
      date:        p.date,
      likes:       p.likes,
    }))
  } catch {
    return []
  }
}

// ─── Instagram фото через VPS instagrapi ─────────────────────────────────────
async function fetchInstagramPhotos(igUrl: string): Promise<PhotoResult[]> {
  try {
    const usernameMatch = igUrl.match(/instagram\.com\/([^/?]+)/)
    if (!usernameMatch) return []
    const username = usernameMatch[1]

    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/scrape/instagram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, limit: 20 }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.photos || []).map((p: any) => ({
      url:         p.url || p.thumbnail_url,
      source:      'instagram' as const,
      profile_url: igUrl,
      date:        p.taken_at || p.date,
      likes:       p.like_count,
    }))
  } catch {
    return []
  }
}

// ─── Завантажити та зберегти фото в Supabase Storage ────────────────────────
async function uploadToStorage(personId: string, photoUrl: string, index: number): Promise<string | null> {
  try {
    const res = await fetch(photoUrl, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const ext = photoUrl.includes('.png') ? 'png' : 'jpg'
    const path = `person-photos/${personId}/${index}.${ext}`

    const { error } = await supabaseAdmin.storage
      .from('persons')
      .upload(path, buf, { contentType: `image/${ext}`, upsert: true })

    if (error) return null

    const { data } = supabaseAdmin.storage.from('persons').getPublicUrl(path)
    return data.publicUrl
  } catch {
    return null
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const saveToStorage = body.save_photos !== false  // default: true

  const { data: person, error } = await supabaseAdmin
    .from('persons').select('*').eq('id', id).single()
  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const allPhotos: PhotoResult[] = []

  // Паралельний збір з усіх платформ
  const tasks: Promise<PhotoResult[]>[] = []

  if (person.vk_url)        tasks.push(fetchVkPhotos(person.vk_url))
  if (person.ok_url)        tasks.push(fetchOkPhotos(person.ok_url))
  if (person.instagram_url) tasks.push(fetchInstagramPhotos(person.instagram_url))

  const results = await Promise.allSettled(tasks)
  for (const r of results) {
    if (r.status === 'fulfilled') allPhotos.push(...r.value)
  }

  if (allPhotos.length === 0) {
    return NextResponse.json({
      success: true,
      found: 0,
      message: 'Немає профілів VK/OK/Instagram для збору фото. Спочатку знайдіть профілі.',
    })
  }

  // Зберігаємо перші 3 фото в Storage
  let newAvatarUrl = person.photo_url
  const savedUrls: string[] = []

  if (saveToStorage) {
    const topPhotos = allPhotos.slice(0, 10)
    for (let i = 0; i < Math.min(topPhotos.length, 3); i++) {
      const saved = await uploadToStorage(id, topPhotos[i].url, i)
      if (saved) {
        savedUrls.push(saved)
        if (i === 0 && !person.photo_url) newAvatarUrl = saved
      }
    }
  }

  // Зберігаємо в person_photos JSONB
  const existing = person.person_photos || []
  const existingUrls = new Set(existing.map((p: any) => p.url))
  const newEntries = allPhotos
    .filter(p => !existingUrls.has(p.url))
    .map(p => ({ ...p, found_at: new Date().toISOString() }))

  const merged = [...existing, ...newEntries].slice(0, 100)

  const updateData: any = { person_photos: merged }
  if (newAvatarUrl && !person.photo_url) updateData.photo_url = newAvatarUrl

  await supabaseAdmin.from('persons').update(updateData).eq('id', id)

  return NextResponse.json({
    success:      true,
    found:        allPhotos.length,
    new_entries:  newEntries.length,
    saved_to_storage: savedUrls.length,
    avatar_updated: !person.photo_url && Boolean(newAvatarUrl),
    sources: {
      vk:        allPhotos.filter(p => p.source === 'vk').length,
      ok:        allPhotos.filter(p => p.source === 'ok').length,
      instagram: allPhotos.filter(p => p.source === 'instagram').length,
    },
    sample: allPhotos.slice(0, 5).map(p => ({ url: p.url, source: p.source })),
  })
}
