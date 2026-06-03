// app/api/osint/vpn-search/[id]/route.ts
// VPN-захищений scraping заблокованих сайтів (ipbd.ru, leb.su, rusprofile.ru)
// УМОВА АКТИВАЦІЇ: мінімум 2 ідентифікаційних збіги (DOB + INN/SNILS/Passport)
//
// На VPS потрібен: WireGuard/OpenVPN з RU-виходом + vpn_search.py

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_HOST  = process.env.VPS_HOST || '161.35.86.145'
const VPN_PORT  = process.env.VPN_SEARCH_PORT || '8003'

const ALLOWED_TARGETS = [
  'ipbd.ru',
  'leb.su',
  'rusprofile.ru',
  'getcontact.com',
]

// Перевіряємо умову активації — мінімум 2 ідентифікатори
function checkActivationCondition(person: any): { allowed: boolean; reason: string } {
  const identifiers: string[] = []
  if (person.dob)       identifiers.push('dob')
  if (person.ipn)       identifiers.push('inn')
  if (person.snils)     identifiers.push('snils')
  if (person.passport)  identifiers.push('passport')
  if (person.phones?.length > 0) identifiers.push('phone')

  if (identifiers.length < 1) {
    return {
      allowed: false,
      reason: `Недостатньо ідентифікаторів. Потрібно хоча б один з: ДН, ІПН, СНІЛС, паспорт, телефон`,
    }
  }
  return { allowed: true, reason: `OK (${identifiers.join(', ')})` }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { target_sites } = body  // ['ipbd.ru', 'leb.su'] або undefined = всі

  const { data: person, error } = await supabaseAdmin
    .from('persons').select('*').eq('id', id).single()
  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  // Перевірка умови активації
  const activation = checkActivationCondition(person)
  if (!activation.allowed) {
    return NextResponse.json({
      error:   'VPN scraping заблоковано — недостатньо ідентифікаторів для безпечного пошуку',
      reason:  activation.reason,
      success: false,
    }, { status: 403 })
  }

  const sites = (target_sites || ALLOWED_TARGETS).filter((s: string) =>
    ALLOWED_TARGETS.includes(s)
  )

  const name    = person.name_rus || person.name_ukr || person.name || ''
  const payload = {
    name,
    dob:      person.dob,
    inn:      person.ipn,
    snils:    person.snils,
    passport: person.passport,
    phones:   person.phones || [],
    targets:  sites,
  }

  try {
    const res = await fetch(`http://${VPS_HOST}:${VPN_PORT}/vpn-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),  // VPN пошук повільніший
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))

      // Якщо VPS не запущений — повертаємо інструкцію
      return NextResponse.json({
        success:     false,
        error:       err.error || 'VPN search service unavailable',
        setup_required: true,
        setup_instructions: [
          '1. На VPS встановіть WireGuard: apt install wireguard',
          '2. Налаштуйте RU-exit VPN провайдер (наприклад mullvad.net або власний)',
          '3. Скопіюйте scripts/vpn_search.py на VPS: scp scripts/vpn_search.py vps:/opt/odb/',
          '4. Запустіть: python3 /opt/odb/vpn_search.py --server --port 8003',
          '5. Додайте в .env.local: VPN_SEARCH_PORT=8003',
        ],
      }, { status: 503 })
    }

    const data = await res.json()

    // Зберігаємо результати в person_mentions
    if (data.results?.length > 0) {
      const existing = person.person_mentions || []
      const newEntries = data.results.map((r: any) => ({
        source_type: 'vpn_scrape',
        source:      r.site,
        url:         r.url,
        snippet:     r.snippet,
        found_at:    new Date().toISOString(),
        data:        r.data,
      }))
      await supabaseAdmin.from('persons')
        .update({ person_mentions: [...existing, ...newEntries].slice(0, 100) })
        .eq('id', id)
    }

    return NextResponse.json({
      success:    true,
      found:      data.results?.length || 0,
      results:    data.results || [],
      sites_searched: sites,
      vpn_used:   data.vpn_used || false,
    })

  } catch (err: any) {
    return NextResponse.json({
      success:         false,
      error:           'VPN search service offline',
      setup_required:  true,
      message:         'Запустіть vpn_search.py на VPS для активації цього модуля',
    }, { status: 503 })
  }
}
