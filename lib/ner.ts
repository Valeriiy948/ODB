// lib/ner.ts — Named Entity Recognition (regex-based NER engine)
// Витягує: ПІБ, телефони, ІПН, крипто-гаманці, номери авто

export interface CryptoAddr { address: string; type: 'BTC' | 'ETH' | 'USDT_TRC20' | 'USDT_ERC20' }

export interface Entities {
  names:    string[]
  phones:   string[]
  ipn:      string[]
  crypto:   CryptoAddr[]
  vehicles: string[]
}

// ─── Регулярки ─────────────────────────────────────────────────────────────
const R = {
  // Телефони: +380XXXXXXXXX, 0XXXXXXXXX, (0XX)XXXXXXX
  phone: /(?:\+?38)?0\d{9}|(?:\+?38)?\(0\d{2,3}\)[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g,

  // ІПН — 10 цифр (перевіряємо що не частина довшого числа)
  ipn: /(?<!\d)\d{10}(?!\d)/g,

  // Bitcoin: Legacy (1...), SegWit P2SH (3...), Native SegWit (bc1...)
  btc: /\b(?:1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,39})\b/gi,

  // Ethereum / ERC-20
  eth: /\b0x[a-fA-F0-9]{40}\b/gi,

  // Tron / USDT TRC-20
  trc: /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g,

  // Українські номерні знаки: АА 0000 АА  або АА0000АА
  vehicle: /\b[А-ЯЁІЇЄA-Z]{2}[\s-]?\d{4}[\s-]?[А-ЯЁІЇЄA-Z]{2}\b/gi,

  // ПІБ: три слова з великої літери (кирилиця або латиниця)
  // NOTE: \b не працює з кирилицею в JS — використовуємо (?:^|[\s,;.([\-]) як межу
  name: /(?:^|(?<=[\s,;.([\-]))([А-ЯІЇЄЁA-Z][а-яіїєёa-z']{1,20}\s+[А-ЯІЇЄЁA-Z][а-яіїєёa-z']{1,20}\s+[А-ЯІЇЄЁA-Z][а-яіїєёa-z']{1,20}(?:а|ич|івна|овна|evich|ovna)?)(?=[\s,;.)\]}\n]|$)/g,
}

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

export function extractEntities(text: string): Entities {
  // reset lastIndex after each global regex
  const phones = unique(
    (text.match(new RegExp(R.phone.source, 'g')) || []).map(normalizePhone).filter(p => p.length === 10)
  )

  const ipnRaw = (text.match(new RegExp(R.ipn.source, 'g')) || [])
  // Фільтруємо: ІПН не може починатися з 0, має бути рівно 10 цифр
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

  // ПІБ: фільтруємо стоп-слова та занадто короткі
  const STOP = new Set(['Суд', 'Орган', 'Відділ', 'Управління', 'Служба'])
  const names = unique(
    (text.match(new RegExp(R.name.source, 'g')) || [])
      .filter(n => !STOP.has(n.split(' ')[0]) && n.length > 8)
  ).slice(0, 60)

  return {
    names,
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
  let score = Math.min(crypto.length * 18, 54)          // кожен гаманець +18, max 54
  const types = new Set(crypto.map(c => c.type))
  if (types.size >= 2) score += 20                      // різні блокчейни → можливий міксер
  if (crypto.length >= 3) score += 15                   // 3+ гаманці → підозрілий патерн
  if (entities.phones.length > 0) score += 5            // телефони + крипто
  return Math.min(Math.round(score), 100)
}

export function riskLabel(score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' {
  if (score >= 80) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 20) return 'MEDIUM'
  if (score > 0)  return 'LOW'
  return 'NONE'
}
