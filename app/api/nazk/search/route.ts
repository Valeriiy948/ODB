// app/api/nazk/search/route.ts — standalone пошук без person_id
import { NextRequest, NextResponse } from 'next/server'

const NAZK_BASE = 'https://public-api.nazk.gov.ua/v2'

const DECLARATION_TYPES: Record<number, string> = {
  1: 'Щорічна', 2: 'Перед звільненням', 3: 'Після звільнення', 4: 'Кандидата',
}

function parseDeclarant(item: any) {
  const s1 = item?.data?.step_1?.data || {}
  return {
    id: item?.id,
    user_declarant_id: item?.user_declarant_id,
    declaration_year: item?.declaration_year,
    declaration_type: DECLARATION_TYPES[item?.declaration_type] || `Тип ${item?.declaration_type}`,
    date: item?.date,
    last_name:   s1.lastname   || '',
    first_name:  s1.firstname  || '',
    middle_name: s1.middlename || '',
    full_name:   [s1.lastname, s1.firstname, s1.middlename].filter(Boolean).join(' '),
    position:    s1.workPost   || '',
    organization: s1.workPlace || '',
    post_category: s1.postCategory || '',
    url: `https://public.nazk.gov.ua/documents/${item?.id}`,
  }
}

function parseAssets(data: any) {
  const re2 = (data?.step_2?.data || []).map((i: any) => ({
    type: i.objectType || 'нерухомість',
    area: i.totalArea ? `${i.totalArea} м²` : '',
    city: [i.city, i.region].filter(Boolean).join(', '),
    country: i.country === '1' ? 'Україна' : i.country,
    cost: i.cost || null,
  }))
  const re3 = (data?.step_3?.data || []).map((i: any) => ({
    type: i.objectType || 'нерухомість',
    area: i.totalArea ? `${i.totalArea} м²` : '',
    city: [i.city, i.region].filter(Boolean).join(', '),
    country: i.country === '1' ? 'Україна' : i.country,
    cost: i.cost || null,
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
    bank: i.organization || '', type: i.accountType || '',
    amount: i.amount || 0, currency: i.currency || 'UAH',
  }))
  const total_income_uah = income
    .filter(i => i.currency === 'UAH')
    .reduce((s, i) => s + i.amount, 0)
  return { real_estate, vehicles, income, cash, bank_accounts, total_income_uah }
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    if (!query || query.trim().length < 3) {
      return NextResponse.json({ error: 'Мінімум 3 символи' }, { status: 400 })
    }

    const res = await fetch(
      `${NAZK_BASE}/documents/list?query=${encodeURIComponent(query.trim())}&page=1`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://public.nazk.gov.ua/',
          'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!res.ok) return NextResponse.json({ error: `НАЗК ${res.status}` }, { status: 502 })

    const data = await res.json()
    const items: any[] = data.data || []
    const total: number = data.count || 0

    if (items.length === 0) {
      return NextResponse.json({
        success: true, found: 0, total: 0, declarations: [],
        note: 'Декларацій не знайдено. Особа може не бути держслужбовцем.',
      })
    }

    const declarations = items.slice(0, 10).map(parseDeclarant)

    // Завантажуємо найновішу повністю
    const latest = [...declarations].sort((a, b) => (b.declaration_year || 0) - (a.declaration_year || 0))[0]
    let fullDeclaration: any = null
    if (latest?.id) {
      try {
        const fullRes = await fetch(`${NAZK_BASE}/documents/${latest.id}`, {
          signal: AbortSignal.timeout(10000),
        })
        if (fullRes.ok) {
          const fullData = await fullRes.json()
          fullDeclaration = { ...latest, assets: parseAssets(fullData.data || {}) }
        }
      } catch { /* skip */ }
    }

    return NextResponse.json({ success: true, found: declarations.length, total, declarations, latest: fullDeclaration })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
