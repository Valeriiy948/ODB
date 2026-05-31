import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/persons/[id]/connections — всі зв'язки особи з даними другої сторони
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [{ data: asA }, { data: asB }] = await Promise.all([
    supabase
      .from('connections')
      .select('id, rel_type, direction, evidence_url, notes, confidence, created_at, person_b')
      .eq('person_a', id),
    supabase
      .from('connections')
      .select('id, rel_type, direction, evidence_url, notes, confidence, created_at, person_a')
      .eq('person_b', id),
  ])

  // Збираємо всі ID суміжних осіб
  const neighborIds = [
    ...(asA || []).map((r: any) => r.person_b),
    ...(asB || []).map((r: any) => r.person_a),
  ]

  let neighbors: any[] = []
  if (neighborIds.length > 0) {
    const { data } = await supabase
      .from('persons')
      .select('id, name_ukr, name_rus, name, rank, unit, photo_url, verified, threat_score, myrotvorets_url')
      .in('id', neighborIds)
    neighbors = data || []
  }

  const neighborMap = Object.fromEntries(neighbors.map((p: any) => [p.id, p]))

  const edges = [
    ...(asA || []).map((r: any) => ({
      id: r.id,
      source: id,
      target: r.person_b,
      rel_type: r.rel_type,
      direction: r.direction,
      evidence_url: r.evidence_url,
      notes: r.notes,
      confidence: r.confidence,
      created_at: r.created_at,
      neighbor: neighborMap[r.person_b] || null,
    })),
    ...(asB || []).map((r: any) => ({
      id: r.id,
      source: r.person_a,
      target: id,
      rel_type: r.rel_type,
      direction: r.direction,
      evidence_url: r.evidence_url,
      notes: r.notes,
      confidence: r.confidence,
      created_at: r.created_at,
      neighbor: neighborMap[r.person_a] || null,
    })),
  ]

  return NextResponse.json({ edges, total: edges.length })
}

// POST /api/persons/[id]/connections — додати зв'язок
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const { target_id, rel_type = 'unknown', direction = 'both', evidence_url, notes, confidence = 0.5 } = body

  if (!target_id) return NextResponse.json({ error: 'target_id required' }, { status: 400 })
  if (target_id === id) return NextResponse.json({ error: 'Self-loop not allowed' }, { status: 400 })

  const { data, error } = await supabase
    .from('connections')
    .insert({
      person_a: id,
      person_b: target_id,
      rel_type,
      direction,
      evidence_url: evidence_url || null,
      notes: notes || null,
      confidence,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
