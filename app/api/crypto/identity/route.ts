// app/api/crypto/identity/route.ts
// De-anon #2: Cross-platform identity search
// Given a wallet address, find the REAL PERSON behind it:
//   - WalletExplorer (BTC entity labeling — free)
//   - BitcoinTalk forum (username extraction from posts)
//   - Reddit (u/username from crypto subreddits)
//   - GitHub (commits/gists with wallet address)
//   - Telegram public channels (via Serper)
//   - Twitter/X mentions
//   - Paste sites (pastebin, ghostbin, rentry)
//
// Output: ranked list of candidate identities with source + confidence

import { NextRequest, NextResponse } from 'next/server'

const SERPER_KEY  = process.env.SERPER_API_KEY || ''
const TAVILY_KEY  = process.env.TAVILY_API_KEY || ''

// ─── Types ────────────────────────────────────────────────────────────────────
interface IdentityHit {
  platform:   string
  username?:  string
  url:        string
  snippet:    string
  confidence: 'high' | 'medium' | 'low'
  flags:      string[]
}

// ─── WalletExplorer (BTC only — free, no key) ─────────────────────────────────
// Labels BTC addresses: "Binance.com", "mining-pool", "gambling" etc.
async function walletExplorerLookup(address: string): Promise<{ label: string | null; wallet_id: string | null }> {
  if (!/^(1|3|bc1)[a-zA-Z0-9]{25,62}$/.test(address)) return { label: null, wallet_id: null }
  try {
    const res = await fetch(
      `https://www.walletexplorer.com/api/1/address?address=${address}&caller=odb-platform`,
      { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'ODB-Crypto-Intel/1.0' } }
    )
    if (!res.ok) return { label: null, wallet_id: null }
    const data = await res.json()
    return {
      label:     data.label     || null,
      wallet_id: data.wallet_id || null,
    }
  } catch { return { label: null, wallet_id: null } }
}

// ─── Serper: targeted Google search ──────────────────────────────────────────
async function serperSearch(query: string, num = 10): Promise<any[]> {
  if (!SERPER_KEY) return []
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method:  'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ q: query, num }),
      signal:  AbortSignal.timeout(12000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.organic || []
  } catch { return [] }
}

// ─── Tavily: deep web search with full content ────────────────────────────────
async function tavilySearch(query: string): Promise<any[]> {
  if (!TAVILY_KEY) return []
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        api_key: TAVILY_KEY,
        query,
        search_depth: 'advanced',
        max_results:  10,
        include_answer: false,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.results || []
  } catch { return [] }
}

// ─── Extract username from URL/snippet ───────────────────────────────────────
function extractUsername(url: string, snippet: string): string | undefined {
  const patterns = [
    // Reddit
    /reddit\.com\/(?:u|user)\/([A-Za-z0-9_\-]{3,20})/i,
    // BitcoinTalk profile
    /bitcointalk\.org\/index\.php\?action=profile;u=(\d+)/i,
    // GitHub
    /github\.com\/([A-Za-z0-9_\-]{1,39})(?:\/|$)/i,
    // Twitter/X
    /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})(?:\/|$)/i,
    // Telegram
    /t\.me\/([A-Za-z0-9_]{5,32})(?:\/|$)/i,
    // YouTube
    /youtube\.com\/@([A-Za-z0-9_\-.]{3,30})/i,
    // Bitcointalk username in snippet
    /Re: .*? by ([A-Za-z0-9_\-]{3,20}) on/i,
  ]
  for (const p of patterns) {
    const m = url.match(p) || snippet.match(p)
    if (m?.[1]) return m[1]
  }
  return undefined
}

