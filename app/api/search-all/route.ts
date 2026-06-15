// app/api/search-all/route.ts
// Universal OSINT search — SSE streaming, паралельний пошук по всіх джерелах
// POST /api/search-all  body: { query }
// Streams: data: {"source":"odb","status":"done","data":{...}}\n\n

import { NextRequest } from 'next/server'
import { parseSearchQuery }      from '../../../lib/search/query-parser'
import { generateNameVariants }  from '../../../lib/search/name-normalizer'
import { scoreResult }           from '../../../lib/search/relevance-scorer'

// VPS access через nginx HTTPS proxy (UFW блокує прямі порти)
const VPS_BASE = (process.env.VPS_URL ?? 'https://evidencebases.com/odb-api')
  .replace(/\/+$/, '')  // strip trailing slash

const VPS_ROUTES = {
  presence:     `${VPS_BASE}/presence`,
  telethon:     `${VPS_BASE}/telethon`,
  social:       `${VPS_BASE}/social-vps`,
  registries:   `${VPS_BASE}/regs`,
  orchestrator: `${VPS_BASE}`,
} as const

// Таймаути (ms) — Vercel Hobby: 60s загалом, кожне джерело паралельно
const SOURCE_TIMEOUTS: Record<string, number> = {
  odb:           5_000,
  telegram:      7_000,
  sherlock:      7_000,
  chimera:       7_000,
  leaks:         7_000,
  breach_catalog:5_000,
  nazk:          8_000,
  mvs:           8_000,
  myrotvorets:   7_000,
  erb:           8_000,
  company:       7_000,
  network:       7_000,
  spiderfoot:    7_000,
  web:           7_000,
  sanctions:     8_000,
  vk:            8_000,
  getcontact:    7_000,
  phone_presence:15_000,
  yandex:        7_000,
  vehicles:      7_000,
}

// Backward-compat alias (використовується у makeSafeFetch)
const VPS_URL = VPS_BASE
// Fallback direct (local dev only)
const VPS_DIRECT = `http://${process.env.VPS_HOST ?? '161.35.86.145'}:${process.env.TELEGRAM_SEARCH_PORT ?? '8001'}`

// На Vercel немає localhost — використовуємо VERCEL_URL (авто-інжектується) або APP_URL
function getBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
const LOCAL = getBaseUrl()

// ── Транслітерація UA/RU → RU для ботів ──────────────────────────────────────
// Більшість OSINT-ботів краще шукають по-російськи
function toRussian(text: string): string {
  const UA_TO_RU: Record<string, string> = {
    'і': 'и', 'І': 'И', 'ї': 'и', 'Ї': 'И',
    'є': 'е', 'Є': 'Е', 'ґ': 'г', 'Ґ': 'Г',
    'и': 'и', 'й': 'й',
  }
  return text.split('').map(c => UA_TO_RU[c] ?? c).join('')
}

// Detect input type — підтримка Ukrainian + Russian форматів
function detectType(q: string): string {
  const clean = q.replace(/[\s\-\(\)\+]/g, '')

  // ── Телефон із явним + ────────────────────────────────────────────────────
  if (q.trimStart().startsWith('+') && /^\d{10,15}$/.test(clean)) return 'phone'

  // ── Українські/міжнародні телефони БЕЗ + (пріоритет перед документами) ───
  // 380XXXXXXXXX = UA, 7XXXXXXXXXX = RU (11 цифр починається з 7)
  if (/^380\d{9}$/.test(clean)) return 'phone'        // UA без +
  if (/^7\d{10}$/.test(clean))  return 'phone'        // RU без +

  // ── Документи та реєстри ─────────────────────────────────────────────────
  if (/^\d{8}$/.test(clean))  return 'edrpou'
  if (/^\d{10}$/.test(clean)) return 'inn'
  if (/^\d{11}$/.test(clean)) return 'snils'
  if (/^\d{12}$/.test(clean)) return 'rinn'
  if (/^\d{13}$/.test(clean)) return 'ogrn'
  if (/^\d{15}$/.test(clean)) return 'ogrnip'

  // ── Інші телефони ────────────────────────────────────────────────────────
  if (/^\+?\d{10,15}$/.test(clean)) return 'phone'

  // ── Мережа ───────────────────────────────────────────────────────────────
  if (/@/.test(q))            return 'email'
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(q)) return 'ip'
  if (/^[a-z0-9][a-z0-9\-]*\.[a-z]{2,}/i.test(q) && !q.includes(' ')) return 'domain'

  // ── Автомобільні номери ──────────────────────────────────────────────────
  // Рос. формат: А123ВС77 / В395ОК199 (кирилиця + цифри)
  if (/^[А-ЯЁ]\d{3}[А-ЯЁ]{2}\d{2,3}$/i.test(q)) return 'plate_ru'
  // Укр. формат: AA1234BB / AА 1234 ВВ
  if (/^[А-ЯA-Z]{2}\s?\d{4}\s?[А-ЯA-Z]{2}$/i.test(q)) return 'plate_ua'
  // VIN: 17 символів
  if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(q)) return 'vin'

  // ── Username (латиниця, без пробілів) ────────────────────────────────────
  if (/^[a-z0-9_\.]{3,32}$/i.test(q) && !q.includes(' ')) return 'username'

  // ── VK посилання ─────────────────────────────────────────────────────────
  if (/^(https?:\/\/)?(vk\.com|vkontakte\.ru)\//i.test(q)) return 'vk_url'

  // ── Telegram ─────────────────────────────────────────────────────────────
  if (/^@[a-z0-9_]{4,32}$/i.test(q)) return 'tg_username'

  return 'name'
}

