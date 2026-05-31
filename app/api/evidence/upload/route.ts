// app/api/evidence/upload/route.ts
// Завантаження доказів: фото, відео, документи
// Зберігає у Supabase Storage + запис у таблицю evidence

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const BUCKET = 'evidence'
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

// Визначаємо тип файлу по MIME
function getEvType(mime: string): string {
  if (mime.startsWith('image/'))                         return 'photo'
  if (mime.startsWith('video/'))                         return 'video'
  if (mime.startsWith('audio/'))                         return 'audio'
  if (mime === 'application/pdf')                        return 'document'
  if (mime.includes('word') || mime.includes('document')) return 'document'
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'document'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'document'
  if (mime === 'text/plain')                             return 'document'
  if (mime === 'text/html')                              return 'document'
  return 'document'
}

// Безпечна назва файлу (без спецсимволів)
function safeFilename(name: string): string {
  return name
    .replace(/[^\w.\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100)
}

function createSupabase() {
  // Service role key обходить RLS — безпечно для серверних API routes
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file       = formData.get('file') as File | null
    const personId   = formData.get('person_id') as string | null
    const incidentId = formData.get('incident_id') as string | null
    const description = formData.get('description') as string || ''
    const source     = formData.get('source') as string || 'manual'
    const dateCaptured = formData.get('date_captured') as string | null
    const location   = formData.get('location') as string || ''

    if (!file) {
      return NextResponse.json({ error: 'file required' }, { status: 400 })
    }
    if (!personId && !incidentId) {
      return NextResponse.json({ error: 'person_id or incident_id required' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `Файл занадто великий (макс. ${MAX_FILE_SIZE / 1024 / 1024} MB)` }, { status: 400 })
    }

    const supabase = createSupabase()

    // Читаємо файл у буфер
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Хеш для дедублікації
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')

    // Перевіряємо дублікат
    const { data: existing } = await supabase
      .from('evidence')
      .select('id, file_url')
      .eq('hash_sha256', hash)
      .eq('person_id', personId || '')
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        evidence: existing,
        message: 'Файл вже існує',
      })
    }

    // Унікальна назва у storage
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const safeName = safeFilename(file.name.replace(/\.[^.]+$/, ''))
    const timestamp = Date.now()
    const folder = personId ? `persons/${personId}` : `incidents/${incidentId}`
    const storagePath = `${folder}/${timestamp}_${safeName}.${ext}`

    // Завантажуємо у Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      // Якщо bucket не існує — повертаємо зрозумілу помилку
      if (uploadError.message?.includes('Bucket not found') ||
          uploadError.message?.includes('bucket') ||
          uploadError.message?.includes('storage')) {
        return NextResponse.json({
          error: 'Storage bucket "evidence" не створено. Виконай міграцію у Supabase.',
          details: uploadError.message,
        }, { status: 500 })
      }
      throw new Error(uploadError.message)
    }

    // Отримуємо публічний URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath)

    const fileUrl = urlData.publicUrl

    // Зберігаємо запис у БД
    const evType = getEvType(file.type)
    const { data: evidence, error: dbError } = await supabase
      .from('evidence')
      .insert({
        person_id:     personId   || null,
        incident_id:   incidentId || null,
        ev_type:       evType,
        filename:      storagePath,
        original_name: file.name,
        file_url:      fileUrl,
        file_size:     file.size,
        mime_type:     file.type,
        description:   description || null,
        source:        source,
        date_captured: dateCaptured || null,
        location:      location || null,
        hash_sha256:   hash,
      })
      .select()
      .single()

    if (dbError) throw new Error(dbError.message)

    return NextResponse.json({ success: true, evidence })

  } catch (err: any) {
    console.error('[evidence/upload]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
