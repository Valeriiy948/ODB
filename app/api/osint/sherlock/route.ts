// app/api/osint/sherlock/route.ts
// Sherlock username hunt — 400+ social platforms
// POST /api/osint/sherlock  body: { username, timeout? }

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT  = process.env.TELEGRAM_SEARCH_PORT || '8001'
const VPS_BASE = `http://${VPS_HOST}:${TG_PORT}`

export async function POST(req: NextRequest) {
  try {
    const { username, timeout = 15, mode = 'quick' } = await req.json()
    if (!username?.trim()) {
      return NextResponse.json({ error: 'username required' }, { status: 400 })
    }

    const timeoutMs = mode === 'full' ? 180_000 : 45_000
    const res = await fetch(`${VPS_BASE}/search/sherlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim().replace(/^@/, ''), timeout, mode }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return NextResponse.json({ error: err.error || `HTTP ${res.status}`, found: [], total: 0 }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ success: true, source: 'sherlock', ...data })
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'timeout', found: [], total: 0 }, { status: 504 })
    }
    return NextResponse.json({ error: err.message, found: [], total: 0 }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    tool: 'Sherlock',
    version: '0.16.0',
    description: 'Username search across 400+ social platforms',
    vps: `${VPS_HOST}:${TG_PORT}`,
  })
}