// Helper factory — передає cookie користувача для авторизації внутрішніх викликів
function makeSafeFetch(cookieHeader: string) {
  return async function safeFetch(url: string, opts: RequestInit = {}, timeoutMs = 7000): Promise<any> {
    try {
      const headers: Record<string, string> = {
        ...(opts.headers as Record<string, string> || {}),
      }
      // Передаємо cookie лише для внутрішніх (LOCAL) викликів
      if (cookieHeader && url.startsWith(LOCAL)) {
        headers['cookie'] = cookieHeader
      }
      const res = await fetch(url, { ...opts, headers, signal: AbortSignal.timeout(timeoutMs) })
      return await res.json()
    } catch { return null }
  }
}

// ── Rate limiting (in-memory, per Vercel lambda instance) ────────────────────
// 20 запитів/хв на IP — захист від abuse
const RL_WINDOW = 60_000  // 1 хвилина
const RL_MAX    = 20
const rlMap     = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfter: number } {
  const now    = Date.now()
  const bucket = rlMap.get(ip)

  if (!bucket || now >= bucket.resetAt) {
    rlMap.set(ip, { count: 1, resetAt: now + RL_WINDOW })
    return { allowed: true, remaining: RL_MAX - 1, retryAfter: 0 }
  }

  if (bucket.count >= RL_MAX) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) }
  }

  bucket.count++
  return { allowed: true, remaining: RL_MAX - bucket.count, retryAfter: 0 }
}

