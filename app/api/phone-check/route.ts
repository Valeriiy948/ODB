// app/api/phone-check/route.ts
// Comprehensive phone intelligence: carrier + messengers + social networks
// POST { phone: "+380991234567" }

import { NextRequest, NextResponse } from 'next/server'

const VPS_URL = process.env.VPS_URL || 'https://evidencebases.com/odb-api'

// ─── Carrier detection by prefix (no API, instant) ───────────────────────────
interface CarrierInfo {
  operator: string
  country: string
  country_code: string
  number_type: 'mobile' | 'landline' | 'voip' | 'unknown'
  mnp: boolean | null
}

const UA_MOBILE: Record<string, string> = {
  '067': 'Kyivstar', '096': 'Kyivstar', '097': 'Kyivstar', '098': 'Kyivstar', '068': 'Kyivstar',
  '050': 'Vodafone Ukraine', '066': 'Vodafone Ukraine', '095': 'Vodafone Ukraine', '099': 'Vodafone Ukraine',
  '063': 'lifecell', '073': 'lifecell', '093': 'lifecell',
  '091': 'Ukrtelecom Mobile', '092': 'PEOPLEnet', '094': 'Intertelecom', '039': '3Mob',
}
const UA_LANDLINE: Record<string, string> = {
  '044': 'Київ', '048': 'Одеса', '057': 'Харків', '032': 'Львів',
  '062': 'Донецьк', '061': 'Запоріжжя', '056': 'Дніпро',
}
const RU_MOBILE: Record<string, string> = {
  '916': 'МТС', '917': 'МТС', '909': 'МТС', '910': 'МТС', '915': 'МТС',
  '919': 'МТС', '980': 'МТС', '985': 'МТС', '926': 'МТС',
  '921': 'МегаФон', '922': 'МегаФон', '931': 'МегаФон', '932': 'МегаФон',
  '933': 'МегаФон', '999': 'МегаФон', '928': 'МегаФон', '927': 'МегаФон',
  '903': 'Beeline', '905': 'Beeline', '906': 'Beeline', '929': 'Beeline',
  '900': 'Tele2', '902': 'Tele2', '904': 'Tele2', '908': 'Tele2',
  '950': 'Tele2', '951': 'Tele2', '952': 'Tele2', '953': 'Tele2',
}
const BY_MOBILE: Record<string, string> = {
  '29': 'МТС Беларусь', '33': 'МТС Беларусь',
  '44': 'A1 (Velcom)', '25': 'A1 (Velcom)',
  '17': 'life:)', '41': 'life:)',
}

function detectCarrier(phone: string): CarrierInfo {
  const clean = phone.replace(/\D/g, '')

  if (clean.startsWith('380') && clean.length === 12) {
    const p3 = clean.substring(2, 5)
    if (UA_MOBILE[p3]) return { operator: UA_MOBILE[p3], country: 'Україна', country_code: 'UA', number_type: 'mobile', mnp: null }
    if (UA_LANDLINE[p3]) return { operator: UA_LANDLINE[p3], country: 'Україна', country_code: 'UA', number_type: 'landline', mnp: null }
    return { operator: 'Невідомий UA', country: 'Україна', country_code: 'UA', number_type: 'mobile', mnp: null }
  }
  if ((clean.startsWith('7') || clean.startsWith('8')) && clean.length === 11) {
    const p3 = clean.substring(1, 4)
    return { operator: RU_MOBILE[p3] || 'Оператор РФ', country: 'Росія', country_code: 'RU', number_type: 'mobile', mnp: null }
  }
  if (clean.startsWith('375') && clean.length === 12) {
    const p2 = clean.substring(3, 5)
    return { operator: BY_MOBILE[p2] || 'Оператор BY', country: 'Білорусь', country_code: 'BY', number_type: 'mobile', mnp: null }
  }
  const countries: Array<[string, string, string]> = [
    ['374','Вірменія','AM'],['994','Азербайджан','AZ'],['995','Грузія','GE'],
    ['996','Киргизстан','KG'],['998','Узбекистан','UZ'],['992','Таджикистан','TJ'],
    ['44','Велика Британія','GB'],['49','Німеччина','DE'],['33','Франція','FR'],
    ['48','Польща','PL'],['1','США/Канада','US'],
  ]
  for (const [code, country, cc] of countries) {
    if (clean.startsWith(code)) {
      return { operator: 'Невідомо', country, country_code: cc, number_type: 'unknown', mnp: null }
    }
  }
  return { operator: 'Невідомо', country: 'Невідома країна', country_code: '??', number_type: 'unknown', mnp: null }
}

function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('380') && d.length === 12) return `+${d}`
  if (d.startsWith('7') && d.length === 11)   return `+${d}`
  if (d.startsWith('375') && d.length === 12) return `+${d}`
  if (d.length === 10 && d.startsWith('0'))   return `+38${d}`
  if (d.length === 10)                        return `+38${d}`
  return `+${d}`
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() } catch { return fallback }
}

