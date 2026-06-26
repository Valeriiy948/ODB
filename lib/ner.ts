// lib/ner.ts — Named Entity Recognition (regex-based NER engine)
// Витягує: ПІБ з контекстом (ДН/звання/посада), телефони, ІПН, крипто, авто

export interface CryptoAddr { address: string; type: 'BTC' | 'ETH' | 'USDT_TRC20' | 'USDT_ERC20' }

export interface PersonContext {
  name:     string
  dob?:     string   // DD.MM.YYYY або YYYY
  rank?:    string   // звання
  unit?:    string   // підрозділ
  position?: string  // посада
}

export interface Entities {
  names:    string[]
  persons:  PersonContext[]  // розширені дані з контекстом
  phones:   string[]
  ipn:      string[]
  crypto:   CryptoAddr[]
  vehicles: string[]
}

// ─── Регулярки ─────────────────────────────────────────────────────────────
const R = {
  phone: /(?:\+?38)?0\d{9}|(?:\+?38)?\(0\d{2,3}\)[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g,
  ipn:   /(?<!\d)\d{10}(?!\d)/g,
  btc:   /\b(?:1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,39})\b/gi,
  eth:   /\b0x[a-fA-F0-9]{40}\b/gi,
  trc:   /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g,
  vehicle: /\b[А-ЯЁІЇЄA-Z]{2}[\s-]?\d{4}[\s-]?[А-ЯЁІЇЄA-Z]{2}\b/gi,
  // NOTE: \b не працює з кирилицею в JS — використовуємо lookbehind/lookahead
  // По батькові ОБОВ'ЯЗКОВЕ — відсікає інституційні назви ("Верховною Радою України" тощо)
  name: /(?:^|(?<=[\s,;.([\-]))([А-ЯІЇЄЁA-Z][а-яіїєёa-z']{1,20}\s+[А-ЯІЇЄЁA-Z][а-яіїєёa-z']{1,20}\s+[А-ЯІЇЄЁA-Z][а-яіїєёa-z']{1,20}(?:ович|евич|євич|йович|івна|овна|євна|ївна))(?=[\s,;.)\]}\n]|$)/g,
}

// ─── Звання (укр + рос) ────────────────────────────────────────────────────
const RANKS = [
  'генерал армії', 'генерал-полковник', 'генерал-лейтенант', 'генерал-майор', 'генерал',
  'полковник', 'підполковник', 'майор',
  'капітан першого рангу', 'капітан другого рангу', 'капітан третього рангу',
  'старший лейтенант', 'лейтенант', 'молодший лейтенант',
  'старший прапорщик', 'прапорщик',
  'старшина', 'старший сержант', 'сержант', 'молодший сержант', 'капрал',
  'старший солдат', 'солдат', 'рядовий', 'матрос',
  // рос
  'подполковник', 'полковник', 'майор', 'капитан', 'лейтенант',
  'старший лейтенант', 'прапорщик', 'сержант', 'рядовой',
]
const RANKS_RE = new RegExp(
  `(${RANKS.sort((a, b) => b.length - a.length).map(r => r.replace(/[-]/g, '[-\\s]')).join('|')})`,
  'i'
)

// ─── Посади ────────────────────────────────────────────────────────────────
const POSITIONS_RE = /(командир(?:\s+(?:батальйону|роти|взводу|бригади|дивізії|полку|загону|з'єднання|підрозділу))?|начальник(?:\s+штабу)?|заступник\s+командира|начальник\s+відділу|офіцер(?:\s+\w+)?|старший\s+офіцер|оперуповноважений|слідчий|прокурор|суддя)/i

// ─── Дата народження ───────────────────────────────────────────────────────
const DOB_RE = /(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}|\d{4})\s*р\.?\s*н\.?|р\.?\s*н\.?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}|\d{4})|народжен\w*\s+(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}|\d{4})/i

// ─── Підрозділи ────────────────────────────────────────────────────────────
const UNIT_RE = /(\d+(?:-й|-а|-е|-го|-ша)?\s+(?:окрема\s+)?(?:механізована|танкова|аеромобільна|десантно-штурмова|гірсько-піхотна|піхотна|артилерійська|зенітна|інженерна|розвідувальна)?\s*(?:бригада|батальйон|рота|полк|дивізія|корпус|армія|загін|група|рота|підрозділ))/i

function unique<T>(arr: T[], key?: (v: T) => string): T[] {
  if (!key) return [...new Set(arr)]
  const seen = new Set<string>()
  return arr.filter(v => { const k = key(v); if (seen.has(k)) return false; seen.add(k); return true })
}

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, '')
  if (digits.startsWith('380')) return '0' + digits.slice(3)
  if (digits.startsWith('38'))  return '0' + digits.slice(2)
  return digits.startsWith('0') ? digits : '0' + digits
}

// Витягуємо контекст (±300 символів навколо знайденого імені)
function extractContext(text: string, nameStart: number, nameEnd: number): PersonContext & { name: string } {
  const ctx = text.slice(Math.max(0, nameStart - 300), Math.min(text.length, nameEnd + 300))
  const name = text.slice(nameStart, nameEnd).trim()

  const dobMatch = ctx.match(DOB_RE)
  let dob: string | undefined
  if (dobMatch) {
    dob = (dobMatch[1] || dobMatch[2] || dobMatch[3] || '').trim()
    // Нормалізуємо розділювач
    dob = dob.replace(/[\/\-]/g, '.')
  }

  const rankMatch = ctx.match(RANKS_RE)
  const rank = rankMatch ? rankMatch[1].trim() : undefined

  const posMatch = ctx.match(POSITIONS_RE)
  const position = posMatch ? posMatch[1].trim() : undefined

  const unitMatch = ctx.match(UNIT_RE)
  const unit = unitMatch ? unitMatch[1].trim() : undefined

  return { name, dob, rank, position, unit }
}

export function extractEntities(text: string): Entities {
  const phones = unique(
    (text.match(new RegExp(R.phone.source, 'g')) || []).map(normalizePhone).filter(p => p.length === 10)
  )

  const ipnRaw = (text.match(new RegExp(R.ipn.source, 'g')) || [])
  const ipn = unique(ipnRaw.filter(n => n.length === 10 && !n.startsWith('0')))

  const crypto: CryptoAddr[] = []
  for (const a of text.match(new RegExp(R.btc.source, 'gi')) || [])
    crypto.push({ address: a, type: 'BTC' })
  for (const a of text.match(new RegExp(R.eth.source, 'gi')) || [])
    crypto.push({ address: a, type: a.toLowerCase().startsWith('0x') ? 'ETH' : 'USDT_ERC20' })
  for (const a of text.match(new RegExp(R.trc.source, 'g')) || [])
    crypto.push({ address: a, type: 'USDT_TRC20' })

  const vehicles = unique(
    (text.match(new RegExp(R.vehicle.source, 'gi')) || [])
      .map(v => v.toUpperCase().replace(/[\s-]/g, ''))
  )

  // ПІБ з контекстом — шукаємо позиції кожного імені
  const STOP = new Set(['Суд', 'Орган', 'Відділ', 'Управління', 'Служба'])
  const nameRe = new RegExp(R.name.source, 'g')
  const personsMap = new Map<string, PersonContext>()

  let m: RegExpExecArray | null
  while ((m = nameRe.exec(text)) !== null) {
    const fullMatch = m[0]
    // Capture group 1 is the actual name (without leading boundary char)
    const nameStr = m[1] ?? fullMatch.trim()
    if (!nameStr || nameStr.length <= 8) continue
    if (STOP.has(nameStr.split(' ')[0])) continue

    const nameStart = m.index + (fullMatch.length - nameStr.length)
    const nameEnd   = nameStart + nameStr.length
    const ctx = extractContext(text, nameStart, nameEnd)

    // Зберігаємо найбагатший контекст (перший збіг або якщо новий має більше даних)
    const existing = personsMap.get(nameStr)
    if (!existing || (!existing.dob && ctx.dob) || (!existing.rank && ctx.rank)) {
      personsMap.set(nameStr, ctx)
    }
  }

  const persons = [...personsMap.values()].slice(0, 60)
  const names   = persons.map(p => p.name)

  return {
    names,
    persons,
    phones:   phones.slice(0, 50),
    ipn:      ipn.slice(0, 30),
    crypto:   unique(crypto, c => c.address).slice(0, 30),
    vehicles: vehicles.slice(0, 30),
  }
}

// ─── Crypto Risk Score 0-100 ──────────────────────────────────────────────
export function cryptoRiskScore(entities: Entities): number {
  const { crypto } = entities
  if (crypto.length === 0) return 0
  let score = Math.min(crypto.length * 18, 54)
  const types = new Set(crypto.map(c => c.type))
  if (types.size >= 2) score += 20
  if (crypto.length >= 3) score += 15
  if (entities.phones.length > 0) score += 5
  return Math.min(Math.round(score), 100)
}

export function riskLabel(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' {
  if (score >= 80) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 20) return 'MEDIUM'
  if (score > 0)  return 'LOW'
  return 'NONE'
}