// ─── Detect platform from URL ─────────────────────────────────────────────────
function detectPlatform(url: string): string {
  if (url.includes('bitcointalk'))  return 'BitcoinTalk'
  if (url.includes('reddit.com'))   return 'Reddit'
  if (url.includes('github.com'))   return 'GitHub'
  if (url.includes('twitter.com') || url.includes('x.com')) return 'Twitter/X'
  if (url.includes('t.me') || url.includes('telegram')) return 'Telegram'
  if (url.includes('youtube'))      return 'YouTube'
  if (url.includes('pastebin'))     return 'Pastebin'
  if (url.includes('etherscan'))    return 'Etherscan'
  if (url.includes('blockchain.'))  return 'Blockchain.com'
  if (url.includes('hackernews') || url.includes('ycombinator')) return 'HackerNews'
  return 'Web'
}

// ─── Confidence scoring ───────────────────────────────────────────────────────
function scoreConfidence(url: string, snippet: string, address: string): 'high' | 'medium' | 'low' {
  const snipLower = snippet.toLowerCase()
  // High: address explicitly mentioned + profile/user page
  if ((url.includes('reddit.com/u/') || url.includes('bitcointalk.org/index.php?action=profile'))
      && snippet.includes(address.slice(0, 10))) return 'high'
  // High: paste site with exact address
  if (url.includes('pastebin') && snippet.includes(address.slice(0, 10))) return 'high'
  // Medium: forum post mentioning address
  if ((url.includes('bitcointalk') || url.includes('reddit')) && snippet.includes(address.slice(0, 8))) return 'medium'
  // Medium: GitHub with address
  if (url.includes('github.com') && snippet.includes(address.slice(0, 8))) return 'medium'
  // Low: generic mention
  return 'low'
}

// ─── Run all searches in parallel ────────────────────────────────────────────
async function searchAllPlatforms(address: string, chain: string): Promise<IdentityHit[]> {
  const hits: IdentityHit[] = []

  // Build targeted queries
  const queries = [
    `"${address}"`,                                          // exact match everywhere
    `"${address}" site:bitcointalk.org`,                    // Bitcoin forum
    `"${address}" site:reddit.com`,                         // Reddit
    `"${address}" site:github.com`,                         // GitHub
    `"${address}" (telegram OR t.me)`,                      // Telegram mentions
    `"${address}" (pastebin OR paste OR leak)`,             // paste sites
  ]

  // Run Serper searches in parallel (2 at a time to avoid rate limit)
  const results: any[][] = []
  for (let i = 0; i < queries.length; i += 2) {
    const batch = await Promise.all(queries.slice(i, i + 2).map(q => serperSearch(q, 5)))
    results.push(...batch)
    // small pause between batches
    if (i + 2 < queries.length) await new Promise(r => setTimeout(r, 300))
  }

  // Also run Tavily for deeper content extraction (first query only)
  const tavilyResults = await tavilySearch(`"${address}" crypto wallet owner identity`)

  // Process all results
  const seen = new Set<string>()
  const allResults = results.flat()

  for (const r of allResults) {
    const url     = r.link || r.url || ''
    const snippet = r.snippet || r.content || ''
    if (!url || seen.has(url)) continue
    seen.add(url)

    const platform   = detectPlatform(url)
    const username   = extractUsername(url, snippet)
    const confidence = scoreConfidence(url, snippet, address)

    const flags: string[] = []
    if (snippet.match(/scam|fraud|hack|steal|phish/i)) flags.push('scam_mention')
    if (snippet.match(/доnat|donate|donation/i))       flags.push('donation_address')
    if (snippet.match(/ransomware|ransom/i))           flags.push('ransomware')
    if (platform === 'GitHub')                         flags.push('developer')
    if (platform === 'Telegram')                       flags.push('telegram_presence')
    if (platform === 'BitcoinTalk')                    flags.push('crypto_forum')

    hits.push({ platform, username, url, snippet: snippet.slice(0, 300), confidence, flags })
  }

  // Process Tavily results
  for (const r of tavilyResults) {
    const url     = r.url || ''
    const snippet = r.content || r.raw_content || ''
    if (!url || seen.has(url)) continue
    seen.add(url)

    const platform   = detectPlatform(url)
    const username   = extractUsername(url, snippet)
    const confidence = scoreConfidence(url, snippet, address)
    const flags: string[] = []
    if (snippet.match(/scam|fraud/i)) flags.push('scam_mention')

    hits.push({ platform, username, url, snippet: snippet.slice(0, 300), confidence, flags })
  }

  // Sort: high confidence first, then by platform priority
  const platformPriority: Record<string, number> = {
    'BitcoinTalk': 10, 'Reddit': 9, 'GitHub': 8, 'Telegram': 7,
    'Twitter/X': 6, 'Pastebin': 5, 'YouTube': 4, 'Web': 1,
  }
  hits.sort((a, b) => {
    const confOrder = { high: 3, medium: 2, low: 1 }
    const confDiff  = confOrder[b.confidence] - confOrder[a.confidence]
    if (confDiff !== 0) return confDiff
    return (platformPriority[b.platform] || 0) - (platformPriority[a.platform] || 0)
  })

  return hits.slice(0, 30)
}

