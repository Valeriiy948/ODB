// app/api/network/route.ts
// Глобальна мережа зв'язків — всі особи та їх зв'язки
// GET /api/network?limit=100&min_connections=1

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500)
  const minConnections = parseInt(searchParams.get('min_connections') || '0')

  try {
    // Всі зв'язки
    const { data: allConnections, error: connError } = await supabase
      .from('connections')
      .select('id, person_a, person_b, rel_type, direction, confidence')
      .limit(limit)

    if (connError) throw connError

    if (!allConnections || allConnections.length === 0) {
      return NextResponse.json({ nodes: [], edges: [], stats: { total_persons: 0, total_connections: 0 } })
    }

    // Збираємо всі ID осіб
    const personIds = new Set<string>()
    for (const c of allConnections) {
      personIds.add(c.person_a)
      personIds.add(c.person_b)
    }

    // Підраховуємо зв'язки per person
    const connCounts: Record<string, number> = {}
    for (const c of allConnections) {
      connCounts[c.person_a] = (connCounts[c.person_a] || 0) + 1
      connCounts[c.person_b] = (connCounts[c.person_b] || 0) + 1
    }

    // Фільтруємо якщо min_connections > 0
    let filteredIds = [...personIds]
    if (minConnections > 0) {
      filteredIds = filteredIds.filter(id => (connCounts[id] || 0) >= minConnections)
    }

    if (filteredIds.length === 0) {
      return NextResponse.json({ nodes: [], edges: [], stats: { total_persons: 0, total_connections: allConnections.length } })
    }

    // Завантажуємо дані осіб
    const { data: persons } = await supabase
      .from('persons')
      .select('id, name_ukr, name_rus, name, rank, unit, threat_score, myrotvorets_url, verified')
      .in('id', filteredIds)

    const personMap = Object.fromEntries((persons || []).map((p: any) => [p.id, p]))

    // Формуємо nodes
    const nodes = filteredIds.map(id => {
      const p = personMap[id]
      const score = p?.threat_score || 0
      const name = p?.name_rus || p?.name_ukr || p?.name || 'Невідомо'
      return {
        id,
        label: name,
        name,
        rank: p?.rank || null,
        unit: p?.unit || null,
        threat_score: score,
        myrotvorets: !!p?.myrotvorets_url,
        verified: !!p?.verified,
        connections_count: connCounts[id] || 0,
      }
    })

    // Формуємо edges (тільки між відфільтрованими вузлами)
    const filteredSet = new Set(filteredIds)
    const edges = allConnections
      .filter(c => filteredSet.has(c.person_a) && filteredSet.has(c.person_b))
      .map(c => ({
        id: c.id,
        source: c.person_a,
        target: c.person_b,
        rel_type: c.rel_type,
        direction: c.direction,
        confidence: c.confidence,
      }))

    // Статистика
    const stats = {
      total_persons: nodes.length,
      total_connections: edges.length,
      myrotvorets_count: nodes.filter(n => n.myrotvorets).length,
      critical_count: nodes.filter(n => n.threat_score >= 75).length,
      high_count: nodes.filter(n => n.threat_score >= 50 && n.threat_score < 75).length,
    }

    return NextResponse.json({ nodes, edges, stats })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
