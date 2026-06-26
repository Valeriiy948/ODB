// app/api/crime-reports/route.ts
// GET  — список довідок з FTS-пошуком
// POST — завантаження файлу + парсинг + NER + watchlist + AI summary + збереження

import { NextRequest, NextResponse }       from 'next/server'
import { createServerClient }              from '@supabase/ssr'
import { cookies }                         from 'next/headers'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { extractText }                     from '@/lib/doc-parser'
import { extractEntities, cryptoRiskScore } from '@/lib/ner'

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_ROLE   = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TG_BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN!
const TG_CHAT_ID     = process.env.TELEGRAM_CHAT_ID!
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY

const BUCKET = 'crime-reports'

// ── helpers ──────────────────────────────────────────────────────────────────

async function serverClient() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (pairs) => pairs.forEach(({ name, value, options }) => {
        try { cookieStore.set(name, value, options) } catch {}
      }),
    },
  })
}

function adminClient() {
  return createAdminClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function tgSend(msg: string) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return
  await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: TG_CHAT_ID, text: msg, parse_mode: 'HTML' }),
  }).catch(() => {})
}

async function getAISummary(text: string): Promise<string | null> {
  if (!ANTHROPIC_KEY || text.length < 200) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 450,
        messages:   [{
          role:    'user',
          content: `Проаналізуй документ і відповідай ТІЛЬКИ JSON без markdown:
{"summary":"2-3 речення про суть документу","facts":["факт1","факт2","факт3"],"threat":"LOW|MEDIUM|HIGH|CRITICAL","threat_reason":"чому такий рівень"}

Документ (перші 4000 символів):
${text.slice(0, 4000)}`,
        }],
      }),
    })
    const data = await res.json() as { content?: Array<{ text: string }> }
    const raw  = data.content?.[0]?.text ?? ''
    const parsed = JSON.parse(raw)
    return `${parsed.summary}\n\nКлючові факти:\n${parsed.facts?.map((f: string) => `• ${f}`).join('\n') ?? ''}\n\nРівень загрози: ${parsed.threat} — ${parsed.threat_reason}`
  } catch {
    return null
  }
}

// ── GET — list ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await serverClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const q        = searchParams.get('q') ?? ''
  const personName = searchParams.get('person_name') ?? ''
  const riskMin  = parseInt(searchParams.get('risk_min') ?? '0')
  const limit    = Math.min(parseInt(searchParams.get('limit')  ?? '30'), 100)
  const offset   = parseInt(searchParams.get('offset') ?? '0')

  const baseSelect = 'id,title,erdr_number,location,incident_date,file_type,crypto_risk_score,entities,tags,status,created_at,summary,watchlist_hits'

  let results: any[] = []

  if (q) {
    // 1. FTS on search_vector (extracted_text + title + location)
    const ftsQuery = supabase
      .from('crime_reports')
      .select(baseSelect)
      .eq('author_id', user.id)
      .textSearch('search_vector', q, { type: 'websearch', config: 'simple' })
      .order('created_at', { ascending: false })
      .range(0, limit - 1)

    // 2. ILIKE on title/ЄРДР/location
    const ilikeFilter = [
      `title.ilike.%${q}%`,
      `erdr_number.ilike.%${q}%`,
      `location.ilike.%${q}%`,
    ].join(',')
    const ilikeQuery = supabase
      .from('crime_reports')
      .select(baseSelect)
      .eq('author_id', user.id)
      .or(ilikeFilter)
      .order('created_at', { ascending: false })
      .range(0, limit - 1)

    // 3. Search in entities JSON (names, phones, etc.)
    const entitiesQuery = supabase
      .from('crime_reports')
      .select(baseSelect)
      .eq('author_id', user.id)
      .filter('entities::text', 'ilike', `%${q}%`)
      .order('created_at', { ascending: false })
      .range(0, limit - 1)

    const [ftsRes, ilikeRes, entRes] = await Promise.all([ftsQuery, ilikeQuery, entitiesQuery])
    const seen = new Set<string>()
    for (const row of [...(ftsRes.data ?? []), ...(ilikeRes.data ?? []), ...(entRes.data ?? [])]) {
      if (!seen.has(row.id)) { seen.add(row.id); results.push(row) }
    }
    if (riskMin > 0) results = results.filter((r: any) => r.crypto_risk_score >= riskMin)
    results = results.slice(offset, offset + limit)
  } else {
    let query = supabase
      .from('crime_reports')
      .select(baseSelect)
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (personName) query = query.contains('entities', { names: [personName] })
    if (riskMin > 0) query = query.gte('crypto_risk_score', riskMin)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    results = data ?? []
  }

  return NextResponse.json({ data: results, count: results.length })
}

