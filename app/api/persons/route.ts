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
  const q = searchParams.get('q')?.trim()
  const status = searchParams.get('status')
  const threat = searchParams.get('threat')

  const filter = searchParams.get('filter')

  let query = supabase
    .from('persons')
    .select(
      'id, name_ukr, name_rus, name_eng, name, dob, rank, unit, unit_num, photo_url, threat_level, threat_score, status, verified, myrotvorets_url, last_full_osint',
      { count: 'exact' }
    )

  // Пошук
  if (q) {
    query = query.or([
      `name_ukr.ilike.%${q}%`,
      `name_rus.ilike.%${q}%`,
      `name_eng.ilike.%${q}%`,
      `name.ilike.%${q}%`,
      `unit.ilike.%${q}%`,
      `unit_num.ilike.%${q}%`,
    ].join(','))
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

    // Якщо є тільки name_rus — копіюємо в name_ukr теж
    if (!insertData.name_ukr && insertData.name_rus) {
      insertData.name_ukr = insertData.name_rus
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
