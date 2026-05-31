// app/api/osint/instagram/[id]/route.ts
// Instagram OSINT — пошук по username або імені особи

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_HOST   = process.env.VPS_HOST   || '161.35.86.145'
const SOCIAL_PORT = process.env.SOCIAL_SEARCH_PORT || '8005'

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

  // Визначаємо username для пошуку
  // 1. Явний username у запиті 2. З vk_url/соц 3. З імені (транслітерація)
  const targetUsername = body.username
    || extractInstagramUsername(person.vk_url)
    || extractInstagramUsername(person.osint_connections)
    || null

  const results: any[] = []

  // Якщо є username — прямий пошук
  if (targetUsername) {
    try {
      const res = await fetch(`http://${VPS_HOST}:${SOCIAL_PORT}/social/instagram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUsername }),
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.found) results.push(data)
      }
    } catch { /* VPS offline */ }
  }

  // Пошук по варіантах імені (транслітерація)
  if (results.length === 0) {
    const name = person.name_rus || person.name_ukr || person.name || ''
    const usernameCandidates = generateUsernameCandidates(name, person.dob)

    for (const candidate of usernameCandidates.slice(0, 4)) {
      try {
        const res = await fetch(`http://${VPS_HOST}:${SOCIAL_PORT}/social/instagram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: candidate }),
          signal: AbortSignal.timeout(10000),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.found) {
            results.push({ ...data, _candidate: candidate })
          }
        }
      } catch { /* skip */ }
    }
  }

  // Зберігаємо знайдені профілі
  if (results.length > 0) {
    const existing: any[] = person.social_profiles || []
    const newProfiles = results.map(r => ({
      platform: 'instagram',
      username: r.username,
      url: r.url,
      full_name: r.full_name,
      followers: r.followers,
      is_private: r.is_private,
      is_verified: r.is_verified,
      profile_pic: r.profile_pic,
      bio: r.bio,
      found_at: new Date().toISOString(),
    }))
    const others = existing.filter((s: any) => s.platform !== 'instagram')
    await supabase.from('persons')
      .update({ social_profiles: [...others, ...newProfiles] })
      .eq('id', id)
  }

  return NextResponse.json({
    success: true,
    found: results.length,
    profiles: results,
    searched_username: targetUsername,
  })
}

// ─── Утиліти ─────────────────────────────────────────────────────────────────

function extractInstagramUsername(text?: string): string | null {
  if (!text) return null
  const m = text.match(/instagram\.com\/([a-zA-Z0-9._]+)/i)
    || text.match(/@([a-zA-Z0-9._]+)/)
  return m ? m[1] : null
}

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

function generateUsernameCandidates(fullName: string, dob?: string): string[] {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length < 2) return []
  const [last, first, middle] = parts.map(translit)
  const year = dob?.match(/(\d{4})/)?.[1] || ''
  const yy = year.slice(-2)

  return [
    `${first}.${last}`,
    `${first}${last}`,
    `${last}.${first}`,
    `${last}${first}`,
    `${first}_${last}`,
    `${last}_${first}`,
    `${first}${last}${yy}`,
    `${first}.${last}${yy}`,
    middle ? `${first}.${middle.slice(0,1)}.${last}` : '',
  ].filter(Boolean)
}
