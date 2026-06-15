// lib/search/name-normalizer.ts
// Генерує варіанти імені: UA / RU / EN транслітерація

import type { ParsedQuery } from './query-parser'

export interface NameVariants {
  original: string
  ukrainian: string[]
  russian: string[]
  english: string[]
  allVariants: string[]   // дедуплікований масив, max 8
}

// ─── UA → RU ────────────────────────────────────────────────────────────────
const UA_TO_RU: Record<string, string> = {
  'і': 'и', 'І': 'И',
  'ї': 'и', 'Ї': 'И',
  'є': 'е', 'Є': 'Е',
  'ґ': 'г', 'Ґ': 'Г',
}

// ─── KMU 2010: UA Cyrillic → Latin ─────────────────────────────────────────
const UA_TO_EN: Record<string, string> = {
  'А': 'A',  'а': 'a',
  'Б': 'B',  'б': 'b',
  'В': 'V',  'в': 'v',
  'Г': 'H',  'г': 'h',
  'Ґ': 'G',  'ґ': 'g',
  'Д': 'D',  'д': 'd',
  'Е': 'E',  'е': 'e',
  'Є': 'Ye', 'є': 'ye',
  'Ж': 'Zh', 'ж': 'zh',
  'З': 'Z',  'з': 'z',
  'И': 'Y',  'и': 'y',
  'І': 'I',  'і': 'i',
  'Ї': 'Yi', 'ї': 'yi',
  'Й': 'Y',  'й': 'y',
  'К': 'K',  'к': 'k',
  'Л': 'L',  'л': 'l',
  'М': 'M',  'м': 'm',
  'Н': 'N',  'н': 'n',
  'О': 'O',  'о': 'o',
  'П': 'P',  'п': 'p',
  'Р': 'R',  'р': 'r',
  'С': 'S',  'с': 's',
  'Т': 'T',  'т': 't',
  'У': 'U',  'у': 'u',
  'Ф': 'F',  'ф': 'f',
  'Х': 'Kh', 'х': 'kh',
  'Ц': 'Ts', 'ц': 'ts',
  'Ч': 'Ch', 'ч': 'ch',
  'Ш': 'Sh', 'ш': 'sh',
  'Щ': 'Shch','щ': 'shch',
  'Ь': '',   'ь': '',
  'Ю': 'Yu', 'ю': 'yu',
  'Я': 'Ya', 'я': 'ya',
}

// ─── RU Cyrillic → Latin ────────────────────────────────────────────────────
const RU_TO_EN: Record<string, string> = {
  'А': 'A',  'а': 'a',
  'Б': 'B',  'б': 'b',
  'В': 'V',  'в': 'v',
  'Г': 'G',  'г': 'g',
  'Д': 'D',  'д': 'd',
  'Е': 'E',  'е': 'e',
  'Ё': 'Yo', 'ё': 'yo',
  'Ж': 'Zh', 'ж': 'zh',
  'З': 'Z',  'з': 'z',
  'И': 'I',  'и': 'i',
  'Й': 'Y',  'й': 'y',
  'К': 'K',  'к': 'k',
  'Л': 'L',  'л': 'l',
  'М': 'M',  'м': 'm',
  'Н': 'N',  'н': 'n',
  'О': 'O',  'о': 'o',
  'П': 'P',  'п': 'p',
  'Р': 'R',  'р': 'r',
  'С': 'S',  'с': 's',
  'Т': 'T',  'т': 't',
  'У': 'U',  'у': 'u',
  'Ф': 'F',  'ф': 'f',
  'Х': 'Kh', 'х': 'kh',
  'Ц': 'Ts', 'ц': 'ts',
  'Ч': 'Ch', 'ч': 'ch',
  'Ш': 'Sh', 'ш': 'sh',
  'Щ': 'Shch','щ': 'shch',
  'Ъ': '',   'ъ': '',
  'Ы': 'Y',  'ы': 'y',
  'Ь': '',   'ь': '',
  'Э': 'E',  'э': 'e',
  'Ю': 'Yu', 'ю': 'yu',
  'Я': 'Ya', 'я': 'ya',
}

// Популярні альтернативні транслітерації першого імені
const ALT_FIRST_NAMES: Record<string, string[]> = {
  'Valerii': ['Valery', 'Valeriy'],
  'Valery':  ['Valerii', 'Valeriy'],
  'Valeriy': ['Valery', 'Valerii'],
  'Oleksii': ['Alexei', 'Aleksei', 'Oleksy'],
  'Mykola':  ['Nikolai', 'Mikola'],
  'Pavlo':   ['Pavel', 'Paul'],
  'Serhii':  ['Sergei', 'Sergiy', 'Serhiy'],
  'Volodymyr':['Vladimir', 'Volodimir'],
  'Yurii':   ['Yuri', 'Yuriy', 'Yury'],
  'Andrii':  ['Andrei', 'Andriy'],
  'Dmytro':  ['Dmitry', 'Dmitri'],
  'Vasyl':   ['Vasily', 'Vasiliy'],
  'Oleh':    ['Oleg'],
  'Ihor':    ['Igor'],
  'Taras':   ['Taras'],
  'Bohdan':  ['Bogdan'],
}

