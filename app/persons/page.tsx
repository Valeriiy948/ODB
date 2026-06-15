'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon, { type IconName } from '../components/Icon'

// ─── Типи ─────────────────────────────────────────────────────────────────
interface Person {
  id: string
  name?: string
  name_ukr?: string
  name_rus?: string
  name_eng?: string
  dob?: string
  rank?: string
  unit?: string
  unit_num?: string
  photo_url?: string
  threat_level?: string
  threat_score?: number
  status?: string
  verified?: boolean
  myrotvorets_url?: string
  last_full_osint?: string
}

type ListFilter = 'all' | 'myrotvorets' | 'no_osint' | 'high_threat'

interface InternetResult {
  source: string
  source_label: string
  source_color: string
  url: string
  myrotvorets_url?: string
  name: string
  snippet: string
  dob?: string
  addr?: string
  canImport: boolean
}

interface SearchResponse {
  local: { results: Person[]; total: number }
  internet: { results: InternetResult[]; searched: boolean }
}

interface TgLeakResult {
  source: string
  source_label: string
  snippet: string
  fields: Record<string, string | string[]>
  date?: string | null
  url?: string | null
  from_phone?: boolean
}

// ─── Утиліти ──────────────────────────────────────────────────────────────
function deduplicateTgResults(results: any[]): any[] {
  const seen = new Set<string>()
  return results.filter(r => {
    const f = r.fields || {}
    const passport = f.passport ? String(f.passport).replace(/\s/g, '').toLowerCase() : ''
    const inn = f.inn ? String(f.inn) : ''
    const phone = f.phone ? String(f.phone).replace(/\D/g, '') : ''
    const hasId = passport || inn || phone
    const fp = hasId
      ? `${r.source}|${passport}|${inn}|${phone}`
      : `${r.source}|${(r.snippet || '').slice(0, 60)}`
    if (seen.has(fp)) return false
    seen.add(fp)
    return true
  })
}

function filterTgByQuery(results: any[], query: string): any[] {
  const isPatronymic = (w: string) => /(?:вна|вич|ович|евич|овна|евна|ична)$/.test(w)
  const queryWords = query.toLowerCase().split(/\s+/)
    .filter(w => /^[а-яґєіїё]/i.test(w) && w.length >= 4 && !isPatronymic(w))
  if (queryWords.length === 0) return results
  return results.filter(r => {
    const name = r.fields?.name
    if (!name) return true
    const nameWords = String(name).toLowerCase().split(/\s+/)
      .filter(w => /^[а-яa-z]/i.test(w) && w.length >= 4 && !isPatronymic(w))
    if (nameWords.length === 0) return true
    return nameWords.some(nw => queryWords.some(qw => {
      const len = Math.min(nw.length, qw.length, 8)
      return len >= 5 && nw.slice(0, len) === qw.slice(0, len)
    }))
  })
}

function displayName(p: Person) {
  return p.name_rus || p.name_ukr || p.name_eng || p.name || '—'
}

function allNames(p: Person): string[] {
  return [p.name_ukr, p.name_rus, p.name_eng, p.name]
    .filter((n): n is string => Boolean(n) && n !== displayName(p))
}

