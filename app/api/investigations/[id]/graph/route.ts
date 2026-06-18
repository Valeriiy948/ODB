// app/api/investigations/[id]/graph/route.ts
// Повертає граф-дані для всіх осіб у розслідуванні

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params

  // 1. Отримати розслідування
  const { data: inv, error: invErr } = await supabase
    .from('investigations')
    .select('person_ids')
    .eq('id', id)
    .single()

  if (invErr || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const personIds: string[] = inv.person_ids || []
  if (personIds.length === 0) return NextResponse.json({ nodes: [], edges: [] })

  // 2. Дані осіб
  const { data: persons } = await supabase
    .from('persons')
    .select('id, name, name_ukr, name_rus, phones, addr_live, addr_reg, threat_level, threat_score')
    .in('id', personIds)

  // 3. Крипто-гаманці
  const { data: wallets } = await supabase
    .from('crypto_wallets')
    .select('id, address, blockchain, person_id, risk_score')
    .in('person_id', personIds)

  // 4. Зв'язки між особами
  const { data: connections } = await supabase
    .from('connections')
    .select('person_id, related_id, relation_type, strength')
    .or(
      personIds.map(pid => `person_id.eq.${pid}`).join(',') + ',' +
      personIds.map(pid => `related_id.eq.${pid}`).join(',')
    )
    .limit(200)

  // ─── Будуємо граф ──────────────────────────────────────────────────────────
  const nodes: object[] = []
  const edges: object[] = []
  const seen = new Set<string>()

  const addNode = (data: object) => {
    const d = data as { id: string }
    if (!seen.has(d.id)) {
      seen.add(d.id)
      nodes.push({ data })
    }
  }

  const addEdge = (source: string, target: string, label: string) => {
    const eid = `e-${source}-${target}`
    if (!seen.has(eid)) {
      seen.add(eid)
      edges.push({ data: { id: eid, source, target, label } })
    }
  }

  for (const p of persons || []) {
    const name = p.name_ukr || p.name_rus || p.name || 'Невідомо'
    const risk = p.threat_score ?? 0
    addNode({
      id: `person-${p.id}`,
      label: name,
      type: 'person',
      href: `/persons/${p.id}`,
      risk,
      bg: risk >= 70 ? '#7f1d1d' : '#6366f1',
      border: risk >= 70 ? '#ef4444' : '#818cf8',
      size: 60,
    })

    // Телефони
    for (const phone of (p.phones || []).slice(0, 4)) {
      const pid = `phone-${phone}`
      addNode({ id: pid, label: phone, type: 'phone', bg: '#15803d', border: '#4ade80', size: 34 })
      addEdge(`person-${p.id}`, pid, 'телефон')
    }

    // Адреси
    if (p.addr_live) {
      const aid = `addr-${p.id}-live`
      addNode({ id: aid, label: p.addr_live.slice(0, 30), type: 'address', bg: '#c2410c', border: '#fb923c', size: 34 })
      addEdge(`person-${p.id}`, aid, 'мешкає')
    }
    if (p.addr_reg && p.addr_reg !== p.addr_live) {
      const aid = `addr-${p.id}-reg`
      addNode({ id: aid, label: p.addr_reg.slice(0, 30), type: 'address', bg: '#c2410c', border: '#fb923c', size: 34 })
      addEdge(`person-${p.id}`, aid, 'прописка')
    }
  }

  // Гаманці
  for (const w of wallets || []) {
    const wid = `wallet-${w.id}`
    const shortAddr = w.address ? `${w.address.slice(0, 8)}…` : '?'
    addNode({
      id: wid,
      label: `${w.blockchain ?? ''} ${shortAddr}`,
      type: 'wallet',
      bg: '#7e22ce',
      border: '#a855f7',
      size: 34,
      risk: w.risk_score ?? 0,
    })
    addEdge(`person-${w.person_id}`, wid, 'гаманець')
  }

  // Зв'язки між особами в розслідуванні
  const personIdSet = new Set(personIds)
  for (const c of connections || []) {
    if (personIdSet.has(c.person_id) && personIdSet.has(c.related_id)) {
      addEdge(`person-${c.person_id}`, `person-${c.related_id}`, c.relation_type || 'звязок')
    }
  }

  return NextResponse.json({ nodes, edges })
}
