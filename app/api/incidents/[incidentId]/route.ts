import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Ctx = { params: Promise<{ incidentId: string }> }

// GET /api/incidents/[incidentId] — інцидент + список пов'язаних осіб
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { incidentId } = await params

  const [{ data: incident }, { data: persons }] = await Promise.all([
    supabase.from('incidents').select('*').eq('id', incidentId).single(),
    supabase
      .from('incident_persons')
      .select('role, notes, person:persons(id, name_ukr, name_rus, name, rank, unit, photo_url)')
      .eq('incident_id', incidentId),
  ])

  if (!incident) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...incident, persons: persons || [] })
}

// PATCH /api/incidents/[incidentId]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { incidentId } = await params
  const body = await req.json()

  const allowed = ['title', 'date', 'location', 'latitude', 'longitude', 'inc_type',
    'description', 'evidence_urls', 'icc_article', 'severity', 'status', 'source_url']
  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const { data, error } = await supabase
    .from('incidents').update(update).eq('id', incidentId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/incidents/[incidentId]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { incidentId } = await params
  const { error } = await supabase.from('incidents').delete().eq('id', incidentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
