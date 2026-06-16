// app/api/b2b/compliance/route.ts
// B2B Compliance API — перевірка криптогаманців для юридичних фірм та обмінників
//
// Авторизація: заголовок x-api-key: <INTERNAL_API_KEY>
//
// POST /api/b2b/compliance
// Body: { "addresses": ["TXxx...", "0x123..."] }
//
// Response:
// {
//   "results": [
//     {
//       "address": "TXxx...",
//       "risk_score": 85,
//       "risk_level": "critical",
//       "is_sanctioned": true,
//       "sanctions_match": "OFAC SDN",
//       "flags": ["unknown_wallet", "high_volume", "seen_in_odb"],
//       "tx_count": 47,
//       "total_volume_usd": 12500000,
//       "last_seen": "2026-06-16T13:50:00Z",
//       "odb_label": "Garantex mixer wallet",
//       "source": "ODB internal + Chainalysis public"
//     }
//   ],
//   "checked_at": "2026-06-16T14:00:00Z",
//   "source": "ODB Intelligence Engine v2"
// }

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CHAINALYSIS_URL = 'https://public.chainalysis.com/api/v1/address'
const APP_URL = process.env.APP_URL ?? 'https://odb-one.vercel.app'

// ─── Auth ─────────────────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const key     = req.headers.get('x-api-key') ?? ''
  const internal = process.env.INTERNAL_API_KEY ?? ''
  return !!internal && key === internal
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ComplianceResult {
  address:         string
  risk_score:      number          // 0–100
  risk_level:      'low' | 'medium' | 'high' | 'critical'
  is_sanctioned:   boolean
  sanctions_match: string          // "OFAC SDN", "EU", "UN" або ""
  flags:           string[]        // причини ризику
  tx_count:        number          // кількість транзакцій у нашій БД
  total_volume_usd: number         // загальний обсяг через нашу БД
  last_seen:       string | null   // остання транзакція в нашій БД
  odb_label:       string          // лейбл з нашої crypto_wallets таблиці
  linked_person:   string | null   // ПІБ особи з ODB якщо прив'язаний
  source:          string
}

// ─── Chainalysis Public Sanctions Check ───────────────────────────────────────
async function checkChainalysis(address: string): Promise<{ sanctioned: boolean; name: string }> {
  const key = process.env.CHAINALYSIS_API_KEY
  if (!key) return { sanctioned: false, name: '' }

  try {
    const res = await fetch(`${CHAINALYSIS_URL}/${address}`, {
      headers: { 'Token': key },
      signal:  AbortSignal.timeout(8_000),
    })
    if (!res.ok) return { sanctioned: false, name: '' }
    const data = await res.json()
    const identifications = data.identifications ?? []
    if (!identifications.length) return { sanctioned: false, name: '' }
    const hit = identifications[0]
    return { sanctioned: true, name: hit.name ?? hit.category ?? 'Sanctions list' }
  } catch {
    return { sanctioned: false, name: '' }
  }
}

// ─── Internal ODB Lookup ──────────────────────────────────────────────────────
async function checkOdbWallet(address: string): Promise<{
  found:       boolean
  label:       string
  risk_score:  number
  is_sanctioned: boolean
  person_name: string | null
}> {
  const { data } = await supabase
    .from('crypto_wallets')
    .select('label, risk_score, is_sanctioned, linked_person_id')
    .eq('address', address)
    .maybeSingle()

  if (!data) return { found: false, label: '', risk_score: 0, is_sanctioned: false, person_name: null }

  let personName: string | null = null
  if (data.linked_person_id) {
    const { data: person } = await supabase
      .from('persons')
      .select('name')
      .eq('id', data.linked_person_id)
      .maybeSingle()
    personName = person?.name ?? null
  }

  return {
    found:        true,
    label:        data.label ?? '',
    risk_score:   data.risk_score ?? 0,
    is_sanctioned: data.is_sanctioned ?? false,
    person_name:  personName,
  }
}

// ─── Whale Transactions History ───────────────────────────────────────────────
async function checkWhaleTxHistory(address: string): Promise<{
  count:      number
  volume:     number
  last_seen:  string | null
}> {
  const { data } = await supabase
    .from('whale_transactions')
    .select('amount_usd, tx_timestamp')
    .or(`from_address.eq.${address},to_address.eq.${address}`)
    .order('tx_timestamp', { ascending: false })
    .limit(100)

  if (!data?.length) return { count: 0, volume: 0, last_seen: null }

  const volume   = data.reduce((s, t) => s + (t.amount_usd as number), 0)
  const lastSeen = data[0]?.tx_timestamp ?? null

  return { count: data.length, volume, last_seen: lastSeen }
}

