// app/api/phone-check/route.ts
// Standalone phone presence check: Telegram, Viber, WhatsApp, Signal, GetContact, NumBuster
// POST { phone: "+380991234567" }

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT  = process.env.TELEGRAM_SEARCH_PORT || '8001'
const REG_PORT = process.env.REGISTRIES_PORT || '8006'

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('380')) return `+${digits}`
  if (digits.startsWith('7'))   return `+${digits}`
  if (digits.length === 10)     return `+38${digits}`
  return `+${digits}`
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() } catch { return fallback }
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const rawPhone = body.phone || body.query || ''
  if (!rawPhone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  const phone = normalizePhone(rawPhone)

  const [telegram, vpsPresence, numbuster, truecaller] = await Promise.all([
    // Telegram — lookup via telethon MTProto
    safe(async () => {
      const res = await fetch(`http://${VPS_HOST}:8008/search/phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return null
      const d = await res.json()
      return d.found ? { found: true, name: d.name || d.first_name, username: d.username, tg_id: d.user_id || d.tg_id } : { found: false }
    }, null),

    // WhatsApp + Viber via VPS (telegram_search.py check endpoint)
    safe(async () => {
      const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/check/phone-presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) return null
      return await res.json()
    }, null),

    // NumBuster (caller ID)
    safe(async () => {
      const res = await fetch(`http://${VPS_HOST}:${REG_PORT}/registry/numbuster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return null
      return await res.json()
    }, null),

    // Truecaller
    safe(async () => {
      const key = process.env.TRUECALLER_API_KEY
      if (!key) return null
      const res = await fetch(
        `https://api4.truecaller.com/v1/search?q=${encodeURIComponent(phone)}&countryCode=UA&type=4&locAddr=&placement=SEARCHRESULTS,HISTORY,DETAILS&encoding=json`,
        {
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
        }
      )
      if (!res.ok) return null
      const data = await res.json()
      const r = data?.data?.[0]
      return r ? { name: r.name, carrier: r.phones?.[0]?.carrier, country: r.phones?.[0]?.countryCode } : null
    }, null),
  ])

  return NextResponse.json({
    phone,
    messengers: {
      telegram: telegram || { found: false },
      whatsapp: vpsPresence?.whatsapp !== undefined ? { found: !!vpsPresence.whatsapp } : null,
      viber:    vpsPresence?.viber    !== undefined ? { found: !!vpsPresence.viber }    : null,
      signal:   vpsPresence?.signal   !== undefined ? { found: !!vpsPresence.signal }   : null,
    },
    caller_id: {
      numbuster:  numbuster?.success ? { name: numbuster.name, rating: numbuster.rating } : null,
      truecaller: truecaller,
    },
  })
}
