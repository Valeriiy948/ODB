'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../components/Sidebar'
import Icon from '../components/Icon'

// ─── Визначення типу ідентифікатора ─────────────────────────────────────────
type IdType = 'phone' | 'inn' | 'snils' | 'passport' | 'email' | 'vk' | 'unknown'

function detectType(value: string): IdType {
  const v = value.trim()
  if (/^[\+\d\s\(\)\-]{7,15}$/.test(v) && v.replace(/\D/g, '').length >= 7) return 'phone'
  if (/^\d{10}$/.test(v.replace(/\D/g, ''))) return 'inn'
  if (/^\d{11}$/.test(v.replace(/\D/g, '')) && v.replace(/\D/g, '').length === 11) return 'snils'
  if (/^[А-ЯA-Z]{2}\s?\d{6,7}/i.test(v) || /^\d{4}\s?\d{6}$/.test(v)) return 'passport'
  if (/@/.test(v)) return 'email'
  if (/vk\.com/i.test(v) || /^(id\d+|[a-z_]{3,})/i.test(v)) return 'vk'
  return 'unknown'
}

const TYPE_CONFIG: Record<IdType, { icon: string; label: string; color: string; hint: string }> = {
  phone:    { icon: '📞', label: 'Телефон',   color: 'text-green-400',  hint: '+7/+38... або просто цифри' },
  inn:      { icon: '🔢', label: 'ІПН / ІНН', color: 'text-yellow-400', hint: '10-значний ідентифікатор' },
  snils:    { icon: '🔢', label: 'СНІЛС',     color: 'text-yellow-400', hint: '11-значний номер (РФ)' },
  passport: { icon: '🛂', label: 'Паспорт',   color: 'text-blue-400',   hint: 'Серія+Номер: АА123456 / 4506 123456' },
  email:    { icon: '✉️', label: 'Email',     color: 'text-purple-400', hint: 'Електронна пошта' },
  vk:       { icon: '💙', label: 'VK',        color: 'text-blue-400',   hint: 'vk.com/... або id12345' },
  unknown:  { icon: '🔍', label: 'Запит',     color: 'text-gray-400',   hint: 'Введіть будь-який ідентифікатор' },
}

// ─── Картка результату з однієї бази ────────────────────────────────────────
function SourceCard({
  icon, title, color, loading, count, children, fallback_url,
}: {
  icon: string; title: string; color: string
  loading?: boolean; count?: number; children?: React.ReactNode; fallback_url?: string
}) {
  return (
    <div className={`bg-gray-800 rounded-xl border ${loading ? 'border-gray-600' : count ? 'border-' + color.replace('text-','').replace('-400','-700') : 'border-gray-700'} overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/60">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className={`font-semibold text-sm ${color}`}>{title}</span>
          {loading && <span className="animate-spin text-xs text-gray-400">⟳</span>}
          {!loading && count != null && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              count > 0 ? 'bg-red-700 text-red-200' : 'bg-gray-700 text-gray-400'
            }`}>{count}</span>
          )}
        </div>
        {fallback_url && (
          <a href={fallback_url} target="_blank" rel="noopener noreferrer"
            className="text-gray-500 hover:text-blue-400 text-xs transition">Відкрити →</a>
        )}
      </div>
      <div className="p-3 text-sm">
        {loading
          ? <p className="text-gray-500 italic animate-pulse">Пошук...</p>
          : children || <p className="text-gray-600 italic">Нічого не знайдено</p>
        }
      </div>
    </div>
  )
}

// ─── Рядок даних ────────────────────────────────────────────────────────────
function DataRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-gray-500 text-xs w-28 shrink-0">{label}</span>
      <span className="text-gray-200 text-xs font-mono break-all">{value}</span>
    </div>
  )
}

