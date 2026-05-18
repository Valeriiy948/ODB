import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Ctx = { params: Promise<{ incidentId: string }> }

// POST /api/incidents/[incidentId]/persons — прив'язати особу до інциденту
export async function POST(req: NextRequest, { params }: Ctx) {
  const { incidentId } = await params
  const { person_id, role = 'виконавець', notes } = await req.json()

  if (!person_id) return NextResponse.json({ error: 'person_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('incident_persons')
    .upsert({ incident_id: incidentId, person_id, role, notes }, { onConflict: 'incident_id,person_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/incidents/[incidentId]/persons?person_id=...
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { incidentId } = await params
  const { searchParams } = new URL(req.url)
  const personId = searchParams.get('person_id')

  if (!personId) return NextResponse.json({ error: 'person_id required' }, { status: 400 })

  const { error } = await supabase
    .from('incident_persons')
    .delete()
    .eq('incident_id', incidentId)
    .eq('person_id', personId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
