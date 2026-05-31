import { NextResponse } from 'next/server'

// ⚠️ Debug endpoint — disabled in production
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  // Dev only — show which keys are configured (never values)
  const keys = [
    'ANTHROPIC_API_KEY', 'GOOGLE_CSE_CX', 'GOOGLE_API_KEY',
    'VK_ACCESS_TOKEN', 'TAVILY_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'VPS_HOST', 'TELEGRAM_SEARCH_PORT',
  ]
  const status: Record<string, string> = {}
  for (const k of keys) {
    const v = process.env[k]
    status[k] = v ? `SET (${v.length} chars)` : 'NOT SET'
  }
  return NextResponse.json({ env: status, NODE_ENV: process.env.NODE_ENV })
}
