// app/api/vps/route.ts
// Proxy to VPS orchestrator (:8011) — no Vercel 10s timeout since we stream/proxy.
// Auth: forwarded via x-internal-key to the orchestrator.

import { NextRequest, NextResponse } from 'next/server'

const VPS_URL = `http://${process.env.VPS_HOST || '161.35.86.145'}:8011`
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || ''

async function proxyToVPS(request: NextRequest, path: string) {
  const url = `${VPS_URL}${path}`
  const isGet = request.method === 'GET'

  let body: string | undefined
  if (!isGet) {
    try { body = await request.text() } catch { body = undefined }
  }

  const resp = await fetch(url, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_KEY,
    },
    body,
    // No timeout — VPS handles it; Vercel Hobby won't kill us for proxied responses
  })

  const data = await resp.json()
  return NextResponse.json(data, { status: resp.status })
}

// POST /api/vps — aggregated search (main endpoint)
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path') || '/search'

  try {
    return await proxyToVPS(request, path)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'vps_error' }, { status: 502 })
  }
}

// GET /api/vps?path=/health  — health / proxy GET endpoints
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path') || '/health'

  try {
    const url = `${VPS_URL}${path}`
    const resp = await fetch(url, {
      headers: { 'x-internal-key': INTERNAL_KEY },
    })
    const data = await resp.json()
    return NextResponse.json(data, { status: resp.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'vps_error' }, { status: 502 })
  }
}
