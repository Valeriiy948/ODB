// app/api/nazk/document/route.ts — завантажити повну декларацію по ID
import { NextRequest, NextResponse } from 'next/server'

const NAZK_BASE = 'https://public-api.nazk.gov.ua/v2'

function parseAssets(data: any) {
  const re2 = (data?.step_2?.data || []).map((i: any) => ({
    type: i.objectType || 'нерухомість', area: i.totalArea ? `${i.totalArea} м²` : '',
    city: [i.city, i.region].filter(Boolean).join(', '), cost: i.cost || null,
  }))
  const re3 = (data?.step_3?.data || []).map((i: any) => ({
    type: i.objectType || 'нерухомість', area: i.totalArea ? `${i.totalArea} м²` : '',
    city: [i.city, i.region].filter(Boolean).join(', '), cost: i.cost || null,
  }))
  const real_estate = [...re2, ...re3]
  const vehicles = (data?.step_6?.data || []).map((i: any) => ({
    brand: i.brand || '', model: i.model || '',
    year: i.graduationYear || i.year || '',
    type: i.objectType || '',
    cost: i.costDate || i.cost || null,
  }))
  const income: any[] = []
  for (const item of (data?.step_11?.data || [])) {
    for (const src of (item.sources || [])) {
      const amount = src.sizeIncome || src.size || 0
      if (amount > 0) income.push({
        source: src.source_ua_company_name || src.otherObjectType || 'Інше',
        amount: Math.round(amount), currency: src.currency || 'UAH',
      })
    }
  }
  const cash = (data?.step_12?.data || [])
    .filter((i: any) => (i.sizeAssets || i.sum || 0) > 0)
    .map((i: any) => ({ amount: i.sizeAssets || i.sum, currency: i.assetsCurrency || i.currency || 'UAH' }))
  const bank_accounts = (data?.step_13?.data || []).map((i: any) => ({
    bank: i.organization || '', type: i.accountType || '', amount: i.amount || 0, currency: i.currency || 'UAH',
  }))
  const total_income_uah = income.filter(i => i.currency === 'UAH').reduce((s, i) => s + i.amount, 0)
  return { real_estate, vehicles, income, cash, bank_accounts, total_income_uah }
}

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const res = await fetch(`${NAZK_BASE}/documents/${id}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://public.nazk.gov.ua/',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return NextResponse.json({ error: `НАЗК ${res.status}` }, { status: 502 })
    const data = await res.json()
    const s1 = data?.data?.step_1?.data || {}
    return NextResponse.json({
      declaration: {
        id,
        full_name: [s1.lastname, s1.firstname, s1.middlename].filter(Boolean).join(' '),
        position: s1.workPost || '',
        organization: s1.workPlace || '',
        assets: parseAssets(data?.data || {}),
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
