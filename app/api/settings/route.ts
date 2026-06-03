// app/api/settings/route.ts
// GET  — поточні налаштування (env + Supabase)
// POST — зберегти налаштування (тільки адмін)

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'vmak948@gmail.com')
  .split(',').map(e => e.trim().toLowerCase())

// Keys that come from env vars (show their status)
const ENV_KEYS: Record<string, string> = {
  SHODAN_API_KEY:     process.env.SHODAN_API_KEY     || '',
  DEHASHED_API_KEY:   process.env.DEHASHED_API_KEY   || '',
  DEHASHED_EMAIL:     process.env.DEHASHED_EMAIL      || '',
  LEAKCHECK_API_KEY:  process.env.LEAKCHECK_API_KEY  || '',
  SNUSBASE_API_KEY:   process.env.SNUSBASE_API_KEY   || '',
  VK_ACCESS_TOKEN:    process.env.VK_ACCESS_TOKEN    || '',
  YOUCONTROL_API_KEY: process.env.YOUCONTROL_API_KEY || '',
  OPENDATABOT_API_KEY:process.env.OPENDATABOT_API_KEY || '',
  TAVILY_API_KEY:     process.env.TAVILY_API_KEY     || '',
  SERPER_API_KEY:     process.env.SERPER_API_KEY     || '',
  ANTHROPIC_API_KEY:  process.env.ANTHROPIC_API_KEY  || '',
}

function maskKey(val: string): string {
  if (!val || val.length < 8) return ''
  return val.slice(0, 4) + '•'.repeat(Math.min(val.length - 8, 20)) + val.slice(-4)
}

async function checkAdmin(req: NextRequest): Promise<boolean> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return false
  const { data: { user } } = await supabase.auth.getUser(token)
  return ADMIN_EMAILS.includes((user?.email || '').toLowerCase())
}

export async function GET(req: NextRequest) {
  const isAdmin = await checkAdmin(req)

  // Try to get from Supabase platform_settings
  let dbSettings: Record<string, string> = {}
  try {
    const { data } = await supabase.from('platform_settings').select('key, value, is_secret')
    for (const row of data || []) {
      dbSettings[row.key] = row.value || ''
    }
  } catch {}

  // Build response: merge env + db, mask secrets for non-admin
  const apiKeys = Object.entries(ENV_KEYS).map(([key, envVal]) => {
    const dbVal = dbSettings[key] || ''
    const activeVal = envVal || dbVal  // env takes priority
    const configured = activeVal.length > 0
    return {
      key,
      configured,
      source: envVal ? 'env' : dbVal ? 'db' : 'none',
      value: isAdmin ? (configured ? maskKey(activeVal) : '') : undefined,
    }
  })

  // Platform preferences from DB
  const preferences = {
    MAX_RESULTS_PER_PAGE:    dbSettings['MAX_RESULTS_PER_PAGE']    || '50',
    SESSION_TIMEOUT_HOURS:   dbSettings['SESSION_TIMEOUT_HOURS']   || '24',
    ADMIN_EMAILS:            isAdmin ? (dbSettings['ADMIN_EMAILS'] || ADMIN_EMAILS.join(',')) : undefined,
  }

  return NextResponse.json({
    is_admin:    isAdmin,
    api_keys:    apiKeys,
    preferences,
    platform: {
      vps_host:        process.env.VPS_HOST || '',
      telegram_port:   process.env.TELEGRAM_SEARCH_PORT || '8001',
      spiderfoot_port: process.env.SPIDERFOOT_PORT || '8007',
      supabase_url:    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    },
  })
}

export async function POST(req: NextRequest) {
  const isAdmin = await checkAdmin(req)
  if (!isAdmin) return NextResponse.json({ error: 'Тільки для адміна' }, { status: 403 })

  try {
    const body = await req.json()
    const { settings } = body // { KEY: 'value', ... }

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'settings object required' }, { status: 400 })
    }

    const rows = Object.entries(settings).map(([key, value]) => ({
      key,
      value: String(value),
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('platform_settings')
      .upsert(rows, { onConflict: 'key' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, updated: rows.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