// Альтернативні транслітерації прізвища (суфікси)
const SURNAME_SUFFIX_ALTS: Array<[RegExp, string]> = [
  [/chuk$/i,  'chuk'],   // Makariichuk ↔ Makarychuk
  [/enko$/i,  'enko'],
  [/sky$/i,   'ski'],
  [/ski$/i,   'sky'],
  [/skyi$/i,  'ski'],
]

function applyTable(text: string, table: Record<string, string>): string {
  let out = ''
  for (const ch of text) out += table[ch] ?? ch
  return out
}

function uaToRu(text: string): string {
  let result = ''
  for (const ch of text) result += UA_TO_RU[ch] ?? ch
  // -ій → -ий (прикметникова форма імен по-батькові та прізвищ)
  return result
    .replace(/ій\b/g, 'ий')
    .replace(/ІЙ\b/g, 'ИЙ')
    .replace(/євич\b/gi, 'евич')
    .replace(/Євич\b/gi, 'Евич')
}

function joinName(...parts: string[]): string {
  return parts.filter(Boolean).join(' ').trim()
}

function dedup(arr: string[], max = 8): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const v of arr) {
    const key = v.toLowerCase().trim()
    if (key && !seen.has(key)) {
      seen.add(key)
      result.push(v)
      if (result.length >= max) break
    }
  }
  return result
}

export function generateNameVariants(parsed: ParsedQuery): NameVariants {
  const { fullName, lastName, firstName, middleName } = parsed

  if (!fullName) {
    return { original: fullName, ukrainian: [], russian: [], english: [], allVariants: [] }
  }

  const hasUA  = /[іїєґ]/i.test(fullName)
  const hasRU  = /[ыэёъ]/i.test(fullName)
  const hasCyr = /[а-яА-ЯёЁіїєґ]/.test(fullName)
  const hasLat = /^[a-zA-Z\s'-]+$/.test(fullName)

  // ── Ukrainian ────────────────────────────────────────────────────────────
  const ukrainian: string[] = []
  if (hasUA || (hasCyr && !hasRU)) ukrainian.push(fullName)

  // ── Russian ──────────────────────────────────────────────────────────────
  const russian: string[] = []
  if (hasRU) {
    russian.push(fullName)
  } else if (hasCyr) {
    const ruVersion = uaToRu(fullName)
    russian.push(ruVersion)
    // Якщо оригінал і RU-версія однакові — не дублюємо
    if (ruVersion.toLowerCase() !== fullName.toLowerCase()) {
      ukrainian.push(fullName)
    }
  }

  // ── English ──────────────────────────────────────────────────────────────
  const english: string[] = []

  if (hasLat) {
    english.push(fullName)
  } else if (hasCyr) {
    // Основна транслітерація з UA
    const table  = hasRU ? RU_TO_EN : UA_TO_EN
    const mainEn = applyTable(fullName, table)
    if (mainEn && mainEn !== fullName) english.push(mainEn)

    // Якщо UA — ще й з RU-джерела
    if (hasUA || (!hasRU && hasCyr)) {
      const fromRu = applyTable(uaToRu(fullName), RU_TO_EN)
      if (fromRu && fromRu !== mainEn) english.push(fromRu)
    }

    // Альтернативні форми першого імені
    const fn_en = applyTable(firstName, UA_TO_EN)
    const ln_en = applyTable(lastName,  UA_TO_EN)
    const mn_en = applyTable(middleName, UA_TO_EN)

    const alts = ALT_FIRST_NAMES[fn_en] ?? []
    for (const alt of alts) {
      const variant = joinName(ln_en, alt, mn_en)
      if (variant && !english.includes(variant)) english.push(variant)
      if (english.length >= 4) break
    }

    // Альтернативні суфікси прізвища (makariichuk ↔ makarychuk)
    for (const [re, rep] of SURNAME_SUFFIX_ALTS) {
      if (re.test(ln_en.toLowerCase())) {
        const altLn = ln_en.replace(re, rep)
        const variant = joinName(altLn, applyTable(firstName, UA_TO_EN), mn_en)
        if (variant && !english.includes(variant)) english.push(variant)
      }
    }
  }

  const allVariants = dedup([
    fullName,
    ...ukrainian,
    ...russian,
    ...english,
  ])

  return { original: fullName, ukrainian, russian, english, allVariants }
}
