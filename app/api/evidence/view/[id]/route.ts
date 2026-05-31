// app/api/evidence/view/[id]/route.ts
// Проксі для перегляду файлів доказів з правильним Content-Type
// Supabase Storage блокує рендеринг HTML (XSS захист) — цей роут обходить це

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createSupabase()

    // Отримуємо метадані файлу
    const { data: ev, error } = await supabase
      .from('evidence')
      .select('filename, original_name, mime_type, file_url')
      .eq('id', id)
      .single()

    if (error || !ev) {
      return new NextResponse('Файл не знайдено', { status: 404 })
    }

    // Завантажуємо файл зі Supabase Storage
    const { data: fileData, error: dlError } = await supabase.storage
      .from('evidence')
      .download(ev.filename)

    if (dlError || !fileData) {
      // Якщо download не вийшов — пробуємо через публічний URL
      const resp = await fetch(ev.file_url)
      if (!resp.ok) {
        return new NextResponse('Не вдалося завантажити файл', { status: 502 })
      }
      const buf = await resp.arrayBuffer()
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': ev.mime_type || 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="${encodeURIComponent(ev.original_name)}"`,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    const buf = await fileData.arrayBuffer()

    // Визначаємо charset для HTML
    let contentType = ev.mime_type || 'application/octet-stream'
    if (contentType === 'text/html' || contentType === 'text/plain') {
      contentType = 'text/html; charset=utf-8'
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(ev.original_name)}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err: any) {
    console.error('[evidence/view]', err)
    return new NextResponse(err.message, { status: 500 })
  }
}
