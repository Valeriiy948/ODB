// app/api/getcontact/search/route.ts
// Getcontact — пошук по телефонній книзі
// Показує під яким іменем номер збережений у людей
// Метод: через VPS проксі (port 8001) або прямий запит

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const VPS_PORT = process.env.TELEGRAM_SEARCH_PORT || '8001'

// Нормалізація телефону до міжнародного формату
function normalizePhone(phone: string): string {
  const clean = phone.replace(/\D/g, '')
  if (clean.startsWith('380') && clean.length === 12) return '+' + clean
  if (clean.startsWith('7')   && clean.length === 11)  return '+' + clean
  if (clean.startsWith('375') && clean.length === 12) return '+' + clean
  if (clean.length === 10 && clean.startsWith('0'))    return '+38' + clean
  return '+' + clean
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query required' }, { status: 400 })
    }

    const phone = normalizePhone(String(query).trim())

    // VPS порт 8005 вже має Getcontact (але потребує токен)
    try {
      const vpsRes = await fetch(`http://${VPS_HOST}:8005/social/getcontact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
        signal: AbortSignal.timeout(10000),
      })

      if (vpsRes.ok) {
        const data = await vpsRes.json()
        if (data.names || data.tags || data.results || data.found) {
          return NextResponse.json(normalizeGetcontactResponse(phone, data))
        }
      }
    } catch {
      // VPS не підтримує — fallback
    }

    // Повертаємо fallback посилання для ручної перевірки
    return await searchGetcontactWeb(phone)


  } catch (err: any) {
    return NextResponse.json({ error: err.message, entries: [] }, { status: 500 })
  }
}

async function searchGetcontactWeb(phone: string) {
  // Getcontact API потребує токен (HMAC + реєстрація пристрою).
  // Повертаємо пряме посилання для ручної перевірки.
  const cleanPhone = phone.replace('+', '')
  return NextResponse.json({
    found:    false,
    phone,
    entries:  [],
    total:    0,
    note:     'Getcontact потребує токен. Перевірте вручну:',
    fallback_url: `https://www.getcontact.com/en/number/${cleanPhone}`,
    // Альтернативи
    alternatives: [
      {
        label: 'Getcontact Web',
        url:   `https://www.getcontact.com/en/number/${cleanPhone}`,
      },
      {
        label: 'NumBuster',
        url:   `https://numbuster.com/number/${phone}`,
      },
      {
        label: 'TrueCaller',
        url:   `https://www.truecaller.com/search/ua/${cleanPhone}`,
      },
    ],
  })
}

function normalizeGetcontactResponse(phone: string, data: any) {
  // Різні формати відповіді залежно від джерела
  const tags: string[]   = data.tags || data.names || data.result?.names || []
  const count: number    = data.tagCount || data.count || tags.length

  return {
    success: true,
    phone,
    total:   count,
    entries: tags.slice(0, 20).map((name: any) => ({
      name:  typeof name === 'string' ? name : name.tag || name.name || String(name),
      count: typeof name === 'object' ? name.count : 1,
    })),
    note: count > 0
      ? `Цей номер збережений у ${count} людей`
      : 'Номер не знайдено в Getcontact',
    fallback_url: `https://getcontact.com/en/number/${encodeURIComponent(phone.replace('+', ''))}`,
  }
}
