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

const MONTHS: Record<string, string> = {
  'січня':'01','лютого':'02','березня':'03','квітня':'04','травня':'05','червня':'06',
  'липня':'07','серпня':'08','вересня':'09','жовтня':'10','листопада':'11','грудня':'12',
}

function extractErdr(text: string): string | null {
  // Спочатку шукаємо явну мітку "провадженні №" або "провадження №"
  const labeled = text.match(/провадженн[іяю]\s*[№#NNo\.]*\s*(\d{10,20})/i)
  if (labeled) return labeled[1]

  // Загальний патерн: 10-20 цифр підряд (ЄРДР зазвичай 14-17 цифр)
  const all = [...text.matchAll(/\b(\d{10,20})\b/g)]
    .map(m => m[1])
    .filter(n => {
      // виключаємо очевидно не-ЄРДР: телефони, ІПН, роки
      if (n.length === 10 || n.length === 13) return false // телефон / ІПН
      return true
    })
  return all[0] ?? null
}

function extractDate(text: string): string | null {
  // "від 27.02.2022" або просто DD.MM.YYYY
  const dmyMatches = [...text.matchAll(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](20\d{2})\b/g)]
  for (const m of dmyMatches) {
    const day = parseInt(m[1]), mon = parseInt(m[2]), year = parseInt(m[3])
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12 && year >= 2014) {
      return `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    }
  }
  // Українська форма: "27 лютого 2022"
  for (const m of text.matchAll(/(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(20\d{2})/gi)) {
    const month = MONTHS[m[2].toLowerCase()]
    if (month) return `${m[3]}-${month}-${m[1].padStart(2,'0')}`
  }
  return null
}

function extractLocation(text: string): string | null {
  // Шукаємо розширений контекст: с. Забуччя Бучанського району Київської області
  const full = text.match(
    /(?:м\.|місто|с\.|смт\.|селище|село)\s*([А-ЯІЇЄЁ][а-яіїєё'\-]+)(?:\s+(?:[А-ЯІЇЄЁ][а-яіїєё'\-]+(?:ого|ого|ської|ого|ського|ої)\s+)?(?:району?|обл(?:асті|\.)|міст[аою])[^.\n]{0,60})?/gi
  )
  if (full?.[0]) return full[0].trim().slice(0, 120)

  // Просто назва населеного пункту
  const simple = text.match(/(?:м\.|місто|с\.|смт\.|село)\s+([А-ЯІЇЄЁ][а-яіїєё'\-]+)/i)
  if (simple) return simple[0].trim()

  return null
}

function extractTitle(text: string): string | null {
  // Шукаємо тип документу у перших 600 символах
  const head = text.slice(0, 600)
  const TYPE_RE = /\b(ДОВІДКА|ПІДОЗРА|ОБВИНУВАЧЕННЯ|ПРОТОКОЛ|АКТ|ВИСНОВОК|ЗВІТ|ВИРОК|УХВАЛА|ПОСТАНОВА|КЛОПОТАННЯ|ПОВІДОМЛЕННЯ)\b/i
  const typeMatch = head.match(TYPE_RE)
  if (!typeMatch) return null

  const typeName = typeMatch[0].trim()
  // Беремо текст після типу документу на тому ж або наступному рядку
  const after = head.slice((typeMatch.index ?? 0) + typeName.length).replace(/^[\s\n:]+/, '').slice(0, 160)
  const line = after.split('\n')[0].trim().replace(/\s+/g, ' ')

  // Відкидаємо якщо починається з малої букви (середина речення) або занадто коротко
  if (!line || line.length < 5 || /^[а-яіїєё]/.test(line)) return typeMatch[0].trim()

  return `${typeName} ${line}`.slice(0, 120)
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buf  = Buffer.from(await file.arrayBuffer())
  const raw  = await extractText(buf, file.type)

  if (!raw || raw.length < 10) {
    return NextResponse.json({ erdr: null, date: null, location: null, title: null, preview: '' })
  }

  // Нормалізуємо всі нестандартні пробіли → звичайний пробіл
  const text = raw
    .replace(/ /g, ' ')   // non-breaking space (Word)
    .replace(/​/g, '')    // zero-width space
    .replace(/\r\n/g, '\n')    // Windows CRLF → LF
    .replace(/[ \t]+/g, ' ')   // collapse multiple spaces/tabs

  const erdr     = extractErdr(text)
  const date     = extractDate(text)
  const location = extractLocation(text)
  const title    = extractTitle(text)
  const preview  = text.slice(0, 400).trim()

  return NextResponse.json({ erdr, date, location, title, preview })
}