// ─── Telegram via Telethon :8008 (nginx proxy) ───────────────────────────────
async function checkTelegram(phone: string) {
  return safe(async () => {
    const res = await fetch(`${VPS_URL}/telethon/search/phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const d = await res.json()
    return d.found
      ? { found: true, name: d.name || d.first_name, username: d.username, tg_id: d.user_id || d.tg_id }
      : { found: false }
  }, null)
}

// ─── WhatsApp via UltraMsg (cloud API, works from Vercel) ────────────────────
// Register at ultramsg.com → New Instance → scan QR → get instanceId + token
// Set env: ULTRAMSG_INSTANCE_ID, ULTRAMSG_TOKEN
async function checkWhatsApp(phone: string) {
  return safe(async () => {
    const instanceId = process.env.ULTRAMSG_INSTANCE_ID
    const token      = process.env.ULTRAMSG_TOKEN
    if (!instanceId || !token) return null

    const cleanPhone = phone.replace(/\D/g, '')
    const body = new URLSearchParams({ token, id: `${cleanPhone}@c.us` })

    const res = await fetch(`https://api.ultramsg.com/${instanceId}/contacts/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    // UltraMsg returns: { id, numberExists, isBusiness, isEnterprise }
    if (data.error) return null
    return { found: data.numberExists === true, is_business: data.isBusiness }
  }, null)
}

// ─── VKontakte phone lookup via VK API ───────────────────────────────────────
async function checkVK(phone: string) {
  return safe(async () => {
    const token = process.env.VK_ACCESS_TOKEN
    if (!token) return null

    const cleanPhone = phone.replace(/\D/g, '')
    const url = `https://api.vk.com/method/account.lookupContacts?contacts=${encodeURIComponent(cleanPhone)}&service=phone&fields=photo_50,screen_name&access_token=${token}&v=5.131`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    const found = data.response?.found?.[0]
    if (!found) return { found: false }
    return {
      found: true,
      name: [found.first_name, found.last_name].filter(Boolean).join(' '),
      url: `https://vk.com/${found.screen_name || `id${found.id}`}`,
      photo: found.photo_50 || null,
    }
  }, null)
}

// ─── NumBuster via nginx → :8006 ─────────────────────────────────────────────
async function checkNumBuster(phone: string) {
  return safe(async () => {
    const res = await fetch(`${VPS_URL}/regs/registry/numbuster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    return await res.json()
  }, null)
}

// ─── Truecaller direct API ────────────────────────────────────────────────────
async function checkTruecaller(phone: string) {
  return safe(async () => {
    const key = process.env.TRUECALLER_API_KEY
    if (!key) return null
    const res = await fetch(
      `https://api4.truecaller.com/v1/search?q=${encodeURIComponent(phone)}&countryCode=UA&type=4&locAddr=&placement=SEARCHRESULTS,HISTORY,DETAILS&encoding=json`,
      { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const r = data?.data?.[0]
    return r ? { name: r.name, carrier: r.phones?.[0]?.carrier, country: r.phones?.[0]?.countryCode } : null
  }, null)
}

// ─── GetContact via nginx → :8005 ────────────────────────────────────────────
async function checkGetContact(phone: string) {
  return safe(async () => {
    const res = await fetch(`${VPS_URL}/social-vps/social/getcontact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.found && !data.total) return null
    return data
  }, null)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const rawPhone = body.phone || body.query || ''
  if (!rawPhone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  const phone = normalizePhone(rawPhone)
  const cleanPhone = phone.replace(/\D/g, '')
  const carrier_info = detectCarrier(phone)

  const [telegram, whatsapp, vk, numbuster, truecaller, getcontact] = await Promise.all([
    checkTelegram(phone),
    checkWhatsApp(phone),
    checkVK(phone),
    checkNumBuster(phone),
    checkTruecaller(phone),
    checkGetContact(phone),
  ])

  // Merge truecaller carrier into carrier_info if better data available
  if (truecaller?.carrier && carrier_info.operator.includes('Невідом')) {
    carrier_info.operator = truecaller.carrier
  }

  // Quick-access links for manual verification (pre-filled with phone)
  const links = {
    whatsapp:  `https://wa.me/${cleanPhone}`,
    viber:     `viber://chat?number=%2B${cleanPhone}`,
    telegram:  telegram?.username ? `https://t.me/${telegram.username}` : `https://t.me/+${cleanPhone}`,
    signal:    `https://signal.me/#p/%2B${cleanPhone}`,
    vk:        `https://vk.com/search?c%5Bq%5D=${cleanPhone}&c%5Bsection%5D=people`,
    facebook:  `https://www.facebook.com/search/people/?q=%2B${cleanPhone}`,
    instagram: `https://www.instagram.com`,
    tiktok:    `https://www.tiktok.com/search/user?q=${cleanPhone}`,
    ok:        `https://ok.ru/search?query=${cleanPhone}&st.cmd=peopleSearch`,
    linkedin:  `https://www.linkedin.com/search/results/people/?keywords=${cleanPhone}`,
    getcontact:`https://www.getcontact.com/en/number/${cleanPhone}`,
    numbuster: `https://numbuster.com/number/${phone}`,
    truecaller:`https://www.truecaller.com/search/ua/${cleanPhone}`,
  }

  return NextResponse.json({
    phone,
    carrier_info,
    messengers: {
      telegram: telegram || { found: false },
      whatsapp: whatsapp,  // null = not configured (needs Green-API), false/true = checked
      viber:    null,      // no free API — use links.viber for manual check
      signal:   null,      // no API exists
    },
    social: {
      vk:        vk,       // null = no VK_ACCESS_TOKEN
      instagram: null,
      facebook:  null,
    },
    caller_id: {
      numbuster:  numbuster?.success ? { name: numbuster.name, rating: numbuster.rating } : null,
      truecaller: truecaller,
      getcontact: getcontact,
    },
    links,
    config: {
      whatsapp_enabled:  !!(process.env.ULTRAMSG_INSTANCE_ID && process.env.ULTRAMSG_TOKEN),
      vk_enabled:        !!process.env.VK_ACCESS_TOKEN,
    },
  })
}
