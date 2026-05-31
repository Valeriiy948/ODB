// app/api/osint/tiktok/[id]/route.ts
// TikTok OSINT — пошук акаунту по username або варіантах імені

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
function generateCandidates(fullName: string, dob?: string): string[] {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length < 2) return []
  const [last, first] = parts.map(translit)
  const yy = dob?.match(/(\d{4})/)?.[1]?.slice(-2) || ''
  return [
    `${first}${last}`, `${first}.${last}`, `${first}_${last}`,
    `${last}${first}`, `${first}${last}${yy}`,
  ].filter(Boolean)
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
  const candidates = body.username
    ? [body.username]
    : generateCandidates(name, person.dob)

  const results: any[] = []

  for (const username of candidates.slice(0, 5)) {
    try {
      const res = await fetch(`http://${VPS_HOST}:${SOCIAL_PORT}/social/tiktok`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
        signal: AbortSignal.timeout(12000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.found) results.push({ ...data, _candidate: username })
      }
    } catch { /* skip */ }
    if (results.length >= 2) break
  }

  // Зберігаємо
  if (results.length > 0) {
    const existing: any[] = person.social_profiles || []
    const newProfiles = results.map(r => ({
      platform: 'tiktok',
      username: r.username,
      url: r.url,
      full_name: r.full_name,
      followers: r.followers,
      likes: r.likes,
      videos: r.videos,
      is_verified: r.is_verified,
      profile_pic: r.profile_pic,
      bio: r.bio,
      found_at: new Date().toISOString(),
    }))
    const others = existing.filter((s: any) => s.platform !== 'tiktok')
    await supabase.from('persons')
      .update({ social_profiles: [...others, ...newProfiles] })
      .eq('id', id)
  }

  return NextResponse.json({
    success: true,
    found: results.length,
    profiles: results,
    candidates_tried: candidates.slice(0, 5),
  })
}
