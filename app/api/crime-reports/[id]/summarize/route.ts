// app/api/crime-reports/[id]/summarize/route.ts
// POST — генерує AI summary для довідки (окремий endpoint щоб не блокувати upload)

import { NextRequest, NextResponse }       from 'next/server'
import { createServerClient }              from '@supabase/ssr'
import { cookies }                         from 'next/headers'

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY

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

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await serverClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: report } = await supabase
    .from('crime_reports')
    .select('id, title, extracted_text, author_id')
    .eq('id', id)
    .eq('author_id', user.id)
    .single()

  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!report.extracted_text) return NextResponse.json({ error: 'No text to summarize' }, { status: 400 })
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: 'No Anthropic API key' }, { status: 500 })

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
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
${report.extracted_text.slice(0, 4000)}`,
        }],
      }),
    })

    const data = await res.json() as { content?: Array<{ text: string }> }
    const raw  = data.content?.[0]?.text ?? ''
    const parsed = JSON.parse(raw)
    const summary = `${parsed.summary}\n\nКлючові факти:\n${parsed.facts?.map((f: string) => `• ${f}`).join('\n') ?? ''}\n\nРівень загрози: ${parsed.threat} — ${parsed.threat_reason}`

    await supabase
      .from('crime_reports')
      .update({ summary })
      .eq('id', id)

    return NextResponse.json({ ok: true, summary })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
