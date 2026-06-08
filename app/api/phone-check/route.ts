// app/api/phone-check/route.ts
// Phone enrichment: carrier detection + messenger presence + caller ID
// VPS access goes through nginx HTTPS proxy (direct ports blocked by UFW)
// POST { phone: "+380991234567" }

import { NextRequest, NextResponse } from 'next/server'

// All VPS calls go through nginx HTTPS proxy → evidencebases.com/odb-api
// Nginx routes: /odb-api/telethon/ → :8008, /odb-api/presence/ → :8001, /odb-api/regs/ → :8006
const VPS_URL = process.env.VPS_URL || 'https://evidencebases.com/odb-api'

// ─── Carrier detection by number prefix (no API, no cost) ────────────────────
interface CarrierInfo {
  operator: string
  country: string
  country_code: string
  number_type: 'mobile' | 'landline' | 'voip' | 'unknown'
  mnp: boolean | null
}

const UA_MOBILE: Record<string, string> = {
  // Kyivstar
  '067': 'Kyivstar', '096': 'Kyivstar', '097': 'Kyivstar', '098': 'Kyivstar', '068': 'Kyivstar',
  // Vodafone Ukraine
  '050': 'Vodafone Ukraine', '066': 'Vodafone Ukraine', '095': 'Vodafone Ukraine', '099': 'Vodafone Ukraine',
  // lifecell
  '063': 'lifecell', '073': 'lifecell', '093': 'lifecell',
  // Інші UA
  '091': 'Ukrtelecom Mobile', '092': 'PEOPLEnet', '094': 'Intertelecom', '039': '3Mob',
}
const UA_LANDLINE: Record<string, string> = {
  '044': 'Київ (стаціонарний)', '045': 'Київська обл.', '048': 'Одеса',
  '057': 'Харків', '032': 'Львів', '062': 'Донецьк', '061': 'Запоріжжя',
  '0800': 'Безкоштовний (0800)',
}

const RU_MOBILE: Record<string, string> = {
  '916': 'МТС', '917': 'МТС', '909': 'МТС', '910': 'МТС', '915': 'МТС',
  '919': 'МТС', '980': 'МТС', '985': 'МТС', '926': 'МТС',
  '921': 'МегаФон', '922': 'МегаФон', '931': 'МегаФон', '932': 'МегаФон',
  '933': 'МегаФон', '999': 'МегаФон', '928': 'МегаФон', '927': 'МегаФон',
  '903': 'Beeline', '905': 'Beeline', '906': 'Beeline', '929': 'Beeline', '936': 'Beeline',
  '977': 'МТС', '978': 'Beeline', '989': 'МегаФон',
  '900': 'Tele2', '902': 'Tele2', '904': 'Tele2', '908': 'Tele2', '950': 'Tele2',
  '951': 'Tele2', '952': 'Tele2', '953': 'Tele2', '958': 'Tele2',
}

const BY_MOBILE: Record<string, string> = {
  '29': 'МТС Беларусь', '33': 'МТС Беларусь',
  '44': 'A1 (Velcom)', '25': 'A1 (Velcom)',
  '17': 'life:)', '41': 'life:)',
}

const COUNTRY_CODES: Array<[string, string, string]> = [
  ['380', 'Україна', 'UA'],
  ['7',   'Росія',   'RU'],
  ['375', 'Білорусь','BY'],
  ['374', 'Вірменія','AM'],
  ['994', 'Азербайджан','AZ'],
  ['995', 'Грузія',  'GE'],
  ['996', 'Киргизстан','KG'],
  ['998', 'Узбекистан','UZ'],
  ['992', 'Таджикистан','TJ'],
  ['44',  'Велика Британія','GB'],
  ['49',  'Німеччина','DE'],
  ['33',  'Франція', 'FR'],
  ['48',  'Польща',  'PL'],
  ['1',   'США/Канада','US'],
]

function detectCarrier(phone: string): CarrierInfo {
  const clean = phone.replace(/\D/g, '')

  // Ukraine +380
  if (clean.startsWith('380') && clean.length === 12) {
    const prefix3 = clean.substring(2, 5)
    if (UA_MOBILE[prefix3]) {
      return { operator: UA_MOBILE[prefix3], country: 'Україна', country_code: 'UA', number_type: 'mobile', mnp: null }
    }
    // Landline: first 3–4 digits after 380
    const prefix4 = clean.substring(2, 6)
    if (UA_LANDLINE[prefix3]) {
      return { operator: UA_LANDLINE[prefix3], country: 'Україна', country_code: 'UA', number_type: 'landline', mnp: null }
    }
    if (prefix4 === '0800') {
      return { operator: 'Безкоштовний (0800)', country: 'Україна', country_code: 'UA', number_type: 'voip', mnp: null }
    }
    return { operator: 'Невідомий UA оператор', country: 'Україна', country_code: 'UA', number_type: 'mobile', mnp: null }
  }

  // Russia +7
  if ((clean.startsWith('7') || clean.startsWith('8')) && clean.length === 11) {
    const prefix3 = clean.substring(1, 4)
    const operator = RU_MOBILE[prefix3] || 'Оператор РФ'
    return { operator, country: 'Росія', country_code: 'RU', number_type: 'mobile', mnp: null }
  }

  // Belarus +375
  if (clean.startsWith('375') && clean.length === 12) {
    const prefix2 = clean.substring(3, 5)
    const operator = BY_MOBILE[prefix2] || 'Оператор BY'
    return { operator, country: 'Білорусь', country_code: 'BY', number_type: 'mobile', mnp: null }
  }

  // Generic country detection
  for (const [code, country, cc] of COUNTRY_CODES) {
    if (clean.startsWith(code)) {
      return { operator: 'Невідомо', country, country_code: cc, number_type: 'unknown', mnp: null }
    }
  }

  return { operator: 'Невідомо', country: 'Невідома країна', country_code: '??', number_type: 'unknown', mnp: null }
}

// ─── Normalize phone ──────────────────────────────────────────────────────────
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('380') && digits.length === 12) return `+${digits}`
  if (digits.startsWith('7')   && digits.length === 11) return `+${digits}`
  if (digits.startsWith('375') && digits.length === 12) return `+${digits}`
  if (digits.length === 10 && digits.startsWith('0'))   return `+38${digits}`
  if (digits.length === 10)                             return `+38${digits}`
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
  const carrier_info = detectCarrier(phone)

  const [telegram, vpsPresence, numbuster, truecaller] = await Promise.all([
    // Telegram — Telethon MTProto via nginx → :8008
    safe(async () => {
      const res = await fetch(`${VPS_URL}/telethon/search/phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return null
      const d = await res.json()
      return d.found
        ? { found: true, name: d.name || d.first_name, username: d.username, tg_id: d.user_id || d.tg_id, photo: d.photo }
        : { found: false }
    }, null),

    // WhatsApp + Viber + Signal via nginx → :8001
    safe(async () => {
      const res = await fetch(`${VPS_URL}/presence/check/phone-presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) return null
      return await res.json()
    }, null),

    // NumBuster (caller ID) via nginx → :8006
    safe(async () => {
      const res = await fetch(`${VPS_URL}/regs/registry/numbuster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return null
      return await res.json()
    }, null),

    // Truecaller (direct API)
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

  // Merge truecaller carrier name into carrier_info if available
  if (truecaller?.carrier) {
    carrier_info.operator = truecaller.carrier
    carrier_info.mnp = false
  }

  return NextResponse.json({
    phone,
    carrier_info,
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
