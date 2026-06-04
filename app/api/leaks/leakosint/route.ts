// app/api/leaks/leakosint/route.ts
// POST /api/leaks/leakosint
// Пошук у LeakOsint API (800+ баз РФ/СНД)
// Response format: { List: { "DB Name": { Data: [...], InfoLeak, NumOfResults } }, NumOfResults, NumOfDatabase }

import { NextRequest, NextResponse } from 'next/server'

const TOKEN = process.env.LEAKOSINT_TOKEN || process.env.LEAKOSINT_API_KEY || ''

function extractField(obj: any, ...keys: string[]): string | null {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return String(obj[k]).trim()
  }
  return null
}

function normalizeEntry(raw: any, dbName: string): any {
  // Build full name from parts or use FullName directly
  let name = extractField(raw, 'FullName', 'full_name') ||
    [raw.LastName, raw.FirstName, raw.MiddleName].filter(Boolean).join(' ').trim() ||
    extractField(raw, 'Name', 'name') || null

  // Phone: may be stored as Phone, Telephone, Phones, etc.
  const phone = extractField(raw, 'Phone', 'Telephone', 'phone', 'tel') ||
    (Array.isArray(raw.Phones) ? raw.Phones[0] : null)

  // Email
  const email = extractField(raw, 'Email', 'email', 'E-mail')

  // DOB: BDay, Birthday, DateOfBirth, etc. — normalize to DD.MM.YYYY
  let dob = extractField(raw, 'BDay', 'Birthday', 'DateOfBirth', 'dob', 'Birthdate') || null
  if (dob) {
    // ISO "1998-03-27" → "27.03.1998"
    const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) dob = `${m[3]}.${m[2]}.${m[1]}`
  }

  // Address: may be City, Region, Address, etc.
  const addressParts = [
    raw.Address, raw.address,
    raw.Region && raw.City ? `${raw.Region}, ${raw.City}` : (raw.Region || raw.City),
  ].filter(Boolean)
  const address = addressParts[0] || null

  // Documents
  const inn = extractField(raw, 'INN', 'inn', 'TaxId')
  const passport = extractField(raw, 'Passport', 'PassportNumber', 'passport')
  const snils = extractField(raw, 'SNILS', 'snils', 'Snils')
  const vk_id = raw.VkId || raw.vk_id || null

  // Username / login
  const username = extractField(raw, 'NickName', 'Username', 'Login', 'login', 'username')

  // Vehicle
  const vehicle = extractField(raw, 'Car', 'Vehicle', 'Auto', 'CarModel')

  return {
    database: dbName,
    name,
    phone,
    email,
    dob,
    address,
    inn,
    passport,
    snils,
    vk_id: vk_id ? `https://vk.com/id${vk_id}` : null,
    username,
    vehicle,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query, limit: rawLimit = 100 } = await req.json()
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query обов\'язковий' }, { status: 400 })
    }
    if (!TOKEN) {
      return NextResponse.json({ error: 'LEAKOSINT_TOKEN не налаштовано', entries: [], total: 0 }, { status: 200 })
    }

    // LeakOsint вимагає limit від 100 до 10000
    const limit = Math.max(100, Math.min(10000, Number(rawLimit) || 100))

    let data: any = null
    try {
      const res = await fetch('https://leakosintapi.com/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
          'Origin': 'https://leakosint.com',
          'Referer': 'https://leakosint.com/',
        },
        body: JSON.stringify({ token: TOKEN, request: query.trim(), limit, lang: 'ru' }),
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        return NextResponse.json({ error: `LeakOsint HTTP ${res.status}: ${errText.slice(0, 100)}`, entries: [], total: 0 })
      }
      data = await res.json()
    } catch (e: any) {
      return NextResponse.json({ error: `LeakOsint недоступний: ${e.message}`, entries: [], total: 0 })
    }

    // Handle API-level errors
    if (data['Error code'] || data.error) {
      const msg = data.error || `${data['Error code']}: ${data['Status'] || ''}`
      return NextResponse.json({ error: msg, entries: [], total: 0 })
    }

    // Parse response: { List: { "DB Name": { Data: [...], InfoLeak, NumOfResults } }, NumOfResults }
    const entries: any[] = []
    const listObj = data.List || data.list || {}

    for (const [dbName, dbData] of Object.entries(listObj as Record<string, any>)) {
      const rows: any[] = dbData?.Data || dbData?.data || (Array.isArray(dbData) ? dbData : [])
      for (const row of rows) {
        const entry = normalizeEntry(row, dbName)
        // Skip entries with no useful data
        if (entry.name || entry.phone || entry.email || entry.passport || entry.inn) {
          entries.push(entry)
        }
      }
    }

    return NextResponse.json({
      success: true,
      total: data.NumOfResults || data.numOfResults || entries.length,
      databases: data.NumOfDatabase || 0,
      price: data.price,
      entries,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, entries: [], total: 0 }, { status: 500 })
  }
}
