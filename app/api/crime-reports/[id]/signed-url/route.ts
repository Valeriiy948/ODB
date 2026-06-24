// app/api/crime-reports/[id]/signed-url/route.ts
// Генерує тимчасовий signed URL для перегляду файлу (60 хв)

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await serverClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS перевіряє доступ до запису
  const { data: report } = await supabase
    .from('crime_reports')
    .select('file_url')
    .eq('id', id)
    .single()

  if (!report?.file_url) return NextResponse.json({ error: 'No file' }, { status: 404 })

  const admin = createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(report.file_url, 3600) // 1 год

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Cannot generate URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
