// app/api/breach/search/route.ts
// Unified breach database search: DeHashed + LeakCheck + SnusBase + HIBP + OsintKit + Shodan + Censys + PeopleFindBase
// POST /api/breach/search  body: { query, type? } or { fields: {...} }

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST    = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT     = process.env.TELEGRAM_SEARCH_PORT || '8001'
const SOCIAL_PORT = process.env.SOCIAL_SEARCH_PORT   || '8005'

// ─── DeHashed API v2 (4.0) ────────────────────────────────────────────────────
// POST https://api.dehashed.com/v2/search
// Header: DeHashed-Api-Key: <key>
// Body: { query, page, size, wildcard, regex, de_dupe }
async function searchDeHashed(query: string, type: string): Promise<any> {
  const apiKey = process.env.DEHASHED_API_KEY
  if (!apiKey) return { source: 'dehashed', error: 'no_key', entries: [] }

  const fieldMap: Record<string, string> = {
    phone: 'phone', email: 'email', inn: 'username',
    name: 'name', ip: 'ip_address', password: 'password',
    username: 'username', address: 'address',
  }
  const field = fieldMap[type] || 'name'
  const dhQuery = `${field}:"${query}"`

  try {
    // v2 API (POST) — актуальний ендпоінт (квітень 2025)
    const res = await fetch('https://api.dehashed.com/v2/search', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'Dehashed-Api-Key': apiKey,
        'Accept':          'application/json',
      },
      body: JSON.stringify({
        query:   dhQuery,
        page:    1,
        size:    20,
        wildcard: false,
        regex:   false,
        de_dupe: true,
      }),
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[DeHashed] HTTP', res.status, JSON.stringify(err).slice(0, 300))
      if (res.status === 401 || res.status === 403) return { source: 'dehashed', error: 'need_subscription', entries: [] }
      return { source: 'dehashed', error: err.error || err.message || `HTTP ${res.status}`, entries: [] }
    }

    const data = await res.json()
    return {
      source: 'dehashed',
      total: data.total || 0,
      balance: data.balance,
      entries: (data.entries || []).map((e: any) => ({
        email:     Array.isArray(e.email)    ? e.email[0]    : e.email,
        username:  Array.isArray(e.username) ? e.username[0] : e.username,
        name:      Array.isArray(e.name)     ? e.name[0]     : e.name,
        phone:     Array.isArray(e.phone)    ? e.phone[0]    : e.phone,
        address:   Array.isArray(e.address)  ? e.address[0]  : e.address,
        password:  e.password || null,   // показуємо реальний пароль
        hashed_pw: Array.isArray(e.hashed_password) ? e.hashed_password[0] : e.hashed_password,
        ip:        Array.isArray(e.ip_address) ? e.ip_address[0] : e.ip_address,
        database:  e.sources?.join(', ') || e.database_name,
      })).filter((e: any) => Object.values(e).some(v => v != null && v !== '')),
    }
  } catch (err: any) {
    return { source: 'dehashed', error: err.message, entries: [] }
  }
}

