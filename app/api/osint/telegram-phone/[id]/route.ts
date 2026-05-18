// app/api/osint/telegram-phone/[id]/route.ts
// Пошук Telegram-акаунтів по телефону або імені через VPS telethon

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT  = process.env.TELEGRAM_SEARCH_PORT || '8001'

interface TelegramAccount {
  phone?:     string
  user_id?:   number
  username?:  string
  first_name?: string
  last_name?:  string
  bio?:        string
  photo_url?:  string
  last_seen?:  string
  verified?:   boolean
  source:      'phone_lookup' | 'username_search' | 'name_search'
}

// ─── Пошук за телефоном через VPS ────────────────────────────────────────────
async function lookupPhone(phone: string): Promise<TelegramAccount | null> {
  try {
    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/search/phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.user_id && !data.username) return null
    return { ...data, source: 'phone_lookup', phone }
  } catch {
    return null
  }
}

// ─── Пошук за username/ім'ям через VPS ───────────────────────────────────────
async function searchByName(name: string): Promise<TelegramAccount[]> {
  try {
    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/search/tg-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, limit: 5 }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []).map((r: any) => ({ ...r, source: 'name_search' }))
  } catch {
    return []
  }
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

  const results: TelegramAccount[] = []

  // Збираємо телефони з усіх джерел
  const phones: string[] = []
  if (person.phones) {
    if (Array.isArray(person.phones)) phones.push(...person.phones)
    else phones.push(String(person.phones))
  }
  // Також беремо з telegram_raw
  if (person.telegram_raw) {
    try {
      const raw = typeof person.telegram_raw === 'string'
        ? JSON.parse(person.telegram_raw) : person.telegram_raw
      for (const r of (Array.isArray(raw) ? raw : [])) {
        const p = r.fields?.phone
        if (p && !phones.includes(String(p))) phones.push(String(p))
      }
    } catch {}
  }

  // Пошук за кожним телефоном
  for (const phone of phones.slice(0, 5)) {
    const account = await lookupPhone(phone)
    if (account) results.push(account)
    await new Promise(r => setTimeout(r, 1000)) // rate limit
  }

  // Пошук за ім'ям якщо немає телефонів або нічого не знайшли
  const name = person.name_rus || person.name_ukr || person.name_eng || person.name
  if (name && results.length === 0) {
    const nameResults = await searchByName(name)
    results.push(...nameResults)
  }

  // Зберігаємо результати
  if (results.length > 0) {
    const existing = person.telegram_accounts || []
    const merged = [...existing]
    for (const r of results) {
      const exists = merged.some((e: any) =>
        (e.user_id && e.user_id === r.user_id) ||
        (e.username && e.username === r.username)
      )
      if (!exists) merged.push(r)
    }

    await supabaseAdmin.from('persons')
      .update({ telegram_accounts: merged.slice(0, 20) })
      .eq('id', id)

    // Зберігаємо першый username як telegram_url
    const withUsername = results.find(r => r.username)
    if (withUsername && !person.telegram_url) {
      await supabaseAdmin.from('persons')
        .update({ telegram_url: `https://t.me/${withUsername.username}` })
        .eq('id', id)
    }
  }

  return NextResponse.json({
    success: true,
    found:   results.length,
    results,
    phones_checked: phones.length,
  })
}
