// app/api/agent/investigate/route.ts
// AUTO-INVESTIGATOR AGENT — Palantir-style full pipeline
// POST /api/agent/investigate
// Body: { query, type?: 'auto'|'name'|'phone'|'email'|'wallet'|'ip', depth?: 1|2|3 }
//
// Pipeline:
//  [0] Auto-detect query type
//  [1] Breach DB search (OsintKit, LeakCheck, HIBP, DeHashed)
//  [2] Persons DB — find or create
//  [3] Registries — MVS, courts, sanctions, NAZK
//  [4] OSINT — social, phones, vehicles, Sherlock
//  [5] Crypto — wallet analysis if found
//  [6] Network — IP/domain intel if found
//  [7] AI synthesis — Claude Sonnet full forensic report
//
// Returns: SSE stream of step events + final report

import { NextRequest } from 'next/server'

const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

// ─── SSE helper ──────────────────────────────────────────────────────────────
function makeStream() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController
  const stream = new ReadableStream({
    start(c) { controller = c },
  })

  function send(event: string, data: any) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    controller.enqueue(encoder.encode(payload))
  }

  function close() { controller.close() }
  return { stream, send, close }
}

// ─── Query type detector ─────────────────────────────────────────────────────
function detectType(query: string): string {
  const q = query.trim()
  if (/^\+?[\d\s\-\(\)]{10,15}$/.test(q))                        return 'phone'
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q))                      return 'email'
  if (/^(0x[a-fA-F0-9]{40}|[13][a-zA-Z0-9]{25,34}|T[A-Za-z0-9]{33})$/.test(q)) return 'wallet'
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(q))                         return 'ip'
  if (/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/i.test(q)) return 'domain'
  if (/^\d{8,14}$/.test(q))                                       return 'inn'
  return 'name'
}

