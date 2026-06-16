// app/api/admin/source-health/route.ts
// GET  — повертає merged стан: Supabase (persistent) + in-memory CB
// POST — скидає circuit breaker для джерела (in-memory + Supabase)

import { NextRequest } from 'next/server'
import { getAllStates, resetSource } from '../../../../lib/circuit-breaker'
import { createClient } from '../../../lib/supabase/server'

export const dynamic = 'force-dynamic'

interface SourceRow {
  source:        string
  state:         string
  failure_count: number
  last_failure:  string | null
  last_success:  string | null
  last_latency:  number | null
  open_until:    string | null
  updated_at:    string
}

export interface SourceHealthEntry {
  source:        string
  state:         'closed' | 'open' | 'half_open'
  failure_count: number
  last_failure:  string | null
  last_success:  string | null
  last_latency:  number | null
  open_until:    string | null
  updated_at:    string
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Persistent дані з Supabase (усі seeded джерела)
  const { data: rows } = await supabase
    .from('source_health')
    .select('*')
    .order('source') as { data: SourceRow[] | null }

  // In-memory circuit breaker (актуальний стан у поточному lambda instance)
  const memStates = getAllStates()
  const memMap = new Map(memStates.map(s => [s.source, s]))

  // Мерджимо: in-memory має пріоритет над Supabase для стану та failure_count
  const sources: SourceHealthEntry[] = (rows ?? []).map(row => {
    const mem = memMap.get(row.source)
    return {
      source:        row.source,
      state:         (mem?.state ?? row.state) as SourceHealthEntry['state'],
      failure_count: mem?.failures ?? row.failure_count,
      last_failure:  mem?.lastFailureAt
        ? new Date(mem.lastFailureAt).toISOString()
        : row.last_failure,
      last_success:  mem?.lastSuccessAt
        ? new Date(mem.lastSuccessAt).toISOString()
        : row.last_success,
      last_latency:  mem?.lastLatencyMs ?? row.last_latency,
      open_until:    mem?.openUntil
        ? new Date(mem.openUntil).toISOString()
        : row.open_until,
      updated_at:    row.updated_at,
    }
  })

  // Додаємо in-memory джерела яких немає в Supabase
  memStates.forEach(mem => {
    if (!sources.find(s => s.source === mem.source)) {
      sources.push({
        source:        mem.source,
        state:         mem.state,
        failure_count: mem.failures,
        last_failure:  mem.lastFailureAt ? new Date(mem.lastFailureAt).toISOString() : null,
        last_success:  mem.lastSuccessAt ? new Date(mem.lastSuccessAt).toISOString() : null,
        last_latency:  mem.lastLatencyMs,
        open_until:    mem.openUntil ? new Date(mem.openUntil).toISOString() : null,
        updated_at:    new Date().toISOString(),
      })
    }
  })

  const summary = {
    total:     sources.length,
    closed:    sources.filter(s => s.state === 'closed').length,
    open:      sources.filter(s => s.state === 'open').length,
    half_open: sources.filter(s => s.state === 'half_open').length,
  }

  return Response.json({ summary, sources, updatedAt: new Date().toISOString() })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { source } = await req.json() as { source: string }
  if (!source) return Response.json({ error: 'source required' }, { status: 400 })

  // Скидаємо in-memory circuit breaker
  resetSource(source)

  // Оновлюємо persistent стан в Supabase
  await supabase
    .from('source_health')
    .update({ state: 'closed', failure_count: 0, open_until: null, updated_at: new Date().toISOString() })
    .eq('source', source)

  return Response.json({ ok: true, source, message: `Circuit breaker '${source}' скинуто → CLOSED` })
}
