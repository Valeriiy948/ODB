import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/incidents?person_id=...&limit=50&offset=0
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const personId = searchParams.get('person_id')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const type = searchParams.get('type')

  if (personId) {
    // Всі інциденти для конкретної особи
    const { data, error } = await supabase
      .from('incident_persons')
      .select(`
        role, notes,
        incident:incidents(
          id, title, date, location, inc_type, severity, status, description, icc_article, evidence_urls, source_url, created_at
        )
      `)
      .eq('person_id', personId)
      .order('created_at', { ascending: false, referencedTable: 'incidents' })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [], total: data?.length || 0 })
  }

  // Загальний список
  let query = supabase
    .from('incidents')
    .select('*, incident_persons(count)', { count: 'exact' })
    .order('date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (type) query = query.eq('inc_type', type)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [], total: count || 0 })
}

// POST /api/incidents
export async function POST(req: NextRequest) {
  const body = await req.json()

  const { title, date, location, latitude, longitude, inc_type, description,
    evidence_urls, icc_article, severity, status, source_url } = body

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const { data, error } = await supabase
    .from('incidents')
    .insert({
      title, date: date || null,
      location: location || null,
      latitude: latitude || null,
      longitude: longitude || null,
      inc_type: inc_type || 'unknown',
      description: description || null,
      evidence_urls: evidence_urls || [],
      icc_article: icc_article || null,
      severity: severity || 'medium',
      status: status || 'reported',
      source_url: source_url || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
