// app/api/crypto/osint-bridge/route.ts
// The KEY differentiator: link wallet address → real person via breach databases
// POST /api/crypto/osint-bridge  body: { address, chain? }
//
// Strategy:
// 1. Search address in ALL breach DBs (people sometimes reuse wallet in registrations)
// 2. Extract email/phone/IP from tx metadata (exchange KYC leaks, forum posts)
// 3. Search for address in Shodan (services running on IPs that interacted with wallet)
// 4. Google OSINT: search wallet address on all platforms
// 5. Check if address appears in known exchange leak DBs

import { NextRequest, NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Search wallet address in breach databases
async function searchBreachDBs(address: string): Promise<any> {
  try {
    const res = await fetch(`${APP_URL}/api/breach/search`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query: address, type: 'auto' }),
      signal:  AbortSignal.timeout(30000),
    })
    return await res.json()
  } catch { return { error: 'breach_search_failed', sources: {} } }
}

// Search in OsintKit specifically (has crypto exchange leaks)
async function searchOsintKitCrypto(address: string): Promise<any> {
  const apiKey = process.env.OSINTKIT_API_KEY
  if (!apiKey) return { error: 'no_key' }

  try {
    // Search as login (people use wallet as username)
    const params = new URLSearchParams({ max_rows: '50' })
    params.set('filters[logins.login]', address)
    const res = await fetch(`https://api.osintkit.net/v1/search?${params.toString()}`, {
      headers: { 'X-API-KEY': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    return await res.json()
  } catch (e: any) { return { error: e.message } }
}

// Shodan lookup for IPs associated with this wallet
async function shodanLookup(query: string): Promise<any> {
  const apiKey = process.env.SHODAN_API_KEY
  if (!apiKey) return { error: 'no_key' }

  try {
    const res = await fetch(
      `https://api.shodan.io/shodan/host/search?key=${apiKey}&query=${encodeURIComponent(query)}&limit=5`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json()
    return {
      total:   data.total || 0,
      matches: (data.matches || []).slice(0, 5).map((m: any) => ({
        ip:       m.ip_str,
        port:     m.port,
        org:      m.org,
        country:  m.location?.country_name,
        hostname: m.hostnames?.[0],
        product:  m.product,
        banner:   m.data?.slice(0, 200),
      })),
    }
  } catch (e: any) { return { error: e.message } }
}

// Web search for wallet address (Serper)
async function webSearchWallet(address: string): Promise<any> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return { error: 'no_key' }

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method:  'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ q: `"${address}"`, num: 10 }),
      signal:  AbortSignal.timeout(10000),
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json()
    return {
      total:   data.searchInformation?.totalResults,
      results: (data.organic || []).slice(0, 10).map((r: any) => ({
        title: r.title,
        url:   r.link,
        snippet: r.snippet,
        // Flag relevant finds
        flags: [
          r.link?.includes('bitcointalk') ? 'forum' : null,
          r.link?.includes('reddit')      ? 'reddit' : null,
          r.link?.includes('github')      ? 'github' : null,
          r.link?.includes('twitter')     ? 'twitter' : null,
          r.link?.includes('telegram')    ? 'telegram' : null,
          r.snippet?.match(/scam|fraud|hack|steal/i) ? 'scam_mention' : null,
        ].filter(Boolean),
      })),
    }
  } catch (e: any) { return { error: e.message } }
}

export async function POST(req: NextRequest) {
  try {
    const { address, chain = 'eth' } = await req.json()
    if (!address?.trim()) return NextResponse.json({ error: 'address required' }, { status: 400 })

    const addr = address.trim()

    // Run all OSINT in parallel
    const [breachData, osintKitData, shodanData, webData] = await Promise.all([
      searchBreachDBs(addr),
      searchOsintKitCrypto(addr),
      shodanLookup(addr),
      webSearchWallet(addr),
    ])

    // Extract any identifiers found
    const foundPersons: any[] = []
    const foundEmails  = new Set<string>()
    const foundPhones  = new Set<string>()
    const foundNames   = new Set<string>()

    for (const [, srcData] of Object.entries((breachData.sources || {}) as Record<string, any>)) {
      for (const entry of (srcData?.entries || [])) {
        if (entry.email)    foundEmails.add(entry.email)
        if (entry.phone)    foundPhones.add(entry.phone)
        if (entry.name)     foundNames.add(entry.name)
        if (entry.email || entry.phone || entry.name) foundPersons.push(entry)
      }
    }

    // Mentions across web — extract patterns
    const scamMentions = (webData.results || []).filter((r: any) => r.flags?.includes('scam_mention'))
    const forumPosts   = (webData.results || []).filter((r: any) => r.flags?.includes('forum') || r.flags?.includes('reddit'))

    // Intelligence assessment
    const intelligenceScore = {
      breach_hits:     foundPersons.length,
      web_hits:        webData.total ? parseInt(webData.total?.replace(/,/g, '')) : 0,
      scam_mentions:   scamMentions.length,
      forum_mentions:  forumPosts.length,
      shodan_exposure: shodanData.total || 0,
    }

    // Identity likelihood
    const identityClues: Array<{ type: string; value: string; source: string; confidence: string }> = []
    foundEmails.forEach(e => identityClues.push({ type: 'email', value: e, source: 'breach_db', confidence: 'high' }))
    foundPhones.forEach(p => identityClues.push({ type: 'phone', value: p, source: 'breach_db', confidence: 'high' }))
    foundNames.forEach(n  => identityClues.push({ type: 'name',  value: n, source: 'breach_db', confidence: 'medium' }))

    forumPosts.slice(0, 3).forEach((fp: any) => {
      // Try to extract username from URL
      const userMatch = fp.url?.match(/\/u\/([a-zA-Z0-9_]+)|\/user\/([a-zA-Z0-9_]+)|bitcointalk\.org\/index\.php\?action=profile;u=(\d+)/)
      if (userMatch) {
        const username = userMatch[1] || userMatch[2] || userMatch[3]
        if (username) identityClues.push({ type: 'username', value: username, source: fp.url, confidence: 'low' })
      }
    })

    return NextResponse.json({
      success:       true,
      address:       addr,
      chain,
      // Key OSINT findings
      identity_clues:       identityClues,
      persons_in_breach_db: foundPersons.slice(0, 10),
      intelligence_score:   intelligenceScore,
      // Raw data
      breach_summary:    { total_hits: breachData.total_hits || 0, active_keys: breachData.active_keys },
      osintkit_hits:     osintKitData?.metadata?.total_records || 0,
      shodan_data:       shodanData,
      web_search:        webData,
      scam_mentions:     scamMentions,
      forum_posts:       forumPosts,
      // Verdict
      de_anonymization_score: Math.min(
        identityClues.length * 20 + scamMentions.length * 15 + (shodanData.total || 0) * 10,
        100
      ),
      analyzed_at: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
