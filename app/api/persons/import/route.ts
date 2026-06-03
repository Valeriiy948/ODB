// app/api/persons/import/route.ts
// POST /api/persons/import  body: { persons: [...], mode: 'insert'|'upsert' }
// Масовий імпорт осіб. Upsert by (name + dob) щоб уникнути дублікатів.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_FIELDS = [
  'name', 'name_ukr', 'name_rus', 'name_eng',
  'dob', 'gender', 'birth_place', 'nationality', 'region',
  'rank', 'position', 'unit', 'unit_num', 'military_id',
  'passport', 'ipn', 'snils',
  'phones', 'email',
  'addr_live', 'addr_reg',
  'threat_level', 'status', 'priority',
  'tags', 'notes', 'sources',
  'icc_relevant', 'verified',
  'vk_url', 'ok_url', 'fb_url', 'instagram_url',
  'photo_url', 'myrotvorets_url',
]

function cleanRow(raw: Record<string, any>): Record<string, any> {
  const row: Record<string, any> = {}
  for (const key of ALLOWED_FIELDS) {
    const val = raw[key]
    if (val === undefined || val === null || val === '') continue

    // phones → array
    if (key === 'phones') {
      if (Array.isArray(val)) {
        const cleaned = val.map(String).filter(Boolean)
        if (cleaned.length) row.phones = cleaned
      } else {
        const cleaned = String(val).split(/[,;|]/).map(s => s.trim()).filter(Boolean)
        if (cleaned.length) row.phones = cleaned
      }
      continue
    }

    // tags → array
    if (key === 'tags') {
      if (Array.isArray(val)) {
        row.tags = val.map(String).filter(Boolean)
      } else {
        row.tags = String(val).split(/[,;]/).map(s => s.trim()).filter(Boolean)
      }
      continue
    }

    // booleans
    if (key === 'icc_relevant' || key === 'verified') {
      row[key] = val === true || val === 'true' || val === '1' || val === 'так' || val === 'yes'
      continue
    }

    // priority → number
    if (key === 'priority') {
      const n = parseInt(String(val), 10)
      if (!isNaN(n)) row.priority = n
      continue
    }

    // dob: normalize various date formats to YYYY-MM-DD
    if (key === 'dob') {
      const s = String(val).trim()
      // YYYY-MM-DD already
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { row.dob = s; continue }
      // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
      const m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/)
      if (m) {
        const y = m[3].length === 2 ? (parseInt(m[3]) > 30 ? `19${m[3]}` : `20${m[3]}`) : m[3]
        row.dob = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
        continue
      }
      row.dob = s
      continue
    }

    row[key] = typeof val === 'string' ? val.trim() : val
  }

  // Ensure name is set (required for display)
  if (!row.name) {
    row.name = row.name_ukr || row.name_rus || row.name_eng || ''
  }
  // Ensure name_ukr fallback
  if (!row.name_ukr && row.name_rus) row.name_ukr = row.name_rus

  // Defaults
  if (!row.status)      row.status      = 'фігурант'
  if (!row.threat_level) row.threat_level = 'unknown'

  return row
}

export async function POST(req: NextRequest) {
  try {
    const { persons, mode = 'upsert' } = await req.json()

    if (!Array.isArray(persons) || persons.length === 0) {
      return NextResponse.json({ error: 'persons array required' }, { status: 400 })
    }

    if (persons.length > 5000) {
      return NextResponse.json({ error: 'Максимум 5000 записів за раз' }, { status: 400 })
    }

    const cleaned = persons
      .map(cleanRow)
      .filter(r => r.name || r.name_ukr || r.name_rus) // skip rows with no name at all

    if (cleaned.length === 0) {
      return NextResponse.json({ error: 'Жоден запис не має імені (name/name_ukr/name_rus)' }, { status: 400 })
    }

    const CHUNK = 200
    let imported = 0
    let skipped  = 0
    const errors: string[] = []
    const importedIds: { id: string; name: string }[] = []

    for (let i = 0; i < cleaned.length; i += CHUNK) {
      const chunk = cleaned.slice(i, i + CHUNK)

      if (mode === 'upsert') {
        // Upsert: if same name+dob exists → update, else insert
        const { data, error } = await supabase
          .from('persons')
          .upsert(chunk, {
            onConflict: 'name,dob',
            ignoreDuplicates: false,
          })
          .select('id, name')

        if (error) {
          // If upsert fails (no unique constraint), fall back to insert
          const { data: ins, error: insErr } = await supabase
            .from('persons')
            .insert(chunk)
            .select('id, name')

          if (insErr) {
            errors.push(`Chunk ${i}-${i + chunk.length}: ${insErr.message}`)
            skipped += chunk.length
          } else {
            imported += (ins || []).length
            importedIds.push(...(ins || []).map((r: any) => ({ id: r.id, name: r.name || '' })))
          }
        } else {
          imported += (data || []).length
          importedIds.push(...(data || []).map((r: any) => ({ id: r.id, name: r.name || '' })))
        }
      } else {
        // Insert only
        const { data, error } = await supabase
          .from('persons')
          .insert(chunk)
          .select('id, name')

        if (error) {
          errors.push(`Chunk ${i}-${i + chunk.length}: ${error.message}`)
          skipped += chunk.length
        } else {
          imported += (data || []).length
          importedIds.push(...(data || []).map((r: any) => ({ id: r.id, name: r.name || '' })))
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: cleaned.length,
      errors: errors.slice(0, 10),
      // IDs for post-import enrichment
      persons: importedIds,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — info about the endpoint
export async function GET() {
  const { count } = await supabase
    .from('persons')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({
    endpoint: 'POST /api/persons/import',
    total_persons_in_db: count,
    max_per_request: 5000,
    supported_fields: ALLOWED_FIELDS,
    modes: ['insert', 'upsert'],
  })
}
