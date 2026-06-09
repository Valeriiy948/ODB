// lib/search/query-parser.ts
// Парсинг пошукового рядка: ПІБ + ДН + телефони

export interface ParsedQuery {
  raw: string
  fullName: string       // "Макарийчук Валерий Валериевич"
  lastName: string       // "Макарийчук"
  firstName: string      // "Валерий"
  middleName: string     // "Валериевич"
  dob: string | null     // "1993-10-10" строго ISO або null
  dobYear: number | null
  dobMonth: number | null
  dobDay: number | null
  phones: string[]
  searchType: 'name' | 'phone' | 'email' | 'mixed'
}

// DD.MM.YYYY або DD/MM/YYYY
const DOB_FULL_RE  = /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/
// ISO YYYY-MM-DD
const DOB_ISO_RE   = /\b(\d{4})-(\d{2})-(\d{2})\b/
// Рік окремо (1900–2010), не частина довшого числа
const DOB_YEAR_RE  = /(?<!\d)(19\d{2}|200\d|2010)(?!\d)/
// Телефони: UA +380 / 0XX / RU 7XX
const PHONE_RE     = /(\+?380\d{9}|\+?7\d{10}|0\d{9})/g
// Email
const EMAIL_RE     = /[^\s@]+@[^\s@]+\.[^\s@]+/

function pad2(n: number): string { return String(n).padStart(2, '0') }

function normalizePhone(raw: string): string {
  if (raw.startsWith('0') && raw.length === 10)  return '+38' + raw
  if (raw.startsWith('380'))                      return '+' + raw
  if (raw.startsWith('+380'))                     return raw
  if (/^7\d{10}$/.test(raw))                      return '+' + raw
  return raw
}

export function parseSearchQuery(raw: string): ParsedQuery {
  let text = raw.trim()
  const phones: string[] = []
  let dob: string | null = null
  let dobYear: number | null = null
  let dobMonth: number | null = null
  let dobDay: number | null = null
  let hasEmail = false

  // 1. Вилучаємо email
  const emailMatches = text.match(new RegExp(EMAIL_RE.source, 'g'))
  if (emailMatches) {
    hasEmail = true
    for (const m of emailMatches) text = text.replace(m, '').trim()
  }

  // 2. Вилучаємо телефони
  const phoneMatches = text.match(PHONE_RE)
  if (phoneMatches) {
    for (const p of phoneMatches) {
      phones.push(normalizePhone(p))
      text = text.replace(p, '').trim()
    }
  }

  // 3. ISO дата YYYY-MM-DD (до повної, щоб не зʼїсти рік)
  const isoMatch = text.match(DOB_ISO_RE)
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10)
    const m = parseInt(isoMatch[2], 10)
    const d = parseInt(isoMatch[3], 10)
    if (y >= 1900 && y <= 2024 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      dobYear = y; dobMonth = m; dobDay = d
      dob = `${y}-${pad2(m)}-${pad2(d)}`
      text = text.replace(isoMatch[0], '').trim()
    }
  }

  // 4. Повна дата DD.MM.YYYY або DD/MM/YYYY
  if (!dob) {
    const fullMatch = text.match(DOB_FULL_RE)
    if (fullMatch) {
      const d = parseInt(fullMatch[1], 10)
      const m = parseInt(fullMatch[2], 10)
      const y = parseInt(fullMatch[3], 10)
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2024) {
        dobDay = d; dobMonth = m; dobYear = y
        dob = `${y}-${pad2(m)}-${pad2(d)}`
        text = text.replace(fullMatch[0], '').trim()
      }
    }
  }

  // 5. Тільки рік (якщо повну дату не знайдено)
  if (!dob) {
    const yearMatch = text.match(DOB_YEAR_RE)
    if (yearMatch) {
      dobYear = parseInt(yearMatch[1], 10)
      text = text.replace(yearMatch[0], '').trim()
    }
  }

  // 6. Нормалізуємо залишок → fullName
  const fullName = text.replace(/\s+/g, ' ').trim()
  const parts    = fullName.split(' ').filter(Boolean)
  const lastName   = parts[0]   ?? ''
  const firstName  = parts[1]   ?? ''
  const middleName = parts.slice(2).join(' ')

  // 7. Тип пошуку
  let searchType: ParsedQuery['searchType'] = 'name'
  if      (phones.length > 0 && !fullName && !hasEmail) searchType = 'phone'
  else if (hasEmail && !fullName && phones.length === 0) searchType = 'email'
  else if (phones.length > 0 || hasEmail)               searchType = 'mixed'

  return {
    raw,
    fullName,
    lastName,
    firstName,
    middleName,
    dob,
    dobYear,
    dobMonth,
    dobDay,
    phones,
    searchType,
  }
}
