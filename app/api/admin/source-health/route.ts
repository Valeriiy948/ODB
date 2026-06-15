// app/api/admin/source-health/route.ts
// GET  — returns in-memory CB states for all tracked sources
// POST — manually reset a source's circuit breaker (body: { source })

import { NextRequest } from 'next/server'
import { getAllStates, resetSource } from '../../../../lib/circuit-breaker'
import { createClient } from '../../../lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const states = getAllStates()

  // Summary counts
  const summary = {
    total:     states.length,
    closed:    states.filter(s => s.state === 'closed').length,
    open:      states.filter(s => s.state === 'open').length,
    half_open: states.filter(s => s.state === 'half_open').length,
  }

  return Response.json({
    summary,
    sources:   states,
    updatedAt: new Date().toISOString(),
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { source } = await req.json()
  if (!source) return Response.json({ error: 'source required' }, { status: 400 })

  resetSource(source)
  return Response.json({ ok: true, source, message: `Circuit breaker for '${source}' reset to CLOSED` })
}
