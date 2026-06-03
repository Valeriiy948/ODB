// app/api/osint/nazk/[id]/route.ts
// НАЗК — Єдиний державний реєстр декларацій осіб, уповноважених на виконання функцій держави
// API: https://public-api.nazk.gov.ua/v2/documents/list?query=ПІБ

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NAZK_BASE = 'https://public-api.nazk.gov.ua/v2'

// ─── Типи декларацій ─────────────────────────────────────────────────────────
const DECLARATION_TYPES: Record<number, string> = {
  1: 'Щорічна',
  2: 'Перед звільненням',
  3: 'Після звільнення',
  4: 'Кандидата на посаду',
}

// ─── Парсинг декларанта з step_1 ─────────────────────────────────────────────
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
    region:      s1.region     || '',
    city:        s1.city       || '',
    url: `https://public.nazk.gov.ua/documents/${item?.id}`,
  }
}

// ─── Парсинг активів з повної декларації ─────────────────────────────────────
function parseAssets(data: any) {
  const assets: any = {
    real_estate: [],
    vehicles: [],
    income: [],
    cash: [],
    bank_accounts: [],
    corporate: [],
  }

  // step_2 — нерухомість (члени сім'ї і декларант)
  const step2 = data?.step_2?.data || []
  for (const item of step2) {
    const area = item.totalArea || item.livingArea || ''
    const city = [item.city, item.region].filter(Boolean).join(', ')
    const obj: any = {
      type: item.objectType || 'нерухомість',
      area: area ? `${area} м²` : '',
      city,
      country: item.country === '1' ? 'Україна' : item.country,
      owner: item.owningSubjectType,
      cost: item.cost || null,
    }
    assets.real_estate.push(obj)
  }

  // step_3 — додаткова нерухомість (члени сім'ї)
  const step3 = data?.step_3?.data || []
  for (const item of step3) {
    const area3 = item.totalArea || item.livingArea || ''
    const city3 = [item.city, item.region].filter(Boolean).join(', ')
    assets.real_estate.push({
      type: item.objectType || 'нерухомість',
      area: area3 ? `${area3} м²` : '',
      city: city3,
      country: item.country === '1' ? 'Україна' : item.country,
      owner: item.owningSubjectType,
      cost: item.cost || null,
    })
  }

  // step_6 — транспортні засоби
  const step6 = data?.step_6?.data || []
  for (const item of step6) {
    assets.vehicles.push({
      brand: item.brand || '',
      model: item.model || '',
      year:  item.graduationYear || item.year || '',
      type:  item.objectType || '',
      cost:  item.costDate || item.cost || null,
    })
  }

  // step_11 — доходи
  const step11 = data?.step_11?.data || []
  for (const item of step11) {
    for (const source of (item.sources || [])) {
      const amount = source.sizeIncome || source.size || 0
      if (amount > 0) {
        assets.income.push({
          source: source.source_ua_company_name || source.otherObjectType || 'Інше',
          amount: Math.round(amount),
          currency: source.currency || 'UAH',
        })
      }
    }
  }

  // step_12 — готівка
  const step12 = data?.step_12?.data || []
  for (const item of step12) {
    const amount = item.sizeAssets || item.sum || 0
    if (amount > 0) {
      assets.cash.push({
        amount,
        currency: item.assetsCurrency || item.currency || 'UAH',
      })
    }
  }

  // step_13 — банківські рахунки
  const step13 = data?.step_13?.data || []
  for (const item of step13) {
    assets.bank_accounts.push({
      bank: item.organization || '',
      type: item.accountType || '',
      amount: item.amount || 0,
      currency: item.currency || 'UAH',
    })
  }

  // Загальний дохід
  const totalIncome = assets.income.reduce((s: number, i: any) => {
    return i.currency === 'UAH' ? s + (i.amount || 0) : s
  }, 0)

  return { ...assets, total_income_uah: totalIncome }
}

// ─── Головний handler ─────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const { data: person, error } = await supabase
    .from('persons').select('*').eq('id', id).single()
  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const name = body.query
    || person.name_ukr
    || person.name_rus
    || person.name
    || ''

  if (!name || name.length < 3) {
    return NextResponse.json({ error: 'Немає імені для пошуку' }, { status: 400 })
  }

  try {
    // ── 1. Пошук по імені ────────────────────────────────────────────────────
    const searchUrl = `${NAZK_BASE}/documents/list?query=${encodeURIComponent(name)}&page=1`
    const searchRes = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    })

    if (!searchRes.ok) {
      return NextResponse.json({ error: `НАЗК API error: ${searchRes.status}` }, { status: 502 })
    }

    const searchData = await searchRes.json()
    const items: any[] = searchData.data || []
    const total: number = searchData.count || 0

    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        found: 0,
        total: 0,
        declarations: [],
        searched_name: name,
        note: 'Декларацій не знайдено. Можливо особа не є держслужбовцем або декларація не подавалась.',
      })
    }

    // ── 2. Парсимо базові дані + завантажуємо повну декларацію для топ-3 ─────
    const declarations = []
    const seenIds = new Set<string>()

    for (const item of items.slice(0, 10)) {
      const decl = parseDeclarant(item)
      if (seenIds.has(decl.id)) continue
      seenIds.add(decl.id)
      declarations.push(decl)
    }

    // Завантажуємо повну декларацію для найновішої
    let fullDeclaration: any = null
    const latestDecl = declarations.sort((a, b) =>
      (b.declaration_year || 0) - (a.declaration_year || 0)
    )[0]

    if (latestDecl?.id) {
      try {
        const fullRes = await fetch(`${NAZK_BASE}/documents/${latestDecl.id}`, {
          signal: AbortSignal.timeout(10000),
        })
        if (fullRes.ok) {
          const fullData = await fullRes.json()
          fullDeclaration = {
            ...latestDecl,
            assets: parseAssets(fullData.data || {}),
          }
        }
      } catch { /* skip */ }
    }

    // ── 3. Зберігаємо у person_mentions ──────────────────────────────────────
    if (declarations.length > 0) {
      const existing: any[] = person.person_mentions || []
      const nazkMentions = declarations.slice(0, 5).map((d: any) => ({
        source_type: 'nazk',
        source: 'НАЗК Декларація',
        title: `${d.declaration_type} ${d.declaration_year}`,
        position: d.position,
        organization: d.organization,
        declaration_year: d.declaration_year,
        url: d.url,
        snippet: `${d.full_name} — ${d.position}, ${d.organization} (${d.declaration_year})`,
        found_at: new Date().toISOString(),
      }))

      // Видаляємо старі НАЗК записи, додаємо нові
      const others = existing.filter((m: any) => m.source_type !== 'nazk')
      await supabase.from('persons')
        .update({ person_mentions: [...others, ...nazkMentions].slice(0, 100) })
        .eq('id', id)
    }

    return NextResponse.json({
      success: true,
      found: declarations.length,
      total,
      searched_name: name,
      declarations,
      latest: fullDeclaration,
    })

  } catch (err: any) {
    console.error('NAZK search error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
