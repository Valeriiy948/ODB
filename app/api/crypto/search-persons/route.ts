// app/api/crypto/search-persons/route.ts
// Quick search persons for wallet linking autocomplete
// GET /api/crypto/search-persons?q=Іванов

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  try {
    const { data } = await supabase
      .from('persons')
      .select('id, name, name_ukr, name_rus, dob, photo_url, threat_level, crypto_wallets')
      .or([
        `name.ilike.%${q}%`,
        `name_ukr.ilike.%${q}%`,
        `name_rus.ilike.%${q}%`,
      ].join(','))
      .limit(10)

    return NextResponse.json({
      results: (data || []).map(p => ({
        id:            p.id,
        name:          p.name || p.name_ukr || p.name_rus || 'Unknown',
        dob:           p.dob,
        threat_level:  p.threat_level,
        photo_url:     p.photo_url,
        wallet_count:  (p.crypto_wallets || []).length,
      }))
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
