// app/api/crime-reports/quick-parse/route.ts
// POST — швидкий аналіз файлу для автозаповнення форми (без збереження в DB)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient }        from '@supabase/ssr'
import { cookies }                   from 'next/headers'
import { extractText }               from '@/lib/doc-parser'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function getUser() {
  const cs = await cookies()
  const sb = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => cs.getAll(),
      setAll: (p) => p.forEach(({ name, value, options }) => { try { cs.set(name, value, options) } catch {} }),
    },
  })
  const { data: { user } } = await sb.auth.getUser()
  return user
}

// ── Шаблони для витягування метаданих ────────────────────────────────────────

// ЄРДР: 12-14 цифр (часто починається з 202)
const ERDR_RE = /\b(202\d{9,11}|\d{12,14})\b/g

// Дати: 01.01.2024 або 1 січня 2024 або 2024-01-01
const MONTHS: Record<string, string> = {
  'січня':'01','лютого':'02','березня':'03','квітня':'04','травня':'05','червня':'06',
  'липня':'07','серпня':'08','вересня':'09','жовтня':'10','листопада':'11','грудня':'12',
}
const DATE_DMY_RE = /\b(\d{1,2})[.\-\/](\d{1,2})[.\-\/](20\d{2})\b/g
const DATE_UA_RE  = /\b(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(20\d{2})\b/gi
const DATE_ISO_RE = /\b(20\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})\b/g

// Місце: "м. Харків", "с. Капітанівка", "смт. Балта", "місто Київ"
const LOCATION_RE = /(?:м\.|місто|с\.|село|смт\.|селище|р-н|район|обл\.|область)\s+([А-ЯІЇЄЁA-Z][а-яіїєёa-z'А-ЯІЇЄЁ\-]+(?:\s+[А-ЯІЇЄЁA-Z][а-яіїєёa-z']+)?)/gi

// Назва справи / заголовок після "ДОВІДКА", "ПРОТОКОЛ", "АКТ"
const TITLE_RE = /(?:ДОВІДКА|ПРОТОКОЛ|АКТ|ВИСНОВОК|ЗВІТ|ПОВІДОМЛЕННЯ)\s+(.{5,80}?)(?:\n|$)/i

function extractErdr(text: string): string | null {
  const matches = [...text.matchAll(new RegExp(ERDR_RE.source, 'g'))]
    .map(m => m[1])
    .filter(n => n.length >= 12)
  return matches[0] ?? null
}

function extractDate(text: string): string | null {
  // ISO формат
  for (const m of text.matchAll(new RegExp(DATE_ISO_RE.source, 'g'))) {
    return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
  }
  // DD.MM.YYYY
  for (const m of text.matchAll(new RegExp(DATE_DMY_RE.source, 'g'))) {
    const year = parseInt(m[3])
    if (year >= 2020 && year <= 2030) {
      return `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    }
  }
  // Українська форма
  for (const m of text.matchAll(new RegExp(DATE_UA_RE.source, 'gi'))) {
    const month = MONTHS[m[2].toLowerCase()]
    if (month) return `${m[3]}-${month}-${m[1].padStart(2,'0')}`
  }
  return null
}

function extractLocation(text: string): string | null {
  const matches: string[] = []
  for (const m of text.matchAll(new RegExp(LOCATION_RE.source, 'gi'))) {
    const loc = m[0].trim()
    if (loc.length > 3 && loc.length < 80) matches.push(loc)
  }
  return matches[0] ?? null
}

function extractTitle(text: string): string | null {
  const m = text.match(TITLE_RE)
  return m ? m[1].trim().slice(0, 100) : null
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buf  = Buffer.from(await file.arrayBuffer())
  const text = await extractText(buf, file.type)

  if (!text || text.length < 10) {
    return NextResponse.json({ erdr: null, date: null, location: null, title: null, preview: '' })
  }

  const erdr     = extractErdr(text)
  const date     = extractDate(text)
  const location = extractLocation(text)
  const title    = extractTitle(text)
  const preview  = text.slice(0, 300).replace(/\s+/g, ' ').trim()

  return NextResponse.json({ erdr, date, location, title, preview })
}
