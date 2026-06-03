// app/api/sanctions/search/route.ts
// OpenSanctions: OFAC (США), EU, ООН, UK, РНБО України, Інтерпол, Panama Papers
// Пріоритет: локальний VPS сервіс → хмарний API → РНБО fallback

import { NextRequest, NextResponse } from 'next/server'

// Локальний VPS сервіс (sanctions_service.py на порту 8010)
const VPS_HOST  = process.env.VPS_HOST || '161.35.86.145'
// Proxied via nginx port 80 (DO Cloud Firewall blocks :8010 directly)
const YENTE_URL = process.env.YENTE_URL || `http://${VPS_HOST}/sanctions-api`
const OS_BASE   = 'https://api.opensanctions.org'

// Флаги країн для зручності
const COUNTRY_FLAGS: Record<string, string> = {
  ru: '🇷🇺', by: '🇧🇾', ua: '🇺🇦', ir: '🇮🇷', kp: '🇰🇵',
  cn: '🇨🇳', sy: '🇸🇾', ve: '🇻🇪', cu: '🇨🇺', ly: '🇱🇾',
  sd: '🇸🇩', mm: '🇲🇲', us: '🇺🇸', gb: '🇬🇧',
}

// Назви санкційних програм (скорочення → повна назва)
const PROGRAM_LABELS: Record<string, string> = {
  'us_ofac_sdn':          'OFAC SDN (США)',
  'us_ofac_cons':         'OFAC Консолідований (США)',
  'eu_fsf':               'EU Financial Sanctions',
  'eu_travel_bans':       'EU Travel Bans',
  'gb_hmt_sanctions':     'UK HMT Sanctions',
  'un_sc_sanctions':      'ООН Рада Безпеки',
  'ua_nsdc_sanctions':    'РНБО України',
  'ua_sfms_blacklist':    'ДФМУ України',
  'interpol_red_notices': 'Інтерпол Red Notice',
  'ru_acf_bribetakers':   'Фонд Навального (корупція)',
  'icij_offshoreleaks':   'ICIJ Panama Papers',
}

const API_KEY = () => process.env.OPENSANCTIONS_API_KEY || ''

// ─── РНБО України — безплатно, без ключа ─────────────────────────────────────
async function checkNsdc(query: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://sanctions.nsdc.gov.ua/api/sanctions?full_name=${encodeURIComponent(query)}&limit=10`,
      {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const items: any[] = data.results || data.data || data || []
    return items.slice(0, 5).map((item: any) => ({
      id: item.id || String(Math.random()),
      name: [item.full_name_uk, item.full_name_ru, item.full_name_en].find(Boolean) || query,
      aliases: [item.full_name_ru, item.full_name_en].filter(Boolean),
      dob: item.birth_date || null,
      nationality: item.nationality || '🇷🇺 RU',
      positions: item.position ? [item.position] : [],
      programs: ['РНБО України'],
      passports: [],
      is_priority: true,
      schema: 'Person',
      score: 1,
      url: `https://sanctions.nsdc.gov.ua/`,
    }))
  } catch { return [] }
}

