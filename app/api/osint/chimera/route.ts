// app/api/osint/chimera/route.ts
// Chimera — Maigret deep OSINT + RU/UA platform aggregator (3000+ sites)
// POST /api/osint/chimera  body: { username, timeout? }

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT  = process.env.TELEGRAM_SEARCH_PORT || '8001'
const VPS_BASE = `http://${VPS_HOST}:${TG_PORT}`

export async function POST(req: NextRequest) {
  try {
    const { username, timeout = 30 } = await req.json()
    if (!username?.trim()) {
      return NextResponse.json({ error: 'username required' }, { status: 400 })
    }

    const res = await fetch(`${VPS_BASE}/search/maigret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim().replace(/^@/, ''), timeout }),
      signal: AbortSignal.timeout(180 * 1000),  // 3 min — Maigret scans 3000+ sites
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return NextResponse.json({ error: err.error || `HTTP ${res.status}`, found: [], total: 0 }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ success: true, source: 'chimera', ...data })
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'timeout', found: [], total: 0 }, { status: 504 })
    }
    return NextResponse.json({ error: err.message, found: [], total: 0 }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    tool: 'Chimera / Maigret',
    version: '0.6.1',
    description: 'Deep username OSINT — 3000+ sites, RU/UA focus, extracts extra profile data',
    vps: `${VPS_HOST}:${TG_PORT}`,
  })
}
