// app/api/osint/getcontact/[id]/route.ts
// GetContact OSINT — як люди зберегли номер у контактах
// Також: NumBuster, Username пошук по всіх соцмережах

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_HOST    = process.env.VPS_HOST || '161.35.86.145'
const SOCIAL_PORT = process.env.SOCIAL_SEARCH_PORT || '8005'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: person, error } = await supabase
    .from('persons').select('*').eq('id', id).single()
  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const phones: string[] = [...(person.phones || [])]
  // Додаємо телефони з telegram_raw витоків
  if (Array.isArray(person.telegram_raw)) {
    for (const entry of person.telegram_raw) {
      for (const leak of (entry.leaks || [])) {
        if (leak.fields?.phone) phones.push(String(leak.fields.phone))
      }
    }
  }
  const uniquePhones = [...new Set(phones)].slice(0, 5)

  if (uniquePhones.length === 0) {
    return NextResponse.json({ error: 'Немає телефонів для перевірки' }, { status: 400 })
  }

  const results: any[] = []

  for (const phone of uniquePhones) {
    try {
      const res = await fetch(`http://${VPS_HOST}:${SOCIAL_PORT}/social/getcontact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
        signal: AbortSignal.timeout(12000),
      })
      if (res.ok) {
        const data = await res.json()
        results.push({ phone, ...data })
      }
    } catch { /* VPS offline */ }
  }

  // Зберігаємо знайдені імена у person_mentions
  const foundNames = results.flatMap(r => r.names || []).filter(Boolean)
  if (foundNames.length > 0) {
    const existing: any[] = person.person_mentions || []
    const newMention = {
      source_type: 'getcontact',
      source: results[0]?.platform || 'getcontact',
      snippet: `Номер збережено як: ${foundNames.join(', ')}`,
      phones: uniquePhones,
      names: foundNames,
      found_at: new Date().toISOString(),
    }
    await supabase.from('persons')
      .update({ person_mentions: [...existing, newMention].slice(0, 100) })
      .eq('id', id)
  }

  return NextResponse.json({
    success: true,
    phones_checked: uniquePhones.length,
    results,
    names_found: foundNames,
  })
}
