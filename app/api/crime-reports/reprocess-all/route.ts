// app/api/crime-reports/reprocess-all/route.ts
// POST — batch reprocess up to BATCH_SIZE reports per call (Vercel 10s limit)
// Frontend calls this repeatedly until done=true

import { NextRequest, NextResponse }         from 'next/server'
import { createServerClient }                from '@supabase/ssr'
import { cookies }                           from 'next/headers'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { extractText }                       from '@/lib/doc-parser'
import { extractEntities, cryptoRiskScore }  from '@/lib/ner'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET        = 'crime-reports'
const BATCH_SIZE    = 3

async function serverClient() {
  const cs = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => cs.getAll(),
      setAll: (p) => p.forEach(({ name, value, options }) => { try { cs.set(name, value, options) } catch {} }),
    },
  })
}

export async function POST(req: NextRequest) {
  const supabase = await serverClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { offset = 0 } = await req.json().catch(() => ({}))

  // Fetch next batch — reports that have a file_url (can be re-extracted)
  const { data: reports, error } = await supabase
    .from('crime_reports')
    .select('id, title, file_url, file_type')
    .eq('author_id', user.id)
    .not('file_url', 'is', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!reports || reports.length === 0) return NextResponse.json({ done: true, processed: 0 })

  const admin = createAdminClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const mimeByExt: Record<string, string> = {
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }

  let processed = 0
  const results: { id: string; title: string; ok: boolean; names: number; error?: string }[] = []

  for (const report of reports) {
    try {
      const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(report.file_url)
      if (dlErr || !fileData) { results.push({ id: report.id, title: report.title, ok: false, names: 0, error: 'download failed' }); continue }

      const buf  = Buffer.from(await fileData.arrayBuffer())
      const mime = mimeByExt[report.file_type ?? ''] ?? 'application/pdf'
      const text = await extractText(buf, mime)
      if (!text) { results.push({ id: report.id, title: report.title, ok: false, names: 0, error: 'empty text' }); continue }

      const entities  = extractEntities(text)
      const riskScore = cryptoRiskScore(entities)

      await supabase.from('crime_reports').update({
        extracted_text: text.slice(0, 500_000),
        entities,
        crypto_risk_score: riskScore,
      }).eq('id', report.id)

      // Update persons with full context (dob, rank, position, unit)
      const personsToAdd = entities.persons ?? []
      await Promise.all(personsToAdd.slice(0, 20).map(async (person: any) => {
        try {
          const nameFound = person.name
          const { data: existing } = await supabase
            .from('persons')
            .select('id, dob, rank')
            .or(`name.ilike.${nameFound},name_ukr.ilike.${nameFound},name_rus.ilike.${nameFound}`)
            .limit(1).maybeSingle()

          if (existing) {
            const updates: Record<string, any> = {}
            if (person.dob  && !existing.dob)  updates.dob  = person.dob
            if (person.rank && !existing.rank) updates.rank = person.rank
            if (Object.keys(updates).length > 0) {
              await supabase.from('persons').update(updates).eq('id', existing.id)
            }
          } else {
            const descParts = [`Авто з довідки: ${report.title}`]
            if (person.rank)     descParts.push(`Звання: ${person.rank}`)
            if (person.position) descParts.push(`Посада: ${person.position}`)
            if (person.unit)     descParts.push(`Підрозділ: ${person.unit}`)
            const { data: newP } = await supabase.from('persons').insert({
              name: nameFound, name_ukr: nameFound,
              status: 'з довідки', verified: false,
              sources: [`crime_report:${report.id}`],
              dob: person.dob ?? null, rank: person.rank ?? null,
              description: descParts.join(' | '),
            }).select('id').single()
            if (newP?.id) {
              await supabase.from('crime_report_persons').upsert(
                { crime_report_id: report.id, person_id: newP.id, name_found: nameFound },
                { onConflict: 'crime_report_id,person_id' }
              )
            }
          }
        } catch { /* non-blocking */ }
      }))

      results.push({ id: report.id, title: report.title, ok: true, names: entities.names.length })
      processed++
    } catch (e) {
      results.push({ id: report.id, title: report.title, ok: false, names: 0, error: String(e) })
    }
  }

  return NextResponse.json({
    done:      reports.length < BATCH_SIZE,
    processed,
    next_offset: offset + reports.length,
    results,
  })
}
