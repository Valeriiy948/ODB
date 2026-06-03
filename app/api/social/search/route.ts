// app/api/social/search/route.ts
// Проксі між браузером і VPS social-search сервісом (уникаємо CORS)

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST    = process.env.VPS_HOST    || '161.35.86.145'
const SOCIAL_PORT = process.env.SOCIAL_SEARCH_PORT || '8005'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { endpoint, ...payload } = body

    // endpoint: 'instagram' | 'tiktok' | 'getcontact' | 'username'
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
    }

    const res = await fetch(`http://${VPS_HOST}:${SOCIAL_PORT}/social/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `VPS error ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)

  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'timeout', found: false }, { status: 504 })
    }
    return NextResponse.json({ error: err.message, found: false }, { status: 503 })
  }
}