// ─── LeakCheck Public API (FREE — без ключа, тільки email) ───────────────────
async function searchLeakCheckPublic(query: string, type: string): Promise<any> {
  // Public endpoint only works for email queries
  if (type !== 'email' && !/@/.test(query)) {
    return { source: 'leakcheck_public', error: 'email_only', entries: [] }
  }
  try {
    const url = `https://leakcheck.io/api/public?check=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: {
        'Accept':     'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; OSINT-Tool/1.0)',
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { source: 'leakcheck_public', error: `HTTP ${res.status}`, entries: [] }
    const data = await res.json()
    // "Not found" means the email is clean — treat as 0 results, NOT an error
    if (!data.success) {
      const notFound = /not found|not_found/i.test(data.error || data.message || '')
      if (notFound) return { source: 'leakcheck_public', total: 0, entries: [] }
      return { source: 'leakcheck_public', error: data.message || data.error || 'failed', entries: [] }
    }
    if (!data.found) return { source: 'leakcheck_public', total: 0, entries: [] }

    // Public API shows breach names but no credentials
    // API may return sources as strings or objects { name, date }
    const sources: any[] = data.sources || []
    return {
      source: 'leakcheck_public',
      total:   sources.length,
      entries: sources.map((src: any) => {
        const name = typeof src === 'string' ? src : (src?.name || String(src))
        const date = typeof src === 'object' && src?.date ? ` (${src.date})` : ''
        return {
          email:    query,
          database: name + date,
          note:     'Детальні дані доступні з API ключем',
        }
      }),
    }
  } catch (err: any) {
    return { source: 'leakcheck_public', error: err.message, entries: [] }
  }
}

// ─── LeakCheck API (платний, з ключем) ───────────────────────────────────────
async function searchLeakCheck(query: string, type: string): Promise<any> {
  const apiKey = process.env.LEAKCHECK_API_KEY
  if (!apiKey) return { source: 'leakcheck', error: 'no_key', entries: [] }

  const typeMap: Record<string, string> = {
    email: 'email', phone: 'phone', username: 'login',
    hash: 'hash', inn: 'login',
  }
  const lcType = typeMap[type] || 'auto'

  try {
    const url = `https://leakcheck.io/api/v2/query/${encodeURIComponent(query)}?type=${lcType}`
    const res = await fetch(url, {
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      console.error('[LeakCheck] HTTP', res.status, JSON.stringify(errBody).slice(0, 300))
      return { source: 'leakcheck', error: `HTTP ${res.status}`, entries: [] }
    }
    const data = await res.json()
    console.log('[LeakCheck] response:', JSON.stringify(data).slice(0, 200))
    if (!data.success) return { source: 'leakcheck', error: data.message, entries: [] }
    return {
      source: 'leakcheck',
      total: data.found || 0,
      entries: (data.result || []).map((e: any) => ({
        email:       e.email,
        username:    e.line?.split(':')[0] || e.username,
        password:    e.line?.split(':').slice(1).join(':') || null,
        database:    e.sources?.join(', '),
        last_breach: e.last_breach,
      })).filter((e: any) => e.email || e.username),
    }
  } catch (err: any) {
    return { source: 'leakcheck', error: err.message, entries: [] }
  }
}

// ─── HaveIBeenPwned API ($3.50/міс, дуже надійний) ───────────────────────────
async function searchHIBP(query: string, type: string): Promise<any> {
  const apiKey = process.env.HIBP_API_KEY
  if (!apiKey) return { source: 'hibp', error: 'no_key', entries: [] }

  // HIBP supports email lookup only (primary use case)
  if (type !== 'email' && !/@/.test(query)) {
    return { source: 'hibp', error: 'email_only', entries: [] }
  }

  try {
    const res = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(query)}?truncateResponse=false`,
      {
        headers: {
          'hibp-api-key': apiKey,
          'User-Agent':   'ODB-Platform/1.0',
          'Accept':       'application/json',
        },
        signal: AbortSignal.timeout(6000),
      }
    )
    if (res.status === 404) return { source: 'hibp', total: 0, entries: [] } // not found = clean
    if (res.status === 401) return { source: 'hibp', error: 'invalid_key', entries: [] }
    if (!res.ok) return { source: 'hibp', error: `HTTP ${res.status}`, entries: [] }

    const breaches = await res.json()
    return {
      source: 'hibp',
      total:  breaches.length,
      entries: breaches.map((b: any) => ({
        email:       query,
        database:    b.Name,
        note:        `${b.Title} — ${b.BreachDate?.slice(0, 7) || '?'} · ${(b.PwnCount || 0).toLocaleString()} акаунтів`,
        obtained_at: b.BreachDate,
        classes:     b.DataClasses?.join(', '),
      })),
    }
  } catch (err: any) {
    return { source: 'hibp', error: err.message, entries: [] }
  }
}

// ─── SnusBase API ─────────────────────────────────────────────────────────────
async function searchSnusBase(query: string, type: string): Promise<any> {
  const apiKey = process.env.SNUSBASE_API_KEY
  if (!apiKey) return { source: 'snusbase', error: 'no_key', entries: [] }

  const typeMap: Record<string, string> = {
    email: 'email', username: 'username', password: 'password',
    name: 'name', hash: 'hash', ip: 'lastip',
  }
  const snType = typeMap[type] || 'email'

  try {
    const res = await fetch('https://api.snusbase.com/data/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Auth': apiKey },
      body: JSON.stringify({ terms: [query], types: [snType], wildcard: false }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { source: 'snusbase', error: `HTTP ${res.status}`, entries: [] }
    const data = await res.json()
    const allResults: any[] = []
    for (const [db, rows] of Object.entries(data.results || {})) {
      for (const row of (rows as any[])) {
        allResults.push({
          email:    row.email,
          username: row.username,
          name:     row.name,
          password: row.password || null,
          hash:     row.hash,
          ip:       row.lastip,
          database: db,
        })
      }
    }
    return { source: 'snusbase', total: data.size || allResults.length, entries: allResults }
  } catch (err: any) {
    return { source: 'snusbase', error: err.message, entries: [] }
  }
}

// ─── OsintKit API (731 Russian databases: Alfabank, ГосУслуги, РСА etc.) ─────
async function searchOsintKit(query: string, type: string, fields?: Record<string, string>): Promise<any> {
  const apiKey = process.env.OSINTKIT_API_KEY
  if (!apiKey) return { source: 'osintkit', error: 'no_key', entries: [] }

  // Build query params based on type
  const params = new URLSearchParams()
  params.set('max_rows', '100')

  // Multi-field structured search (advanced mode)
  if (fields && Object.keys(fields).length > 0) {
    if (fields.name)     params.set('filters[names]', fields.name)
    if (fields.phone)    params.set('filters[phones]', fields.phone.replace(/[\s\-\(\)]/g, ''))
    if (fields.email)    params.set('filters[emails]', fields.email)
    if (fields.dob)      params.set('filters[birth_date]', fields.dob) // DD.MM.YYYY
    if (fields.inn)      params.set('filters[inn]', fields.inn)
    if (fields.snils)    params.set('filters[snils]', fields.snils)
    if (fields.passport) params.set('filters[documents.passports.serial]', fields.passport)
    if (fields.address)  params.set('filters[address]', fields.address)
    if (fields.login)    params.set('filters[logins.login]', fields.login)
    if (fields.vin)      params.set('filters[vehicles.vin]', fields.vin)
    if (fields.plate)    params.set('filters[vehicles.plate_number]', fields.plate)
    if (fields.telegram) params.set('filters[social_networks.id]', fields.telegram)
  } else {
    // Single-field auto-detect mode
    if (type === 'email')            params.set('filters[emails]', query)
    else if (type === 'phone')       params.set('filters[phones]', query.replace(/[\s\-\(\)]/g, ''))
    else if (type === 'name')        params.set('filters[names]', query)
    else if (type === 'inn')         params.set('filters[inn]', query)
    else if (type === 'snils')       params.set('filters[snils]', query)
    else if (type === 'passport')    params.set('filters[documents.passports.serial]', query)
    else if (type === 'username')    params.set('filters[logins.login]', query)
    else if (type === 'address')     params.set('filters[address]', query)
    else if (type === 'ip')          params.set('filters[logins.login]', query)
    else                             params.set('filters[names]', query)
  }

  const searchUrl = `https://api.osintkit.net/v1/search?${params.toString()}`
  try {
    const res = await fetch(searchUrl, {
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })

    if (res.status === 401) return { source: 'osintkit', error: 'invalid_key', entries: [] }
    if (res.status === 402) return { source: 'osintkit', error: 'limit_exceeded', entries: [] }
    if (res.status === 403) return { source: 'osintkit', error: 'need_premium', entries: [] }
    if (!res.ok) return { source: 'osintkit', error: `HTTP ${res.status}`, entries: [] }

    const data = await res.json()
    const results: any[] = data.data || []

    return {
      source: 'osintkit',
      total: data.metadata?.total_records || results.length,
      entries: results.map((r: any) => ({
        name:      r.names?.[0] || null,
        email:     r.emails?.[0] || null,
        phone:     r.phones?.[0] || null,
        address:   r.address?.[0] || null,
        dob:       r.birth_date || null,
        inn:       r.inn || null,
        snils:     r.snils || null,
        passport:  r.documents?.passports?.[0]?.serial || null,
        username:  r.logins?.[0]?.login || null,
        password:  r.logins?.[0]?.password || null,
        vk_id:     r.social_networks?.find((s: any) => s.name === 'VK')?.id || null,
        telegram_id: r.social_networks?.find((s: any) => s.name === 'Telegram')?.id || null,
        vehicle:   r.vehicles?.[0] ? `${r.vehicles[0].model || ''} ${r.vehicles[0].plate_number || ''}`.trim() : null,
        military:  r.forces?.[0] ? `${r.forces[0].rank || ''} ${r.forces[0].unit || ''}`.trim() : null,
        database:  r.database_name,
        as_of:     r.as_of_date || null,
        // Keep extra names/phones/emails as notes
        extra_names:  r.names?.length  > 1 ? r.names.slice(1).join(', ')  : null,
        extra_phones: r.phones?.length > 1 ? r.phones.slice(1).join(', ') : null,
        extra_emails: r.emails?.length > 1 ? r.emails.slice(1).join(', ') : null,
      })).filter((e: any) => Object.values(e).some(v => v != null && v !== '')),
    }
  } catch (err: any) {
    return { source: 'osintkit', error: err.message, entries: [] }
  }
}

// ─── Shodan Host Lookup (IP enrichment) ──────────────────────────────────────
async function searchShodan(query: string, type: string): Promise<any> {
  const apiKey = process.env.SHODAN_API_KEY
  if (!apiKey) return { source: 'shodan', error: 'no_key', entries: [] }
  if (type !== 'ip') return { source: 'shodan', error: 'ip_only', entries: [] }

  const ip = query.trim()
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return { source: 'shodan', error: 'invalid_ip', entries: [] }
  }

  try {
    const res = await fetch(
      `https://api.shodan.io/shodan/host/${ip}?key=${apiKey}`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (res.status === 404) return { source: 'shodan', total: 0, entries: [] }
    if (!res.ok) return { source: 'shodan', error: `HTTP ${res.status}`, entries: [] }

    const d = await res.json()
    const ports = (d.ports || []).join(', ')
    const hostnames = (d.hostnames || []).join(', ')
    const domains   = (d.domains   || []).join(', ')

    // Create one entry per open service
    const entries = (d.data || []).map((svc: any) => ({
      ip:       ip,
      port:     svc.port,
      protocol: svc.transport || 'tcp',
      product:  svc.product || svc._shodan?.module || null,
      version:  svc.version || null,
      banner:   (svc.data || '').slice(0, 200),
      cves:     svc.vulns ? Object.keys(svc.vulns).join(', ') : null,
      database: `Shodan · ${d.country_name || ''} ${d.city || ''} · ${d.org || d.isp || ''}`,
    }))

    // Also add a summary entry
    entries.unshift({
      ip,
      name:     hostnames || domains || null,
      address:  `${d.city || ''} ${d.country_name || ''}`.trim() || null,
      username: d.org || d.isp || null,
      note:     `Ports: ${ports} | ASN: ${d.asn || ''} | OS: ${d.os || 'unknown'}`,
      database: 'Shodan Summary',
    })

    return {
      source:  'shodan',
      total:   entries.length,
      ip_info: {
        country: d.country_name, city: d.city, org: d.org,
        isp: d.isp, asn: d.asn, os: d.os,
        hostnames, domains, ports, last_update: d.last_update,
      },
      entries,
    }
  } catch (err: any) {
    return { source: 'shodan', error: err.message, entries: [] }
  }
}

// ─── Censys Host Lookup (IP enrichment) ──────────────────────────────────────
async function searchCensys(query: string, type: string): Promise<any> {
  const apiToken = process.env.CENSYS_API_TOKEN
  if (!apiToken) return { source: 'censys', error: 'no_key', entries: [] }
  if (type !== 'ip') return { source: 'censys', error: 'ip_only', entries: [] }

  const ip = query.trim()
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return { source: 'censys', error: 'invalid_ip', entries: [] }
  }

  try {
    const res = await fetch(`https://search.censys.io/api/v2/hosts/${ip}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept':        'application/json',
      },
      signal: AbortSignal.timeout(6000),
    })
    if (res.status === 404) return { source: 'censys', total: 0, entries: [] }
    if (res.status === 422) return { source: 'censys', error: 'invalid_ip', entries: [] }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { source: 'censys', error: `HTTP ${res.status}: ${err.message || ''}`, entries: [] }
    }

    const data = await res.json()
    const host = data.result || {}
    const services: any[] = host.services || []

    const entries = services.map((svc: any) => ({
      ip,
      port:     svc.port,
      protocol: svc.transport_protocol || 'tcp',
      product:  svc.software?.[0]?.product || svc.service_name || null,
      version:  svc.software?.[0]?.version || null,
      banner:   svc.banner || null,
      note:     svc.tls?.certificates?.leaf_data?.subject_dn || null,
      database: `Censys · ${host.location?.country || ''} ${host.location?.city || ''} · ${host.autonomous_system?.name || ''}`,
    }))

    const asn  = host.autonomous_system
    const loc  = host.location

    entries.unshift({
      ip,
      port:     null,
      protocol: null,
      product:  host.reverse_dns?.reverse_dns?.[0] || asn?.name || null,
      version:  null,
      banner:   `ASN: ${asn?.asn || ''} | BGP: ${asn?.bgp_prefix || ''} | ${asn?.country_code || ''}`,
      note:     `${loc?.city || ''} ${loc?.country || ''}`.trim() || null,
      database: 'Censys Summary',
    })

    return { source: 'censys', total: entries.length, entries }
  } catch (err: any) {
    return { source: 'censys', error: err.message, entries: [] }
  }
}

// ─── PeopleFindBaseBot (Telegram VPS gateway) ────────────────────────────────
// Потребує запущеного VPS сервісу (python telegram userbot на port 8005)
async function searchPeopleFindBot(query: string, type: string): Promise<any> {
  try {
    const typeMap: Record<string, string> = {
      phone: 'phone', name: 'name', email: 'email',
      inn: 'inn', passport: 'passport', snils: 'snils',
    }
    const botType = typeMap[type] || 'name'

    const res = await fetch(`http://${VPS_HOST}:${SOCIAL_PORT}/peoplefind/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, type: botType }),
      signal: AbortSignal.timeout(6000), // бот може відповідати довго
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      if (res.status === 503 || res.status === 404) {
        return { source: 'peoplefind_bot', error: 'vps_offline', entries: [] }
      }
      return { source: 'peoplefind_bot', error: `HTTP ${res.status}`, entries: [] }
    }

    const data = await res.json()
    return {
      source:  'peoplefind_bot',
      total:   data.results?.length || 0,
      entries: (data.results || []).map((r: any) => ({
        name:     r.name     || r.fio    || null,
        phone:    r.phone    || null,
        email:    r.email    || null,
        address:  r.address  || r.addr   || null,
        dob:      r.dob      || r.birth  || null,
        inn:      r.inn      || null,
        passport: r.passport || null,
        database: r.source   || 'PeopleFindBaseBot',
        note:     r.raw      || null,
      })).filter((e: any) => Object.values(e).some(v => v != null && v !== '')),
    }
  } catch (err: any) {
    return { source: 'peoplefind_bot', error: 'vps_offline', entries: [] }
  }
}

