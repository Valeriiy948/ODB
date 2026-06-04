// app/api/osint/social-all/[id]/route.ts
// Соцмережі OSINT — запускає всі платформи паралельно

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_HOST    = process.env.VPS_HOST || '161.35.86.145'
const SOCIAL_PORT = process.env.SOCIAL_SEARCH_PORT || '8005'

const TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',
  и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',
  с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
  і:'i',ї:'yi',є:'ye',ґ:'g',
}
function translit(s: string): string {
  return s.toLowerCase().split('').map(c => TRANSLIT[c] ?? c).join('')
    .replace(/[^a-z0-9_.]/g, '')
}
function getBestUsername(person: any): string {
  const name = person.name_rus || person.name_ukr || person.name || ''
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return translit(name)
  const [last, first] = parts.map(translit)
  return `${first}${last}`
}

async function vpsCall(endpoint: string, body: any, timeoutMs = 12000): Promise<any> {
  try {
    const res = await fetch(`http://${VPS_HOST}:${SOCIAL_PORT}/social/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status }
    return await res.json()
  } catch (e: any) {
    if (e.name === 'TimeoutError') return { error: 'timeout' }
    return { error: 'vps_offline' }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const { data: person, error } = await supabase
    .from('persons').select('*').eq('id', id).single()
  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const name = person.name_rus || person.name_ukr || person.name || ''
  const username = body.username || getBestUsername(person)
  const phones: string[] = [...(person.phones || [])].slice(0, 2)

  // ── Паралельно запускаємо всі платформи ─────────────────────────────────────
  const [igResult, ttResult, gcResult, unResult, vkResult] = await Promise.all([
    // Instagram
    vpsCall('instagram', { username }),
    // TikTok
    vpsCall('tiktok', { username }),
    // GetContact (тільки якщо є телефон)
    phones.length > 0 ? vpsCall('getcontact', { phone: phones[0] }) : Promise.resolve(null),
    // Username everywhere (Sherlock-style)
    vpsCall('username', { username }, 25000),
    // VK (через наш існуючий API)
    fetch(`/api/osint/vk/${id}`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
    }).then(r => r.ok ? r.json() : { error: `HTTP ${r.status}` }).catch(() => ({ error: 'failed' })),
  ])

  // ── Збираємо результати ──────────────────────────────────────────────────────
  const summary: Record<string, any> = {
    instagram: igResult?.found ? igResult : null,
    tiktok:    ttResult?.found ? ttResult : null,
    getcontact: gcResult?.names?.length > 0 ? gcResult : null,
    username_hits: unResult?.found || [],
    vk: vkResult?.profiles?.length > 0 ? vkResult.profiles : null,
  }

  // ── Оновлюємо social_profiles у Supabase ─────────────────────────────────────
  const newProfiles: any[] = []
  if (igResult?.found) {
    newProfiles.push({
      platform: 'instagram',
      username: igResult.username,
      url: igResult.url,
      full_name: igResult.full_name,
      followers: igResult.followers,
      profile_pic: igResult.profile_pic,
      is_private: igResult.is_private,
      found_at: new Date().toISOString(),
    })
  }
  if (ttResult?.found) {
    newProfiles.push({
      platform: 'tiktok',
      username: ttResult.username,
      url: ttResult.url,
      full_name: ttResult.full_name,
      followers: ttResult.followers,
      found_at: new Date().toISOString(),
    })
  }
  if ((unResult?.found || []).length > 0) {
    for (const hit of (unResult.found || []).slice(0, 10)) {
      newProfiles.push({
        platform: hit.platform.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        url: hit.url,
        found_at: new Date().toISOString(),
      })
    }
  }

  if (newProfiles.length > 0) {
    const existing: any[] = person.social_profiles || []
    const platforms = new Set(newProfiles.map((p: any) => p.platform))
    const kept = existing.filter((p: any) => !platforms.has(p.platform))
    await supabase.from('persons')
      .update({ social_profiles: [...kept, ...newProfiles].slice(0, 50) })
      .eq('id', id)
  }

  const totalFound = (igResult?.found ? 1 : 0)
    + (ttResult?.found ? 1 : 0)
    + (gcResult?.names?.length > 0 ? 1 : 0)
    + (unResult?.found?.length || 0)
    + (vkResult?.profiles?.length || 0)

  return NextResponse.json({
    success: true,
    total_found: totalFound,
    searched_username: username,
    searched_name: name,
    summary,
    new_profiles_saved: newProfiles.length,
  })
}
