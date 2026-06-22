// app/api/persons/route.ts
// GET: список осіб | POST: створити нову особу

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── GET: список осіб ──────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit') || '50'), 200)
  const offset = Number(searchParams.get('offset') || '0')
  const q     = searchParams.get('q')?.trim()
  const phone = searchParams.get('phone')?.trim().replace(/[\s\-\(\)]/g, '')
  const ipn   = searchParams.get('ipn')?.trim()
  const status = searchParams.get('status')
  const threat = searchParams.get('threat')
  const ids   = searchParams.get('ids')

  const filter = searchParams.get('filter')

  // Use 'estimated' count to avoid full-table scan (count:'exact' is too slow on 400k+ rows)
  let query = supabase
    .from('persons')
    .select(
      'id, name_ukr, name_rus, name_eng, name, dob, rank, unit, unit_num, photo_url, threat_level, threat_score, status, verified, myrotvorets_url, last_full_osint',
      { count: 'estimated' }
    )

  // Пошук по списку ID (для Investigation detail page)
  if (ids) {
    const idList = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 100)
    if (idList.length) {
      const { data, error } = await supabase
        .from('persons')
        .select('id, name_ukr, name_rus, name_eng, name, photo_url, threat_level, threat_score')
        .in('id', idList)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data: data || [], total: (data || []).length })
    }
    return NextResponse.json({ data: [], total: 0 })
  }

  // Пошук по телефону — phones is text[], use array contains (@>) or cs operator
  if (phone) {
    const phoneVariants = [phone]
    // also try without +38 / 38 prefix
    if (/^(\+?38)/.test(phone)) phoneVariants.push(phone.replace(/^\+?38/, ''))
    // build array contains filter: phones.cs.{"79787396585"}
    const csFilters = phoneVariants.map(p => `phones.cs.{"${p}"}`).join(',')
    query = query.or(csFilters)
  }
  // Пошук по ІПН
  else if (ipn) {
    query = query.or(`ipn.eq.${ipn},ipn.ilike.%${ipn}%`)
  }
  else if (q) {
    query = query.or(`name_ukr.ilike.%${q}%,name_rus.ilike.%${q}%,name.ilike.%${q}%`)
  }

  if (status) query = query.eq('status', status)
  if (threat)  query = query.eq('threat_level', threat)

  // Фільтри для сторінки реєстру
  if (filter === 'myrotvorets') {
    query = query.not('myrotvorets_url', 'is', null)
  } else if (filter === 'no_osint') {
    query = query.is('last_full_osint', null)
  } else if (filter === 'high_threat') {
    query = query.gte('threat_score', 75)
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data || [],
    persons: data || [],   // alias для сумісності
    total: count || 0,
    limit,
    offset,
  })
}

// ─── POST: створити нову особу ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const allowed = [
      'name', 'name_ukr', 'name_rus', 'name_eng',
      'dob', 'gender', 'citizenship',
      'rank', 'unit', 'unit_num', 'military_id',
      'passport', 'ipn', 'snils',
      'phones', 'email',
      'addr_live', 'addr_reg',
      'photo_url', 'myrotvorets_url',
      'vk_url', 'ok_url', 'fb_url', 'instagram_url',
      'threat_level', 'status', 'priority',
      'tags', 'sources', 'description',
      'icc_relevant', 'verified',
    ]

    const insertData: Record<string, any> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) insertData[key] = body[key]
    }

    // Ensure name (primary display/search field) is always set
    if (!insertData.name) {
      insertData.name = insertData.name_ukr || insertData.name_rus || insertData.name_eng || ''
    }
    // Якщо є тільки name_rus — копіюємо в name_ukr теж
    if (!insertData.name_ukr && insertData.name_rus) {
      insertData.name_ukr = insertData.name_rus
    }

    // phones must be text[] — normalize string → array
    if (insertData.phones && !Array.isArray(insertData.phones)) {
      insertData.phones = [insertData.phones]
    }
    // dob: normalize DD.MM.YYYY → YYYY-MM-DD for Supabase date column
    if (insertData.dob) {
      const m = String(insertData.dob).match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
      if (m) insertData.dob = `${m[3]}-${m[2]}-${m[1]}`
    }

    insertData.status = insertData.status || 'фігурант'
    insertData.threat_level = insertData.threat_level || 'unknown'

    const { data, error } = await supabase
      .from('persons')
      .insert(insertData)
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ id: data.id, success: true }, { status: 201 })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
