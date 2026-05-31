// app/api/search/fragments/route.ts
// Пошук за крихтами — комбінований пошук по неповним даним
// Підтримує будь-яку комбінацію: прізвище+регіон, ДН+авто, родичі+місто тощо

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface FragmentQuery {
  // Особисті дані
  last_name?: string       // Прізвище
  first_name?: string      // Ім'я
  middle_name?: string     // По батькові
  dob?: string             // Дата народження ДД.ММ.РРРР або рік РРРР
  gender?: 'male' | 'female'

  // Документи
  passport?: string
  ipn?: string             // ІПН / ІНН
  snils?: string
  military_id?: string

  // Контакти
  phone?: string
  email?: string

  // Географія
  region?: string
  city?: string
  address?: string

  // Військове
  rank?: string
  unit?: string
  unit_num?: string

  // Авто
  vehicle_plate?: string   // Номерний знак

  // Родичі (пошук по полю description/osint_connections)
  relative_name?: string

  // Соцмережі
  vk_url?: string
  telegram?: string

  // Фільтри
  myrotvorets_only?: boolean
  has_photo?: boolean
  has_incidents?: boolean
  limit?: number
}

// ─── Нормалізація рядка для нечіткого пошуку ────────────────────────────────
function norm(s?: string): string {
  if (!s) return ''
  return s.trim().toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/й/g, 'й')
}