// ─── Risk Score Calculation ───────────────────────────────────────────────────
function calcRisk(params: {
  is_sanctioned:  boolean
  odb_risk_score: number
  tx_count:       number
  volume:         number
  odb_found:      boolean
}): { score: number; level: 'low' | 'medium' | 'high' | 'critical'; flags: string[] } {
  let score = 0
  const flags: string[] = []

  if (params.is_sanctioned) {
    score += 90
    flags.push('sanctioned')
  }
  if (params.odb_found) {
    score += 20
    flags.push('seen_in_odb')
    if (params.odb_risk_score > 0) score += Math.round(params.odb_risk_score * 0.3)
  }
  if (params.volume >= 10_000_000) { score += 20; flags.push('high_volume_10m+') }
  else if (params.volume >= 1_000_000) { score += 10; flags.push('high_volume_1m+') }
  if (params.tx_count >= 20) { score += 15; flags.push('frequent_activity') }
  else if (params.tx_count >= 5)  { score += 5;  flags.push('repeated_activity') }

  score = Math.min(score, 100)

  const level: 'low' | 'medium' | 'high' | 'critical' =
    score >= 75 ? 'critical' :
    score >= 50 ? 'high' :
    score >= 25 ? 'medium' : 'low'

  return { score, level, flags }
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'Unauthorized. Pass x-api-key header.' },
      { status: 401 }
    )
  }

  let body: { addresses?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const addresses = body.addresses
  if (!Array.isArray(addresses) || !addresses.length) {
    return NextResponse.json(
      { error: 'Body must contain "addresses": ["addr1", "addr2", ...]' },
      { status: 400 }
    )
  }

  // Ліміт: 50 адрес за запит
  const toCheck = (addresses as string[]).slice(0, 50).map(a => String(a).trim())

  const results: ComplianceResult[] = []

  // Перевіряємо паралельно батчами по 5
  for (let i = 0; i < toCheck.length; i += 5) {
    const batch = toCheck.slice(i, i + 5)
    const batchResults = await Promise.all(batch.map(async (address) => {
      const [chainalysis, odb, history] = await Promise.all([
        checkChainalysis(address),
        checkOdbWallet(address),
        checkWhaleTxHistory(address),
      ])

      const isSanctioned  = chainalysis.sanctioned || odb.is_sanctioned
      const sanctionsMatch = chainalysis.sanctioned ? chainalysis.name
                           : odb.is_sanctioned      ? 'ODB Sanctions DB'
                           : ''

      const { score, level, flags } = calcRisk({
        is_sanctioned:  isSanctioned,
        odb_risk_score: odb.risk_score,
        tx_count:       history.count,
        volume:         history.volume,
        odb_found:      odb.found,
      })

      if (!flags.length) flags.push('no_flags')

      return {
        address,
        risk_score:       score,
        risk_level:       level,
        is_sanctioned:    isSanctioned,
        sanctions_match:  sanctionsMatch,
        flags,
        tx_count:         history.count,
        total_volume_usd: Math.round(history.volume),
        last_seen:        history.last_seen,
        odb_label:        odb.label,
        linked_person:    odb.person_name,
        source:           'ODB Intelligence Engine v2 + Chainalysis Public',
      } satisfies ComplianceResult
    }))
    results.push(...batchResults)
  }

  // Сортуємо: критичні спочатку
  results.sort((a, b) => b.risk_score - a.risk_score)

  return NextResponse.json({
    results,
    total:      results.length,
    critical:   results.filter(r => r.risk_level === 'critical').length,
    high:       results.filter(r => r.risk_level === 'high').length,
    checked_at: new Date().toISOString(),
    source:     'ODB Intelligence Engine v2',
    docs:       `${APP_URL}/api/b2b/compliance`,
  })
}

// ─── GET — документація ───────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    name:        'ODB B2B Compliance API',
    version:     '2.0',
    description: 'Перевірка криптогаманців на ризики для AML/KYC compliance',
    auth:        'Header: x-api-key: <your_api_key>',
    endpoint:    'POST /api/b2b/compliance',
    body:        { addresses: ['string', '...max 50'] },
    risk_levels: { low: '0-24', medium: '25-49', high: '50-74', critical: '75-100' },
    sources:     ['ODB crypto_wallets DB', 'ODB whale_transactions', 'Chainalysis Public Sanctions'],
    contact:     'vmak948@gmail.com',
  })
}
