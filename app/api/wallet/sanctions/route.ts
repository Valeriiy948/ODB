// app/api/wallet/sanctions/route.ts
// POST /api/wallet/sanctions — перевірка гаманця по санкційним спискам
// Використовує Chainalysis Public API (безкоштовно, без ключа)
// Покриває: OFAC SDN, EU, UN, HM Treasury + крипто-специфічні списки

// TODO: VPS Python cron job (щодобово) завантажує OFAC SDN CSV,
// парсить його і синхронізує з таблицею ofac_cache в Supabase.
// Vercel тоді звертається до ofac_cache замість зовнішнього сервісу.
// CSV-підхід неприйнятний зараз: файл ~30MB вичерпає RAM Serverless функції.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface SanctionMatch {
  entity_id:    string
  name:         string
  program:      string
  listing_date: string | null
  score:        number
}

interface SanctionsResponse {
  ofac_hit: boolean
  matches:  SanctionMatch[]
  source:   string
}

// Тип відповіді Chainalysis Public API
interface ChainalysisIdentification {
  category:    string
  name:        string
  description: string
  url:         string
}

interface ChainalysisResponse {
  identifications?: ChainalysisIdentification[]
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { wallet_address: string; person_id: string }
    const { wallet_address, person_id } = body

    if (!wallet_address) {
      return NextResponse.json({ error: 'wallet_address обовʼязковий' }, { status: 400 })
    }

    // Chainalysis Public API — безкоштовний, без ключа, без ліміту
    const res = await fetch(
      `https://public.chainalysis.com/api/v1/address/${wallet_address}`,
      {
        headers: {
          'Accept':     'application/json',
          'User-Agent': 'ODB-Crypto-Intel/1.0',
        },
        signal: AbortSignal.timeout(10_000),
      }
    )

    if (!res.ok) {
      return NextResponse.json(
        { error: `Chainalysis API помилка: ${res.status}` },
        { status: 502 }
      )
    }

    const data = await res.json() as ChainalysisResponse
    const identifications: ChainalysisIdentification[] = data.identifications ?? []

    const ofac_hit = identifications.length > 0

    // Маппінг у стандартний формат SanctionMatch
    const matches: SanctionMatch[] = identifications.map(id => ({
      entity_id:    id.name,
      name:         id.name,
      program:      id.category,
      listing_date: null,   // Chainalysis не повертає дату лістингу
      score:        1.0,
    }))

    // Оновлюємо запис у crypto_wallets якщо є person_id
    if (person_id) {
      const newLabels: string[] = []
      if (ofac_hit) newLabels.push('sanctions')

      // OFAC специфічно
      const isOfac = identifications.some(id => id.name?.toLowerCase().includes('ofac'))
      const isEu   = identifications.some(id => id.name?.toLowerCase().includes('eu'))
      const isUn   = identifications.some(id => id.name?.toLowerCase().includes('un'))
      if (isOfac) newLabels.push('ofac')
      if (isEu)   newLabels.push('eu-sanctions')
      if (isUn)   newLabels.push('un-sanctions')

      const { data: existing } = await supabase
        .from('crypto_wallets')
        .select('risk_labels, risk_score')
        .eq('wallet_address', wallet_address)
        .eq('person_id', person_id)
        .maybeSingle()

      const prevLabels: string[] = Array.isArray(existing?.risk_labels) ? existing.risk_labels : []
      const mergedLabels = Array.from(new Set([...prevLabels, ...newLabels]))

      // +25 до risk_score якщо є санкційний хіт
      const prevScore: number = existing?.risk_score ?? 0
      const updatedScore = ofac_hit ? Math.min(prevScore + 25, 100) : prevScore

      await supabase
        .from('crypto_wallets')
        .update({
          ofac_hit,
          risk_labels:     mergedLabels,
          risk_score:      updatedScore,
          last_checked_at: new Date().toISOString(),
        })
        .eq('wallet_address', wallet_address)
        .eq('person_id', person_id)
    }

    const response: SanctionsResponse = {
      ofac_hit,
      matches,
      source: 'chainalysis_public',
    }
    return NextResponse.json(response)

  } catch (err) {
    const e = err as Error
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
