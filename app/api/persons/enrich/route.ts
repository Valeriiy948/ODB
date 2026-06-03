// app/api/persons/enrich/route.ts
// POST /api/persons/enrich
// Збагачує картку однієї особи: шукає по витоках, санкціях
// Викликається клієнтом по одній особі за раз — для показу прогресу

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS   = `http://${process.env.VPS_HOST || '161.35.86.145'}`
const YENTE = process.env.YENTE_URL || `${VPS}/sanctions-api`

const LEAKOSINT_TOKEN = process.env.LEAKOSINT_TOKEN || ''
const OSINTKIT_KEY    = process.env.OSINTKIT_API_KEY || ''

async function safeFetch(url: string, opts: RequestInit = {}, ms = 10000): Promise<any> {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

async function searchLeakOsint(name: string): Promise<any> {
  if (!LEAKOSINT_TOKEN) return null
  try {
    const res = await fetch('https://leakosintapi.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: LEAKOSINT_TOKEN, request: name, limit: 20, lang: 'ru' }),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const entries: any[] = []
    for (const [src, srcData] of Object.entries(data as Record<string, any>)) {
      if (src === 'Num_Results' || src === 'message') continue
      const list = Array.isArray(srcData) ? srcData : ((srcData as any)?.List || (srcData as any)?.data || [])
      for (const e of list) entries.push({ source: src, ...e })
    }
    return { entries, total: entries.length }
  } catch { return null }
}

async function searchOsintKit(name: string): Promise<any> {
  if (!OSINTKIT_KEY) return null
  // Correct format: filters[names]=ПІБ (per official API docs) — fixed 2026-05-31
  const params = new URLSearchParams()
  params.append('filters[names]', name)
  const url = `https://api.osintkit.net/v1/search?${params.toString()}`
  return safeFetch(url, {
    headers: { 'X-API-KEY': OSINTKIT_KEY, Accept: 'application/json' }
  }, 12000)
}

async function searchSanctions(name: string): Promise<any> {
  return safeFetch(`${YENTE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: name, limit: 5 }),
  }, 8000)
}

function normalizeDobFromLeak(val: any): string | null {
  if (!val) return null
  const s = String(val).trim()
  if (!s || s === 'null' || s === 'undefined') return null
  // ISO: 1989-03-15 or 1989-03-15T00:00:00 → YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // DD.MM.YYYY or D.M.YYYY
  const dot = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/)
  if (dot) return `${dot[3]}-${dot[2].padStart(2,'0')}-${dot[1].padStart(2,'0')}`
  // YYYY only → keep as-is (don't overwrite existing year-only with same year)
  return null
}

function extractFromLeaks(data: any) {
  const phones: string[] = [], emails: string[] = []
  const addresses: string[] = [], inns: string[] = [], vk_urls: string[] = []
  const dobs: string[] = []

  const entries: any[] = data?.entries || data?.List || data?.data || []

  // Helper: value can be string or array
  const toArr = (v: any): string[] => {
    if (!v) return []
    if (Array.isArray(v)) return v.map(String).filter(Boolean)
    return [String(v).trim()].filter(Boolean)
  }

  for (const e of entries) {
    // Phones — LeakOsint: e.phone (string) | OsintKit: e.phones (array)
    phones.push(...toArr(e.phone || e.Phone))
    phones.push(...toArr(e.phones))
    if (e.extra_phones) phones.push(...String(e.extra_phones).split(/[,;]/).map((s: string) => s.trim()).filter(Boolean))

    // Emails
    emails.push(...toArr(e.email || e.Email))
    emails.push(...toArr(e.emails))

    // Address — OsintKit: e.address (array)
    addresses.push(...toArr(e.address || e.Address))

    // INN
    inns.push(...toArr(e.inn || e.INN))

    // VK
    if (e.vk_id) vk_urls.push(`https://vk.com/id${e.vk_id}`)

    // DOB
    const dobRaw = e.dob || e.BDay || e.Birthday || e.DateOfBirth || e.birthdate || e.birth_date || e.date_birth
    const dobNorm = normalizeDobFromLeak(dobRaw)
    if (dobNorm) dobs.push(dobNorm)
  }

  const uniq = (a: string[]) => [...new Set(a.filter(Boolean))]
  return { phones: uniq(phones), emails: uniq(emails), addresses: uniq(addresses), inns: uniq(inns), vk_urls: uniq(vk_urls), dobs: uniq(dobs) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { person_id, name: queryName, phone, email, dob, inn, passport, auto_patch = true } = body

    // Потрібен хоча б person_id, name, або інший ідентифікатор
    const hasAnyField = person_id || queryName || phone || email || inn || passport
    if (!hasAnyField) {
      return NextResponse.json({ error: 'Потрібен хоча б один параметр: name, phone, email, inn або passport' }, { status: 400 })
    }

    // 1. Отримуємо особу з БД
    let person: any = null
    if (person_id) {
      const { data } = await supabase
        .from('persons')
        .select('id, name, name_rus, dob, phones, email, addr_live, ipn, vk_url, status, notes, tags, rank, unit, military_id, passport, snils, myrotvorets_url, threat_score')
        .eq('id', person_id)
        .single()
      person = data
    }

    const searchName = queryName || person?.name_rus || person?.name || ''
    if (!searchName && !phone && !email) {
      return NextResponse.json({ error: 'Потрібно ПІБ, телефон або email для пошуку' }, { status: 400 })
    }

    // 2. Паралельний пошук
    const [leakosint, osintkit, sanctions] = await Promise.all([
      searchLeakOsint(searchName),
      searchOsintKit(searchName),
      searchSanctions(searchName),
    ])

    // 3. Витягуємо дані
    const fromLeak = leakosint ? extractFromLeaks(leakosint) : null
    const fromOsint = osintkit ? extractFromLeaks(osintkit) : null

    const allPhones    = [...new Set([...(fromLeak?.phones || []), ...(fromOsint?.phones || [])])]
    const allEmails    = [...new Set([...(fromLeak?.emails || []), ...(fromOsint?.emails || [])])]
    const allAddresses = [...new Set([...(fromLeak?.addresses || []), ...(fromOsint?.addresses || [])])]
    const allInns      = [...new Set([...(fromLeak?.inns || []), ...(fromOsint?.inns || [])])]
    const allVkUrls    = [...new Set([...(fromLeak?.vk_urls || []), ...(fromOsint?.vk_urls || [])])]
    const allDobs      = [...new Set([...(fromLeak?.dobs || []), ...(fromOsint?.dobs || [])])]

    // 4. Санкції — тільки ВЕРИФІКОВАНІ офіційні списки
    // Виключаємо: ext_ru_egrul (реєстр бізнесу РФ), wikidata, wd_*, gb_coh_disqualified (дискваліфіковані директори)
    const REAL_SANCTION_PROGRAMS = new Set([
      'us_ofac_sdn', 'us_ofac_cons', 'OFAC SDN (США)', 'OFAC Консолідований (США)',
      'eu_fsf', 'eu_travel_bans', 'EU Financial Sanctions', 'EU Travel Bans',
      'gb_hmt_sanctions', 'UK HMT Sanctions',
      'un_sc_sanctions', 'ООН Рада Безпеки',
      'ua_nsdc_sanctions', 'РНБО України',
      'ua_sfms_blacklist', 'ДФМУ України',
      'ua_war_sanctions',
      'interpol_red_notices', 'Інтерпол Red Notice',
      'ru_myrotvorets_wagner',
      'ca_dfatd_sema_sanctions',
      'au_dfat_sanctions',
      'jp_mof_sanctions',
      'nz_russia_sanctions',
      'ch_seco_sanctions',
      'be_fod_sanctions',
      'us_sam_exclusions',
      'us_trade_csl',
      'tw_shtc',
      'mc_fund_freezes',
      'fr_tresor_gels_avoir',
    ])
    // Записи з оцінкою >= 0.85 і хоча б одна реальна санкційна програма
    const sanctionHits = (sanctions?.entries || []).filter((e: any) => {
      if ((e.score || 0) < 0.85) return false
      const progs: string[] = e.programs || []
      return progs.some(p => REAL_SANCTION_PROGRAMS.has(p))
    })
    const isSanctioned  = sanctionHits.length > 0
    // Лише верифіковані програми у мітці
    const sanctionProgs = isSanctioned
      ? [...new Set(sanctionHits.flatMap((e: any) =>
          (e.programs || []).filter((p: string) => REAL_SANCTION_PROGRAMS.has(p))
        ))] as string[]
      : []

    // 5. Готуємо патч
    const patch: Record<string, any> = {}

    if (allPhones.length > 0) {
      const existing = Array.isArray(person?.phones) ? person.phones : []
      patch.phones = [...new Set([...existing, ...allPhones])].slice(0, 20)
    }
    if (allEmails.length > 0 && !person?.email)     patch.email    = allEmails[0]
    if (allAddresses.length > 0 && !person?.addr_live) patch.addr_live = allAddresses[0]
    if (allInns.length > 0 && !person?.ipn)         patch.ipn      = allInns[0]
    if (allVkUrls.length > 0 && !person?.vk_url)    patch.vk_url   = allVkUrls[0]
    // DOB: оновлюємо якщо OSINT знайшов повну дату, а в БД тільки рік (наприклад "1989")
    if (allDobs.length > 0) {
      const curDob = String(person?.dob || '')
      const isYearOnly = /^\d{4}$/.test(curDob.trim())
      const isEmpty = !curDob
      if (isYearOnly || isEmpty) {
        // Prefer a full date that matches the known birth year (if any)
        const matchingDob = allDobs.find(d => curDob && d.startsWith(curDob.substring(0, 4)))
        patch.dob = matchingDob || allDobs[0]
      }
    }

    if (isSanctioned) {
      patch.status = 'санкційний'
      const note = `⚠️ Санкції: ${sanctionProgs.slice(0, 5).join(', ')}`
      patch.notes = person?.notes ? `${person.notes}\n${note}` : note
    }

    // Тег "перевірено"
    const existingTags = Array.isArray(person?.tags) ? person.tags : []
    const newTags = [...new Set([...existingTags, 'перевірено', ...(isSanctioned ? ['sanctions'] : [])])]
    if (newTags.length !== existingTags.length) patch.tags = newTags

    // ── Threat Score (без AI — на основі доступних даних) ─────────────
    // Формула синхронна з calcThreatScore() в osint/ai-profile/[id]/route.ts
    const mergedPerson = { ...person, ...patch }
    let threatScore = 0
    if (mergedPerson.myrotvorets_url)              threatScore += 35
    if (mergedPerson.rank || mergedPerson.unit)    threatScore += 10
    if (mergedPerson.military_id)                  threatScore += 5
    if (mergedPerson.snils || mergedPerson.ipn || allInns.length > 0) threatScore += 5
    if (mergedPerson.passport)                     threatScore += 5
    if (isSanctioned)                              threatScore += 20  // санкції = серйозна загроза
    if (allPhones.length > 0 || (mergedPerson.phones?.length ?? 0) > 0) threatScore += 5
    if (allEmails.length > 0 || mergedPerson.email) threatScore += 3
    threatScore = Math.min(100, threatScore)

    // Завжди оновлюємо threat_score та last_full_osint — навіть якщо нових полів нема
    patch.threat_score    = threatScore
    patch.last_full_osint = new Date().toISOString()

    if (auto_patch && person_id) {
      await supabase.from('persons').update(patch).eq('id', person_id)
    }

    return NextResponse.json({
      success: true,
      person_id,
      name: searchName,
      threat_score: threatScore,
      found: {
        phones: allPhones.length,
        emails: allEmails.length,
        addresses: allAddresses.length,
        inns: allInns.length,
        sanctions: sanctionHits.length,
        dob: patch.dob ? 1 : 0,
      },
      dob_updated: patch.dob || null,
      sanctions_programs: sanctionProgs,
      enriched_fields: Object.keys(patch),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
