// app/lib/osint/myrotvorets-parser.ts
// Парсер сторінок myrotvorets.center — витягує всі доступні дані особи

export interface MyrotvoretsData {
  // Імена
  name_ukr?: string
  name_rus?: string
  name_eng?: string

  // Персональні дані
  dob?: string           // DD.MM.YYYY
  country?: string
  addr_live?: string     // місто/регіон проживання

  // Військові дані
  rank?: string
  unit?: string
  unit_num?: string
  military_id?: string   // військовий квиток

  // Документи
  passport?: string      // серія та номер

  // Контакти / соцмережі
  phones?: string[]
  email?: string
  vk_url?: string
  ok_url?: string
  fb_url?: string
  instagram_url?: string
  twitter_url?: string

  // OSINT
  photo_url?: string     // URL фото на myrotvorets.center
  tags?: string[]        // #WarCrime #БтгЗабайкальеВВО тощо
  sources?: string[]     // джерела

  // Мета
  myrotvorets_url?: string
  myrotvorets_id?: string
  myrotvorets_date?: string  // дата внесення до бази
  description?: string
}

// ─── Утиліти ───────────────────────────────────────────────────────────────

function extractText(html: string, regex: RegExp): string | undefined {
  const m = html.match(regex)
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : undefined
}

function extractAll(html: string, regex: RegExp): string[] {
  const results: string[] = []
  let m: RegExpExecArray | null
  const r = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g')
  while ((m = r.exec(html)) !== null) {
    const val = m[1].replace(/<[^>]+>/g, '').trim()
    if (val) results.push(val)
  }
  return results
}

function cleanPhone(raw: string): string {
  return raw.replace(/[^\d+]/g, '').replace(/^8(\d{10})$/, '+7$1')
}

// ─── Головний парсер ────────────────────────────────────────────────────────

