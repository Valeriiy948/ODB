// app/api/osint/vk/[id]/route.ts
// Пошук в VK (ВКонтакте) за ім'ям + роком народження

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface VkProfile {
  vk_id: number
  url: string
  name: string
  photo: string
  city?: string
  bdate?: string
  followers?: number
  last_seen?: string
  is_closed: boolean
  confidence: number // 0-100
}

function matchScore(profile: any, nameWords: string[], dobYear?: string): number {
  let score = 0
  const firstName = (profile.first_name || '').toLowerCase()
  const lastName = (profile.last_name || '').toLowerCase()
  const fullName = `${firstName} ${lastName}`

  // Збіг прізвища (+50)
  for (const w of nameWords) {
    if (lastName.includes(w) || w.includes(lastName.slice(0, 5))) score += 50
    // Збіг імені (+20)
    if (firstName.includes(w.slice(0, 4))) score += 20
  }

  // Збіг року народження (+25)
  if (dobYear && profile.bdate) {
    if (String(profile.bdate).includes(dobYear)) score += 25
  }

  // Профіль не закритий (+5)
  if (!profile.is_closed) score += 5

  // Є фото (+5)
  if (profile.photo_max && !profile.photo_max.includes('camera_50')) score += 5

  return Math.min(100, score)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const vkToken = process.env.VK_ACCESS_TOKEN
  if (!vkToken) {
    return NextResponse.json(
      { error: 'VK_ACCESS_TOKEN не налаштовано у .env.local. Отримайте на vk.com/apps → Standalone app → Service token' },
      { status: 503 }
    )
  }

  const { data: person, error } = await supabaseAdmin
    .from('persons').select('*').eq('id', id).single()
  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const name = person.name_rus || person.name_ukr || person.name || ''
  if (!name || name.length < 3) {
    return NextResponse.json({ error: 'Немає імені для пошуку' }, { status: 400 })
  }

  // Парсимо рік народження
  const dob = person.dob || ''
  const dobYear = dob.match(/(\d{4})/)?.[1]

  // Слова імені для порівняння
  const nameWords = name.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3)

  try {
    // VK users.search API
    const vkUrl = new URL('https://api.vk.com/method/users.search')
    vkUrl.searchParams.set('q', name)
    vkUrl.searchParams.set('count', '20')
    vkUrl.searchParams.set('fields', 'photo_max,city,bdate,followers_count,last_seen,is_closed,domain')
    if (dobYear) vkUrl.searchParams.set('birth_year', dobYear)
    vkUrl.searchParams.set('access_token', vkToken)
    vkUrl.searchParams.set('v', '5.199')

    const res = await fetch(vkUrl.toString())
    if (!res.ok) {
      return NextResponse.json({ error: `VK API HTTP ${res.status}` }, { status: 502 })
    }
    const data = await res.json()

    if (data.error) {
      return NextResponse.json(
        { error: `VK API error ${data.error.error_code}: ${data.error.error_msg}` },
        { status: 502 }
      )
    }

    const items: any[] = data.response?.items || []

    // Скоруємо та фільтруємо
    const profiles: VkProfile[] = items
      .map((p: any) => ({
        vk_id: p.id,
        url: `https://vk.com/${p.domain || `id${p.id}`}`,
        name: `${p.first_name} ${p.last_name}`,
        photo: p.photo_max || '',
        city: p.city?.title || '',
        bdate: p.bdate || '',
        followers: p.followers_count || 0,
        last_seen: p.last_seen ? new Date(p.last_seen.time * 1000).toLocaleDateString('uk-UA') : '',
        is_closed: p.is_closed || false,
        confidence: matchScore(p, nameWords, dobYear),
      }))
      .filter((p: VkProfile) => p.confidence >= 30)
      .sort((a: VkProfile, b: VkProfile) => b.confidence - a.confidence)

    // Зберігаємо в social_profiles
    if (profiles.length > 0) {
      const existing = person.social_profiles || []
      const newVk = profiles.slice(0, 5).map((p: VkProfile) => ({
        platform: 'vk',
        profile_id: String(p.vk_id),
        url: p.url,
        name: p.name,
        photo_url: p.photo,
        city: p.city,
        confidence: p.confidence,
        found_at: new Date().toISOString(),
      }))

      // Замінюємо старі VK профілі, зберігаємо інші платформи
      const otherPlatforms = existing.filter((s: any) => s.platform !== 'vk')
      await supabaseAdmin.from('persons')
        .update({ social_profiles: [...otherPlatforms, ...newVk] })
        .eq('id', id)

      // Якщо впевненість > 70 і немає VK URL — зберігаємо як основний
      const topProfile = profiles[0]
      if (topProfile.confidence >= 70 && !person.vk_url) {
        await supabaseAdmin.from('persons')
          .update({ vk_url: topProfile.url })
          .eq('id', id)
      }
    }

    return NextResponse.json({
      success: true,
      found: profiles.length,
      profiles,
      searched_name: name,
      searched_year: dobYear || null,
    })
  } catch (err: any) {
    console.error('VK search error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