// ─── Локальна VPS leaks DB ────────────────────────────────────────────────────
async function searchLocalLeaks(query: string, type: string): Promise<any> {
  try {
    const body: Record<string, string> = {}
    if (type === 'phone')    body.phone    = query.replace(/\D/g, '')
    if (type === 'email')    body.email    = query
    if (type === 'inn')      body.inn      = query
    if (type === 'name')     body.name     = query
    if (type === 'passport') body.passport = query
    if (type === 'snils')    body.snils    = query
    if (!Object.keys(body).length) body.phone = query

    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/leaks/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { source: 'local_leaks', error: 'VPS error', entries: [] }
    const data = await res.json()
    return {
      source: 'local_leaks',
      total: data.results?.length || 0,
      entries: (data.results || []).map((r: any) => ({
        phone:    r.phone,
        email:    r.email,
        name:     r.name,
        dob:      r.dob,
        inn:      r.inn,
        snils:    r.snils,
        passport: r.passport,
        address:  r.address,
        vk_id:    r.vk_id,
        database: r.source,
      })),
    }
  } catch {
    return { source: 'local_leaks', error: 'VPS offline', entries: [] }
  }
}

// ─── LeakOsint API (800+ RU/CIS databases) ───────────────────────────────────
// Охоплює: ВКонтакте, Одноклассники, Авіто, HeadHunter, ГИБДД, ФНС, МВС,
//          Сбербанк, Тінькофф, МТС, Білайн, Мегафон, ГосУслуги і ще 800+
async function searchLeakOsint(query: string, type: string): Promise<any> {
  const apiKey = process.env.LEAKOSINT_API_KEY
  if (!apiKey) return { source: 'leakosint', error: 'no_key', entries: [] }

  try {
    const res = await fetch('https://leakosintapi.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: apiKey, request: query, limit: 100, lang: 'ru' }),
      signal: AbortSignal.timeout(6000),
    })
    if (res.status === 401 || res.status === 403) return { source: 'leakosint', error: 'invalid_key', entries: [] }
    if (res.status === 402) return { source: 'leakosint', error: 'no_balance', entries: [] }
    if (!res.ok) return { source: 'leakosint', error: `HTTP ${res.status}`, entries: [] }

    const data = await res.json()
    // Response: { List: { "DBName": { Data: [{fields}], InfoLeak: "...", NumOfResults: N } }, NumOfResults: N }
    if (data.error) return { source: 'leakosint', error: data.error, entries: [] }

    const entries: any[] = []
    for (const [dbName, dbData] of Object.entries(data.List || {})) {
      if (dbName === 'No results found') continue
      const rows: any[] = Array.isArray((dbData as any).Data) ? (dbData as any).Data : []
      for (const row of rows) {
        // Handle both flat (FirstName/LastName) and combined (FullName/fio) name formats
        const fullName = row.FullName || row.fio || row.FIO || row.name || row.Name
          || [row.LastName, row.FirstName, row.MiddleName].filter(Boolean).join(' ')
          || null

        // Passport: series + number as string
        const passportSeries = row.PassportSeries || row.Series || row['Серия паспорта'] || ''
        const passportNumber = row.PassportNumber || row.Passport || row.passport || row.DocNumber || row['Номер паспорта'] || ''
        const passportFull = passportSeries && passportNumber
          ? `${passportSeries} ${passportNumber}`.trim()
          : (passportNumber || passportSeries || null)
        const passportStr = passportFull && typeof passportFull === 'object'
          ? JSON.stringify(passportFull) : (passportFull ? String(passportFull) : null)

        // Extra phones (some DBs have multiple)
        const extraPhones = [row.Phone2, row.Phone3, row.phone2, row.phone3]
          .filter(Boolean).join(', ') || null

        // Relatives (Relationship DB)
        const relatives = row.Relatives || row.relatives || row['Родственники'] || null

        // Vehicle info
        const vehicleStr = [
          row.CarBrand || row.Brand || row.Marka,
          row.CarModel || row.Model,
          row.CarPlate || row.GRZ || row.Plate || row.AutoNum,
          row.VIN ? `VIN:${row.VIN}` : null,
          row.CarYear ? `(${row.CarYear})` : null,
        ].filter(Boolean).join(' ') || row.Car || row.auto || row.grz || null

        // Insurance
        const insurance = row.Insurance || row.PolicyNum || row.Strahovka || null

        entries.push({
          name:            fullName,
          email:           row.Email       || row.email       || null,
          phone:           row.Phone       || row.phone       || row.tel || null,
          extra_phones:    extraPhones,
          address:         row.Address     || row.address     || [row.City || row.city, row.Street || row.street, row.House || row.house].filter(Boolean).join(', ') || null,
          dob:             row.BDay        || row.Date        || row.birth_date || row.birthday || row.dob || null,
          birthplace:      row.BirthPlace  || row.birthplace  || row.PlaceOfBirth || row['Место рождения'] || null,
          inn:             row.INN         || row.inn         || row.TaxID || null,
          snils:           row.SNILS       || row.snils       || row.Snils || null,
          passport:        passportStr,
          passport_issuer: row.IssuedBy    || row.issued_by   || row.PassportIssuer || row['Кем выдан'] || null,
          username:        row.Login       || row.login       || row.username || row.nick || null,
          password:        row.Password    || row.password    || null,
          hashed_pw:       row['Password(SHA256)'] || row['Password(bcrypt)'] || row['Password(md5)'] || null,
          vk_id:           row.VkId        || row.vk_id       || row.uid || null,
          vehicle:         vehicleStr,
          vin:             row.VIN         || row.vin         || null,
          car_plate:       row.CarPlate    || row.GRZ         || row.Plate || row.AutoNum || null,
          ip:              row.IP          || row.ip          || null,
          relatives:       typeof relatives === 'object' ? JSON.stringify(relatives) : relatives,
          insurance:       insurance,
          bank_account:    row.Account     || row.account     || null,
          region:          row.Region      || row.region      || null,
          gender:          row.Gender      || row.gender      || row.Sex || null,
          database:        dbName,
          source_db:       dbName,
          note:            [
            row.Comment || row.comment || null,
            row.InfoLeak ? null : null,  // skip InfoLeak (too long)
          ].filter(Boolean).join(' | ') || null,
        })
      }
    }
    const filtered = entries.filter((e: any) =>
      Object.entries(e)
        .filter(([k]) => k !== 'database' && k !== 'source_db')
        .some(([, v]) => v != null && v !== '')
    )
    return {
      source:  'leakosint',
      total:   data.NumOfResults || filtered.length,
      entries: filtered,
    }
  } catch (err: any) {
    return { source: 'leakosint', error: err.message, entries: [] }
  }
}