// ─── Головна сторінка ────────────────────────────────────────────────────────
export default function PhoneSearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState('')
  const [detectedType, setDetectedType] = useState<IdType>('unknown')
  const [running, setRunning] = useState(false)

  // Результати за джерелами
  const [localPersons, setLocalPersons]   = useState<any[]>([])
  const [leaksRes, setLeaksRes]           = useState<any>(null)
  const [nazkRes, setNazkRes]             = useState<any>(null)
  const [myroRes, setMyroRes]             = useState<any>(null)
  const [tgPhoneRes, setTgPhoneRes]       = useState<any>(null)
  const [erbRes, setErbRes]               = useState<any>(null)
  const [mvsRes, setMvsRes]               = useState<any>(null)

  // Стан loading окремо для кожного
  const [loadingLocal, setLoadingLocal]     = useState(false)
  const [loadingLeaks, setLoadingLeaks]     = useState(false)
  const [loadingNazk, setLoadingNazk]       = useState(false)
  const [loadingMyro, setLoadingMyro]       = useState(false)
  const [loadingTg, setLoadingTg]           = useState(false)
  const [loadingErb, setLoadingErb]         = useState(false)
  const [loadingMvs, setLoadingMvs]         = useState(false)

  const hasAnyResult = localPersons.length > 0 || leaksRes?.total > 0
    || nazkRes?.found > 0 || myroRes?.found > 0 || erbRes?.found > 0 || mvsRes?.total > 0

  async function post(path: string, body: object) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.json()
  }

  async function runSearch() {
    const q = query.trim()
    if (!q || q.length < 2) return

    const type = detectType(q)
    setDetectedType(type)
    setSearched(q)
    setRunning(true)

    // Скидаємо
    setLocalPersons([]); setLeaksRes(null); setNazkRes(null)
    setMyroRes(null); setTgPhoneRes(null); setErbRes(null); setMvsRes(null)

    // ── 1. Локальна DB осіб ──────────────────────────────────────────────────
    setLoadingLocal(true)
    ;(async () => {
      try {
        const fragBody: Record<string, string> = {}
        if (type === 'phone')    fragBody.phone = q
        if (type === 'inn')      fragBody.ipn   = q.replace(/\D/g,'')
        if (type === 'snils')    fragBody.snils  = q.replace(/\D/g,'')
        if (type === 'passport') fragBody.passport = q
        if (type === 'email')    fragBody.email  = q
        if (type === 'unknown' || type === 'vk') fragBody.last_name = q
        const r = await post('/api/search/fragments', fragBody)
        setLocalPersons(r.results || [])
      } catch {}
      setLoadingLocal(false)
    })()

    // ── 2. VPS Leaks DB ──────────────────────────────────────────────────────
    setLoadingLeaks(true)
    ;(async () => {
      try {
        const leakBody: Record<string, string> = {}
        if (type === 'phone')    leakBody.phone    = q.replace(/\D/g,'')
        if (type === 'inn')      leakBody.inn       = q.replace(/\D/g,'')
        if (type === 'snils')    leakBody.snils     = q.replace(/\D/g,'')
        if (type === 'passport') leakBody.passport  = q
        if (type === 'email')    leakBody.email     = q
        if (type === 'unknown')  leakBody.name      = q
        const r = await post('/api/leaks', leakBody)
        setLeaksRes(r)
      } catch {}
      setLoadingLeaks(false)
    })()

    // ── 3. НАЗК (тільки для ІПН або імені) ──────────────────────────────────
    if (type === 'inn' || type === 'unknown') {
      setLoadingNazk(true)
      ;(async () => {
        try {
          const r = await post('/api/nazk/search', { query: q })
          setNazkRes(r)
        } catch {}
        setLoadingNazk(false)
      })()
    }

    // ── 4. Миротворець (для будь-якого запиту) ───────────────────────────────
    setLoadingMyro(true)
    ;(async () => {
      try {
        const r = await post('/api/myrotvorets/search', { query: q })
        setMyroRes(r)
      } catch {}
      setLoadingMyro(false)
    })()

    // ── 5. Telegram Phone Lookup (тільки для телефону) ──────────────────────
    if (type === 'phone') {
      setLoadingTg(true)
      ;(async () => {
        try {
          const r = await post('/api/osint/telegram-phone/direct', { phone: q.replace(/\D/g,'') })
          setTgPhoneRes(r)
        } catch {}
        setLoadingTg(false)
      })()
    }

    // ── 6. ЄРБ Боржники ─────────────────────────────────────────────────────
    if (type === 'unknown' || type === 'inn') {
      setLoadingErb(true)
      ;(async () => {
        try {
          const r = await post('/api/erb/search', { query: q, last_name: q.split(' ')[0] })
          setErbRes(r)
        } catch {}
        setLoadingErb(false)
      })()
    }

    // ── 7. МВС Розшук ───────────────────────────────────────────────────────
    if (type === 'unknown') {
      setLoadingMvs(true)
      ;(async () => {
        try {
          const r = await post('/api/mvs/search', { query: q, resource: 'wanted' })
          setMvsRes(r)
        } catch {}
        setLoadingMvs(false)
      })()
    }

    setRunning(false)
  }

  const cfg = TYPE_CONFIG[detectedType]

  // ─── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen text-white" style={{ background: 'var(--odb-bg)' }}>
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Шапка */}
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--odb-border-soft)' }}>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--odb-accent-hi), var(--odb-accent-lo))', boxShadow: 'var(--odb-shadow-accent)' }}>
              <Icon name="phone" size={20} />
            </span>
            <div>
              <h1 className="text-lg font-bold text-white">Пошук за ідентифікатором</h1>
              <p className="text-[var(--odb-text-faint)] text-xs mt-0.5">Телефон · ІПН · Паспорт · СНІЛС · Email — всі бази одночасно</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.push('/search-all')}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs transition">
              🔍 Пошук по всіх джерелах
            </button>
            <button onClick={() => router.push('/admin/leaks-import')}
              className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 text-amber-200 rounded-lg text-xs transition">
              📥 Імпорт витоків
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Рядок пошуку */}
          <div className="max-w-3xl mx-auto mb-6">
            <div className="relative">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runSearch()}
                    placeholder="Введіть телефон, ІПН, паспорт, СНІЛС або email..."
                    className="w-full px-4 py-3.5 bg-gray-800 border border-gray-600 rounded-xl text-white text-base focus:border-blue-500 focus:outline-none placeholder-gray-500 pr-32"
                  />
                  {query && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <span className={`text-xs px-2 py-0.5 rounded-full bg-gray-700 ${TYPE_CONFIG[detectType(query)].color}`}>
                        {TYPE_CONFIG[detectType(query)].icon} {TYPE_CONFIG[detectType(query)].label}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={runSearch}
                  disabled={!query.trim() || running}
                  className="px-6 py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-semibold text-base transition whitespace-nowrap">
                  {running ? '⟳ Пошук...' : '🔍 Шукати'}
                </button>
              </div>
            </div>

            {/* Підказки */}
            <div className="flex flex-wrap gap-2 mt-3">
              {[
                { label: '📞 Телефон', example: '+79147441444' },
                { label: '🔢 ІПН',     example: '2602016998' },
                { label: '🛂 Паспорт', example: 'АА 123456' },
                { label: '🔢 СНІЛС',   example: '123-456-789 00' },
                { label: '✉️ Email',   example: 'ivan@mail.ru' },
              ].map(({ label, example }) => (
                <button key={label}
                  onClick={() => setQuery(example)}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-full border border-gray-700 transition">
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Якщо нічого ще не шукали */}
          {!searched && (
            <div className="max-w-3xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                {[
                  { icon: '📞', title: 'За телефоном',   desc: 'Telegram, Leaks, Personas, GetContact' },
                  { icon: '🔢', title: 'За ІПН / ІНН',   desc: 'НАЗК декларації, ЄРБ, Leaks' },
                  { icon: '🛂', title: 'За паспортом',   desc: 'Leaks DB, локальна база осіб' },
                  { icon: '🔢', title: 'За СНІЛС',       desc: 'Leaks DB (бази РФ)' },
                  { icon: '✉️', title: 'За Email',       desc: 'Leaks DB, OSINT' },
                  { icon: '🚨', title: 'Миротворець',    desc: 'Будь-який запит по імені' },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                    <div className="text-3xl mb-2">{icon}</div>
                    <p className="text-white font-medium text-sm">{title}</p>
                    <p className="text-gray-500 text-xs mt-1">{desc}</p>
                  </div>
                ))}
              </div>

              {/* Статистика leaks DB */}
              <div className="mt-6 p-4 bg-gray-800/40 border border-gray-700 rounded-xl">
                <p className="text-gray-400 text-sm font-medium mb-1">💧 База витоків (VPS)</p>
                <p className="text-gray-500 text-xs">
                  Щоб наповнити базу — завантажте CSV файли через{' '}
                  <button onClick={() => router.push('/admin/leaks-import')}
                    className="text-amber-400 hover:underline">Імпорт витоків</button>
                  . Підтримувані формати: РосПаспорт, Гослуслуги, МТС, Білайн, ФССП, VK leaks та інші.
                </p>
              </div>
            </div>
          )}

          {/* Результати */}
          {searched && (
            <div className="max-w-5xl mx-auto">
              {/* Заголовок результатів */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className={`text-2xl`}>{cfg.icon}</span>
                  <div>
                    <p className="text-white font-semibold">{searched}</p>
                    <p className={`text-xs ${cfg.color}`}>{cfg.label}</p>
                  </div>
                </div>
                {hasAnyResult && (
                  <span className="text-green-400 text-sm font-medium">✅ Знайдено збіги</span>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* ── Місцева база осіб ── */}
                <SourceCard icon="🛡️" title="Локальна база ODB" color="text-blue-400"
                  loading={loadingLocal} count={localPersons.length}>
                  {localPersons.length > 0 ? (
                    <div className="space-y-2">
                      {localPersons.map((p: any, i: number) => (
                        <div key={i}
                          onClick={() => router.push(`/persons/${p.id}`)}
                          className="p-3 rounded-lg bg-blue-950/20 border border-blue-800/30 cursor-pointer hover:bg-blue-950/40 transition">
                          <div className="flex items-center gap-2">
                            {p.photo_url
                              ? <img src={p.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                              : <div className="w-8 h-8 rounded-full bg-blue-900/40 flex items-center justify-center shrink-0">👤</div>
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium truncate">{p.name_rus || p.name_ukr || p.name}</p>
                              <div className="flex gap-2 flex-wrap">
                                {p.dob && <span className="text-gray-400 text-xs">{p.dob}</span>}
                                {p.rank && <span className="text-gray-400 text-xs">{p.rank}</span>}
                              </div>
                            </div>
                            <span className={`text-sm font-bold ${p._score >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>
                              {p._score}
                            </span>
                          </div>
                          {p.myrotvorets_url && (
                            <span className="mt-1 inline-block text-xs text-red-400">🚨 Миротворець</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : !loadingLocal && (
                    <p className="text-gray-600 text-xs italic">Не знайдено в локальній базі</p>
                  )}
                </SourceCard>

                {/* ── Leaks DB ── */}
                <SourceCard icon="💧" title="База витоків (VPS)" color="text-amber-400"
                  loading={loadingLeaks} count={leaksRes?.total}
                  fallback_url={leaksRes?.total === 0 && leaksRes?.vps_offline ? undefined : undefined}>
                  {leaksRes?.vps_offline ? (
                    <p className="text-red-400 text-xs">VPS :8001 недоступний</p>
                  ) : leaksRes?.results?.length > 0 ? (
                    <div className="space-y-2">
                      {leaksRes.results.map((r: any, i: number) => (
                        <div key={i} className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/30">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-1.5 py-0.5 rounded text-xs bg-amber-900/50 text-amber-300">
                              {r.source_label || r.source}
                            </span>
                            {r.leaked_at && <span className="text-gray-600 text-xs">{new Date(r.leaked_at).toLocaleDateString('uk-UA')}</span>}
                          </div>
                          <DataRow label="Ім'я"    value={r.name} />
                          <DataRow label="Телефон" value={r.phone} />
                          <DataRow label="Email"   value={r.email} />
                          <DataRow label="ІПН"     value={r.inn} />
                          <DataRow label="СНІЛС"   value={r.snils} />
                          <DataRow label="Паспорт" value={r.passport} />
                          <DataRow label="Адреса"  value={r.address} />
                          <DataRow label="ДН"      value={r.dob} />
                          <DataRow label="VK ID"   value={r.vk_id} />
                        </div>
                      ))}
                    </div>
                  ) : leaksRes && leaksRes.total === 0 ? (
                    <p className="text-gray-600 text-xs italic">Не знайдено у базі витоків</p>
                  ) : null}
                </SourceCard>

                {/* ── Миротворець ── */}
                <SourceCard icon="🚨" title="Миротворець" color="text-red-400"
                  loading={loadingMyro} count={myroRes?.found}>
                  {myroRes?.found > 0 ? (
                    <div className="space-y-2">
                      {myroRes.results?.map((r: any, i: number) => (
                        <div key={i} className="p-2.5 rounded-lg bg-red-950/20 border border-red-800/30">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-white text-xs font-medium">{r.title}</p>
                            <a href={r.url} target="_blank" rel="noopener noreferrer"
                              className="shrink-0 text-red-400 hover:text-red-300 text-xs">→</a>
                          </div>
                          {r.excerpt && <p className="text-gray-400 text-xs mt-1 line-clamp-2">{r.excerpt}</p>}
                          <p className="text-gray-600 text-xs mt-0.5">{r.date}</p>
                        </div>
                      ))}
                    </div>
                  ) : myroRes && (
                    <p className="text-green-600 text-xs">✅ У базі Миротворця не знайдено</p>
                  )}
                </SourceCard>

                {/* ── НАЗК ── */}
                {(detectedType === 'inn' || detectedType === 'unknown') && (
                  <SourceCard icon="📜" title="НАЗК Декларації" color="text-yellow-400"
                    loading={loadingNazk} count={nazkRes?.found}>
                    {nazkRes?.found > 0 ? (
                      <div className="space-y-2">
                        {nazkRes.declarations?.slice(0, 5).map((d: any, i: number) => (
                          <div key={i} className="p-2.5 rounded-lg bg-yellow-950/20 border border-yellow-800/30">
                            <div className="flex justify-between gap-2">
                              <div>
                                <p className="text-white text-xs font-medium">{d.full_name}</p>
                                <p className="text-yellow-300/70 text-xs">{d.position}</p>
                                <p className="text-gray-500 text-xs">{d.declaration_type} · {d.declaration_year}</p>
                              </div>
                              <a href={d.url} target="_blank" rel="noopener noreferrer"
                                className="text-yellow-500 hover:text-yellow-300 text-xs shrink-0">→</a>
                            </div>
                          </div>
                        ))}
                        {nazkRes.total > 5 && (
                          <p className="text-gray-500 text-xs">+ ще {nazkRes.total - 5} декларацій</p>
                        )}
                      </div>
                    ) : nazkRes && (
                      <p className="text-gray-600 text-xs italic">Декларацій не знайдено</p>
                    )}
                  </SourceCard>
                )}

                {/* ── ЄРБ Боржники ── */}
                {(detectedType === 'unknown' || detectedType === 'inn') && (
                  <SourceCard icon="💳" title="ЄРБ Боржники" color="text-orange-400"
                    loading={loadingErb} count={erbRes?.found}
                    fallback_url={erbRes?.fallback_url}>
                    {erbRes?.found > 0 ? (
                      <div className="space-y-1.5">
                        {erbRes.debtors?.map((d: any, i: number) => (
                          <div key={i} className="p-2.5 rounded-lg bg-orange-950/20 border border-orange-800/30 text-xs">
                            <p className="text-white font-medium">{d.lastName} {d.firstName}</p>
                            {d.debtSum && <p className="text-orange-300">Борг: {d.debtSum?.toLocaleString()} грн</p>}
                            {d.creditorName && <p className="text-gray-400">Стягувач: {d.creditorName}</p>}
                          </div>
                        ))}
                      </div>
                    ) : erbRes && (
                      <div>
                        <p className="text-green-600 text-xs">✅ Боргів не знайдено</p>
                        {erbRes.fallback_url && (
                          <a href={erbRes.fallback_url} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:underline text-xs block mt-1">Перевірити вручну →</a>
                        )}
                      </div>
                    )}
                  </SourceCard>
                )}

                {/* ── МВС Розшук ── */}
                {detectedType === 'unknown' && (
                  <SourceCard icon="🚔" title="МВС Розшук" color="text-blue-400"
                    loading={loadingMvs} count={mvsRes?.total}
                    fallback_url={mvsRes?.fallback_url}>
                    {mvsRes?.total > 0 ? (
                      <div className="space-y-1.5">
                        {mvsRes.records?.map((r: any, i: number) => (
                          <div key={i} className="p-2 rounded-lg bg-blue-950/20 border border-blue-800/30 text-xs">
                            <p className="text-white">{r.LAST_NAME_U || r.lastname} {r.FIRST_NAME_U || r.firstname}</p>
                            {(r.ARTICLE_CRIM || r.article) && <p className="text-red-400">Ст. {r.ARTICLE_CRIM || r.article}</p>}
                          </div>
                        ))}
                      </div>
                    ) : mvsRes?.fallback_url ? (
                      <div>
                        <p className="text-gray-500 text-xs mb-1">OpenData недоступний</p>
                        <a href={mvsRes.fallback_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/50 text-blue-300 rounded text-xs transition">
                          🚔 Перевірити на сайті МВС
                        </a>
                      </div>
                    ) : mvsRes && (
                      <p className="text-green-600 text-xs">✅ В розшуку не значиться</p>
                    )}
                  </SourceCard>
                )}

                {/* ── Telegram Phone Lookup ── */}
                {detectedType === 'phone' && (
                  <SourceCard icon="📱" title="Telegram (по номеру)" color="text-sky-400"
                    loading={loadingTg} count={tgPhoneRes?.accounts?.length || (tgPhoneRes?.found ? 1 : 0)}>
                    {tgPhoneRes?.error ? (
                      <p className="text-red-400 text-xs">{tgPhoneRes.error}</p>
                    ) : tgPhoneRes?.accounts?.length > 0 ? (
                      <div className="space-y-2">
                        {tgPhoneRes.accounts.map((a: any, i: number) => (
                          <div key={i} className="p-2.5 rounded-lg bg-sky-950/20 border border-sky-800/30 flex items-center gap-3">
                            {a.photo_url
                              ? <img src={a.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                              : <div className="w-8 h-8 rounded-full bg-sky-900/40 flex items-center justify-center shrink-0 text-base">📱</div>
                            }
                            <div>
                              <p className="text-sky-300 text-sm font-medium">{a.first_name} {a.last_name}</p>
                              {a.username && (
                                <a href={`https://t.me/${a.username}`} target="_blank" rel="noopener noreferrer"
                                  className="text-sky-400 text-xs hover:underline">@{a.username}</a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : tgPhoneRes && (
                      <p className="text-gray-600 text-xs italic">Telegram акаунта не знайдено</p>
                    )}
                  </SourceCard>
                )}

              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
