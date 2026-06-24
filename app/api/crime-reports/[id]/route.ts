// app/api/crime-reports/[id]/route.ts
// GET — повна довідка | DELETE — видалення (тільки автор)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'
import { cookies }                   from 'next/headers'

const URL_   = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SVC    = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = 'crime-reports'

async function serverClient() {
  const cs = await cookies()
  return createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => cs.getAll(),
      setAll: (p) => p.forEach(({ name, value, options }) => { try { cs.set(name, value, options) } catch {} }),
    },
  })
}
function adminClient() {
  return createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await serverClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('crime_reports')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await serverClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Отримуємо запис — RLS перевіряє що автор
  const { data: report } = await supabase
    .from('crime_reports')
    .select('file_url,author_id')
    .eq('id', id)
    .single()

  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (report.author_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Видаляємо файл зі Storage
  if (report.file_url) {
    const admin = adminClient()
    await admin.storage.from(BUCKET).remove([report.file_url])
  }

  const { error } = await supabase.from('crime_reports').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