// ─── Eye of God / Глаз Бога (Telegram bot via VPS) ───────────────────────────
// Потребує VPS сервісу на порту 8007 (python telegram userbot)
async function searchEyeOfGod(query: string, type: string): Promise<any> {
  const port = process.env.EYEOFGOD_PORT || '8007'
  try {
    const typeMap: Record<string, string> = {
      phone: 'phone', name: 'name', email: 'email',
      inn: 'inn', telegram: 'telegram',
    }
    const res = await fetch(`http://${VPS_HOST}:${port}/eyeofgod/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, type: typeMap[type] || 'phone' }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { source: 'eyeofgod', error: res.status === 503 ? 'vps_offline' : `HTTP ${res.status}`, entries: [] }
    const data = await res.json()
    return {
      source:  'eyeofgod',
      total:   data.results?.length || 0,
      entries: (data.results || []).map((r: any) => ({
        name:     r.name     || r.fio     || null,
        phone:    r.phone    || null,
        email:    r.email    || null,
        address:  r.address  || r.region  || null,
        dob:      r.dob      || r.birth   || null,
        inn:      r.inn      || null,
        telegram_id: r.telegram_id || r.tg_id || null,
        vk_id:    r.vk_id    || null,
        database: r.source   || 'EyeOfGod',
        note:     r.raw      || null,
      })).filter((e: any) => Object.values(e).some(v => v != null && v !== '')),
    }
  } catch {
    return { source: 'eyeofgod', error: 'vps_offline', entries: [] }
  }
}

// ─── OpenDataBot (Ukrainian ЄДР, courts, FOP, enforcement) ───────────────────
// https://opendatabot.ua/developers — безкоштовний план: 100 req/день
async function searchOpenDataBot(query: string, type: string): Promise<any> {
  const apiKey = process.env.OPENDATABOT_TOKEN
  if (!apiKey) return { source: 'opendatabot', error: 'no_key', entries: [] }

  const headers = { 'X-TOKEN': apiKey, 'Accept': 'application/json' }
  const entries: any[] = []

  try {
    // ІПН або ЄДРПОУ (8 цифр = компанія, 10 цифр = фізична особа)
    if (type === 'inn' || /^\d{8,10}$/.test(query)) {
      const isCompany = query.length === 8
      const endpoint  = isCompany
        ? `https://opendatabot.ua/api/v3/company/${query}`
        : `https://opendatabot.ua/api/v3/physical/${query}`
      const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(6000) })
      if (res.ok) {
        const d = await res.json()
        const c = d.data || d
        entries.push({
          name:     c.name     || c.full_name || null,
          address:  c.address  || c.location  || null,
          phone:    c.phone    || null,
          email:    c.email    || null,
          inn:      c.code     || c.edrpou    || query,
          dob:      c.birth_date || c.registration_date || null,
          note:     [c.status, c.activity_kinds?.[0]?.name].filter(Boolean).join(' · ') || null,
          database: isCompany ? 'ЄДР — Компанії (UA)' : 'ЄДР — Фізичні особи (UA)',
        })
      }
    }

    // Пошук за ім'ям — ФОП та юридичні особи
    if (type === 'name' || (!entries.length && query.length >= 3)) {
      const res = await fetch(
        `https://opendatabot.ua/api/v3/fullname?name=${encodeURIComponent(query)}&limit=10`,
        { headers, signal: AbortSignal.timeout(6000) }
      )
      if (res.ok) {
        const d = await res.json()
        for (const r of (d.data || []).slice(0, 10)) {
          entries.push({
            name:     r.name     || r.full_name || null,
            inn:      r.code     || r.edrpou    || null,
            address:  r.address  || r.location  || null,
            dob:      r.birth_date || r.registration_date || null,
            note:     r.status   || null,
            database: r.type === 'fop' ? 'ЄДР — ФОП (UA)' : 'ЄДР — ЮО (UA)',
          })
        }
      }
    }

    // Судовий реєстр
    if (entries.length > 0 || type === 'name') {
      const courtRes = await fetch(
        `https://opendatabot.ua/api/v3/court?name=${encodeURIComponent(query)}&limit=5`,
        { headers, signal: AbortSignal.timeout(6000) }
      ).catch(() => null)
      if (courtRes?.ok) {
        const d = await courtRes.json()
        for (const r of (d.data || []).slice(0, 5)) {
          entries.push({
            name:     r.sides    || query,
            note:     [r.case_number, r.judgment_type, r.court_name].filter(Boolean).join(' · '),
            dob:      r.date     || null,
            database: 'Судовий реєстр (UA)',
          })
        }
      }
    }

    return { source: 'opendatabot', total: entries.length, entries }
  } catch (err: any) {
    return { source: 'opendatabot', error: err.message, entries: [] }
  }
}

