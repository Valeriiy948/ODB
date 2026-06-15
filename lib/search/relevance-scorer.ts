// lib/search/relevance-scorer.ts
// Скоринг релевантності: 0..100, поріг 25

import type { ParsedQuery } from './query-parser'
import { levenshteinNorm } from '../utils'

export interface ScoredResult {
  _score: number
  [key: string]: unknown
}

// ─── Поля для пошуку імені та дати ──────────────────────────────────────────
const NAME_FIELDS = [
  'name', 'fullName', 'full_name', 'person_name',
  'fio', 'ФИО', 'ПІБ', 'displayName', 'title',
  'last_name', 'lastName', 'surname',
] as const

const DOB_FIELDS = [
  'dob', 'birth_date', 'bdate', 'birthday',
  'дата_народження', 'date_of_birth', 'born',
  'birthDate', 'birth',
] as const

// ─── Нормалізація дати до ISO ────────────────────────────────────────────────
function normalizeDateToISO(raw: unknown): string | null {
  if (!raw) return null

  // Числовий timestamp
  if (typeof raw === 'number') {
    if (raw > 1e10) return new Date(raw).toISOString().slice(0, 10)  // ms
    if (raw > 1e7)  return new Date(raw * 1000).toISOString().slice(0, 10) // s
  }

  const s = String(raw).trim()
  if (!s) return null

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  // DD.MM.YYYY або DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (dmy) {
    const d = dmy[1].padStart(2, '0')
    const m = dmy[2].padStart(2, '0')
    const y = dmy[3]
    return `${y}-${m}-${d}`
  }

  // YYYY
  if (/^\d{4}$/.test(s)) return null  // рік без місяця/дня — не ISO

  return null
}

function extractYear(raw: unknown): number | null {
  if (!raw) return null
  const s = String(raw)
  const m = s.match(/\b(\d{4})\b/)
  if (m) {
    const y = parseInt(m[1], 10)
    if (y >= 1900 && y <= 2024) return y
  }
  return null
}

// ─── Витягуємо значення першого непустого поля ───────────────────────────────
function pickField(
  result: Record<string, unknown>,
  fields: readonly string[],
): string | null {
  for (const f of fields) {
    const v = result[f]
    if (v && typeof v === 'string' && v.trim()) return v.trim()
    if (v && typeof v === 'number')              return String(v)
  }
  return null
}

// ─── Основна функція ─────────────────────────────────────────────────────────
export function scoreResult(
  result: Record<string, unknown>,
  query: ParsedQuery,
  _source: string,
): number {
  if (!query.fullName && !query.dob && query.phones.length === 0) return 50

  let score = 0
  const rawName  = pickField(result, NAME_FIELDS)
  const rawDate  = pickField(result, DOB_FIELDS)

  // ── Ім'я ─────────────────────────────────────────────────────────────────
  if (rawName && query.fullName) {
    const rn  = rawName.toLowerCase()
    const qfn = query.fullName.toLowerCase()
    const qln = query.lastName.toLowerCase()
    const qfnF= query.firstName.toLowerCase()

    // Точний збіг fullName
    if (rn === qfn) score += 60

    // Збіг прізвища (точний)
    if (qln && rn.includes(qln)) score += 25

    // Збіг імені (точний)
    if (qfnF && rn.includes(qfnF)) score += 15

    // Levenshtein прізвища (≤ 0.2)
    if (qln && levenshteinNorm(rawName.split(' ')[0] ?? '', query.lastName) <= 0.2) {
      score += 20
    }

    // Levenshtein імені (≤ 0.2)
    if (qfnF) {
      const rParts = rawName.split(' ')
      const rFirst = rParts[1] ?? rParts[0] ?? ''
      if (levenshteinNorm(rFirst, query.firstName) <= 0.2) score += 10
    }
  }

  // Якщо немає імені в запиті але є прізвище в результаті — базовий бал
  if (!query.fullName && rawName) score = 30

  // ── Дата народження ───────────────────────────────────────────────────────
  if (rawDate && (query.dob || query.dobYear)) {
    const isoResult = normalizeDateToISO(rawDate)

    // Точний збіг ISO дати
    if (query.dob && isoResult && isoResult === query.dob) {
      score += 35
    } else {
      // Збіг тільки року
      const resultYear = isoResult
        ? parseInt(isoResult.slice(0, 4), 10)
        : extractYear(rawDate)

      if (query.dobYear && resultYear === query.dobYear) score += 10
    }
  }

  // ── Бонус: прізвище + дата разом ─────────────────────────────────────────
  const hasLastNameHit = rawName && query.lastName &&
    rawName.toLowerCase().includes(query.lastName.toLowerCase())
  const hasFullDobHit  = query.dob && rawDate &&
    normalizeDateToISO(rawDate) === query.dob
  if (hasLastNameHit && hasFullDobHit && score >= 55) score += 10

  // ── Поріг ────────────────────────────────────────────────────────────────
  return score < 25 ? 0 : Math.min(100, score)
}
