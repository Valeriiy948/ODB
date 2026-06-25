// app/api/crime-reports/reprocess/route.ts
// POST — re-extract text + re-run NER for a report whose extracted_text is empty

import { NextRequest, NextResponse }         from 'next/server'
import { createServerClient }                from '@supabase/ssr'
import { cookies }                           from 'next/headers'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { extractText }                       from '@/lib/doc-parser'
import { extractEntities, cryptoRiskScore }  from '@/lib/ner'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = 'crime-reports'

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

export async function POST(req: NextRequest) {
  const supabase = await serverClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { report_id, manual_text } = await req.json()
  if (!report_id) return NextResponse.json({ error: 'report_id required' }, { status: 400 })

  // Fetch report
  const { data: report } = await supabase
    .from('crime_reports')
    .select('id, title, file_url, file_type, author_id')
    .eq('id', report_id)
    .eq('author_id', user.id)
    .single()
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let extractedText = ''

  if (manual_text?.trim()) {
    // User provided manual text (for scanned PDFs)
    extractedText = manual_text.trim()
  } else {
    if (!report.file_url) return NextResponse.json({ error: 'No file attached' }, { status: 400 })

    // Download file from storage and auto-extract
    const admin = createAdminClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: fileData, error: dlErr } = await admin.storage.from(BUCKET).download(report.file_url)
    if (dlErr || !fileData) return NextResponse.json({ error: `Download failed: ${dlErr?.message}` }, { status: 500 })

    const buf = Buffer.from(await fileData.arrayBuffer())
    const mimeByExt: Record<string, string> = {
      pdf:  'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
    const mime = mimeByExt[report.file_type ?? ''] ?? 'application/pdf'
    extractedText = await extractText(buf, mime)
    if (!extractedText) return NextResponse.json({ error: 'Text extraction returned empty — file may be scanned image. Use manual text input.' }, { status: 422 })
  }

  const entities  = extractEntities(extractedText)
  const riskScore = cryptoRiskScore(entities)

  const { error: updateErr } = await supabase
    .from('crime_reports')
    .update({ extracted_text: extractedText.slice(0, 500_000), entities, crypto_risk_score: riskScore })
    .eq('id', report_id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Auto-add persons from NER (same logic as upload)
  let personsAdded = 0
  if (entities.names.length > 0) {
    for (const nameFound of entities.names.slice(0, 20)) {
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
            .insert({ name: nameFound, name_ukr: nameFound, status: 'з довідки', verified: false,
                      sources: [`crime_report:${report_id}`],
                      description: `Автоматично додано з довідки: ${report.title}` })
            .select('id').single()
          personId = newPerson?.id
          if (personId) personsAdded++
        }
        if (personId) {
          await supabase.from('crime_report_persons').upsert(
            { crime_report_id: report_id, person_id: personId, name_found: nameFound },
            { onConflict: 'crime_report_id,person_id' }
          )
        }
      } catch { /* non-blocking */ }
    }
  }

  return NextResponse.json({
    ok: true,
    text_length: extractedText.length,
    names_found: entities.names.length,
    persons_added: personsAdded,
    entities,
  })
}
