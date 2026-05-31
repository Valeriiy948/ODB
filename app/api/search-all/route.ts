// app/api/search-all/route.ts
// Universal OSINT search — SSE streaming, паралельний пошук по всіх джерелах
// POST /api/search-all  body: { query }
// Streams: data: {"source":"odb","status":"done","data":{...}}\n\n

import { NextRequest } from 'next/server'

const VPS   = `http://${process.env.VPS_HOST || '161.35.86.145'}:${process.env.TELEGRAM_SEARCH_PORT || '8001'}`
const LOCAL = 'http://localhost:3000'

// Detect input type — підтримка Ukrainian + Russian форматів
function detectType(q: string): string {
  const clean = q.replace(/[\s\-\(\)\+]/g, '')

  // ── Телефон із явним + (пріоритет над СНІЛС/РІНН) ────────────────────────
  if (q.trimStart().startsWith('+') && /^\d{10,15}$/.test(clean)) return 'phone'

  // ── Документи та реєстри ─────────────────────────────────────────────────
  if (/^\d{8}$/.test(clean))  return 'edrpou'       // ЄДРПОУ (укр. компанія)
  if (/^\d{10}$/.test(clean)) return 'inn'           // ІПН (укр.) / ІПН компанії (рос.)
  if (/^\d{11}$/.test(clean)) return 'snils'         // СНІЛС (рос.)
  if (/^\d{12}$/.test(clean)) return 'rinn'          // ІПН фіз. особи (рос. 12 цифр)
  if (/^\d{13}$/.test(clean)) return 'ogrn'          // ОГРН (рос. юр. особа)
  if (/^\d{15}$/.test(clean)) return 'ogrnip'        // ОГРНІП (рос. ФОП)

  // ── Телефони ─────────────────────────────────────────────────────────────
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

// Helper: fetch with timeout, never throws
async function safeFetch(url: string, opts: RequestInit = {}, timeoutMs = 25000): Promise<any> {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) })
    return await res.json()
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const body  = await req.json()
  const { query, user_id, user_email } = body
  if (!query?.trim()) {
    return new Response(JSON.stringify({ error: 'query required' }), { status: 400 })
  }

  const q       = query.trim()
  const type    = detectType(q)
  const startTs = Date.now()

  // Extract request metadata for logging
  const ip_address =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  const user_agent = req.headers.get('user-agent') || ''

  const encoder = new TextEncoder()
  const stream  = new TransformStream()
  const writer  = stream.writable.getWriter()

  function send(source: string, status: 'loading' | 'done' | 'error', data: any = null) {
    const msg = JSON.stringify({ source, status, data, type })
    writer.write(encoder.encode(`data: ${msg}\n\n`))
  }

  // Build search tasks based on type
  async function runAll() {
    const tasks: Promise<void>[] = []

    // ── 1. ODB persons DB ─────────────────────────────────────────────────────
    tasks.push((async () => {
      send('odb', 'loading')
      // Use GET /api/persons with query params (supports q, phone, ipn)
      const params = new URLSearchParams({ limit: '20' })
      if (type === 'phone')    params.set('phone', q)
      else if (type === 'inn') params.set('ipn', q)
      else                     params.set('q', q)
      const d = await safeFetch(`${LOCAL}/api/persons?${params}`, {}, 15000)
      // Normalize response shape for countHits
      if (d && d.data !== undefined) {
        send('odb', 'done', { persons: d.data, total: d.total || d.data?.length || 0 })
      } else {
        send('odb', d ? 'done' : 'error', d)
      }
    })())

    // ── 2. Telegram ───────────────────────────────────────────────────────────
    if (['phone', 'username', 'name'].includes(type)) {
      tasks.push((async () => {
        send('telegram', 'loading')
        let d: any = null
        if (type === 'phone') {
          d = await safeFetch(`${LOCAL}/api/osint/telegram-phone/direct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: q }),
          }, 15000)
        } else {
          // Use fast MTProto search (no bot waiting)
          d = await safeFetch(`${VPS}/search/tg-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: q, limit: 5 }),
          }, 10000)
        }
        send('telegram', d ? 'done' : 'error', d)
      })())
    }

    // ── 3. Sherlock ───────────────────────────────────────────────────────────
    if (['username', 'name', 'email'].includes(type)) {
      tasks.push((async () => {
        send('sherlock', 'loading')
        const uname = type === 'email' ? q.split('@')[0] : q.split(' ')[0]
        const d = await safeFetch(`${LOCAL}/api/osint/sherlock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: uname, timeout: 12, mode: 'quick' }),
        }, 40000)
        send('sherlock', d ? 'done' : 'error', d)
      })())
    }

    // ── 4. Chimera (Maigret) ──────────────────────────────────────────────────
    if (['username', 'name'].includes(type)) {
      tasks.push((async () => {
        send('chimera', 'loading')
        const uname = q.split(' ')[0]
        const d = await safeFetch(`${LOCAL}/api/osint/chimera`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: uname, timeout: 20 }),
        }, 50000)
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
          body: JSON.stringify({ query: q }),
        }, 20000)
        send('leaks', d ? 'done' : 'error', d)
      })())
    }

    // ── 6. Breach catalog (known-breaches) ───────────────────────────────────
    if (['domain', 'username', 'name'].includes(type)) {
      tasks.push((async () => {
        send('breach_catalog', 'loading')
        const qterm = type === 'domain' ? q.split('.')[0] : q.split(' ')[0]
        const d = await safeFetch(`${LOCAL}/api/breach/catalog?q=${encodeURIComponent(qterm)}&limit=10`, {}, 10000)
        send('breach_catalog', d ? 'done' : 'error', d)
      })())
    }

    // ── 7. НАЗК декларації ────────────────────────────────────────────────────
    if (type === 'name') {
      tasks.push((async () => {
        send('nazk', 'loading')
        const d = await safeFetch(`${LOCAL}/api/nazk/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        }, 15000)
        send('nazk', d ? 'done' : 'error', d)
      })())
    }

    // ── 8. МВС розшук ────────────────────────────────────────────────────────
    if (type === 'name') {
      tasks.push((async () => {
        send('mvs', 'loading')
        const d = await safeFetch(`${LOCAL}/api/mvs/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        }, 12000)
        send('mvs', d ? 'done' : 'error', d)
      })())
    }

    // ── 9. Миротворець ────────────────────────────────────────────────────────
    if (type === 'name') {
      tasks.push((async () => {
        send('myrotvorets', 'loading')
        const d = await safeFetch(`${LOCAL}/api/myrotvorets/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        }, 12000)
        send('myrotvorets', d ? 'done' : 'error', d)
      })())
    }

    // ── 10. ЄРБ боржники ─────────────────────────────────────────────────────
    if (['name', 'inn'].includes(type)) {
      tasks.push((async () => {
        send('erb', 'loading')
        const d = await safeFetch(`${LOCAL}/api/erb/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        }, 12000)
        send('erb', d ? 'done' : 'error', d)
      })())
    }

    // ── 11. Бізнес-розвідка ───────────────────────────────────────────────────
    if (['name', 'edrpou', 'inn'].includes(type)) {
      tasks.push((async () => {
        send('company', 'loading')
        const d = await safeFetch(`${LOCAL}/api/company/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        }, 20000)
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
        }, 20000)
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
        }, 30000)
        send('spiderfoot', d ? 'done' : 'error', d)
      })())
    }

    // ── 14. Web search (Tavily — всі типи) ───────────────────────────────────
    tasks.push((async () => {
      send('web', 'loading')
      const d = await safeFetch(`${LOCAL}/api/web/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, type }),
      }, 20000)
      send('web', d ? 'done' : 'error', d)
    })())

    // ── 15. OpenSanctions (OFAC + EU + UN + РНБО) — для всіх імен та документів
    if (['name', 'inn', 'rinn', 'ogrn', 'ogrnip', 'phone', 'email'].includes(type)) {
      tasks.push((async () => {
        send('sanctions', 'loading')
        const d = await safeFetch(`${LOCAL}/api/sanctions/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, type }),
        }, 20000)
        send('sanctions', d ? 'done' : 'error', d)
      })())
    }

    // ── 16. VK пошук (критично для росіян) ───────────────────────────────────
    // VK заблокований в Україні — запит йде через VPS (Нідерланди)
    if (['name', 'username', 'phone', 'vk_url'].includes(type)) {
      tasks.push((async () => {
        send('vk', 'loading')
        // Спочатку через VPS проксі напряму (8008), fallback через наш API
        const VPS_VK = `http://${process.env.VPS_HOST || '161.35.86.145'}:8008`
        let d = await safeFetch(`${VPS_VK}/vk/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, type }),
        }, 20000)
        // Fallback через /api/vk/search (якщо VPS 8008 недоступний)
        if (!d) {
          d = await safeFetch(`${LOCAL}/api/vk/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, type }),
          }, 20000)
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
        }, 15000)
        send('getcontact', d ? 'done' : 'error', d)
      })())
    }

    // ── 18. Авто/VIN пошук ─────────────────────────────────────────────────────
    if (['plate_ru', 'plate_ua', 'vin'].includes(type)) {
      tasks.push((async () => {
        send('vehicles', 'loading')
        const d = await safeFetch(`${LOCAL}/api/osint/vehicles/direct`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, type }),
        }, 20000)
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
        }, 15000)
        send('yandex', d ? 'done' : 'error', d)
      })())
    }

    await Promise.allSettled(tasks)

    // Done signal
    writer.write(encoder.encode(`data: ${JSON.stringify({ source: '__done__', status: 'done', type })}\n\n`))
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

  runAll().catch(() => writer.close())

  return new Response(stream.readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