// ─── YouControl (Ukrainian business intelligence) ─────────────────────────────
// https://youcontrol.com.ua/api-doc/
async function searchYouControl(query: string, type: string): Promise<any> {
  const apiKey = process.env.YOUCONTROL_API_KEY
  if (!apiKey) return { source: 'youcontrol', error: 'no_key', entries: [] }

  try {
    // Пошук за ЄДРПОУ або назвою компанії
    const isCode = /^\d{8}$/.test(query.trim())
    const url    = isCode
      ? `https://youcontrol.com.ua/api/v2/company-by-code?code=${query}`
      : `https://youcontrol.com.ua/api/v2/companies?q=${encodeURIComponent(query)}&limit=10`

    const res = await fetch(url, {
      headers: { 'x-auth-token': apiKey, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    })
    if (res.status === 401) return { source: 'youcontrol', error: 'invalid_key', entries: [] }
    if (!res.ok) return { source: 'youcontrol', error: `HTTP ${res.status}`, entries: [] }
    const data = await res.json()

    const list: any[] = isCode ? (data ? [data] : []) : (data.items || data.data || [])
    return {
      source:  'youcontrol',
      total:   list.length,
      entries: list.slice(0, 10).map((c: any) => ({
        name:    c.short_name || c.name || null,
        inn:     c.edrpou    || c.code  || null,
        address: c.address   || c.location || null,
        phone:   c.phone     || null,
        email:   c.email     || null,
        note:    [c.status, c.kved_name, c.boss].filter(Boolean).join(' · ') || null,
        database: 'YouControl (UA)',
      })),
    }
  } catch (err: any) {
    return { source: 'youcontrol', error: err.message, entries: [] }
  }
}

// ─── OpenSanctions (РНБО UA + EU + US — VPS Yente або Cloud з ключем) ────────
// VPS self-hosted (Yente): http://VPS/sanctions-api  — безкоштовно
// Cloud (платно): https://api.opensanctions.org — потребує API ключ
async function searchOpenSanctions(query: string): Promise<any> {
  const yenteBase = process.env.YENTE_URL          // VPS self-hosted (пріоритет)
  const cloudKey  = process.env.OPENSANCTIONS_API_KEY

  if (!yenteBase && !cloudKey) {
    return { source: 'opensanctions', error: 'no_key', entries: [] }
  }

  // Helper: parse entity result
  function parseEntity(entity: any): any {
    const p     = entity.properties || {}
    const lists = (entity.datasets || []).join(', ')
    return {
      name:     (p.name    || p.alias || [])[0]  || entity.caption || null,
      address:  (p.address || p.country || [])[0] || null,
      dob:      (p.birthDate || [])[0] || null,
      note:     [
        (p.position || [])[0],
        (p.nationality || [])[0],
        entity.schema,
        entity.score != null ? `match: ${(entity.score * 100).toFixed(0)}%` : null,
      ].filter(Boolean).join(' · '),
      database: `Санкції: ${lists || 'ua_nsdc'}`,
      inn:      (p.taxNumber  || p.idNumber  || [])[0] || null,
      passport: (p.passportNumber || [])[0] || null,
    }
  }

  // ── Спроба 1: VPS Yente (самохостований, безкоштовно) ──────────────────────
  if (yenteBase) {
    try {
      const res = await fetch(`${yenteBase}/match/default`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          queries: {
            q1: { schema: 'Person',      properties: { name: [query] } },
            q2: { schema: 'Company',     properties: { name: [query] } },
            q3: { schema: 'LegalEntity', properties: { name: [query] } },
          },
        }),
        signal: AbortSignal.timeout(6000),
      })
      if (res.ok) {
        const data    = await res.json()
        const entries: any[] = []
        for (const result of Object.values(data.responses || {})) {
          for (const entity of ((result as any).results || [])) {
            if ((entity.score ?? 1) < 0.45) continue
            entries.push(parseEntity(entity))
          }
        }
        return { source: 'opensanctions', total: entries.length, entries: entries.slice(0, 15) }
      }
    } catch { /* fallthrough to cloud */ }
  }

  // ── Спроба 2: OpenSanctions Cloud (з ключем) ───────────────────────────────
  if (cloudKey) {
    try {
      const res = await fetch('https://api.opensanctions.org/match/default', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'application/json',
          'Authorization': `ApiKey ${cloudKey}`,
        },
        body: JSON.stringify({
          queries: {
            q1: { schema: 'Person',      properties: { name: [query] } },
            q2: { schema: 'Company',     properties: { name: [query] } },
            q3: { schema: 'LegalEntity', properties: { name: [query] } },
          },
        }),
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return { source: 'opensanctions', error: `HTTP ${res.status}`, entries: [] }
      const data    = await res.json()
      const entries: any[] = []
      for (const result of Object.values(data.responses || {})) {
        for (const entity of ((result as any).results || [])) {
          if ((entity.score ?? 1) < 0.45) continue
          entries.push(parseEntity(entity))
        }
      }
      return { source: 'opensanctions', total: entries.length, entries: entries.slice(0, 15) }
    } catch (err: any) {
      return { source: 'opensanctions', error: err.message, entries: [] }
    }
  }

  return { source: 'opensanctions', error: 'vps_offline', entries: [] }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { query, type = 'auto', fields } = await req.json()

    // fields = structured multi-param search { name, phone, email, dob, inn, ... }
    const hasFields = fields && Object.values(fields).some((v: any) => v && String(v).trim())

    if (!hasFields && (!query || String(query).trim().length < 2)) {
      return NextResponse.json({ error: 'query required (min 2 chars)' }, { status: 400 })
    }

    // For simple query, use it; for fields mode prioritize most unique identifier
    // Phone/email/inn are more unique than name — use them as primary query
    const q = hasFields
      ? (fields.phone || fields.email || fields.inn || fields.passport || fields.name || '').trim()
      : String(query).trim()

    // Auto-detect type — in fields mode, detect from the primary identifier chosen above
    const autoType = hasFields
      ? (fields.phone    ? 'phone'
       : fields.email    ? 'email'
       : fields.inn      ? 'inn'
       : fields.passport ? 'passport'
       : 'name')
      : type !== 'auto' ? type
      : /@/.test(q)                                               ? 'email'
      : /^\+?\d{10,12}$/.test(q.replace(/[\s\-\(\)]/g, ''))     ? 'phone'
      : /^\d{10}$/.test(q)                                       ? 'inn'
      : /^\d{11}$/.test(q)                                       ? 'snils'
      : 'name'

    // Build display query string
    const displayQuery = hasFields
      ? Object.entries(fields).filter(([,v]) => v).map(([k,v]) => `${k}:${v}`).join(' ')
      : q

    // Run all sources in parallel
    // In fields mode: also run LeakOsint on name if primary query is phone (and vice versa)
    const secondaryLeakOsintPromise = (hasFields && fields.name && autoType === 'phone')
      ? searchLeakOsint(fields.name, 'name')
      : Promise.resolve(null)

    const [
      dehashed, leakcheck_public, leakcheck, hibp, snusbase, osintkit,
      shodan, censys, peoplefind, local,
      leakosint, eyeofgod, opendatabot, youcontrol, opensanctions,
      leakosintByName,
    ] = await Promise.all([
      searchDeHashed(q, autoType),
      searchLeakCheckPublic(q, autoType),
      searchLeakCheck(q, autoType),
      searchHIBP(q, autoType),
      searchSnusBase(q, autoType),
      searchOsintKit(q, autoType, hasFields ? fields : undefined),
      searchShodan(q, autoType),
      searchCensys(q, autoType),
      searchPeopleFindBot(q, autoType),
      searchLocalLeaks(q, autoType),
      searchLeakOsint(q, autoType),
      searchEyeOfGod(q, autoType),
      searchOpenDataBot(q, autoType),
      searchYouControl(q, autoType),
      searchOpenSanctions(q),
      secondaryLeakOsintPromise,
    ])

    // Merge secondary LeakOsint (by name) into main leakosint result
    if (leakosintByName && !leakosintByName.error && leakosintByName.entries?.length) {
      const merged = { ...leakosint }
      merged.entries = [...(leakosint.entries || []), ...(leakosintByName.entries || [])]
      merged.total = (merged.entries.length)
      Object.assign(leakosint, merged)
    }

    const allSources = [
      dehashed, leakcheck_public, leakcheck, hibp, snusbase, osintkit,
      shodan, censys, peoplefind, local,
      leakosint, eyeofgod, opendatabot, youcontrol, opensanctions,
    ]
    const totalHits  = allSources.reduce((s, r) => s + (!r.error ? (r.total || 0) : 0), 0)
    const activeKeys = allSources.filter(s => !s.error && s.total !== undefined).map(s => s.source)

    return NextResponse.json({
      success:     true,
      query:       displayQuery,
      type:        autoType,
      total_hits:  totalHits,
      active_keys: activeKeys,
      sources: {
        dehashed,
        leakcheck_public,
        leakcheck,
        hibp,
        snusbase,
        osintkit,
        shodan,
        censys,
        peoplefind_bot: peoplefind,
        local_leaks:    local,
        // Нові джерела
        leakosint,
        eyeofgod,
        opendatabot,
        youcontrol,
        opensanctions,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — перевірка які ключі налаштовані
export async function GET() {
  return NextResponse.json({
    configured: {
      // Міжнародні leak DB
      dehashed:         !!(process.env.DEHASHED_API_KEY),
      leakcheck_public: true,
      leakcheck:        !!process.env.LEAKCHECK_API_KEY,
      hibp:             !!process.env.HIBP_API_KEY,
      snusbase:         !!process.env.SNUSBASE_API_KEY,
      // Російські/СНД джерела
      osintkit:         !!process.env.OSINTKIT_API_KEY,
      leakosint:        !!process.env.LEAKOSINT_API_KEY,
      eyeofgod:         false, // requires VPS service on port 8007
      peoplefind_bot:   false, // requires VPS service on port 8005
      // Українські джерела
      opendatabot:      !!process.env.OPENDATABOT_TOKEN,
      youcontrol:       !!process.env.YOUCONTROL_API_KEY,
      opensanctions:    true, // безкоштовно без ключа
      // IP розвідка
      shodan:           !!process.env.SHODAN_API_KEY,
      censys:           !!process.env.CENSYS_API_TOKEN,
      local_leaks:      true,
    },
    free_sources:     ['leakcheck_public', 'local_leaks', 'opensanctions'],
    russian_sources:  ['osintkit', 'leakosint', 'eyeofgod', 'peoplefind_bot'],
    ukrainian_sources:['opendatabot', 'youcontrol', 'opensanctions'],
    ip_sources:       ['shodan', 'censys'],
  })
}