function formatDob(dob?: string) {
  if (!dob) return null
  const iso = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`
  return dob
}

function extractDobFromQuery(q: string): { name: string; dob: string } {
  const m = q.match(/\b(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})\b/)
  if (m) return { name: q.replace(m[0], '').replace(/\s+/g, ' ').trim(), dob: m[1] }
  return { name: q.trim(), dob: '' }
}

function dobToIso(dob: string): string | null {
  const m = dob.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/)
  if (!m) return null
  const y = m[3].length === 2 ? `19${m[3]}` : m[3]
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function threatColor(level?: string) {
  switch (level) {
    case 'critical': return 'bg-red-900/60 text-red-300 border border-red-700'
    case 'high': return 'bg-orange-900/60 text-orange-300 border border-orange-700'
    case 'medium': return 'bg-yellow-900/60 text-yellow-300 border border-yellow-700'
    default: return 'bg-slate-700 text-slate-300 border border-slate-600'
  }
}

function sourceColorClass(color: string) {
  switch (color) {
    case 'yellow': return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
    case 'blue': return 'bg-blue-500/20 border-blue-500/50 text-blue-300'
    case 'red': return 'bg-red-500/20 border-red-500/50 text-red-300'
    default: return 'bg-slate-700/50 border-slate-600 text-slate-300'
  }
}

function threatScoreColor(score?: number) {
  if (!score) return 'text-slate-500'
  if (score >= 75) return 'text-red-400 font-bold'
  if (score >= 50) return 'text-orange-400 font-semibold'
  if (score >= 25) return 'text-yellow-400'
  return 'text-slate-400'
}

// ─── Компонент картки особи з бази ────────────────────────────────────────
function PersonRow({
  person,
  selected,
  onSelect,
}: {
  person: Person
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b transition-all duration-200 group"
      style={{ borderColor: 'var(--odb-border-soft)', background: selected ? 'var(--odb-accent-glow)' : 'transparent' }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--odb-surface-2)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={e => { e.stopPropagation(); onSelect(person.id, e.target.checked) }}
        onClick={e => e.stopPropagation()}
        className="w-4 h-4 flex-shrink-0 accent-blue-500 cursor-pointer"
      />

      {/* Аватар */}
      <Link href={`/persons/${person.id}`}
        className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-sm font-semibold transition-transform group-hover:scale-105"
        style={{ background: 'var(--odb-surface-3)', color: 'var(--odb-text-dim)' }}>
        {person.photo_url
          ? <img src={person.photo_url} alt="" className="w-full h-full object-cover" />
          : displayName(person).charAt(0)
        }
      </Link>

      {/* ПІБ */}
      <Link href={`/persons/${person.id}`} className="flex-1 min-w-0">
        <div className="text-white font-medium truncate group-hover:text-blue-300 transition-colors flex items-center gap-2">
          {displayName(person)}
          {person.verified && <span className="text-green-400 text-xs flex-shrink-0">✓</span>}
          {person.myrotvorets_url && (
            <span className="text-xs px-1 py-0.5 rounded bg-yellow-900/50 text-yellow-400 border border-yellow-700/50 flex-shrink-0">М</span>
          )}
          {!person.last_full_osint && (
            <span className="text-xs text-slate-600 flex-shrink-0">no osint</span>
          )}
        </div>
        {allNames(person).length > 0 && (
          <div className="text-slate-500 text-xs truncate">{allNames(person).join(' / ')}</div>
        )}
      </Link>

      {/* Звання */}
      <div className="w-32 text-slate-300 text-sm truncate hidden md:block">
        {person.rank || '—'}
      </div>

      {/* Підрозділ */}
      <div className="flex-1 text-slate-400 text-sm truncate hidden lg:block">
        {person.unit || '—'}
      </div>

      {/* ДН */}
      <div className="w-24 text-slate-400 text-sm hidden xl:block">
        {formatDob(person.dob) || '—'}
      </div>

      {/* Threat score */}
      <div className={`w-14 text-sm text-right ${threatScoreColor(person.threat_score)}`}>
        {person.threat_score != null ? `${person.threat_score}%` : '—'}
      </div>

      {/* Статус */}
      <div className="w-20 text-right">
        <span className="px-2 py-0.5 rounded text-xs bg-blue-600/30 text-blue-300 border border-blue-600/50">
          {person.status || 'фігурант'}
        </span>
      </div>
    </div>
  )
}

// ─── Компонент картки інтернет-результату ─────────────────────────────────
function InternetResultCard({
  result,
  onImport,
  importing,
}: {
  result: InternetResult
  onImport: (r: InternetResult) => void
  importing: boolean
}) {
  return (
    <div className={`flex items-start gap-4 px-5 py-4 border-b border-slate-700/30 ${result.source === 'myrotvorets' ? 'bg-yellow-900/10' : ''}`}>
      {/* Іконка джерела */}
      <div className={`px-2 py-1 rounded text-xs font-bold border flex-shrink-0 mt-0.5 ${sourceColorClass(result.source_color)}`}>
        {result.source_label}
      </div>

      {/* Дані */}
      <div className="flex-1 min-w-0">
        <a href={result.url} target="_blank" rel="noopener noreferrer"
          className="text-white font-medium hover:text-blue-300 transition-colors line-clamp-1">
          {result.name || '—'}
        </a>
        {(result.dob || result.addr) && (
          <div className="text-slate-400 text-xs mt-0.5 flex gap-3">
            {result.dob && <span>📅 {result.dob}</span>}
            {result.addr && <span>📍 {result.addr}</span>}
          </div>
        )}
        <p className="text-slate-400 text-sm mt-1 line-clamp-2">{result.snippet}</p>
      </div>

      {/* Кнопки */}
      <div className="flex gap-2 flex-shrink-0">
        <a href={result.url} target="_blank" rel="noopener noreferrer"
          className="px-3 py-1.5 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
          Відкрити
        </a>
        {result.canImport && (
          <button
            onClick={() => onImport(result)}
            disabled={importing}
            className="px-3 py-1.5 rounded text-xs bg-green-700 hover:bg-green-600 text-white transition-colors disabled:opacity-50 font-medium">
            {importing ? '⏳' : '+ Додати в базу'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Головний компонент ────────────────────────────────────────────────────
export default function PersonsPage() {
  const router = useRouter()

  // Стани
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [internetLoading, setInternetLoading] = useState(false)
  const [searchData, setSearchData] = useState<SearchResponse | null>(null)
  const [allPersons, setAllPersons] = useState<Person[]>([])
  const [allTotal, setAllTotal] = useState(0)
  const [allLoading, setAllLoading] = useState(true)
  const [importingUrl, setImportingUrl] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [tgResults, setTgResults] = useState<TgLeakResult[]>([])
  const [tgLoading, setTgLoading] = useState(false)
  const [tgCreating, setTgCreating] = useState(false)
  const [tgSearchedQuery, setTgSearchedQuery] = useState('')
  const [tgCreateError, setTgCreateError] = useState<string | null>(null)

  // Фільтри та масовий вибір
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchQueuing, setBatchQueuing] = useState(false)
  const [batchMsg, setBatchMsg] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tgDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ── Завантажуємо список осіб (з фільтром) ──────────────────────────────
  useEffect(() => {
    async function load() {
      setAllLoading(true)
      setSelected(new Set())
      setBatchMsg('')
      try {
        let url = '/api/persons?limit=50'
        if (listFilter === 'myrotvorets') url += '&filter=myrotvorets'
        else if (listFilter === 'no_osint') url += '&filter=no_osint'
        else if (listFilter === 'high_threat') url += '&filter=high_threat'
        const res = await fetch(url)
        const data = await res.json()
        setAllPersons(data.persons || data.data || [])
        setAllTotal(data.total || 0)
      } catch {}
      setAllLoading(false)
    }
    load()
  }, [listFilter])

  // ── Вибір записів ───────────────────────────────────────────────────────
  function handleSelect(id: string, checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }

  function handleSelectAll(checked: boolean) {
    if (checked) setSelected(new Set(allPersons.map(p => p.id)))
    else setSelected(new Set())
  }

  // ── Запустити OSINT для вибраних ────────────────────────────────────────
  async function queueSelected() {
    if (!selected.size) return
    setBatchQueuing(true)
    setBatchMsg('')
    try {
      const res = await fetch('/api/osint/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_ids: [...selected],
          modules: ['web', 'ai'],
          priority: 3,
        }),
      })
      const data = await res.json()
      setBatchMsg(data.message || `Додано ${selected.size} задач`)
      setSelected(new Set())
    } catch {
      setBatchMsg('Помилка додавання до черги')
    }
    setBatchQueuing(false)
  }

  // ── Пошук з debounce ────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchData(null)
      return
    }

    setLoading(true)
    setSearchData(null)

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data: SearchResponse = await res.json()
      setSearchData(data)
    } catch {}

    setLoading(false)
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    clearTimeout(tgDebounceRef.current)
    setTgResults([])
    setTgSearchedQuery('')
    setTgCreateError(null)
    if (query.length < 2) {
      setSearchData(null)
      return
    }
    debounceRef.current = setTimeout(() => doSearch(query), 500)
    return () => {
      clearTimeout(debounceRef.current)
      clearTimeout(tgDebounceRef.current)
    }
  }, [query, doSearch])

  // Auto-OSINT: якщо нічого немає в базі — шукаємо в Telegram (з затримкою)
  useEffect(() => {
    const local = searchData?.local.results || []
    const words = query.trim().split(/\s+/).filter(Boolean)
    if (!loading && searchData && local.length === 0 && words.length >= 2) {
      clearTimeout(tgDebounceRef.current)
      tgDebounceRef.current = setTimeout(() => runTelegramOsint(query), 2000)
    }
    return () => clearTimeout(tgDebounceRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchData])

  // ── Додати особу з інтернету в базу ────────────────────────────────────
  async function importFromInternet(result: InternetResult) {
    setImportingUrl(result.url)
    try {
      // 1. Створюємо нову особу з ім'ям
      const nameParts = result.name.split(/[\s\/|]+/).map(s => s.trim()).filter(Boolean)
      const createRes = await fetch('/api/persons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_rus: result.name,
          name_ukr: nameParts[0] || result.name,
          dob: result.dob || null,
          status: 'фігурант',
        }),
      })

      if (!createRes.ok) throw new Error('Помилка створення')
      const { id } = await createRes.json()

      // 2. Якщо є Myrotvorets URL — одразу збагачуємо
      if (result.myrotvorets_url && id) {
        await fetch(`/api/persons/${id}/enrich`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: result.myrotvorets_url }),
        })
      }

      setImportSuccess(id)
      // Переходимо на картку особи
      setTimeout(() => router.push(`/persons/${id}`), 800)

    } catch (e) {
      console.error(e)
    }
    setImportingUrl(null)
  }

  // ── Швидкий OSINT по незнайденій особі (тільки PeopleFindBaseBot) ──────
  async function runTelegramOsint(q: string) {
    if (tgSearchedQuery === q) return
    setTgSearchedQuery(q)
    setTgLoading(true)
    setTgResults([])
    try {
      const { name, dob } = extractDobFromQuery(q)
      const params = new URLSearchParams({ q: name })
      if (dob) params.set('dob', dob)
      const res = await fetch(`/api/telegram/quick?${params}`)
      if (res.ok) {
        const data = await res.json()
        const raw = deduplicateTgResults(data.results || [])
        setTgResults(filterTgByQuery(raw, name))
      }
    } catch {}
    setTgLoading(false)
  }

  async function createPersonFromOsint() {
    setTgCreating(true)
    setTgCreateError(null)
    try {
      const { name, dob } = extractDobFromQuery(query)

      // Перевірка на дублікат перед створенням
      const dobIso = dob ? dobToIso(dob) : null
      if (dobIso) {
        const dupCheck = await fetch(`/api/persons?q=${encodeURIComponent(name)}&limit=5`)
        if (dupCheck.ok) {
          const dupData = await dupCheck.json()
          const existing = (dupData.persons || []).find((p: any) => p.dob === dobIso)
          if (existing) {
            setTgCreateError(`Особа вже є в базі: ${existing.name_rus || existing.name_ukr || existing.name}`)
            setTgCreating(false)
            return
          }
        }
      }

      // Агрегуємо поля з усіх витоків; phones збираємо з усіх
      const toTitle = (s: string) => s.replace(/\b([А-ЯҐЄІЇа-яґєіїA-Za-z])(\S*)/gu,
        (_m, f0, r0) => f0.toUpperCase() + r0.toLowerCase())
      const agg: Record<string, any> = {}
      const allPhones: string[] = []
      for (const r of tgResults) {
        const f = r.fields || {}
        for (const [k, v] of Object.entries(f)) {
          if (k === 'phone' && v) { allPhones.push(String(v)); continue }
          if (k === 'phones_list' && Array.isArray(v)) { allPhones.push(...v.map(String)); continue }
          if (!agg[k] && v) agg[k] = v
        }
      }
      const uniquePhones = [...new Set(allPhones)]

      // Повне ім'я: беремо найдовше ФИО (з по батькові)
      let fullNameRus = name
      let fullNameUkr = name
      for (const r of tgResults) {
        const n = r.fields?.name
        if (n && String(n).split(' ').length >= 3) {
          const titled = toTitle(String(n))
          // Кирилиця з Й/й — ймовірно українська
          if (/[іїєґІЇЄҐ]/.test(String(n)) && fullNameUkr === name) fullNameUkr = titled
          else if (fullNameRus === name) fullNameRus = titled
        }
      }

      // Паспорт з ким виданий
      let passportValue: string | undefined
      if (agg.passport) {
        passportValue = agg.series && /^\d{4}$/.test(String(agg.series))
          ? `${agg.series} ${agg.passport}`.trim() : String(agg.passport).trim()
        if (agg.passport_issuer) passportValue += ` / ${agg.passport_issuer}`
      }

      // Description — збираємо всі додаткові дані
      const dlParts: string[] = []
      if (agg.dl_categories) dlParts.push(`Права (категорії): ${agg.dl_categories}`)
      if (agg.dl_issue_date) dlParts.push(`Права видано: ${agg.dl_issue_date}`)
      if (agg.dl_expiry) dlParts.push(`Права дійсні до: ${agg.dl_expiry}`)
      if (!agg.passport && agg.passport_issuer) dlParts.push(`Паспорт видано: ${agg.passport_issuer}`)
      if (agg.car_info) dlParts.push(`Авто: ${agg.car_info}${agg.vin ? ` / VIN: ${agg.vin}` : ''}`)
      if (agg.credit_card) dlParts.push(`Карта (маск.): ${agg.credit_card}`)
      if (agg.relatives) dlParts.push(`Родичі: ${agg.relatives}`)

      const createRes = await fetch('/api/persons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullNameRus,
          name_rus: fullNameRus,
          name_ukr: fullNameUkr !== name ? fullNameUkr : fullNameRus,
          dob: dob ? dobToIso(dob) : (agg.dob ? String(agg.dob) : null),
          status: 'фігурант',
          ...(agg.gender  ? { gender: String(agg.gender).toUpperCase() === 'M' ? 'male' : 'female' } : {}),
          ...(agg.inn     ? { ipn: String(agg.inn) } : {}),
          ...(passportValue ? { passport: passportValue } : {}),
          ...(uniquePhones.length ? { phones: uniquePhones } : {}),
          ...(agg.address ? { addr_live: String(agg.address) } : {}),
          ...(agg.email   ? { email: String(agg.email) } : {}),
          ...(agg.rank    ? { rank: String(agg.rank) } : {}),
          ...(agg.unit    ? { unit: String(agg.unit) } : {}),
          ...(agg.snils   ? { snils: String(agg.snils) } : {}),
          ...(agg.region  ? { region: String(agg.region) } : {}),
          ...(dlParts.length ? { description: dlParts.join('\n') } : {}),
        }),
      })
      if (!createRes.ok) {
        const errBody = await createRes.json().catch(() => ({}))
        throw new Error(errBody.error || `HTTP ${createRes.status}`)
      }
      const { id } = await createRes.json()

      // PATCH для полів що не пішли в POST
      const patch: Record<string, any> = {}
      if (agg.personal_num || agg.tab_num) patch.military_id = String(agg.personal_num || agg.tab_num)
      if (agg.vk)           patch.vk_url       = String(agg.vk)
      if (agg.ok)           patch.ok_url       = String(agg.ok)
      if (agg.instagram)    patch.instagram_url = String(agg.instagram)
      if (agg.facebook)     patch.fb_url       = String(agg.facebook)

      if (Object.keys(patch).length > 0) {
        await fetch(`/api/persons/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
      }

      setImportSuccess(id)
      setTimeout(() => router.push(`/persons/${id}`), 800)
    } catch (e: any) {
      console.error('createPersonFromOsint error:', e)
      setTgCreateError(e?.message || 'Невідома помилка')
    }
    setTgCreating(false)
  }

  // ── Визначаємо що показувати ────────────────────────────────────────────
  const isSearching = query.length >= 2
  const localResults = searchData?.local.results || []
  const localTotal = searchData?.local.total || 0
  const internetResults = searchData?.internet.results || []
  const internetSearched = searchData?.internet.searched || false

  return (
    <div className="min-h-screen text-white" style={{ background: 'var(--odb-bg)' }}>
      {/* ── Заголовок ── */}
      <div className="px-6 py-4 border-b odb-animate-fade" style={{ borderColor: 'var(--odb-border-soft)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--odb-accent-hi), var(--odb-accent-lo))', boxShadow: 'var(--odb-shadow-accent)' }}>
              <Icon name="users" size={22} strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-xl font-bold">Реєстр осіб</h1>
              <p className="text-[var(--odb-text-dim)] text-sm mt-0.5">
                Всього в базі: <span className="text-white font-semibold">{allTotal.toLocaleString()}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button
                onClick={queueSelected}
                disabled={batchQueuing}
                className="odb-animate-scale flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-xl text-sm font-medium transition-all">
                <Icon name="spark" size={15} />
                {batchQueuing ? 'Додаємо…' : `OSINT (${selected.size})`}
              </button>
            )}
            <Link href="/admin/batch"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all text-[var(--odb-text-dim)] hover:text-white"
              style={{ background: 'var(--odb-surface-2)', border: '1px solid var(--odb-border)' }}>
              <Icon name="activity" size={15} /> Batch
            </Link>
            <Link href="/admin/import"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all text-[var(--odb-text-dim)] hover:text-white"
              style={{ background: 'var(--odb-surface-2)', border: '1px solid var(--odb-border)' }}>
              <Icon name="download" size={15} /> Імпорт CSV
            </Link>
            <Link href="/persons/new"
              className="odb-btn-accent flex items-center gap-1.5 px-4 py-2 text-sm font-semibold">
              <Icon name="arrow-right" size={15} /> Додати
            </Link>
          </div>
        </div>

        {/* Фільтри */}
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: 'all',         label: 'Всі',            icon: 'users' },
            { key: 'myrotvorets', label: 'Myrotvorets',    icon: 'alert' },
            { key: 'no_osint',    label: 'Без OSINT',      icon: 'search' },
            { key: 'high_threat', label: 'Висока загроза', icon: 'alert' },
          ] as { key: ListFilter; label: string; icon: IconName }[]).map(f => {
            const on = listFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setListFilter(f.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border"
                style={on
                  ? { background: 'var(--odb-accent-glow)', color: 'var(--odb-accent-hi)', borderColor: 'var(--odb-accent-lo)' }
                  : { background: 'var(--odb-surface-2)', color: 'var(--odb-text-dim)', borderColor: 'transparent' }}
              >
                <Icon name={f.icon} size={14} />
                <span>{f.label}</span>
              </button>
            )
          })}
          {batchMsg && (
            <span className="ml-2 text-xs text-[var(--odb-ok)] font-medium flex items-center gap-1">
              <Icon name="check" size={13} /> {batchMsg}
            </span>
          )}
        </div>
      </div>

      {/* ── Пошуковий рядок ── */}
      <div className="px-6 py-4 border-b border-slate-700/30">
        <div className="relative">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            {loading ? (
              <svg className="animate-spin w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Пошук за ПІБ, підрозділом, номером в/ч, посадою... (якщо немає в базі — шукає в мережі)"
            className="w-full rounded-xl pl-11 pr-4 py-3 text-white placeholder-[var(--odb-text-faint)] outline-none transition-all"
            style={{ background: 'var(--odb-surface-2)', border: '1px solid var(--odb-border)' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--odb-accent)'; e.currentTarget.style.boxShadow = 'var(--odb-shadow-accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--odb-border)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-white transition-colors">
              ✕
            </button>
          )}
        </div>

        {/* Підказка про інтернет-пошук */}
        {isSearching && !loading && searchData && (
          <div className="mt-2 flex items-center gap-4 text-sm">
            <span className="text-slate-400">
              В базі: <span className="text-white font-medium">{localTotal.toLocaleString()}</span>
            </span>
            {internetSearched && (
              <span className="text-slate-400">
                В мережі: <span className="text-yellow-400 font-medium">{internetResults.length}</span>
              </span>
            )}
            {localTotal < 5 && !internetSearched && (
              <span className="text-slate-500 text-xs">Шукаємо в мережі...</span>
            )}
          </div>
        )}
      </div>

      {/* ── Результати ── */}
      <div className="flex-1">

        {/* Локальні результати */}
        {isSearching ? (
          <>
            {localResults.length > 0 && (
              <div>
                {/* Заголовок таблиці */}
                <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/50 border-b border-slate-700/50 text-xs text-slate-500 font-medium uppercase tracking-wide">
                  <div className="w-4 flex-shrink-0"/>
                  <div className="w-9 flex-shrink-0"/>
                  <div className="flex-1">ПІБ</div>
                  <div className="w-32 hidden md:block">Звання / Посада</div>
                  <div className="flex-1 hidden lg:block">Підрозділ</div>
                  <div className="w-24 hidden xl:block">Дата нар.</div>
                  <div className="w-14 text-right">Загроза</div>
                  <div className="w-20 text-right">Статус</div>
                </div>
                {localResults.map(p => (
                  <PersonRow key={p.id} person={p} selected={selected.has(p.id)} onSelect={handleSelect} />
                ))}
                {localTotal > localResults.length && (
                  <div className="text-center py-3 text-slate-500 text-sm border-b border-slate-700/30">
                    Показано {localResults.length} з {localTotal.toLocaleString()} • Уточніть запит
                  </div>
                )}
              </div>
            )}

            {/* Немає в базі — авто-OSINT */}
            {!loading && localResults.length === 0 && (
              <div>
                <div className="px-5 py-4 text-slate-500 text-sm border-b border-slate-700/30 flex items-center gap-2">
                  <span>🔍</span>
                  <span>В базі не знайдено "{query}" — швидкий пошук через Telegram (~30с)...</span>
                </div>

                {/* Telegram витоки */}
                {(tgLoading || tgResults.length > 0) && (
                  <div>
                    <div className="px-5 py-2 bg-blue-900/20 border-b border-blue-700/30 flex items-center gap-3">
                      <span className="text-xs text-blue-400 font-medium uppercase tracking-wide">📡 Telegram витоки</span>
                      {tgLoading && (
                        <svg className="animate-spin w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      )}
                      {!tgLoading && tgResults.length > 0 && (
                        <span className="text-xs text-blue-300">знайдено {tgResults.length} записів</span>
                      )}
                    </div>

                    {tgResults.length > 0 && (
                      <>
                        {/* Зведені поля */}
                        {(() => {
                          const agg: Record<string, string> = {}
                          for (const r of tgResults) {
                            const f = r.fields || {}
                            for (const [k, v] of Object.entries(f)) {
                              if (!agg[k] && v && k !== 'phones_list') agg[k] = String(v)
                            }
                          }
                          const labels: Record<string, string> = {
                            name: '👤 ПІБ', phone: '📞 Телефон', address: '📍 Адреса', rank: '🎖 Звання',
                            unit: '🏢 В/Ч', personal_num: '🪪 Особ. №', passport: '🗂 Паспорт',
                            series: 'Серія', snils: 'СНІЛС', inn: 'ІПН', dob: '🎂 ДН',
                            email: '✉ Email', vk: 'ВК', ok: 'OK', card: '💳 Карта', income: '💰 Дохід',
                            gender: '🧬 Стать', dl_categories: '🚗 Права', passport_issuer: '🏛 Паспорт видав',
                            dl_issue_date: '📅 ВП видано', dl_expiry: '⏰ ВП до',
                            tab_num: '🆔 Таб. №', car_info: '🚗 Авто', vin: 'VIN',
                            credit_card: '💳 Карта (маск.)', region: '🗺️ Регіон', relatives: '👪 Родичі',
                          }
                          const entries = Object.entries(agg).filter(([k]) => labels[k])
                          if (entries.length === 0) return null
                          return (
                            <div className="px-5 py-3 border-b border-slate-700/30 bg-slate-800/20">
                              <div className="text-xs text-slate-500 mb-2 font-medium">Знайдені дані:</div>
                              <div className="flex flex-wrap gap-2">
                                {entries.map(([k, v]) => (
                                  <span key={k} className="px-2 py-1 rounded text-xs bg-slate-700/60 text-slate-300 border border-slate-600/50">
                                    <span className="text-slate-500">{labels[k]}: </span>{v}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        })()}

                        {/* Список витоків */}
                        {tgResults.slice(0, 5).map((r, i) => (
                          <div key={i} className="px-5 py-3 border-b border-slate-700/20 hover:bg-slate-800/20">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${r.from_phone ? 'bg-green-900/40 text-green-300 border-green-700/50' : 'bg-blue-900/40 text-blue-300 border-blue-700/50'}`}>
                                {r.source_label}
                              </span>
                              {r.date && <span className="text-xs text-slate-600">{r.date.slice(0, 10)}</span>}
                            </div>
                            <p className="text-slate-400 text-xs line-clamp-2">{r.snippet}</p>
                          </div>
                        ))}

                        {/* Кнопка створити картку */}
                        <div className="px-5 py-4 border-b border-slate-700/30 bg-slate-800/30 flex items-center gap-3 flex-wrap">
                          <button
                            onClick={createPersonFromOsint}
                            disabled={tgCreating}
                            className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                            {tgCreating ? '⏳ Створюємо...' : '✅ Створити картку з цими даними'}
                          </button>
                          {tgCreateError ? (
                            <span className="text-xs text-red-400 font-medium">❌ {tgCreateError}</span>
                          ) : (
                            <span className="text-xs text-slate-500">
                              Буде створено нову особу з усіма знайденими полями
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    {!tgLoading && tgResults.length === 0 && (
                      <div className="px-5 py-3 text-slate-600 text-xs border-b border-slate-700/20">
                        Нічого не знайдено в Telegram витоках
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Інтернет-результати */}
            {internetSearched && internetResults.length > 0 && (
              <div>
                <div className="px-5 py-2 bg-slate-800/30 border-b border-slate-700/50 flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">🌐 Знайдено в мережі</span>
                  <span className="text-xs text-slate-600">({internetResults.length} результатів)</span>
                  {localTotal < 5 && (
                    <span className="ml-auto text-xs text-slate-500 italic">
                      В базі мало результатів — автоматичний пошук в інтернеті
                    </span>
                  )}
                </div>
                {internetResults.map((r, i) => (
                  <InternetResultCard
                    key={i}
                    result={r}
                    onImport={importFromInternet}
                    importing={importingUrl === r.url}
                  />
                ))}
              </div>
            )}

            {internetSearched && internetResults.length === 0 && !loading && (
              <div className="px-5 py-4 text-slate-500 text-sm flex items-center gap-2">
                <span>🌐</span>
                <span>В мережі також нічого не знайдено</span>
              </div>
            )}

            {/* Успішний імпорт */}
            {importSuccess && (
              <div className="fixed bottom-6 right-6 bg-green-700 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 z-50">
                ✅ Особу додано до бази. Переходимо на картку...
              </div>
            )}
          </>
        ) : (
          /* Всі особи (без пошуку) */
          <>
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/50 border-b border-slate-700/50 text-xs text-slate-500 font-medium uppercase tracking-wide">
              <input
                type="checkbox"
                className="w-4 h-4 accent-blue-500 cursor-pointer flex-shrink-0"
                checked={allPersons.length > 0 && selected.size === allPersons.length}
                onChange={e => handleSelectAll(e.target.checked)}
              />
              <div className="w-9 flex-shrink-0"/>
              <div className="flex-1">ПІБ</div>
              <div className="w-32 hidden md:block">Звання / Посада</div>
              <div className="flex-1 hidden lg:block">Підрозділ</div>
              <div className="w-24 hidden xl:block">Дата нар.</div>
              <div className="w-14 text-right">Загроза%</div>
              <div className="w-20 text-right">Статус</div>
            </div>
            {allLoading ? (
              <div className="flex items-center justify-center py-20">
                <svg className="animate-spin w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
            ) : allPersons.length === 0 ? (
              <div className="px-6 py-10 text-center text-slate-500 text-sm">
                {listFilter !== 'all' ? 'Немає записів за цим фільтром' : 'База порожня'}
              </div>
            ) : (
              allPersons.map(p => (
                <PersonRow key={p.id} person={p} selected={selected.has(p.id)} onSelect={handleSelect} />
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
