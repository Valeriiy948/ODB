// app/api/admin/migrate/route.ts
// One-time migration runner — adds missing columns
// POST /api/admin/migrate  body: { secret: "odb-migrate-2026" }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MIGRATIONS = [
  {
    name: 'add_crypto_wallets_to_persons',
    sql: `ALTER TABLE persons ADD COLUMN IF NOT EXISTS crypto_wallets JSONB DEFAULT '[]'::jsonb;`,
  },
]

export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({}))
  if (secret !== 'odb-migrate-2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results: any[] = []

  for (const m of MIGRATIONS) {
    try {
      const { error } = await supabase.rpc('exec_migration', { sql: m.sql }).throwOnError()
      results.push({ name: m.name, status: 'ok' })
    } catch {
      // Fallback: try direct upsert approach (won't work for DDL, but catches error nicely)
      results.push({ name: m.name, status: 'needs_manual', sql: m.sql })
    }
  }

  return NextResponse.json({ results })
}