// ─── API helpers ─────────────────────────────────────────────────────────────
async function callAPI(path: string, body: any, timeoutMs = 30000): Promise<any> {
  try {
    const res = await fetch(`${APP}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(timeoutMs),
    })
    return await res.json()
  } catch { return { error: 'timeout_or_failed' } }
}

async function callAPIGet(path: string, timeoutMs = 15000): Promise<any> {
  try {
    const res = await fetch(`${APP}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return await res.json()
  } catch { return { error: 'timeout_or_failed' } }
}

// ─── AI Final Report ─────────────────────────────────────────────────────────
async function generateFinalReport(query: string, type: string, allData: Record<string, any>): Promise<any> {
  if (!ANTHROPIC_KEY) return { error: 'no_api_key' }

  const systemPrompt = `Ти — старший криміналістичний аналітик ODB Platform.
Твоє завдання: на основі зібраних OSINT-даних скласти ПОВНЕ КРИМІНАЛЬНЕ ДОСЬЄ.
Відповідай ВИКЛЮЧНО JSON без markdown-обгортки.`

  const userPrompt = `ОСІНТ дані по запиту: "${query}" (тип: ${type})

ЗІБРАНІ ДАНІ:
${JSON.stringify(allData, null, 2).slice(0, 12000)}

Складіть структуроване досьє у форматі JSON:
{
  "executive_summary": "Стислий висновок 3-5 речень",
  "subject": {
    "name": "повне ім'я або ідентифікатор",
    "aliases": [],
    "dob": "якщо відомо",
    "nationality": "",
    "status": "active|deceased|unknown",
    "threat_level": "low|medium|high|critical",
    "threat_score": 0-100
  },
  "identity_confirmed": true/false,
  "contact_data": {
    "phones": [],
    "emails": [],
    "addresses": []
  },
  "documents": {
    "passport": "",
    "inn": "",
    "snils": ""
  },
  "digital_footprint": {
    "social_profiles": [],
    "crypto_wallets": [],
    "ip_addresses": [],
    "domains": []
  },
  "criminal_indicators": [
    { "type": "sanction|warrant|court|crypto_fraud|other", "description": "", "severity": "low|medium|high|critical", "source": "" }
  ],
  "financial_intel": {
    "known_wallets": [],
    "total_crypto_volume_usd": null,
    "suspicious_transactions": []
  },
  "connections": [
    { "name": "", "relation": "", "confidence": "low|medium|high" }
  ],
  "timeline": [
    { "date": "", "event": "", "source": "" }
  ],
  "sources_summary": {
    "total_sources": 0,
    "breach_hits": 0,
    "registry_hits": 0,
    "osint_hits": 0
  },
  "recommendations": [],
  "law_enforcement_notes": "",
  "confidence_score": 0-100,
  "investigation_gaps": [],
  "next_steps": []
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-5',
        max_tokens: 4096,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(60000),
    })

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(clean)
  } catch (e: any) {
    return { error: e.message, raw_available: true }
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { query, type: forceType, depth = 2 } = await req.json().catch(() => ({}))

  if (!query?.trim()) {
    return new Response(JSON.stringify({ error: 'query required' }), { status: 400 })
  }

  const { stream, send, close } = makeStream()

  // Run pipeline in background
  ;(async () => {
    const q     = query.trim()
    const qtype = forceType || detectType(q)
    const allData: Record<string, any> = {}
    const startTime = Date.now()

    send('start', { query: q, type: qtype, depth, timestamp: new Date().toISOString() })

    // ── STEP 1: Breach DBs ──────────────────────────────────────────────────
    send('step', { step: 1, name: 'Пошук у базах витоків', status: 'running', icon: '🔓' })
    const breachData = await callAPI('/api/breach/search', { query: q, type: qtype }, 35000)
    allData.breach = breachData
    const breachHits = Object.values(breachData.sources || {})
      .reduce((sum: number, s: any) => sum + (s?.total_hits || s?.entries?.length || 0), 0)
    send('step', { step: 1, name: 'Пошук у базах витоків', status: 'done', icon: '🔓',
      result: `${breachHits} записів у ${Object.keys(breachData.sources || {}).length} джерелах` })

    // ── STEP 2: Persons DB ──────────────────────────────────────────────────
    send('step', { step: 2, name: 'Картотека осіб', status: 'running', icon: '👤' })
    let personData: any = null
    let personId: string | null = null
    try {
      // Search in persons DB
      const searchParam = qtype === 'phone'
        ? `?phone=${encodeURIComponent(q)}`
        : qtype === 'inn'
        ? `?ipn=${encodeURIComponent(q)}`
        : `?q=${encodeURIComponent(q)}`

      const personsRes = await callAPIGet(`/api/persons${searchParam}&limit=5`, 10000)
      if (personsRes.data?.length) {
        personData = personsRes.data[0]
        personId   = personData.id
      }
    } catch {}

    // If not found and it's a name/phone — try to enrich & auto-create
    if (!personId && (qtype === 'name' || qtype === 'phone' || qtype === 'inn')) {
      const enrichRes = await callAPI('/api/persons/enrich', {
        query: q, type: qtype, sources: ['osintkit', 'leakcheck'],
      }, 45000)
      allData.enrich = enrichRes
      if (enrichRes.person_id) {
        personId   = enrichRes.person_id
        personData = { id: personId, name: q, ...enrichRes }
      }
    }

    allData.person = personData
    send('step', { step: 2, name: 'Картотека осіб', status: 'done', icon: '👤',
      result: personId
        ? `Знайдено: ${personData?.name || personData?.name_ukr || q} (ID: ${personId?.slice(0,8)}...)`
        : 'Новий об\'єкт — немає в базі' })

    // ── STEP 3: Registries ──────────────────────────────────────────────────
    send('step', { step: 3, name: 'Реєстри (МВС, суди, санкції, НАЗК)', status: 'running', icon: '🏛️' })
    const [mvsData, courtsData, sanctionsData, nazkData] = await Promise.all([
      callAPI('/api/mvs/search',       { query: q }, 10000),
      callAPI('/api/court/search',     { query: q }, 10000),
      callAPI('/api/sanctions/search', { query: q }, 15000),
      callAPI('/api/nazk/search',      { query: q }, 10000),
    ])
    allData.registries = { mvs: mvsData, courts: courtsData, sanctions: sanctionsData, nazk: nazkData }
    const regHits =
      (mvsData.records?.length || 0) +
      (courtsData.results?.length || 0) +
      (sanctionsData.entries?.length || 0) +
      (nazkData.declarations?.length || 0)
    send('step', { step: 3, name: 'Реєстри', status: 'done', icon: '🏛️',
      result: `${regHits} записів: МВС ${mvsData.records?.length || 0}, суди ${courtsData.results?.length || 0}, санкції ${sanctionsData.entries?.length || 0}, НАЗК ${nazkData.declarations?.length || 0}`,
      alert: sanctionsData.entries?.length > 0 ? '🚨 У САНКЦІЙНИХ СПИСКАХ!' : null })

    // ── STEP 4: OSINT (only for name/phone queries) ────────────────────────
    send('step', { step: 4, name: 'OSINT розвідка', status: 'running', icon: '🔍' })
    if (personId) {
      const [vehiclesData, phonesData, socialData] = await Promise.all([
        callAPIGet(`/api/osint/vehicles/${personId}`, 15000),
        callAPIGet(`/api/osint/phone-presence/${personId}`, 10000),
        callAPIGet(`/api/osint/vk/${personId}`, 10000),
      ])
      allData.osint = { vehicles: vehiclesData, phones: phonesData, social: socialData }
      const vehicles = vehiclesData.vehicles?.length || 0
      send('step', { step: 4, name: 'OSINT розвідка', status: 'done', icon: '🔍',
        result: `Авто: ${vehicles}, телефони верифіковано` })
    } else if (qtype === 'name') {
      // Username OSINT via Sherlock
      const username = q.split(/\s+/)[0].toLowerCase()
      const sherlockData = await callAPI('/api/osint/sherlock', { username }, 20000)
      allData.osint = { sherlock: sherlockData }
      send('step', { step: 4, name: 'OSINT розвідка', status: 'done', icon: '🔍',
        result: `Sherlock: ${sherlockData.found?.length || 0} профілів знайдено` })
    } else {
      allData.osint = {}
      send('step', { step: 4, name: 'OSINT розвідка', status: 'skipped', icon: '🔍',
        result: 'Пропущено (не ім\'я/телефон)' })
    }

    // ── STEP 5: Crypto ─────────────────────────────────────────────────────
    send('step', { step: 5, name: 'Крипто-розвідка', status: 'running', icon: '₿' })
    let cryptoData: any = {}

    if (qtype === 'wallet') {
      // Direct wallet analysis
      const walletRes = await callAPI('/api/crypto/wallet', { address: q }, 20000)
      cryptoData = { wallet: walletRes }

      // Check if wallet linked to a person
      const linkRes = await callAPIGet(`/api/crypto/link-person?wallet=${encodeURIComponent(q)}`, 8000)
      if (linkRes.found) cryptoData.linked_person = linkRes.person

      // OSINT bridge
      const osintBridgeRes = await callAPI('/api/crypto/osint-bridge', { address: q }, 20000)
      cryptoData.osint_bridge = osintBridgeRes

      send('step', { step: 5, name: 'Крипто-розвідка', status: 'done', icon: '₿',
        result: `Гаманець: ${walletRes.wallet?.balance_native || 0} ${walletRes.wallet?.symbol || ''}, ризик: ${walletRes.risk_level || 'unknown'}`,
        alert: walletRes.risk_level === 'critical' ? '🚨 КРИТИЧНИЙ РИЗИК!' : walletRes.risk_level === 'high' ? '⚠️ Високий ризик' : null })

    } else if (personId) {
      // Check if person has wallets linked
      const personFull = await callAPIGet(`/api/persons/${personId}`, 8000)
      const wallets: any[] = personFull.crypto_wallets || []
      if (wallets.length > 0) {
        const walletAnalyses = await Promise.all(
          wallets.slice(0, 3).map((w: any) =>
            callAPI('/api/crypto/wallet', { address: w.address, chain: w.chain }, 15000)
          )
        )
        cryptoData = { wallets, analyses: walletAnalyses }
        send('step', { step: 5, name: 'Крипто-розвідка', status: 'done', icon: '₿',
          result: `${wallets.length} гаманців проаналізовано` })
      } else {
        send('step', { step: 5, name: 'Крипто-розвідка', status: 'skipped', icon: '₿',
          result: 'Гаманців не знайдено' })
      }
    } else {
      send('step', { step: 5, name: 'Крипто-розвідка', status: 'skipped', icon: '₿',
        result: 'Не актуально для цього типу запиту' })
    }
    allData.crypto = cryptoData

    // ── STEP 6: Network Intel ──────────────────────────────────────────────
    send('step', { step: 6, name: 'Мережева розвідка', status: 'running', icon: '🌐' })
    if (qtype === 'ip' || qtype === 'domain') {
      const [shodanRes, abuseRes] = await Promise.all([
        callAPIGet(`/api/shodan/search?q=${encodeURIComponent(q)}`, 12000),
        callAPIGet(`/api/network/abuseipdb?ip=${encodeURIComponent(q)}`, 8000),
      ])
      allData.network = { shodan: shodanRes, abuse: abuseRes }
      send('step', { step: 6, name: 'Мережева розвідка', status: 'done', icon: '🌐',
        result: `Shodan: ${shodanRes.total || 0} хостів, AbuseIPDB score: ${abuseRes.abuseConfidenceScore ?? 'n/a'}` })
    } else {
      allData.network = {}
      send('step', { step: 6, name: 'Мережева розвідка', status: 'skipped', icon: '🌐',
        result: 'Не IP/домен' })
    }

    // ── STEP 7: Web Search ─────────────────────────────────────────────────
    send('step', { step: 7, name: 'Веб-пошук', status: 'running', icon: '🌍' })
    const webRes = await callAPI('/api/web/search', { query: `"${q}"`, num: 8 }, 15000)
    allData.web = webRes
    send('step', { step: 7, name: 'Веб-пошук', status: 'done', icon: '🌍',
      result: `${webRes.results?.length || 0} згадок в інтернеті` })

    // ── STEP 8: AI Synthesis ───────────────────────────────────────────────
    send('step', { step: 8, name: 'Claude AI синтез', status: 'running', icon: '🤖' })
    const report = await generateFinalReport(q, qtype, allData)
    allData.ai_report = report

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    send('step', { step: 8, name: 'Claude AI синтез', status: 'done', icon: '🤖',
      result: `Досьє сформовано за ${elapsed}с. Впевненість: ${report.confidence_score || '?'}/100` })

    // ── FINAL ──────────────────────────────────────────────────────────────
    send('done', {
      query:       q,
      type:        qtype,
      person_id:   personId,
      elapsed_sec: parseFloat(elapsed),
      report:      report,
      raw_data:    {
        breach_hits:    breachHits,
        registry_hits:  Object.values(allData.registries || {}).reduce(
          (s: number, v: any) => s + (v?.results?.length || v?.entries?.length || v?.records?.length || v?.declarations?.length || 0), 0),
        has_sanctions:  (sanctionsData.entries?.length || 0) > 0,
        has_crypto:     Object.keys(cryptoData).length > 0,
        person_found:   !!personId,
      },
      collected_at: new Date().toISOString(),
    })

  })().catch(err => {
    send('error', { message: err.message })
  }).finally(() => {
    close()
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
