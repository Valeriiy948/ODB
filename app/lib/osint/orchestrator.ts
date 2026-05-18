// app/lib/osint/orchestrator.ts

import { googleSearch, SearchResult, scoreResult } from './google-cse'

// Шумні вектори — фільтруємо за relevance
const NOISY_VECTORS = new Set(['name_ukr', 'name_ru_web', 'name_year', 'relatives'])

// Мінімальний поріг для шумних векторів
const MIN_RELEVANCE = 35

export interface OsintVector {
  query: string; vector: string; label: string; results: SearchResult[]
}
export interface OsintSearchResult {
  vectors: OsintVector[]; total: number; searchedAt: string
}

interface PersonData {
  id: string
  name?: string
  name_ukr?: string
  name_rus?: string
  dob?: string
  ipn?: string
  passport?: string
  snils?: string
  phones?: string[]
  email?: string
  unit?: string
  unit_num?: string
  rank?: string
  military_id?: string
}

function parseDob(dob: string) {
  const iso = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const dot = dob.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (iso) return { year: iso[1], month: iso[2], day: iso[3] }
  if (dot) return { year: dot[3], month: dot[2], day: dot[1] }
  const y = dob.match(/(\d{4})/); if (y) return { year: y[1], month: null, day: null }
  return null
}

export async function runOsintSearch(person: PersonData): Promise<OsintSearchResult> {
  const nameUkr = person.name_ukr || person.name || null
  const nameRus = person.name_rus || person.name || null
  const dob = person.dob ? parseDob(person.dob) : null

  // ══════════════════════════════════════════════════════════════════════════
  // ПРІОРИТЕТ 1 — унікальні ідентифікатори (завжди, ці найцінніші)
  // ══════════════════════════════════════════════════════════════════════════
  const queries: { query: string; vector: string; label: string; lang: 'ua' | 'ru' | 'en' }[] = []

  if (person.ipn && person.ipn.length >= 10) {
    queries.push({ query: `"${person.ipn}"`, vector: 'ipn', label: `ІПН: ${person.ipn}`, lang: 'ru' })
  }
  if (person.snils && person.snils.length >= 10) {
    queries.push({ query: `"${person.snils}"`, vector: 'snils', label: `СНІЛС: ${person.snils}`, lang: 'ru' })
  }
  if (person.passport && person.passport.length >= 6) {
    queries.push({ query: `"${person.passport}"`, vector: 'passport', label: `Паспорт: ${person.passport}`, lang: 'ru' })
  }
  if (person.phones?.length) {
    for (const phone of person.phones.slice(0, 2)) {
      if (phone?.length >= 7) {
        queries.push({ query: `"${phone}"`, vector: `phone_${phone.slice(-4)}`, label: `Тел: ${phone}`, lang: 'ru' })
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПРІОРИТЕТ 2 — ПІБ + рік (якщо є ім'я)
  // ══════════════════════════════════════════════════════════════════════════
  if (nameRus) {
    // ПІБ + рік народження — дуже специфічний запит, менше шуму
    if (dob?.year) {
      queries.push({
        query: `"${nameRus}" ${dob.year}`,
        vector: 'name_year',
        label: `ПІБ + рік нар. (${dob.year})`,
        lang: 'ru',
      })
    } else {
      // Немає ДН — шукаємо просто ПІБ
      queries.push({ query: `"${nameRus}"`, vector: 'name_ru_web', label: `ПІБ: "${nameRus}"`, lang: 'ru' })
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПРІОРИТЕТ 3 — спецджерела (Міротворець, VK, Cargo200)
  // ══════════════════════════════════════════════════════════════════════════
  if (nameRus) {
    queries.push({
      query: `"${nameRus}" site:myrotvorets.center`,
      vector: 'myrotvorets',
      label: '🇺🇦 Миротворець',
      lang: 'ru',
    })
    queries.push({
      query: `"${nameRus}" site:vk.com`,
      vector: 'vk',
      label: 'VK',
      lang: 'ru',
    })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПРІОРИТЕТ 4 — email (якщо є)
  // ══════════════════════════════════════════════════════════════════════════
  if (person.email) {
    queries.push({ query: `"${person.email}"`, vector: 'email', label: `Email: ${person.email}`, lang: 'en' })
  }

  // Виконуємо батчами по 3, пауза 300ms між батчами (щоб не зловити rate limit)
  const BATCH_SIZE = 3
  const BATCH_DELAY = 300
  const vectorResults: { query: string; vector: string; label: string; results: SearchResult[] }[] = []

  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async ({ query, vector, label, lang }) => {
        const results = await googleSearch(query, vector, lang)
        return { query, vector, label, results }
      })
    )
    vectorResults.push(...batchResults)
    if (i + BATCH_SIZE < queries.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY))
    }
  }

  // Фільтрація шумних векторів
  const vectors = vectorResults
    .map(v => {
      if (!NOISY_VECTORS.has(v.vector)) return v
      const filtered = v.results.filter(r => (r.relevanceScore ?? 50) >= MIN_RELEVANCE)
      return { ...v, results: filtered }
    })
    .filter(v => v.results.length > 0)

  const total = vectors.reduce((sum, v) => sum + v.results.length, 0)
  return { vectors, total, searchedAt: new Date().toISOString() }
}
