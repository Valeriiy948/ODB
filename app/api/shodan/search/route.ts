// app/api/shodan/search/route.ts
// Shodan + Censys + GreyNoise + AbuseIPDB + WHOIS + DNS + IP Geo + CVE — мережева розвідка
// POST /api/shodan/search  body: { query, type: 'ip'|'domain'|'search' }

import { NextRequest, NextResponse } from 'next/server'

const SHODAN_KEY    = () => process.env.SHODAN_API_KEY    || ''
const ABUSEIPDB_KEY = () => process.env.ABUSEIPDB_API_KEY || ''
const CENSYS_TOKEN  = () => process.env.CENSYS_API_TOKEN  || ''

// ─── Censys IP lookup (Personal Access Token) ────────────────────────────────
async function censysIp(ip: string): Promise<any> {
  const token = CENSYS_TOKEN()
  if (!token) return { error: 'no_key' }
  try {
    const res = await fetch(`https://search.censys.io/api/v2/hosts/${ip}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[Censys] HTTP ${res.status}:`, body.slice(0, 200))
      if (res.status === 401 || res.status === 403) return {
        error: `Censys HTTP ${res.status}`,
        needs_upgrade: true,
        censys_url: `https://platform.censys.io/hosts/${ip}`,
      }
      return { error: `Censys HTTP ${res.status}` }
    }
    const json = await res.json()
    const d = json.result || json
    return {
      ip:         d.ip,
      country:    d.location?.country,
      city:       d.location?.city,
      asn:        d.autonomous_system?.asn,
      org:        d.autonomous_system?.name,
      bgp:        d.autonomous_system?.bgp_prefix,
      last_seen:  d.last_updated_at?.slice(0, 10),
      ports:      (d.services || []).map((s: any) => s.port),
      services:   (d.services || []).slice(0, 8).map((s: any) => ({
        port:        s.port,
        protocol:    s.transport_protocol,
        service:     s.service_name,
        banner:      (s.banner || '').slice(0, 200),
        product:     s.software?.[0]?.product || null,
        version:     s.software?.[0]?.version || null,
        http_title:  s.http?.response?.html_title || null,
        tls_subject: s.tls?.certificates?.leaf_data?.subject_dn?.slice(0, 80) || null,
      })),
      labels:     d.labels || [],
    }
  } catch (err: any) {
    return { error: err.message }
  }
}

