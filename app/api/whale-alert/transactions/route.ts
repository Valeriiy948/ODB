// app/api/whale-alert/transactions/route.ts
// GET /api/whale-alert/transactions — список Whale Alert транзакцій для дашборду

import { NextRequest } from 'next/server'
import { createClient } from '../../../lib/supabase/server'

export const dynamic = 'force-dynamic'

export interface WhaleTx {
  id:              string
  whale_alert_id:  string
  blockchain:      string
  symbol:          string
  amount:          number
  amount_usd:      number
  tx_type:         string
  hash:            string | null
  from_address:    string | null
  from_owner:      string | null
  from_owner_type: string | null
  to_address:      string | null
  to_owner:        string | null
  to_owner_type:   string | null
  tx_timestamp:    string
  telegram_sent:   boolean
  created_at:      string
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit      = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const blockchain = searchParams.get('blockchain') ?? ''
  const minUsd     = Number(searchParams.get('min_usd') ?? 0)
  const page       = Math.max(Number(searchParams.get('page') ?? 1), 1)
  const offset     = (page - 1) * limit

  let query = supabase
    .from('whale_transactions')
    .select('*', { count: 'estimated' })
    .order('tx_timestamp', { ascending: false })
    .range(offset, offset + limit - 1)

  if (blockchain) query = query.eq('blockchain', blockchain)
  if (minUsd > 0) query = query.gte('amount_usd', minUsd)

  const { data, count, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Статистика за останні 24 години
  const since24h = new Date(Date.now() - 86_400_000).toISOString()
  const { data: stats24h } = await supabase
    .from('whale_transactions')
    .select('amount_usd')
    .gte('tx_timestamp', since24h)

  const volume24h = (stats24h ?? []).reduce((s, r) => s + Number(r.amount_usd), 0)

  return Response.json({
    transactions: (data ?? []) as WhaleTx[],
    total:        count ?? 0,
    page,
    limit,
    volume_24h:   volume24h,
    count_24h:    stats24h?.length ?? 0,
  })
}
