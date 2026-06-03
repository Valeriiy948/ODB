// app/api/osint/findface/[id]/route.ts
// FindFace / FindClone — пошук по фото через VPS Selenium-сервіс
// Потрібно: photo_url або файл у Supabase Storage
// VPS: python3 scripts/findface_scraper.py --server --port 8004

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_HOST       = process.env.VPS_HOST || '161.35.86.145'
const FINDFACE_PORT  = process.env.FINDFACE_PORT || '8004'

interface FaceMatch {
  source:      string   // 'vk' | 'ok' | 'instagram' | 'findclone'
  profile_url: string
  name?:       string
  similarity?: number
  photo_url?:  string
  found_at:    string
}

async function searchFindFace(photoUrl: string): Promise<FaceMatch[]> {
  try {
    const res = await fetch(`http://${VPS_HOST}:${FINDFACE_PORT}/search/face`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ photo_url: photoUrl }),
      signal:  AbortSignal.timeout(120000), // face search is slow
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).map((r: any) => ({
      ...r,
      source:   r.source || 'findface',
      found_at: new Date().toISOString(),
    }))
  } catch {
    return []
  }
}

async function searchFindClone(photoUrl: string): Promise<FaceMatch[]> {
  try {
    const res = await fetch(`http://${VPS_HOST}:${FINDFACE_PORT}/search/findclone`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ photo_url: photoUrl }),
      signal:  AbortSignal.timeout(120000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).map((r: any) => ({
      source:      r.source || 'findclone',
      profile_url: r.profile_url || r.url,
      name:        r.name,
      similarity:  r.similarity,
      photo_url:   r.photo_url,
      found_at:    new Date().toISOString(),
    }))
  } catch {
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

  // Знаходимо фото для пошуку
  const photoUrl: string | null =
    person.photo_url ||
    person.person_photos?.[0]?.url ||
    null

  if (!photoUrl) {
    return NextResponse.json({
      success: false,
      error:   'Фото відсутнє. Спочатку додайте фото особи для пошуку по обличчю.',
    }, { status: 400 })
  }

  // Паралельний пошук у FindFace і FindClone
  const [ffResults, fcResults] = await Promise.all([
    searchFindFace(photoUrl),
    searchFindClone(photoUrl),
  ])

  const allResults = [...ffResults, ...fcResults]

  // Якщо обидва сервіси недоступні
  if (allResults.length === 0 && ffResults.length === 0 && fcResults.length === 0) {
    return NextResponse.json({
      success:         false,
      error:           'FindFace сервіс недоступний',
      setup_required:  true,
      photo_used:      photoUrl,
      setup_instructions: [
        '1. На VPS: pip3 install selenium undetected-chromedriver pillow requests',
        '2. Встановіть ChromeDriver: apt install chromium-chromedriver',
        '3. Скопіюйте scripts/findface_scraper.py на VPS',
        '4. Запустіть: python3 /opt/odb/findface_scraper.py --server --port 8004',
        '5. Додайте в .env.local: FINDFACE_PORT=8004',
      ],
    }, { status: 503 })
  }

  // Дедублікація за profile_url
  const seen = new Set<string>()
  const unique = allResults.filter(r => {
    if (!r.profile_url || seen.has(r.profile_url)) return false
    seen.add(r.profile_url)
    return true
  })

  // Зберігаємо у person_photos разом із profile_url
  if (unique.length > 0) {
    const existing: any[] = person.person_photos || []
    // Додаємо нові записи тільки якщо profile_url ще не є
    const existingUrls = new Set(existing.map((p: any) => p.profile_url).filter(Boolean))
    const newPhotos = unique
      .filter(r => !existingUrls.has(r.profile_url))
      .map(r => ({
        url:         r.photo_url || photoUrl,
        profile_url: r.profile_url,
        source:      r.source,
        name:        r.name,
        similarity:  r.similarity,
        found_by:    'findface',
        found_at:    r.found_at,
      }))

    if (newPhotos.length > 0) {
      const merged = [...existing, ...newPhotos].slice(0, 100)
      await supabaseAdmin.from('persons')
        .update({ person_photos: merged })
        .eq('id', id)
    }

    // Якщо VK/Instagram URL знайдено — оновлюємо профілі
    const vkMatch = unique.find(r => r.source === 'vk' && r.profile_url)
    const igMatch = unique.find(r => r.source === 'instagram' && r.profile_url)
    const updates: Record<string, string> = {}
    if (vkMatch && !person.vk_url)        updates.vk_url = vkMatch.profile_url
    if (igMatch && !person.instagram_url) updates.instagram_url = igMatch.profile_url
    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from('persons').update(updates).eq('id', id)
    }
  }

  return NextResponse.json({
    success:    true,
    found:      unique.length,
    results:    unique,
    photo_used: photoUrl,
    sources: {
      findface:  ffResults.length,
      findclone: fcResults.length,
    },
  })
}
