// app/api/public/signals/route.ts
// Публічний API — без авторизації, тізер для landing page

import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('whitebit_signals')
    .select('id, market, signal_type, emoji, severity, change_pct, price, volume_usd, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