export async function POST(req: NextRequest) {
  try {
    const { query, type = 'name' } = await req.json()
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query required' }, { status: 400 })
    }

    const q = String(query).trim()
    const key = API_KEY()

    // ── Пріоритет 1: Локальний VPS сервіс через nginx proxy (sanctions_service.py) ─
    try {
      const vpsRes = await fetch(`${YENTE_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 20 }),
        signal: AbortSignal.timeout(8000),
      })
      if (vpsRes.ok) {
        const vpsData = await vpsRes.json()
        if (!vpsData.error && vpsData.success !== false && Array.isArray(vpsData.entries)) {
          // Нормалізуємо відповідь сервісу до стандартного формату
          const entries = (vpsData.entries || []).map((e: any) => ({
            id:          e.id || String(Math.random()),
            name:        e.name || e.caption || '?',
            aliases:     e.aliases || [],
            dob:         e.dob || e.birth_date || null,
            nationality: e.nationality || e.country || null,
            positions:   e.positions || [],
            programs:    e.programs || e.datasets?.map((d: string) => PROGRAM_LABELS[d] || d) || [],
            passports:   e.passports || [],
            addresses:   e.addresses || [],
            schema:      e.schema || 'Person',
            score:       e.score || 1,
            url:         e.url || `https://www.opensanctions.org/entities/${e.id}/`,
            is_priority: e.is_priority ?? ['ru', 'by'].some(c =>
              (e.nationality || e.country || '').toLowerCase().includes(c)
            ),
          }))
          entries.sort((a: any, b: any) => {
            if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1
            return (b.score || 0) - (a.score || 0)
          })
          return NextResponse.json({
            success: true,
            query:   q,
            total:   vpsData.total || entries.length,
            entries,
            sources_checked: vpsData.sources_checked || ['ofac', 'eu_sanctions', 'un_security_council', 'ua_nsdc', 'uk_hmt', 'interpol'],
            source: 'local_vps',
          })
        }
      }
    } catch {
      // VPS недоступний — продовжуємо до наступного fallback
    }

    // ── Пріоритет 2: Якщо немає API ключа — РНБО + посилання ───────────────
    if (!key) {
      // Спробуємо РНБО напряму (безплатно, без ключа)
      const nsdcResults = await checkNsdc(q)

      return NextResponse.json({
        success: nsdcResults.length > 0,
        no_key: true,
        total: nsdcResults.length,
        entries: nsdcResults,
        query: q,
        sources_checked: ['ua_nsdc'],
        note: 'Перевірено РНБО України. Для повної перевірки (OFAC, EU, UN) додайте OPENSANCTIONS_API_KEY.',
        fallback_urls: {
          opensanctions: `https://www.opensanctions.org/search/?q=${encodeURIComponent(q)}`,
          ofac: `https://sanctionssearch.ofac.treas.gov/?value=${encodeURIComponent(q)}&type=SDN`,
          eu: `https://eeas.europa.eu/topics/sanctions-policy/8442/consolidated-list-of-sanctions_en`,
          ua_nsdc: `https://sanctions.nsdc.gov.ua/`,
          un: `https://www.un.org/securitycouncil/content/un-sc-consolidated-list`,
        },
        message: 'Безплатний API ключ OpenSanctions: https://www.opensanctions.org/api/ → додайте OPENSANCTIONS_API_KEY у .env.local',
      })
    }

    // OpenSanctions /search — пошук по імені, псевдоніму, ІПН, паспорту
    const params = new URLSearchParams({
      q:       q,
      limit:   '20',
      schema:  'Thing',
    })

    const res = await fetch(`${OS_BASE}/search/default?${params}`, {
      headers: {
        'Accept':        'application/json',
        'User-Agent':    'ODB-Platform/1.0 (war-crimes-investigation)',
        'Authorization': `ApiKey ${key}`,
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      return NextResponse.json({
        error: `OpenSanctions HTTP ${res.status}`,
        entries: [],
        fallback_urls: {
          opensanctions: `https://www.opensanctions.org/search/?q=${encodeURIComponent(q)}`,
          ofac: `https://sanctionssearch.ofac.treas.gov/?value=${encodeURIComponent(q)}&type=SDN`,
        },
      })
    }

    const data = await res.json()
    const results = data.results || []

    const entries = results.map((entity: any) => {
      // Назви (всі варіанти написання)
      const names: string[] = entity.properties?.name || []
      const aliases: string[] = entity.properties?.alias || []

      // Дата народження
      const dobs: string[] = entity.properties?.birthDate || []

      // Громадянство
      const nationalities: string[] = entity.properties?.nationality || []
      const countries: string[] = entity.properties?.country || []
      const allCountries = [...new Set([...nationalities, ...countries])]

      // Санкційні програми
      const datasets: string[] = entity.datasets || []
      const programs = datasets.map(d => PROGRAM_LABELS[d] || d)

      // Посади
      const positions: string[] = entity.properties?.position || []

      // Паспорт / ID документи
      const passports: string[] = entity.properties?.passportNumber || []
      const idNumbers: string[] = entity.properties?.idNumber || []

      // Адреси
      const addresses: string[] = entity.properties?.address || []

      // Фото (якщо є)
      const images: string[] = entity.properties?.wikidataId
        ? [`https://www.wikidata.org/wiki/${entity.properties.wikidataId[0]}`]
        : []

      const countryFlags = allCountries.map(c =>
        (COUNTRY_FLAGS[c?.toLowerCase()] || '') + ' ' + c?.toUpperCase()
      ).join(', ')

      return {
        id:            entity.id,
        name:          names[0] || entity.caption || '?',
        aliases:       aliases.slice(0, 5),
        dob:           dobs[0] || null,
        nationality:   countryFlags || null,
        positions:     positions.slice(0, 3),
        programs,
        passports:     [...passports, ...idNumbers].slice(0, 3),
        addresses:     addresses.slice(0, 2),
        schema:        entity.schema, // Person / LegalEntity / etc
        score:         entity.score || 0,
        url:           `https://www.opensanctions.org/entities/${entity.id}/`,
        // Позначка: чи це росіянин/білорус (пріоритет для нас)
        is_priority:   allCountries.some(c => ['ru', 'by'].includes(c?.toLowerCase())),
        raw_countries: allCountries,
      }
    })

    // Сортуємо: спочатку росіяни/білоруси, потім за score
    entries.sort((a: any, b: any) => {
      if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1
      return (b.score || 0) - (a.score || 0)
    })

    return NextResponse.json({
      success: true,
      query:   q,
      total:   data.total || entries.length,
      entries,
      sources_checked: ['ofac', 'eu_sanctions', 'un_security_council', 'ua_nsdc', 'uk_hmt', 'interpol'],
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message, entries: [] }, { status: 500 })
  }
}

// GET — перевірка статусу
export async function GET() {
  try {
    const res = await fetch(`${OS_BASE}/`, { signal: AbortSignal.timeout(5000) })
    return NextResponse.json({ ok: res.ok, free: true, source: 'opensanctions.org' })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