// ── POST — upload + process ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await serverClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminClient()
  const form  = await req.formData()

  const file        = form.get('file') as File | null
  const title       = (form.get('title')         as string) || 'Без назви'
  const erdrNumber  = (form.get('erdr_number')   as string) || null
  const location    = (form.get('location')      as string) || null
  const incidentDate = (form.get('incident_date') as string) || null
  const tagsRaw     = (form.get('tags')          as string) || ''
  const tags        = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []

  // ── 0. Дедублікація по ЄРДР ──────────────────────────────────────────────
  if (erdrNumber) {
    const { data: existing } = await supabase
      .from('crime_reports')
      .select('id, title')
      .eq('erdr_number', erdrNumber)
      .eq('author_id', user.id)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: `ЄРДР ${erdrNumber} вже існує у реєстрі`, existing_id: existing.id },
        { status: 409 }
      )
    }
  }

  // ── 1. Завантаження файлу ─────────────────────────────────────────────────
  let fileUrl:  string | null = null
  let fileName: string | null = null
  let fileType: string | null = null
  let fileSizeKb = 0
  let extractedText = ''
  let fileHash: string | null = null

  if (file && file.size > 0) {
    const arrayBuf = await file.arrayBuffer()
    const buf      = Buffer.from(arrayBuf)

    // ── Дедублікація по хешу файлу ─────────────────────────────────────────
    const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuf)
    fileHash = Buffer.from(hashBuf).toString('hex')
    const { data: hashExisting } = await supabase
      .from('crime_reports')
      .select('id, title')
      .eq('file_hash', fileHash)
      .eq('author_id', user.id)
      .maybeSingle()
    if (hashExisting) {
      return NextResponse.json(
        { error: `Цей файл вже завантажено як «${hashExisting.title}»`, existing_id: hashExisting.id },
        { status: 409 }
      )
    }

    const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    // Supabase Storage accepts only ASCII keys — use timestamp + extension only
    const safeName = `${Date.now()}.${ext}`
    const path     = `${user.id}/${safeName}`

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: false })

    if (uploadErr) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 })
    }

    fileUrl     = path
    fileName    = file.name
    fileType    = ext
    fileSizeKb  = Math.round(file.size / 1024)

    // ── 2. Витягування тексту ──────────────────────────────────────────────
    // Use extension as fallback — browser may send empty file.type
    const mimeByExt: Record<string, string> = {
      pdf:  'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
    const effectiveMime = file.type || mimeByExt[ext] || ''
    extractedText = await extractText(buf, effectiveMime)
  }

  // ── 3. NER ────────────────────────────────────────────────────────────────
  const entities = extractEntities(extractedText)
  const riskScore = cryptoRiskScore(entities)

  // AI Summary виноситься в окремий endpoint /api/crime-reports/[id]/summarize
  // щоб не блокувати upload (Vercel 10s timeout)

  // ── 5. Watchlist check ────────────────────────────────────────────────────
  const watchlistHits: Array<{ entity_type: string; value: string; label: string; priority: string }> = []

  const allValues: Array<{ entity_type: string; value: string }> = [
    ...entities.phones.map(v => ({ entity_type: 'phone', value: v })),
    ...entities.crypto.map(c => ({ entity_type: 'crypto', value: c.address })),
    ...entities.vehicles.map(v => ({ entity_type: 'vehicle', value: v })),
    ...entities.ipn.map(v => ({ entity_type: 'ipn', value: v })),
  ]

  if (allValues.length > 0) {
    const { data: hits } = await supabase
      .from('watchlist')
      .select('entity_type,value,label,priority')

    if (hits) {
      const hitSet = new Map(hits.map(h => [`${h.entity_type}:${h.value.toLowerCase()}`, h]))
      for (const { entity_type, value } of allValues) {
        const hit = hitSet.get(`${entity_type}:${value.toLowerCase()}`)
        if (hit) watchlistHits.push(hit)
      }
    }
  }

  // ── 6. Зберігаємо в DB ───────────────────────────────────────────────────
  const { data: report, error: insertErr } = await supabase
    .from('crime_reports')
    .insert({
      title,
      erdr_number:   erdrNumber,
      location,
      incident_date: incidentDate || null,
      author_id:     user.id,
      file_url:      fileUrl,
      file_name:     fileName,
      file_type:     fileType,
      file_size_kb:  fileSizeKb,
      file_hash:     fileHash ?? null,
      extracted_text: extractedText.slice(0, 500_000), // ліміт 500k символів
      summary: null, // генерується окремо через /api/crime-reports/[id]/summarize
      entities,
      crypto_risk_score: riskScore,
      watchlist_hits: watchlistHits,
      tags,
    })
    .select('id')
    .single()

  if (insertErr || !report) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  // ── 7. Авто-додавання осіб з NER до таблиці persons (паралельно) ────────
  if (entities.names.length > 0) {
    await Promise.all(entities.names.slice(0, 20).map(async (nameFound) => {
      try {
        const { data: existing } = await supabase
          .from('persons')
          .select('id')
          .or(`name.ilike.${nameFound},name_ukr.ilike.${nameFound},name_rus.ilike.${nameFound}`)
          .limit(1)
          .maybeSingle()

        let personId = existing?.id
        if (!personId) {
          const { data: newPerson } = await supabase
            .from('persons')
            .insert({
              name:         nameFound,
              name_ukr:     nameFound,
              status:       'з довідки',
              verified:     false,
              sources:      [`crime_report:${report.id}`],
              description:  `Автоматично додано з довідки: ${title}`,
            })
            .select('id')
            .single()
          personId = newPerson?.id
        }

        if (personId) {
          await supabase.from('crime_report_persons').upsert({
            crime_report_id: report.id,
            person_id:       personId,
            name_found:      nameFound,
          }, { onConflict: 'crime_report_id,person_id' })
        }
      } catch { /* non-blocking */ }
    }))
  }

  // ── 8. Telegram: watchlist hits ───────────────────────────────────────────
  if (watchlistHits.length > 0) {
    const hitLines = watchlistHits
      .map(h => `🔴 <b>${h.entity_type.toUpperCase()}</b>: <code>${h.value}</code> — ${h.label ?? ''} [${h.priority.toUpperCase()}]`)
      .join('\n')

    await tgSend(
      `🚨 <b>WATCHLIST ALERT — Crime Reports</b>\n` +
      `📄 <b>${title}</b>\n` +
      (erdrNumber ? `📋 ЄРДР: ${erdrNumber}\n` : '') +
      `\nЗбіги зі списком спостереження:\n${hitLines}\n\n` +
      `⚠️ Крипто-ризик: ${riskScore}/100\n` +
      `🔗 /crime-reports/${report.id}`
    )
  }

  return NextResponse.json({
    id:        report.id,
    entities,
    risk_score: riskScore,
    watchlist_hits: watchlistHits.length,
    text_length: extractedText.length,
  }, { status: 201 })
}