export function parseMyrotvoretsPage(html: string, pageUrl: string): MyrotvoretsData {
  const data: MyrotvoretsData = {}
  data.myrotvorets_url = pageUrl

  // ── Фото ──
  // Шукаємо основне фото — тільки абсолютні URL до зображень
  const photoPatterns = [
    // Пряме посилання на wp-content/uploads (основне фото особи)
    /<img[^>]+src="(https?:\/\/myrotvorets\.center\/wp-content\/uploads\/[^"]+\.(jpg|jpeg|png|webp))"/i,
    // Будь-яке зображення з myrotvorets
    /<img[^>]+src="(https?:\/\/[^"]*myrotvorets\.center[^"]*\.(jpg|jpeg|png|webp))"/i,
    // Клас criminal/photo
    /class="[^"]*(?:criminal|photo|avatar|mugshot)[^"]*"[^>]*src="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp))"/i,
    // Через allorigins — може бути в contents
    /"(https?:\/\/myrotvorets\.center\/wp-content\/uploads\/[^"]+)"/i,
  ]
  for (const p of photoPatterns) {
    const m = html.match(p)
    if (m) {
      const url = m[1]
      // Перевіряємо що це справжнє зображення (не zip, не css)
      if (url && /\.(jpg|jpeg|png|webp)(\?[^"]*)?$/i.test(url)) {
        data.photo_url = url
        break
      }
    }
  }

  // ── Назва / ПІБ ──
  // Заголовок сторінки зазвичай: <h1 class="entry-title">ПІБ</h1>
  const titlePatterns = [
    /<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<title>([\s\S]*?)\s*[–—|-]\s*Миротворець/i,
    /<title>([\s\S]*?)<\/title>/i,
  ]
  let rawTitle = ''
  for (const p of titlePatterns) {
    const m = html.match(p)
    if (m) { rawTitle = m[1].replace(/<[^>]+>/g, '').trim(); break }
  }
  // Відокремлюємо рядки назв (укр / рос / eng)
  if (rawTitle) {
    const lines = rawTitle.split(/[\n\r\/|]+/).map(s => s.trim()).filter(Boolean)
    if (lines[0]) data.name_ukr = lines[0]
    if (lines[1]) data.name_rus = lines[1]
    if (lines[2]) data.name_eng = lines[2]
  }

  // ── Структуровані поля (таблиця або dl/dt/dd) ──
  // Шукаємо патерни типу: <b>Дата народження:</b> 19.06.1990
  const fieldMap: Record<string, (val: string) => void> = {
    'дата народження|дата рождения|date of birth': (v) => {
      const m = v.match(/(\d{1,2}[.\-]\d{1,2}[.\-]\d{4})/)
      if (m) data.dob = m[1].replace(/-/g, '.')
    },
    'країна|страна|country': (v) => { data.country = v },
    'місто|город|city|місце проживання|адреса': (v) => { data.addr_live = v },
    'звання|rank': (v) => { data.rank = v },
    'підрозділ|подразделение|unit|в/ч': (v) => { data.unit = v },
    'номер в/ч|номер части|unit number': (v) => { data.unit_num = v },
    'військовий квиток|военный билет|military id': (v) => { data.military_id = v },
    'паспорт|passport': (v) => { data.passport = v },
    'email|e-mail': (v) => { data.email = v },
  }

  // Шукаємо поля в HTML через різні патерни
  for (const [keyPattern, setter] of Object.entries(fieldMap)) {
    const re = new RegExp(
      `(?:<(?:b|strong|th|dt|label)[^>]*>\\s*(?:${keyPattern})\\s*:?\\s*<\\/(?:b|strong|th|dt|label)>|(?:${keyPattern})\\s*:)\\s*([^<\n]{3,100})`,
      'i'
    )
    const m = html.match(re)
    if (m) {
      const val = m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      if (val) setter(val)
    }
  }

  // ── DOB з мета-даних сторінки ──
  if (!data.dob) {
    const metaDob = html.match(/(\d{2}\.\d{2}\.\d{4})/)
    // Не беремо перше-ліпше — перевіряємо контекст
    const dobCtx = html.match(/(?:народ|born|dob|birth)[^.]{0,50}(\d{2}\.\d{2}\.\d{4})/i)
    if (dobCtx) data.dob = dobCtx[1]
  }

  // ── Соцмережі — VK ──
  const vkPatterns = [
    /href="(https?:\/\/(?:www\.)?vk\.com\/[^"]+)"/gi,
    /href="(https?:\/\/vkontakte\.ru\/[^"]+)"/gi,
  ]
  for (const p of vkPatterns) {
    const m = html.match(p)
    if (m) {
      data.vk_url = m[0].replace(/href="|"/g, '')
      break
    }
  }

  // ── Соцмережі — OK.ru ──
  const okM = html.match(/href="(https?:\/\/(?:www\.)?ok\.ru\/[^"]+)"/i)
  if (okM) data.ok_url = okM[1]

  // ── Facebook ──
  const fbM = html.match(/href="(https?:\/\/(?:www\.)?facebook\.com\/[^"]+)"/i)
  if (fbM) data.fb_url = fbM[1]

  // ── Instagram ──
  const igM = html.match(/href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"/i)
  if (igM) data.instagram_url = igM[1]

  // ── Телефони ──
  const phoneMatches = html.match(/(?:\+7|8|380)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g)
  if (phoneMatches) {
    data.phones = [...new Set(phoneMatches.map(cleanPhone))].slice(0, 5)
  }

  // ── Хештеги / теги — тільки реальні (не CSS-кольори, не числа) ──
  const hashtagMatches = html.match(/#[а-яА-ЯіїєёЁa-zA-ZҐґЄєІіЇї][а-яА-ЯіїєёЁa-zA-ZҐґЄєІіЇї\d_]{2,39}/g)
  if (hashtagMatches) {
    const filtered = [...new Set(hashtagMatches)].filter(tag => {
      const t = tag.slice(1) // без #
      // Виключаємо: CSS hex кольори (#FFF, #333, #FFD500), числа, HTML-класи
      if (/^[0-9A-Fa-f]{3,8}$/.test(t)) return false  // hex кольори
      if (/^\d+$/.test(t)) return false                 // числові
      if (t.length < 4) return false                    // надто короткі
      // Виключаємо CSS/HTML системні назви
      const systemWords = ['close', 'expand', 'content', 'website', 'webpage', 'primary', 'secondary', 'image', 'icon', 'page', 'main', 'top', 'bottom', 'left', 'right', 'center', 'header', 'footer', 'menu', 'nav', 'logo', 'wrapper', 'container', 'block', 'item', 'link', 'text', 'title', 'body', 'html', 'head', 'script', 'style', 'class', 'span', 'caff', 'dcaf', 'ffff', 'challenge']
      if (systemWords.includes(t.toLowerCase())) return false
      // Залишаємо тільки значущі теги — переважно кирилиця або відомі паттерни
      return /[а-яА-ЯіїєЁёҐґЄєІіЇї]/.test(t) || /^(War|war|BTG|btg|Btg|VDV|Wagner|PMC|ICC|МКС|ГРУ|ФСБ|ЗС|ВДВ)/i.test(t)
    })
    if (filtered.length > 0) data.tags = filtered.slice(0, 15)
  }

  // ── Дата внесення до бази ──
  const dateAdded = html.match(/(?:опубліковано|дата внесення|published)[^<]{0,30}(\d{1,2}\.\d{1,2}\.\d{4})/i)
  if (dateAdded) data.myrotvorets_date = dateAdded[1]

  // ── ID Миротворця з URL ──
  const slugM = pageUrl.match(/criminal\/([^\/]+)\/?$/)
  if (slugM) data.myrotvorets_id = slugM[1]

  // ── Джерела ──
  data.sources = [`Миротворець: ${pageUrl}`]

  // ── Опис ──
  // Перші 500 символів основного тексту (після очищення тегів)
  const contentM = html.match(/<(?:article|div)[^>]*class="[^"]*(?:entry-content|criminal-content|post-content)[^"]*"[^>]*>([\s\S]{50,2000})/i)
  if (contentM) {
    const text = contentM[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .trim()
      .slice(0, 500)
    if (text.length > 50) data.description = text
  }

  return data
}

// ─── Пошук URL Миротворця через OSINT результати ───────────────────────────

export function findMyrotvoretsUrl(osintVectors: Array<{ vector: string; results: Array<{ link: string; title: string }> }>): string | null {
  for (const v of osintVectors) {
    if (v.vector === 'myrotvorets' || v.vector === 'myrotvorets_ukr') {
      for (const r of v.results) {
        if (r.link?.includes('myrotvorets.center/criminal/')) {
          return r.link
        }
      }
    }
  }
  // Також шукаємо в будь-якому векторі
  for (const v of osintVectors) {
    for (const r of v.results) {
      if (r.link?.includes('myrotvorets.center/criminal/')) {
        return r.link
      }
    }
  }
  return null
}