// ─── Censys Search ────────────────────────────────────────────────────────────
async function censysSearch(query: string): Promise<any> {
  const token = CENSYS_TOKEN()
  if (!token) return { error: 'no_key', matches: [] }
  try {
    const res = await fetch(
      `https://search.censys.io/api/v2/hosts/search?q=${encodeURIComponent(query)}&per_page=20`,
      {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!res.ok) return { error: `Censys HTTP ${res.status}`, matches: [] }
    const { result: d } = await res.json()
    return {
      total:   d.total || 0,
      matches: (d.hits || []).map((h: any) => ({
        ip:      h.ip,
        country: h.location?.country,
        city:    h.location?.city,
        org:     h.autonomous_system?.name,
        ports:   (h.services || []).map((s: any) => s.port),
        labels:  h.labels || [],
      })),
    }
  } catch (err: any) {
    return { error: err.message, matches: [] }
  }
}

// ─── Shodan IP lookup ─────────────────────────────────────────────────────────
async function shodanIp(ip: string): Promise<any> {
  const key = SHODAN_KEY()
  if (!key) return { error: 'no_key' }
  try {
    const res = await fetch(`https://api.shodan.io/shodan/host/${ip}?key=${key}`, {
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return { error: `Shodan HTTP ${res.status}` }
    const d = await res.json()
    return {
      ip:          d.ip_str,
      org:         d.org,
      isp:         d.isp,
      asn:         d.asn,
      country:     d.country_name,
      city:        d.city,
      region:      d.region_code,
      hostnames:   d.hostnames || [],
      domains:     d.domains   || [],
      os:          d.os,
      last_update: d.last_update,
      ports:       (d.ports || []).slice(0, 30),
      vulns:       Object.keys(d.vulns || {}).slice(0, 10),
      tags:        d.tags || [],
      services:    (d.data || []).slice(0, 5).map((s: any) => ({
        port:       s.port,
        transport:  s.transport,
        banner:     (s.banner || '').slice(0, 200),
        product:    s.product,
        version:    s.version,
        cpe:        (s.cpe || []).join(', '),
        http_title: s.http?.title || null,
      })),
    }
  } catch (err: any) {
    return { error: err.message }
  }
}

// ─── Shodan Domain/Host search ────────────────────────────────────────────────
async function shodanSearch(query: string): Promise<any> {
  const key = SHODAN_KEY()
  if (!key) return { error: 'no_key', matches: [] }
  try {
    const res = await fetch(
      `https://api.shodan.io/shodan/host/search?key=${key}&query=${encodeURIComponent(query)}&minify=true`,
      { signal: AbortSignal.timeout(15000) }
    )
    if (res.status === 403) return {
      error: 'Shodan Search API потребує платного плану (~$49/рік). Безкоштовно: введіть конкретну IP адресу.',
      upgrade_url: 'https://account.shodan.io/billing',
      tip: 'Спробуйте: 45.83.65.1 або інший конкретний IP',
      matches: [],
      free_tier_limit: true,
    }
    if (!res.ok) return { error: `Shodan HTTP ${res.status}`, matches: [] }
    const d = await res.json()
    return {
      total:   d.total || 0,
      matches: (d.matches || []).slice(0, 20).map((m: any) => ({
        ip:         m.ip_str,
        port:       m.port,
        org:        m.org,
        country:    m.location?.country_name,
        city:       m.location?.city,
        os:         m.os,
        product:    m.product,
        version:    m.version,
        hostnames:  m.hostnames || [],
        http_title: m.http?.title || null,
      })),
    }
  } catch (err: any) {
    return { error: err.message, matches: [] }
  }
}

// ─── GreyNoise Community API (БЕЗКОШТОВНО, без ключа) ────────────────────────
async function greynoiseCheck(ip: string): Promise<any> {
  try {
    const res = await fetch(`https://api.greynoise.io/v3/community/${ip}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'ODB-Platform/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 404) {
      // IP not in GreyNoise DB — not a known scanner
      return { ip, noise: false, riot: false, message: 'Не відомий сканер', not_found: true }
    }
    if (!res.ok) return null
    const d = await res.json()
    return {
      ip,
      noise:          d.noise,          // true = active internet scanner
      riot:           d.riot,           // true = known safe (google, cloudflare etc)
      classification: d.classification, // 'benign' | 'malicious' | 'unknown'
      name:           d.name,
      link:           d.link,
      last_seen:      d.last_seen,
      message:        d.message,
    }
  } catch {
    return null
  }
}

// ─── AbuseIPDB (безкоштовний ключ, 1000 перевірок/день) ──────────────────────
async function abuseipdbCheck(ip: string): Promise<any> {
  const key = ABUSEIPDB_KEY()
  if (!key) return { error: 'no_key' }
  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90&verbose`,
      {
        headers: { 'Key': key, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) return { error: `AbuseIPDB HTTP ${res.status}` }
    const { data: d } = await res.json()
    return {
      ip:               d.ipAddress,
      abuse_score:      d.abuseConfidenceScore, // 0-100
      total_reports:    d.totalReports,
      distinct_users:   d.numDistinctUsers,
      country:          d.countryCode,
      isp:              d.isp,
      domain:           d.domain,
      is_tor:           d.isTor,
      is_public:        d.isPublic,
      usage_type:       d.usageType,
      last_reported_at: d.lastReportedAt,
    }
  } catch (err: any) {
    return { error: err.message }
  }
}

// ─── IP Geolocation (без ключа, кілька fallback) ─────────────────────────────
async function geoIp(ip: string): Promise<any> {
  // Primary: ip-api.com (45 req/min, no auth)
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,org,as,timezone,proxy,hosting`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (res.ok) {
      const d = await res.json()
      if (d.status === 'success') {
        return {
          ip, country: d.country, country_code: d.countryCode,
          region: d.regionName, city: d.city,
          org: d.org, asn: d.as,
          timezone: d.timezone,
          proxy: d.proxy || d.hosting || false,
        }
      }
    }
  } catch {}

  // Fallback: ipwho.is
  try {
    const res = await fetch(`https://ipwho.is/${ip}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const d = await res.json()
      if (d.success !== false) {
        return {
          ip, country: d.country, country_code: d.country_code,
          region: d.region, city: d.city,
          org: d.connection?.org, asn: d.connection?.asn,
          timezone: d.timezone?.id,
          proxy: false,
        }
      }
    }
  } catch {}

  return null
}

// ─── DNS Lookup (Cloudflare DoH — безкоштовно) ───────────────────────────────
async function dnsLookup(domain: string): Promise<any> {
  try {
    const types = ['A', 'MX', 'NS', 'TXT', 'CNAME']
    const results: Record<string, any[]> = {}
    await Promise.allSettled(types.map(async t => {
      const res = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${t}`,
        { headers: { 'Accept': 'application/dns-json' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) return
      const d = await res.json()
      results[t] = (d.Answer || []).map((r: any) => r.data)
    }))
    return results
  } catch { return {} }
}

// ─── WHOIS (RDAP.org — безкоштовно) ──────────────────────────────────────────
async function whoisLookup(domain: string): Promise<any> {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { 'Accept': 'application/rdap+json' },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const d = await res.json()
      const getDate = (action: string) =>
        d.events?.find((e: any) => e.eventAction === action)?.eventDate?.slice(0, 10) || null
      const ns  = d.nameservers?.map((n: any) => n.ldhName?.toLowerCase()) || []
      const org = d.entities?.find((e: any) => e.roles?.includes('registrant'))
      return {
        domain:             d.ldhName?.toLowerCase(),
        registrar:          d.entities?.find((e: any) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3] || null,
        registered:         getDate('registration'),
        expires:            getDate('expiration'),
        updated:            getDate('last changed'),
        nameservers:        ns,
        registrant_org:     org?.vcardArray?.[1]?.find((v: any) => v[0] === 'org')?.[3] || null,
        registrant_country: org?.vcardArray?.[1]?.find((v: any) => v[0] === 'adr')?.[3]?.[6] || null,
        status:             d.status || [],
        source:             'RDAP',
      }
    }
  } catch {}

  // Fallback: IANA RDAP
  try {
    const res = await fetch(`https://rdap.iana.org/domain/${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const d = await res.json()
      return { domain: d.ldhName, status: d.status || [], source: 'IANA RDAP' }
    }
  } catch {}

  return null
}

// ─── WHOIS IP — власник IP, abuse контакт, email (RIPE RDAP) ─────────────────
async function whoisIp(ip: string): Promise<any> {
  try {
    // RIPE RDAP — покриває Європу, Росію, Україну
    const res = await fetch(`https://rdap.db.ripe.net/ip/${ip}`, {
      headers: { 'Accept': 'application/rdap+json', 'User-Agent': 'ODB-Platform/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`RIPE HTTP ${res.status}`)
    const d = await res.json()

    // Витягуємо всі контакти з vCard
    const contacts: any[] = []
    for (const ent of (d.entities || [])) {
      const vcard = ent.vcardArray?.[1] || []
      const fn    = vcard.find((v: any) => v[0] === 'fn')?.[3] || ''
      const emails = vcard.filter((v: any) => v[0] === 'email').map((v: any) => v[3])
      const phones = vcard.filter((v: any) => v[0] === 'tel').map((v: any) => v[3])
      const adrRaw = vcard.find((v: any) => v[0] === 'adr')
      const address = adrRaw
        ? (adrRaw[1]?.label || Object.values(adrRaw[3] || {}).filter(Boolean).join(', '))
        : null
      contacts.push({
        handle: ent.handle,
        name:   fn,
        roles:  ent.roles || [],
        emails,
        phones,
        address,
      })
    }

    // Знаходимо abuse email
    const abuseContact = contacts.find(c => c.roles.includes('abuse'))
    const techContact  = contacts.find(c => c.roles.includes('technical') || c.roles.includes('administrative'))

    return {
      network:      d.name,
      handle:       d.handle,
      cidr:         d.cidr,
      type:         d.type,
      country:      d.country,
      range:        `${d.startAddress} - ${d.endAddress}`,
      abuse_email:  abuseContact?.emails?.[0] || null,
      abuse_phone:  abuseContact?.phones?.[0] || null,
      abuse_org:    abuseContact?.name || null,
      tech_email:   techContact?.emails?.[0] || null,
      tech_name:    techContact?.name || null,
      address:      abuseContact?.address || techContact?.address || null,
      all_contacts: contacts.filter(c => c.emails?.length > 0 || c.phones?.length > 0),
      source:       'RIPE RDAP',
    }
  } catch {
    // Fallback: ARIN (для США/Канади)
    try {
      const res = await fetch(`https://rdap.arin.net/registry/ip/${ip}`, {
        headers: { 'Accept': 'application/rdap+json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return null
      const d = await res.json()
      const org = d.entities?.find((e: any) => e.roles?.includes('registrant'))
      const abuse = d.entities?.find((e: any) => e.roles?.includes('abuse'))
      const getEmail = (ent: any) => ent?.vcardArray?.[1]?.find((v: any) => v[0] === 'email')?.[3] || null
      return {
        network:     d.name,
        handle:      d.handle,
        range:       `${d.startAddress} - ${d.endAddress}`,
        abuse_email: getEmail(abuse),
        tech_name:   org?.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3] || null,
        source:      'ARIN RDAP',
      }
    } catch { return null }
  }
}

// ─── Reverse DNS (PTR record) ─────────────────────────────────────────────────
async function reverseDns(ip: string): Promise<string[]> {
  try {
    // Формуємо PTR запит: 1.2.3.4 → 4.3.2.1.in-addr.arpa
    const ptr = ip.split('.').reverse().join('.') + '.in-addr.arpa'
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(ptr)}&type=PTR`,
      { headers: { 'Accept': 'application/dns-json' }, signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return []
    const d = await res.json()
    return (d.Answer || []).map((r: any) => r.data.replace(/\.$/, ''))
  } catch { return [] }
}

// ─── SSL Certificates (crt.sh — безкоштовно) ─────────────────────────────────
async function sslCerts(ip: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://crt.sh/?q=${encodeURIComponent(ip)}&output=json`,
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    // Унікальні Common Name і SAN
    const seen = new Set<string>()
    return (data || [])
      .filter((c: any) => {
        const key = c.name_value || c.common_name
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 15)
      .map((c: any) => ({
        cn:         c.common_name,
        names:      (c.name_value || '').split('\n').filter(Boolean),
        issuer:     c.issuer_name,
        not_before: c.not_before?.slice(0, 10),
        not_after:  c.not_after?.slice(0, 10),
        id:         c.id,
      }))
  } catch { return [] }
}

// ─── CVE Database (NVD — безкоштовно) ────────────────────────────────────────
async function searchCVE(product: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(product)}&resultsPerPage=5`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return []
    const d = await res.json()
    return (d.vulnerabilities || []).map((v: any) => ({
      id:          v.cve.id,
      description: (v.cve.descriptions?.find((d: any) => d.lang === 'en')?.value || '').slice(0, 300),
      severity:    v.cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity || 'UNKNOWN',
      score:       v.cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore,
      published:   v.cve.published?.slice(0, 10),
    }))
  } catch { return [] }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { query, type } = await req.json()
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 })

    const q = String(query).trim()

    const isIp     = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(q)
    const isDomain = /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/i.test(q) && !isIp
    const detectedType = type || (isIp ? 'ip' : isDomain ? 'domain' : 'search')

    const result: any = { query: q, type: detectedType }

    if (detectedType === 'ip') {
      // Run all IP lookups in parallel (Censys as Shodan fallback)
      const [shodan, censys, geo, greynoise, abuse, whois_ip, rdns, ssl_certs] = await Promise.all([
        shodanIp(q),
        censysIp(q),
        geoIp(q),
        greynoiseCheck(q),
        abuseipdbCheck(q),
        whoisIp(q),
        reverseDns(q),
        sslCerts(q),
      ])
      result.shodan    = shodan
      result.censys    = censys
      result.geo       = geo
      result.greynoise = greynoise
      result.abuseipdb = abuse
      result.whois_ip  = whois_ip
      result.rdns      = rdns
      result.ssl_certs = ssl_certs

      // CVE search — use Shodan product, fallback to Censys
      const product = shodan?.services?.[0]?.product || censys?.services?.[0]?.product
      if (product) {
        result.cve = await searchCVE(product)
      }
    } else if (detectedType === 'domain') {
      const [dns, whois, shodan, censys] = await Promise.all([
        dnsLookup(q),
        whoisLookup(q),
        shodanSearch(`hostname:${q}`),
        censysSearch(`parsed.names: ${q}`),
      ])
      result.dns          = dns
      result.whois        = whois
      result.shodan_hosts = shodan
      result.censys_hosts = censys

      // Geo the resolved IPs
      if (dns?.A?.length > 0) {
        const [geos, greynoise_ips] = await Promise.all([
          Promise.all(dns.A.slice(0, 3).map(geoIp)),
          Promise.all(dns.A.slice(0, 3).map(greynoiseCheck)),
        ])
        result.ip_geos       = geos
        result.ip_greynoise  = greynoise_ips.filter(Boolean)
      }
    } else {
      const [shodanRes, censysRes] = await Promise.all([
        shodanSearch(q),
        censysSearch(q),
      ])
      result.shodan = shodanRes
      result.censys = censysRes
    }

    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    configured: {
      shodan:    !!process.env.SHODAN_API_KEY,
      censys:    !!process.env.CENSYS_API_TOKEN,
      greynoise: true,
      abuseipdb: !!process.env.ABUSEIPDB_API_KEY,
      geo:       true,
      dns:       true,
      whois:     true,
      cve:       true,
    },
    free_sources: ['censys_research', 'greynoise', 'geo', 'dns', 'whois', 'cve'],
    note: 'Censys Research API — безкоштовно при реєстрації. Shodan — $49/рік.',
  })
}
