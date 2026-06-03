// app/api/evidence/[id]/route.ts
// GET  /api/evidence/[id]  — список доказів особи або інциденту
// DELETE /api/evidence/[id] — видалення доказу

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'evidence'

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/evidence/[id]?type=person  або  ?type=incident
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createSupabase()
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'person'

    const field = type === 'incident' ? 'incident_id' : 'person_id'
    const { data, error } = await supabase
      .from('evidence')
      .select('*')
      .eq(field, id)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    // Групуємо по типу
    const grouped = {
      photos:    (data || []).filter(e => e.ev_type === 'photo'),
      videos:    (data || []).filter(e => e.ev_type === 'video'),
      documents: (data || []).filter(e => e.ev_type === 'document'),
      audio:     (data || []).filter(e => e.ev_type === 'audio'),
      other:     (data || []).filter(e => !['photo','video','document','audio'].includes(e.ev_type)),
    }

    return NextResponse.json({
      success: true,
      total: data?.length || 0,
      evidence: data || [],
      grouped,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/evidence/[id]  — видалення конкретного доказу
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createSupabase()

    // Знаходимо запис
    const { data: ev, error: fetchError } = await supabase
      .from('evidence')
      .select('id, filename')
      .eq('id', id)
      .single()

    if (fetchError || !ev) {
      return NextResponse.json({ error: 'Не знайдено' }, { status: 404 })
    }

    // Видаляємо файл зі storage
    if (ev.filename) {
      await supabase.storage.from(BUCKET).remove([ev.filename])
    }

    // Видаляємо запис з БД
    const { error: delError } = await supabase
      .from('evidence')
      .delete()
      .eq('id', id)

    if (delError) throw new Error(delError.message)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/evidence/[id] — оновлення метаданих
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createSupabase()
    const body = await req.json()

    const allowed = ['description', 'source', 'date_captured', 'location', 'is_classified']
    const update: Record<string, any> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    const { data, error } = await supabase
      .from('evidence')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true, evidence: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