// ─── Рахуємо score збігу ────────────────────────────────────────────────────
function calcMatchScore(person: any, q: FragmentQuery, telegramHit: boolean): number {
  let score = 0
  const weights: Record<string, number> = {
    last_name: 20, first_name: 15, middle_name: 10, dob: 25,
    passport: 40, ipn: 35, snils: 35, military_id: 30,
    phone: 30, email: 25, region: 10, rank: 15, unit: 15,
    vehicle_plate: 35, relative_name: 20, vk_url: 30, telegram: 30,
  }

  const fullNameRus = norm(person.name_rus || '')
  const fullNameUkr = norm(person.name_ukr || '')
  const fullName = fullNameRus || fullNameUkr

  if (q.last_name) {
    const ln = norm(q.last_name)
    if (fullName.includes(ln)) score += weights.last_name
    else if (fullName.startsWith(ln)) score += weights.last_name * 0.7
  }
  if (q.first_name) {
    const fn = norm(q.first_name)
    if (fullName.includes(fn)) score += weights.first_name
  }
  if (q.middle_name) {
    const mn = norm(q.middle_name)
    if (fullName.includes(mn)) score += weights.middle_name
  }
  if (q.dob && person.dob) {
    const qd = norm(q.dob).replace(/\D/g, '')
    const pd = norm(person.dob).replace(/\D/g, '')
    if (qd.length === 4) { // тільки рік
      if (pd.includes(qd)) score += weights.dob * 0.5
    } else if (qd === pd) {
      score += weights.dob
    } else if (qd.length >= 4 && pd.endsWith(qd.slice(-4))) {
      score += weights.dob * 0.7
    }
  }
  if (q.passport && person.passport) {
    const qp = norm(q.passport).replace(/\s/g, '')
    const pp = norm(person.passport).replace(/\s/g, '')
    if (pp.includes(qp) || qp.includes(pp)) score += weights.passport
  }
  if (q.ipn && person.ipn) {
    if (norm(person.ipn).includes(norm(q.ipn))) score += weights.ipn
  }
  if (q.snils && person.snils) {
    if (norm(person.snils).replace(/\D/g, '').includes(norm(q.snils).replace(/\D/g, '')))
      score += weights.snils
  }
  if (q.military_id && person.military_id) {
    if (norm(person.military_id).includes(norm(q.military_id))) score += weights.military_id
  }
  if (q.phone) {
    const qPhone = norm(q.phone).replace(/\D/g, '')
    const phones = (person.phones || []).map((p: string) => norm(p).replace(/\D/g, ''))
    if (phones.some((p: string) => p.includes(qPhone) || qPhone.includes(p))) score += weights.phone
  }
  if (q.email && person.email) {
    if (norm(person.email).includes(norm(q.email))) score += weights.email
  }
  if (q.region && person.region) {
    if (norm(person.region).includes(norm(q.region))) score += weights.region
  }
  if (q.rank && person.rank) {
    if (norm(person.rank).includes(norm(q.rank))) score += weights.rank
  }
  if (q.unit) {
    if (person.unit && norm(person.unit).includes(norm(q.unit))) score += weights.unit
    if (person.unit_num && norm(person.unit_num).includes(norm(q.unit))) score += weights.unit
  }
  if (q.vk_url && person.vk_url) {
    if (norm(person.vk_url).includes(norm(q.vk_url).replace(/.*vk\.com\//,''))) score += weights.vk_url
  }
  if (q.relative_name) {
    const rn = norm(q.relative_name)
    const desc = norm(person.description || '') + ' ' + norm(person.osint_connections || '')
    if (desc.includes(rn)) score += weights.relative_name
    // також у telegram_raw
    const tgText = JSON.stringify(person.telegram_raw || '').toLowerCase()
    if (tgText.includes(rn)) score += weights.relative_name
  }
  if (q.vehicle_plate) {
    const plate = norm(q.vehicle_plate).replace(/\s/g, '')
    const conn = norm(person.osint_connections || '') + ' ' + norm(person.description || '')
    const tgText = JSON.stringify(person.telegram_raw || '').toLowerCase()
    if (conn.includes(plate) || tgText.includes(plate)) score += weights.vehicle_plate
  }

  // Telegram hit бонус
  if (telegramHit) score += 15

  return score
}

// ─── Витяг коротких matched полів для відображення ──────────────────────────
function getMatchedFields(person: any, q: FragmentQuery): string[] {
  const matched: string[] = []
  const fn = person.name_rus || person.name_ukr || person.name || ''
  if (fn) matched.push(`ПІБ: ${fn}`)
  if (person.dob) matched.push(`ДН: ${person.dob}`)
  if (person.region) matched.push(`Регіон: ${person.region}`)
  if (person.rank) matched.push(`Звання: ${person.rank}`)
  if (person.unit) matched.push(`Підрозділ: ${person.unit}`)
  if (person.passport) matched.push(`Паспорт: ${person.passport}`)
  if (person.ipn) matched.push(`ІПН: ${person.ipn}`)
  if (person.phones?.length) matched.push(`Тел: ${person.phones[0]}`)
  if (person.email) matched.push(`Email: ${person.email}`)
  if (person.myrotvorets_url) matched.push('🚨 Миротворець')
  return matched.slice(0, 5)
}

// ─── Пошук у telegram_raw (JSONB) ───────────────────────────────────────────
async function searchInTelegramRaw(q: FragmentQuery, limit = 50): Promise<string[]> {
  // Повертаємо person_id де telegram_raw містить потрібні дані
  const conditions: string[] = []

  // Пошук по прізвищу/імені у тексті витоків
  if (q.last_name && q.last_name.length >= 3) {
    conditions.push(`telegram_raw::text ILIKE '%${q.last_name.trim()}%'`)
  }
  if (q.first_name && q.first_name.length >= 3) {
    conditions.push(`telegram_raw::text ILIKE '%${q.first_name.trim()}%'`)
  }
  if (q.middle_name && q.middle_name.length >= 4) {
    conditions.push(`telegram_raw::text ILIKE '%${q.middle_name.trim()}%'`)
  }
  if (q.phone) {
    const phone = q.phone.replace(/\D/g, '')
    if (phone.length >= 7) {
      conditions.push(`telegram_raw::text ILIKE '%${phone}%'`)
    }
  }
  if (q.vehicle_plate) {
    conditions.push(`telegram_raw::text ILIKE '%${q.vehicle_plate.toUpperCase()}%'`)
  }
  if (q.relative_name) {
    conditions.push(`telegram_raw::text ILIKE '%${q.relative_name}%'`)
  }
  if (q.ipn) {
    conditions.push(`telegram_raw::text ILIKE '%${q.ipn}%'`)
  }
  if (q.passport) {
    const pp = q.passport.replace(/\s/g, '')
    conditions.push(`telegram_raw::text ILIKE '%${pp}%'`)
  }

  if (conditions.length === 0) return []

  try {
    const { data } = await supabase
      .from('persons')
      .select('id')
      .or(conditions.join(','))
      .limit(limit)
    return (data || []).map((r: any) => r.id)
  } catch { return [] }
}

// ─── Пошук у VPS leaks базі ──────────────────────────────────────────────────
const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const VPS_TG_PORT = process.env.TELEGRAM_SEARCH_PORT || '8001'

interface LeakResult {
  source: string
  source_label?: string
  name?: string
  phone?: string
  inn?: string
  passport?: string
  address?: string
  dob?: string
  snippet?: string
  [key: string]: any
}

async function searchInLeaksDB(q: FragmentQuery): Promise<LeakResult[]> {
  try {
    const body: Record<string, string> = {}
    if (q.last_name) body.name = [q.last_name, q.first_name, q.middle_name].filter(Boolean).join(' ')
    if (q.phone)     body.phone = q.phone.replace(/\D/g, '')
    if (q.ipn)       body.inn = q.ipn
    if (q.snils)     body.snils = q.snils.replace(/\D/g, '')
    if (q.passport)  body.passport = q.passport.replace(/\s/g, '')
    if (q.email)     body.email = q.email

    if (Object.keys(body).length === 0) return []

    body.limit = '50'

    const res = await fetch(`http://${VPS_HOST}:${VPS_TG_PORT}/leaks/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.results || []
  } catch {
    return []
  }
}

// ─── Головна функція пошуку ──────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const q: FragmentQuery = await request.json()
    const maxResults = Math.min(q.limit || 50, 200)

    // Перевіряємо що є хоч щось для пошуку
    const searchFields = [
      q.last_name, q.first_name, q.dob, q.passport, q.ipn, q.snils,
      q.phone, q.email, q.region, q.rank, q.unit, q.unit_num,
      q.vehicle_plate, q.relative_name, q.vk_url, q.military_id,
    ].filter(Boolean)

    if (searchFields.length === 0) {
      return NextResponse.json({ error: 'Вкажіть хоча б один параметр пошуку' }, { status: 400 })
    }

    // ── 1. Паралельний пошук: telegram_raw + VPS leaks ──────────────────────
    const [telegramIds, leaksResults] = await Promise.all([
      searchInTelegramRaw(q, 100),
      searchInLeaksDB(q),
    ])

    // ── 2. Будуємо Supabase запит ────────────────────────────────────────────
    let dbQuery = supabase.from('persons').select(`
      id, name_rus, name_ukr, name, dob, gender, region,
      rank, unit, unit_num, military_id,
      passport, ipn, snils, phones, email,
      vk_url, photo_url, myrotvorets_url,
      description, osint_connections, tags,
      threat_score, verified, telegram_raw
    `)

    // Фільтри що точно відкидають нерелевантних
    if (q.myrotvorets_only) {
      dbQuery = dbQuery.not('myrotvorets_url', 'is', null)
    }
    if (q.has_photo) {
      dbQuery = dbQuery.not('photo_url', 'is', null)
    }
    if (q.gender) {
      dbQuery = dbQuery.eq('gender', q.gender)
    }

    // Нечіткий пошук по прізвищу (найефективніший фільтр)
    if (q.last_name && q.last_name.length >= 3) {
      const ln = q.last_name.trim()
      dbQuery = dbQuery.or(
        `name_rus.ilike.${ln}%,name_ukr.ilike.${ln}%,` +
        `name_rus.ilike.% ${ln} %,name_ukr.ilike.% ${ln} %,` +
        `name_rus.ilike.% ${ln},name_ukr.ilike.% ${ln}`
      )
    }

    // Точний пошук по унікальних полях
    if (q.ipn) {
      dbQuery = supabase.from('persons').select(`
        id, name_rus, name_ukr, name, dob, gender, region,
        rank, unit, unit_num, military_id,
        passport, ipn, snils, phones, email,
        vk_url, photo_url, myrotvorets_url,
        description, osint_connections, tags,
        threat_score, verified, telegram_raw
      `).ilike('ipn', `%${q.ipn}%`)
    } else if (q.passport) {
      dbQuery = supabase.from('persons').select(`
        id, name_rus, name_ukr, name, dob, gender, region,
        rank, unit, unit_num, military_id,
        passport, ipn, snils, phones, email,
        vk_url, photo_url, myrotvorets_url,
        description, osint_connections, tags,
        threat_score, verified, telegram_raw
      `).ilike('passport', `%${q.passport.replace(/\s/g, '')}%`)
    } else if (q.snils) {
      dbQuery = supabase.from('persons').select(`
        id, name_rus, name_ukr, name, dob, gender, region,
        rank, unit, unit_num, military_id,
        passport, ipn, snils, phones, email,
        vk_url, photo_url, myrotvorets_url,
        description, osint_connections, tags,
        threat_score, verified, telegram_raw
      `).ilike('snils', `%${q.snils.replace(/\D/g, '')}%`)
    }

    // Регіон
    if (q.region && q.region.length >= 3) {
      dbQuery = dbQuery.ilike('region', `%${q.region}%`)
    }
    // Звання
    if (q.rank && q.rank.length >= 2) {
      dbQuery = dbQuery.ilike('rank', `%${q.rank}%`)
    }
    // Підрозділ
    if (q.unit && q.unit.length >= 3) {
      dbQuery = dbQuery.or(`unit.ilike.%${q.unit}%,unit_num.ilike.%${q.unit}%`)
    }

    dbQuery = dbQuery.limit(Math.min(maxResults * 3, 500))

    const { data: dbResults, error } = await dbQuery

    if (error) {
      console.error('Fragment search DB error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // ── 3. Додаємо telegram hits ──────────────────────────────────────────────
    let allIds = new Set((dbResults || []).map((r: any) => r.id))
    const tgOnlyIds = telegramIds.filter(id => !allIds.has(id))

    let tgOnlyPersons: any[] = []
    if (tgOnlyIds.length > 0) {
      const { data: tgPersons } = await supabase
        .from('persons')
        .select(`
          id, name_rus, name_ukr, name, dob, gender, region,
          rank, unit, unit_num, military_id,
          passport, ipn, snils, phones, email,
          vk_url, photo_url, myrotvorets_url,
          description, osint_connections, tags,
          threat_score, verified, telegram_raw
        `)
        .in('id', tgOnlyIds.slice(0, 50))
      tgOnlyPersons = tgPersons || []
    }

    const allPersons = [...(dbResults || []), ...tgOnlyPersons]

    // ── 4. Скорінг і сортування ──────────────────────────────────────────────
    const telegramIdSet = new Set(telegramIds)
    const scored = allPersons.map(person => ({
      ...person,
      _score: calcMatchScore(person, q, telegramIdSet.has(person.id)),
      _matched_fields: getMatchedFields(person, q),
      telegram_raw: undefined, // не повертаємо великий масив
    }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, maxResults)

    // ── 5. Збагачуємо leaks результати мітками джерел ───────────────────────
    const SOURCE_LABELS: Record<string, string> = {
      ros_pasport: 'РосПаспорт', gosuslugi: 'Гослуслуги', mts: 'МТС',
      beeline: 'Білайн', fssp: 'ФССП', military: 'Військові',
      spektr: 'Спектр', getcontact: 'GetContact', black_sprut: 'BlackSprut',
      vk: 'VK', unknown: 'Невідомо',
    }
    const enrichedLeaks = leaksResults.map((r: LeakResult) => ({
      ...r,
      source_label: SOURCE_LABELS[r.source] || r.source || 'Витік',
    }))

    return NextResponse.json({
      success: true,
      total: scored.length,
      query: q,
      results: scored,
      leaks: enrichedLeaks,
      leaks_total: enrichedLeaks.length,
      searched_at: new Date().toISOString(),
    })

  } catch (err: any) {
    console.error('Fragment search error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
