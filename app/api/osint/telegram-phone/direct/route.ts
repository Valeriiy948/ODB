// app/api/osint/telegram-phone/direct/route.ts
// Прямий пошук Telegram-акаунту за номером телефону (без person_id)

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT  = process.env.TELEGRAM_SEARCH_PORT || '8001'

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json()
    if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/search/phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: String(phone).trim() }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.error || `VPS error ${res.status}`, found: false },
        { status: res.status }
      )
    }

    const data = await res.json()

    // VPS повертає user_id/username якщо знайдено
    if (!data.user_id && !data.username) {
      return NextResponse.json({ found: false, phone })
    }

    return NextResponse.json({
      found: true,
      phone,
      result: {
        user_id:    data.user_id,
        username:   data.username,
        first_name: data.first_name,
        last_name:  data.last_name,
        bio:        data.bio,
        photo_url:  data.photo_url,
        last_seen:  data.last_seen,
        verified:   data.verified || false,
      },
    })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
      return NextResponse.json({ error: 'VPS недоступний', found: false, vps_offline: true }, { status: 503 })
    }
    return NextResponse.json({ error: err.message, found: false }, { status: 500 })
  }
}
