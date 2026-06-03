// app/api/osint/phone-presence/[id]/route.ts
// WhatsApp / Viber presence — перевірка реєстрації номерів у месенджерах
// Методи:
//   1. WhatsApp Business API (якщо є ключ) або через VPS headless-check
//   2. Viber — публічна перевірка через viber.com/search
//   3. Truecaller API (якщо є ключ) для ідентифікації власника

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_HOST   = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT    = process.env.TELEGRAM_SEARCH_PORT || '8001'

// ── Truecaller ────────────────────────────────────────────────────────────────
async function checkTruecaller(phone: string): Promise<any | null> {
  const apiKey = process.env.TRUECALLER_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(
      `https://api4.truecaller.com/v1/search?q=${encodeURIComponent(phone)}&countryCode=UA&type=4&locAddr=&placement=SEARCHRESULTS,HISTORY,DETAILS&encoding=json`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.data?.[0]
    if (!result) return null
    return {
      name:    result.name,
      carrier: result.phones?.[0]?.carrier,
      country: result.phones?.[0]?.countryCode,
      tags:    result.tags,
      score:   result.score,
    }
  } catch {
    return null
  }
}

// ── VPS WhatsApp/Viber check ──────────────────────────────────────────────────
async function checkVPSPresence(phone: string): Promise<{ whatsapp?: boolean; viber?: boolean }> {
  try {
    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/check/phone-presence`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone }),
      signal:  AbortSignal.timeout(20000),
    })
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}

// ── HLR Lookup (carrier) ──────────────────────────────────────────────────────
async function hlrLookup(phone: string): Promise<any | null> {
  // Використовуємо безкоштовний HLR endpoint якщо є
  const hlrKey = process.env.HLR_LOOKUP_KEY
  if (!hlrKey) return null
  try {
    const res = await fetch(
      `https://api.hlr-lookups.com/api/sync/hlr?msisdn=${encodeURIComponent(phone)}&route=IP&provider=IP`,
      {
        headers: { Authorization: `Basic ${Buffer.from(hlrKey).toString('base64')}` },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    return {
      status:    data.status,
      country:   data.mcc_mnc_iso,
      carrier:   data.original_network_name,
      ported:    data.is_ported,
      roaming:   data.is_roaming,
    }
  } catch {
    return null
  }
}

// Нормалізуємо номер до E.164
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('380')) return `+${digits}`
  if (digits.startsWith('7'))   return `+${digits}`
  if (digits.length === 10)     return `+38${digits}`
  return `+${digits}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: person, error } = await supabaseAdmin
    .from('persons').select('*').eq('id', id).single()
  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  // Extract phones: from person.phones array + from telegram_raw leaks fields
  const tgPhones: string[] = []
  if (Array.isArray(person.telegram_raw)) {
    for (const entry of person.telegram_raw) {
      for (const leak of (entry.leaks || [])) {
        if (leak.fields?.phone) tgPhones.push(String(leak.fields.phone))
      }
    }
  }
  const rawPhones: string[] = [
    ...(person.phones || []),
    ...tgPhones,
  ].filter(Boolean)

  if (rawPhones.length === 0) {
    return NextResponse.json({
      success: false,
      error:   'Немає номерів телефону для перевірки',
    }, { status: 400 })
  }

  const phones = [...new Set(rawPhones.map(normalizePhone))]
  const results: any[] = []

  for (const phone of phones.slice(0, 5)) {  // max 5 phones
    // Паралельна перевірка
    const [tcData, vpsPresence, hlrData] = await Promise.all([
      checkTruecaller(phone),
      checkVPSPresence(phone),
      hlrLookup(phone),
    ])

    results.push({
      phone,
      whatsapp:  vpsPresence.whatsapp ?? null,
      viber:     vpsPresence.viber    ?? null,
      truecaller: tcData,
      carrier:   hlrData?.carrier || tcData?.carrier || null,
      country:   hlrData?.country || tcData?.country || null,
      is_ported: hlrData?.ported  ?? null,
      checked_at: new Date().toISOString(),
    })
  }

  // Зберігаємо результати у person_mentions
  const messengerFinds = results.filter(r => r.whatsapp || r.viber)
  if (messengerFinds.length > 0 || results.some(r => r.truecaller)) {
    const existing = person.person_mentions || []
    const newMentions = results
      .filter(r => r.whatsapp || r.viber || r.truecaller)
      .map(r => ({
        source_type: 'phone_presence',
        source:      [
          r.whatsapp ? 'WhatsApp' : null,
          r.viber    ? 'Viber'    : null,
          r.truecaller ? 'Truecaller' : null,
        ].filter(Boolean).join(', '),
        phone:      r.phone,
        carrier:    r.carrier,
        truecaller: r.truecaller,
        found_at:   r.checked_at,
        snippet:    `${r.phone}: ${[r.whatsapp ? 'WhatsApp✓' : null, r.viber ? 'Viber✓' : null].filter(Boolean).join(' ')} ${r.truecaller?.name || ''}`.trim(),
      }))
    await supabaseAdmin.from('persons')
      .update({ person_mentions: [...existing, ...newMentions].slice(0, 100) })
      .eq('id', id)
  }

  const whatsappCount = results.filter(r => r.whatsapp).length
  const viberCount    = results.filter(r => r.viber).length

  return NextResponse.json({
    success:         true,
    phones_checked:  phones.length,
    results,
    summary: {
      whatsapp_found: whatsappCount,
      viber_found:    viberCount,
      truecaller_found: results.filter(r => r.truecaller).length,
    },
    note: (!process.env.TRUECALLER_API_KEY && !process.env.HLR_LOOKUP_KEY)
      ? 'Для повної перевірки додайте TRUECALLER_API_KEY або HLR_LOOKUP_KEY в .env.local'
      : undefined,
  })
}