// ─── Build candidate identities from hits ─────────────────────────────────────
function buildCandidates(hits: IdentityHit[]): Array<{
  username: string; platforms: string[]; confidence: string; hit_count: number
}> {
  const map = new Map<string, { platforms: Set<string>; confidence: string; count: number }>()

  for (const h of hits) {
    if (!h.username) continue
    // Skip generic system usernames
    if (['api', 'www', 'mail', 'admin', 'help', 'support'].includes(h.username.toLowerCase())) continue

    const existing = map.get(h.username)
    if (existing) {
      existing.platforms.add(h.platform)
      existing.count++
      if (h.confidence === 'high') existing.confidence = 'high'
      else if (h.confidence === 'medium' && existing.confidence === 'low') existing.confidence = 'medium'
    } else {
      map.set(h.username, { platforms: new Set([h.platform]), confidence: h.confidence, count: 1 })
    }
  }

  return [...map.entries()]
    .map(([username, data]) => ({
      username,
      platforms:  [...data.platforms],
      confidence: data.platforms.size > 1 ? 'high' : data.confidence, // cross-platform = high confidence
      hit_count:  data.count,
    }))
    .sort((a, b) => b.hit_count - a.hit_count || b.platforms.length - a.platforms.length)
    .slice(0, 10)
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { address, chain = 'eth' } = await req.json()
    if (!address?.trim()) return NextResponse.json({ error: 'address required' }, { status: 400 })
    if (!SERPER_KEY && !TAVILY_KEY) return NextResponse.json({ error: 'no_search_api_key' }, { status: 500 })

    const addr = address.trim()

    // Run WalletExplorer + platform search in parallel
    const [walletExplorer, platformHits] = await Promise.all([
      walletExplorerLookup(addr),
      searchAllPlatforms(addr, chain),
    ])

    // Build candidate identities
    const candidates = buildCandidates(platformHits)

    // Summary stats
    const byPlatform: Record<string, number> = {}
    platformHits.forEach(h => { byPlatform[h.platform] = (byPlatform[h.platform] || 0) + 1 })

    const scamMentions = platformHits.filter(h => h.flags.includes('scam_mention'))
    const devHits      = platformHits.filter(h => h.flags.includes('developer'))
    const telegramHits = platformHits.filter(h => h.flags.includes('telegram_presence'))

    return NextResponse.json({
      success:   true,
      address:   addr,
      chain,

      // BTC-specific entity label
      wallet_explorer: walletExplorer,

      // Candidate real identities
      candidates,

      // All raw hits
      hits:      platformHits,
      hits_total: platformHits.length,

      // Summary
      by_platform:      byPlatform,
      scam_mentions:    scamMentions.length,
      developer_traces: devHits.length,
      telegram_traces:  telegramHits.length,

      // Quick flags
      flags: [
        walletExplorer.label                ? `entity:${walletExplorer.label}` : null,
        scamMentions.length > 0             ? 'scam_association'               : null,
        devHits.length > 0                  ? 'developer_profile'              : null,
        telegramHits.length > 0             ? 'telegram_presence'              : null,
        candidates.length > 0              ? 'identity_found'                 : null,
      ].filter(Boolean),

      analyzed_at: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