export async function POST(req: NextRequest) {
  // ── Rate limit check ──────────────────────────────────────────────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || req.headers.get('x-real-ip')
            || 'unknown'

  if (ip !== 'unknown') {
    const { allowed, remaining, retryAfter } = checkRateLimit(ip)
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: `Занадто багато запитів. Спробуйте через ${retryAfter}с.` }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(RL_MAX),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }
  }

  const body  = await req.json()
  const { query, user_id, user_email } = body
  if (!query?.trim()) {
    return new Response(JSON.stringify({ error: 'query required' }), { status: 400 })
  }

  const q       = query.trim()
  const type    = detectType(q)
  const startTs = Date.now()

  // ── Парсинг запиту через lib/search/query-parser ─────────────────────────
  const parsed       = parseSearchQuery(q)
  const nameVariants = generateNameVariants(parsed)
  const cleanName    = parsed.fullName || q        // ПІБ без дати народження
  const extractedDob = parsed.dob ?? ''            // ISO або ''
  const querySurname = parsed.lastName.toLowerCase()

  // VPS body — передається всім VPS джерелам
  const vpsNameBody = {
    name:         parsed.fullName,
    nameVariants: nameVariants.allVariants,
    firstName:    parsed.firstName,
    lastName:     parsed.lastName,
    dob:          parsed.dob,
    dobYear:      parsed.dobYear,
  }

  // Cookie forwarding — передаємо сесію для авторизації внутрішніх API викликів
  const cookieHeader = req.headers.get('cookie') || ''
  const safeFetch = makeSafeFetch(cookieHeader)

  // Extract request metadata for logging
  const ip_address =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  const user_agent = req.headers.get('user-agent') || ''

  const encoder     = new TextEncoder()
  const stream      = new TransformStream()
  const writer      = stream.writable.getWriter()
  // AbortController per source — memory leak prevention on Vercel
  const controllers = new Map<string, AbortController>()

  function makeSignal(source: string): AbortSignal {
    const ac = new AbortController()
    controllers.set(source, ac)
    return ac.signal
  }

  function clearController(source: string) {
    controllers.get(source)?.abort()
    controllers.delete(source)
  }

  function clearAllControllers() {
    for (const ac of controllers.values()) ac.abort()
    controllers.clear()
  }

  function send(
    source: string,
    status: 'loading' | 'done' | 'error',
    data: Record<string, unknown> | null = null,
    extra?: { count?: number; totalFound?: number; durationMs?: number },
  ) {
    const msg = JSON.stringify({
      source, status, data, type,
      ...(extra ?? {}),
    })
    writer.write(encoder.encode(`data: ${msg}\n\n`))
  }

  // Build search tasks based on type
  async function runAll() {
    const tasks: Promise<void>[] = []

    // ── 1. ODB persons DB ─────────────────────────────────────────────────────
    tasks.push((async () => {
      send('odb', 'loading')
      const params = new URLSearchParams({ limit: '20' })
      if (type === 'phone')    params.set('phone', q)
      else if (type === 'inn') params.set('ipn', q)
      else                     params.set('q', cleanName)  // cleanName без ДН
      const d = await safeFetch(`${LOCAL}/api/persons?${params}`, {}, 7000)
      if (d && d.data !== undefined) {
        send('odb', 'done', { persons: d.data, total: d.total || d.data?.length || 0 })
      } else {
        send('odb', d ? 'done' : 'error', d)
      }
    })())

    // ── 2. Telegram MTProto пошук ─────────────────────────────────────────────
    if (['phone', 'username', 'name'].includes(type)) {
      tasks.push((async () => {
        send('telegram', 'loading')
        let d: any = null
        if (type === 'phone') {
          d = await safeFetch(`${LOCAL}/api/osint/telegram-phone/direct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: q }),
          }, 7000)
        } else {
          d = await safeFetch(`${VPS_ROUTES.telethon}/search/tg-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...vpsNameBody, limit: 5 }),
          }, SOURCE_TIMEOUTS.telegram)
        }
        send('telegram', d ? 'done' : 'error', d)
      })())
    }

    // ── 2b. Telegram LEAK BOTS — async, фронтенд запускає окремо ─────────────
    if (['name', 'phone'].includes(type)) {
      send('tg_bots', 'done', {
        async:          true,
        endpoint:       `${VPS_ROUTES.presence}/search`,
        query:          toRussian(cleanName),
        query_original: cleanName,
        nameVariants:   nameVariants.allVariants,
        dob:            parsed.dob,
        dobYear:        parsed.dobYear,
        message:        'Натисніть "Перевірити боти" для пошуку через Telegram боти (~40с)',
      })
    }

    // ── 3. Sherlock — ТІЛЬКИ для username/email, не для ПІБ ──────────────────
    if (['username', 'email'].includes(type)) {
      tasks.push((async () => {
        send('sherlock', 'loading')
        const uname = type === 'email' ? q.split('@')[0] : q
        const d = await safeFetch(`${LOCAL}/api/osint/sherlock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: uname, timeout: 12, mode: 'quick' }),
        }, 7000)
        send('sherlock', d ? 'done' : 'error', d)
      })())
    }

    // ── 4. Chimera — ТІЛЬКИ для username, не для ПІБ ─────────────────────────
    if (type === 'username') {
      tasks.push((async () => {
        send('chimera', 'loading')
        const d = await safeFetch(`${LOCAL}/api/osint/chimera`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: q, timeout: 20 }),
        }, 7000)
        send('chimera', d ? 'done' : 'error', d)
      })())
    }

    // ── 5. Витоки (Leaks + Breach catalog) ───────────────────────────────────
    if (['phone', 'email', 'inn', 'snils', 'name', 'username'].includes(type)) {
      tasks.push((async () => {
        send('leaks', 'loading')
        const d = await safeFetch(`${LOCAL}/api/breach/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: type === 'name' ? cleanName : q }),
        }, 7000)
        // ── Relevance-фільтр: відсікаємо шлак за прізвищем (OsintKit/LeakOsint
        //    повертають записи по фрагменту імені — «Макар» замість «Макарійчук»)
        if (type === 'name' && parsed.lastName.length >= 4 && d?.sources) {
          let kept = 0
          for (const src of Object.values(d.sources as Record<string, any>)) {
            if (Array.isArray(src?.entries)) {
              src.entries = src.entries.filter((e: Record<string, unknown>) => {
                const hasName = e.name || e.full_name || e.fio
                if (!hasName) return true                 // знайдено по телефону/email — лишаємо
                return scoreResult(e, parsed, 'leaks') > 0 // інакше — лише релевантні за прізвищем/ДН
              })
              src.total = src.entries.length
              kept += src.entries.length
            }
          }
          if (typeof d.total === 'number') d.total = kept
        }
        send('leaks', d ? 'done' : 'error', d)
      })())
    }

    // ── 6. Breach catalog (known-breaches) ───────────────────────────────────
    if (['domain', 'username', 'name'].includes(type)) {
      tasks.push((async () => {
        send('breach_catalog', 'loading')
        const qterm = type === 'domain' ? q.split('.')[0] : cleanName.split(' ')[0]
        const d = await safeFetch(`${LOCAL}/api/breach/catalog?q=${encodeURIComponent(qterm)}&limit=10`, {}, 7000)
        send('breach_catalog', d ? 'done' : 'error', d)
      })())
    }

    // ── 7. НАЗК декларації — cleanName без дати народження ───────────────────
    if (type === 'name') {
      tasks.push((async () => {
        send('nazk', 'loading')
        const d = await safeFetch(`${LOCAL}/api/nazk/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: cleanName }),  // БЕЗ дати
        }, 7000)
        send('nazk', d ? 'done' : 'error', d)
      })())
    }

    // ── 8. МВС розшук — cleanName без ДН ────────────────────────────────────
    if (type === 'name') {
      tasks.push((async () => {
        send('mvs', 'loading')
        const d = await safeFetch(`${LOCAL}/api/mvs/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: cleanName }),
        }, 7000)
        send('mvs', d ? 'done' : 'error', d)
      })())
    }

    // ── 9. Миротворець — cleanName без ДН ────────────────────────────────────
    if (type === 'name') {
      tasks.push((async () => {
        send('myrotvorets', 'loading')
        const d = await safeFetch(`${LOCAL}/api/myrotvorets/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: cleanName }),
        }, 7000)
        send('myrotvorets', d ? 'done' : 'error', d)
      })())
    }

    // ── 10. ЄРБ боржники — cleanName без ДН ──────────────────────────────────
    if (['name', 'inn'].includes(type)) {
      tasks.push((async () => {
        send('erb', 'loading')
        const d = await safeFetch(`${LOCAL}/api/erb/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: type === 'name' ? cleanName : q }),
        }, 7000)
        send('erb', d ? 'done' : 'error', d)
      })())
    }

    // ── 11. Бізнес-розвідка — cleanName без ДН ───────────────────────────────
    if (['name', 'edrpou', 'inn'].includes(type)) {
      tasks.push((async () => {
        send('company', 'loading')
        const d = await safeFetch(`${LOCAL}/api/company/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: type === 'name' ? cleanName : q }),
        }, 7000)
        send('company', d ? 'done' : 'error', d)
      })())
    }

    // ── 12. Network Intel (IP / Domain) ───────────────────────────────────────
    if (['ip', 'domain'].includes(type)) {
      tasks.push((async () => {
        send('network', 'loading')
        const d = await safeFetch(`${LOCAL}/api/shodan/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, type }),
        }, 7000)
        send('network', d ? 'done' : 'error', d)
      })())
    }

    // ── 13. SpiderFoot (для складних цілей) ──────────────────────────────────
    if (['email', 'domain', 'ip', 'name', 'phone'].includes(type)) {
      tasks.push((async () => {
        send('spiderfoot', 'loading')
        const d = await safeFetch(`${LOCAL}/api/spiderfoot/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: q, scan_type: 'quick' }),
        }, 7000)
        send('spiderfoot', d ? 'done' : 'error', d)
      })())
    }

    // ── 14. Web search (Tavily) — для name передаємо повний q (з ДН для кращого результату)
    tasks.push((async () => {
      send('web', 'loading')
      const d = await safeFetch(`${LOCAL}/api/web/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, type }),  // Повний q — дата допомагає Web пошуку
      }, 7000)
      send('web', d ? 'done' : 'error', d)
    })())

    // ── 15. OpenSanctions (OFAC + EU + UN + РНБО) ───────────────────────────
    if (['name', 'inn', 'rinn', 'ogrn', 'ogrnip', 'phone', 'email'].includes(type)) {
      tasks.push((async () => {
        send('sanctions', 'loading')
        const d = await safeFetch(`${LOCAL}/api/sanctions/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: type === 'name' ? cleanName : q, type }),
        }, 7000)
        // Фільтруємо результати: прізвище запиту ОБОВ'ЯЗКОВО присутнє в імені результату
        if (d && Array.isArray(d.entries) && type === 'name' && querySurname.length >= 3) {
          d.entries = d.entries.filter((e: any) => {
            const names = [e.name, ...(e.aliases || [])].join(' ').toLowerCase()
            return names.includes(querySurname)
          })
          d.total = d.entries.length
        }
        send('sanctions', d ? 'done' : 'error', d)
      })())
    }

    // ── 16. VK пошук (критично для росіян) ───────────────────────────────────
    // VK заблокований в Україні — запит йде через VPS (Нідерланди)
    if (['name', 'username', 'phone', 'vk_url'].includes(type)) {
      tasks.push((async () => {
        send('vk', 'loading')
        // VPS через nginx HTTPS proxy → :8008 (прямий порт заблокований UFW)
        let d = await safeFetch(`${VPS_URL}/telethon/vk/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, type }),
        }, 7000)
        // Fallback через /api/vk/search (якщо VPS 8008 недоступний)
        if (!d) {
          d = await safeFetch(`${LOCAL}/api/vk/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, type }),
          }, 7000)
        }
        send('vk', d ? 'done' : 'error', d)
      })())
    }

    // ── 17. Getcontact (хто зберіг номер телефону) ────────────────────────────
    if (type === 'phone') {
      tasks.push((async () => {
        send('getcontact', 'loading')
        const d = await safeFetch(`${LOCAL}/api/getcontact/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        }, 7000)
        send('getcontact', d ? 'done' : 'error', d)
      })())
    }

    // ── 17b. Месенджери — WhatsApp/Viber/Telegram/Signal по номеру ──────────────
    if (type === 'phone') {
      tasks.push((async () => {
        send('phone_presence', 'loading')
        const d = await safeFetch(`${LOCAL}/api/phone-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: q }),
        }, 25000)
        send('phone_presence', d ? 'done' : 'error', d)
      })())
    }

    // ── 17c. Username/соцмережі пошук ───────────────────────────────────────────
    if (type === 'username') {
      tasks.push((async () => {
        send('social', 'loading')
        const d = await safeFetch(`${VPS_URL}/social-vps/social/username`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: q }),
        }, 15000)
        send('social', d ? 'done' : 'error', d)
      })())
    }

    // ── 17d. Instagram пошук по username (з web результатів) ─────────────────
    // Якщо в web результатах знайдено Instagram посилання — перевіряємо профіль
    // (запускається паралельно з іншими, результат додається до social секції)

    // ── 18. Авто/VIN пошук ─────────────────────────────────────────────────────
    if (['plate_ru', 'plate_ua', 'vin'].includes(type)) {
      tasks.push((async () => {
        send('vehicles', 'loading')
        const d = await safeFetch(`${LOCAL}/api/osint/vehicles/direct`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, type }),
        }, 7000)
        send('vehicles', d ? 'done' : 'error', d)
      })())
    }

    // ── 19. Yandex пошук (краще для рос. контенту) ───────────────────────────
    if (['name', 'phone', 'email', 'username', 'plate_ru', 'ogrn', 'rinn'].includes(type)) {
      tasks.push((async () => {
        send('yandex', 'loading')
        const yQuery = type === 'plate_ru' ? `номер автомобиля ${q}` : q
        const d = await safeFetch(`${LOCAL}/api/web/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: yQuery, type, engine: 'yandex' }),
        }, 7000)
        send('yandex', d ? 'done' : 'error', d)
      })())
    }

    await Promise.allSettled(tasks)
    clearAllControllers()

    // Done signal
    writer.write(encoder.encode(`data: ${JSON.stringify({
      source: '__done__', status: 'done', type,
      durationMs: Date.now() - startTs,
      parsedQuery: {
        fullName: parsed.fullName,
        dob:      parsed.dob,
        dobYear:  parsed.dobYear,
        phones:   parsed.phones,
      },
    })}\n\n`))
    writer.close()

    // Log activity (fire-and-forget, non-blocking)
    fetch(`${LOCAL}/api/activity/log`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-forwarded-for': ip_address,
        'user-agent':    user_agent,
      },
      body: JSON.stringify({
        user_id,
        user_email,
        action:       'search',
        query:        q,
        query_type:   type,
        result_count: 0, // populated after stream ends
        duration_ms:  Date.now() - startTs,
      }),
    }).catch(() => {})
  }

  runAll().catch(() => { clearAllControllers(); writer.close() })

  return new Response(stream.readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
