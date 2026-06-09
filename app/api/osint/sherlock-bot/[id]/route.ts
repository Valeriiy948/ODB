import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_URL = process.env.VPS_URL || 'https://evidencebases.com/odb-api'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: person, error } = await supabaseAdmin
    .from('persons')
    .select('name, name_rus, dob')
    .eq('id', id)
    .single()

  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const full_name = ((person.name_rus || person.name) ?? '').trim().toUpperCase()
  if (!full_name) {
    return NextResponse.json({ error: 'Person has no name' }, { status: 400 })
  }

  // Format DOB: YYYY-MM-DD → ДД.ММ.РРРР
  let dob = ''
  if (person.dob) {
    const parts = String(person.dob).split('-')
    if (parts.length === 3) dob = `${parts[2]}.${parts[1]}.${parts[0]}`
  }

  try {
    const res = await fetch(`${VPS_URL}/presence/search/sherlock-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, dob }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      return NextResponse.json(
        { error: err.error || `HTTP ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json({ success: true, person_id: id, full_name, dob, ...data })
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'timeout (60s)' }, { status: 504 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
