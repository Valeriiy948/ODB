'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '../components/Sidebar'

// ─── Source metadata ──────────────────────────────────────────────────────────
const SOURCE_META: Record<string, {
  label: string; icon: string; color: string; desc: string
  free?: boolean; price?: string; url?: string; env?: string
}> = {
  leakcheck_public: {
    label: 'LeakCheck',  icon: '✅', color: 'text-green-400',
    desc:  'Показує назви баз — безкоштовно, без ключа',
    free:  true,
  },
  hibp: {
    label: 'HaveIBeenPwned', icon: '🔍', color: 'text-orange-400',
    desc:  'Найнадійніша база витоків — 14B акаунтів',
    price: '$3.50/міс', url: 'https://haveibeenpwned.com/API/Key', env: 'HIBP_API_KEY',
  },
  leakcheck: {
    label: 'LeakCheck Pro', icon: '🔓', color: 'text-blue-400',
    desc:  'Деталі: email, паролі, username',
    price: '$9/міс', url: 'https://leakcheck.io', env: 'LEAKCHECK_API_KEY',
  },
  dehashed: {
    label: 'DeHashed',   icon: '💀', color: 'text-red-400',
    desc:  '12B+ записів — найповніша база',
    price: '$5.49/міс', url: 'https://dehashed.com', env: 'DEHASHED_API_KEY + DEHASHED_EMAIL',
  },
  snusbase: {
    label: 'SnusBase',   icon: '💾', color: 'text-purple-400',
    desc:  '~10 млрд записів',
    price: '$6/міс',    url: 'https://snusbase.com', env: 'SNUSBASE_API_KEY',
  },
  osintkit: {
    label: 'OsintKit',   icon: '🇷🇺', color: 'text-yellow-400',
    desc:  '731 Russian DB: Alfabank, ГосУслуги, РСА, авіа/ж/д',
    price: 'від $5/міс', url: 'https://osintkit.net/api', env: 'OSINTKIT_API_KEY',
  },
  leakosint: {
    label: 'LeakOsint',  icon: '🔴', color: 'text-red-400',
    desc:  '800+ баз РФ/СНД: ВКонтакте, ГИБДД, МТС, Сбербанк, ФНС, МВС, HeadHunter',
    price: 'від $10/міс', url: 'https://leakosint.com', env: 'LEAKOSINT_API_KEY',
  },
  eyeofgod: {
    label: 'Eye of God', icon: '👁️', color: 'text-orange-400',
    desc:  'Глаз Бога — Telegram bot: бази РФ по телефону, ім\'ю, Telegram ID',
    free:  false, url: 'https://t.me/eyeofgod_bot', env: 'VPS port 8007',
  },
  opendatabot: {
    label: 'OpenDataBot', icon: '🇺🇦', color: 'text-blue-400',
    desc:  'ЄДР, ФОП, судовий реєстр, виконавчі провадження — Україна',
    price: 'Free 100/day', url: 'https://opendatabot.ua/developers', env: 'OPENDATABOT_TOKEN',
  },
  youcontrol: {
    label: 'YouControl', icon: '🇺🇦', color: 'text-cyan-400',
    desc:  'Бізнес-розвідка UA: компанії, ФОП, власники, афілійовані особи',
    price: 'від $30/міс', url: 'https://youcontrol.com.ua/api-doc/', env: 'YOUCONTROL_API_KEY',
  },
  opensanctions: {
    label: 'OpenSanctions', icon: '⚖️', color: 'text-green-400',
    desc:  'РНБО UA + EU + US + UN санкції — безкоштовно без ключа',
    free:  true, url: 'https://www.opensanctions.org/api/', env: 'OPENSANCTIONS_API_KEY (опційно)',
  },
  shodan: {
    label: 'Shodan',     icon: '🌐', color: 'text-cyan-400',
    desc:  'IP розвідка: порти, сервіси, CVE, банери',
    free:  false, url: 'https://account.shodan.io', env: 'SHODAN_API_KEY', price: 'є безкоштовний',
  },
  censys: {
    label: 'Censys',     icon: '🔭', color: 'text-blue-300',
    desc:  'IP/домен аналіз: сертифікати, ASN, геолокація',
    free:  false, url: 'https://censys.io', env: 'CENSYS_API_TOKEN', price: 'Research Free',
  },
  peoplefind_bot: {
    label: 'PeopleFindBaseBot', icon: '🤖', color: 'text-pink-400',
    desc:  'Telegram бот: бази РФ (потребує VPS сервісу)',
    free:  false, url: 'https://t.me/PeopleFindBaseBot', env: 'VPS port 8005',
  },
  local_leaks: {
    label: 'ODB Local',  icon: '🗄️', color: 'text-cyan-400',
    desc:  'Власна локальна DB на VPS',
    free:  true,
  },
}

// ─── Entry card ───────────────────────────────────────────────────────────────
function EntryCard({ entry, source }: { entry: any; source: string }) {
  const meta = SOURCE_META[source]

  // Shodan/Censys — IP service card
  if ((source === 'shodan' || source === 'censys') && entry.port) {
    return (
      <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-cyan-400 font-mono text-xs font-bold">:{entry.port}/{entry.protocol || 'tcp'}</span>
          {entry.product && <span className="text-gray-300 text-xs">{entry.product} {entry.version || ''}</span>}
          {entry.cves && <span className="text-red-400 text-xs bg-red-950/40 px-1.5 rounded">⚠️ {entry.cves}</span>}
        </div>
        {entry.banner && <div className="text-xs text-gray-500 font-mono truncate">{entry.banner}</div>}
        {entry.note && <div className="text-xs text-blue-300 mt-0.5">{entry.note}</div>}
      </div>
    )
  }

  // Shodan/Censys summary entry
  if ((source === 'shodan' || source === 'censys') && entry.database?.includes('Summary')) {
    return (
      <div className="bg-cyan-950/30 border border-cyan-800/50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-cyan-300 font-bold text-xs">{entry.ip}</span>
          <span className="text-gray-400 text-xs">{entry.address}</span>
          <span className="text-gray-500 text-xs ml-auto">{entry.username}</span>
        </div>
        {entry.note && <div className="text-xs text-gray-400 font-mono">{entry.note}</div>}
        {entry.name && <div className="text-xs text-blue-300 mt-0.5">↳ {entry.name}</div>}
      </div>
    )
  }

  // HIBP entries have a special structure
  if (source === 'hibp' && entry.note) {
    return (
      <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-orange-400 font-semibold text-xs">{entry.database}</span>
        </div>
        <div className="text-xs text-gray-400">{entry.note}</div>
        {entry.classes && (
          <div className="text-xs text-gray-500 mt-1">
            Дані: <span className="text-gray-300">{entry.classes}</span>
          </div>
        )}
      </div>
    )
  }

  // LeakCheck public — only shows breach name
  if (source === 'leakcheck_public') {
    return (
      <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 flex items-center gap-2">
        <span className="text-green-400 text-xs">✓</span>
        <span className="text-white text-xs font-mono">{entry.database}</span>
        {entry.note && <span className="text-gray-500 text-xs ml-auto">{entry.note}</span>}
      </div>
    )
  }

  const fields = [
    { label: "Ім'я",        value: entry.name },
    { label: 'Email',       value: entry.email },
    { label: 'Телефон',     value: entry.phone },
    { label: 'Адреса',      value: entry.address },
    { label: 'ДН',          value: entry.dob },
    { label: 'ІПН',         value: entry.inn },
    { label: 'СНІЛС',       value: entry.snils },
    { label: 'Паспорт',     value: entry.passport },
    { label: 'Username',    value: entry.username },
    { label: 'Пароль',      value: entry.password },
    { label: 'Hash',        value: entry.hashed_pw || entry.hash },
    { label: 'IP',          value: entry.ip },
    { label: 'VK',          value: entry.vk_id },
    { label: 'Telegram',    value: entry.telegram_id },
    { label: 'Авто',        value: entry.vehicle },
    { label: 'Армія',       value: entry.military },
    { label: 'Станом на',   value: entry.as_of },
    { label: 'Ще імена',    value: entry.extra_names },
    { label: 'Ще телефони', value: entry.extra_phones },
    { label: 'Ще email',    value: entry.extra_emails },
    { label: 'База',        value: entry.database },
    { label: 'Витік',       value: entry.last_breach || entry.obtained_at },
  ].filter(f => f.value)

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold ${meta?.color}`}>{meta?.icon} {meta?.label}</span>
        {entry.database && (
          <span className="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded font-mono truncate max-w-[220px]">
            {entry.database}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex gap-2 text-xs">
            <span className="text-gray-500 w-20 shrink-0">{label}:</span>
            <span className={`font-mono break-all ${
              label === 'Email'   ? 'text-blue-300'  :
              label === 'Телефон' ? 'text-green-300' :
              label === 'Пароль'  ? 'text-yellow-300' :
              label === 'Армія'   ? 'text-red-300' :
              'text-gray-200'
            }`}>{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Source block ─────────────────────────────────────────────────────────────
function SourceBlock({ sourceKey, data }: { sourceKey: string; data: any }) {
  const meta     = SOURCE_META[sourceKey]
  const [open, setOpen] = useState(false)
  const entries  = data?.entries || []
  const isNoKey       = data?.error === 'no_key'
  const isEmailOnly   = data?.error === 'email_only'
  const isNeedSub     = data?.error === 'need_subscription'
  const hasData       = entries.length > 0

  // Skip sources that errored in a non-useful way
  if (data?.error && data.error !== 'no_key' && data.error !== 'email_only' && data.error !== 'need_subscription' && !hasData) return null

  return (
    <div className={`bg-gray-900 rounded-xl border overflow-hidden transition-all ${
      hasData    ? 'border-red-800/60' :
      isNoKey    ? 'border-gray-800'   :
      meta?.free ? 'border-gray-700'   :
                   'border-gray-800'
    }`}>
      <div
        className="flex items-center justify-between p-4 cursor-pointer select-none"
        onClick={() => hasData && setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{meta?.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`font-semibold text-sm ${meta?.color}`}>{meta?.label}</span>
              {meta?.free && (
                <span className="text-xs px-1.5 py-0.5 bg-green-900/40 text-green-400 border border-green-800/50 rounded font-mono">
                  FREE
                </span>
              )}
            </div>
            <span className="text-gray-600 text-xs">{meta?.desc}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isNoKey ? (
            <span className="text-xs text-gray-500 border border-gray-700 px-2 py-0.5 rounded">
              🔑 Потрібен ключ
            </span>
          ) : isEmailOnly ? (
            <span className="text-xs text-gray-600 border border-gray-800 px-2 py-0.5 rounded">
              тільки email
            </span>
          ) : isNeedSub ? (
            <a href="https://dehashed.com/subscriptions" target="_blank" rel="noopener noreferrer"
              className="text-xs text-yellow-500 border border-yellow-900 px-2 py-0.5 rounded hover:border-yellow-700 hover:text-yellow-400">
              ⏳ Потрібна Search підписка →
            </a>
          ) : data?.error ? (
            <span className="text-xs text-red-400">{data.error}</span>
          ) : (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              hasData ? 'bg-red-800 text-red-200' : 'bg-gray-800 text-gray-400'
            }`}>
              {data?.total || entries.length} знайдено
            </span>
          )}
          {hasData && (
            <span className="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
          )}
        </div>
      </div>

      {/* Entries */}
      {open && hasData && (
        <div className="border-t border-gray-800 p-4 space-y-2 max-h-96 overflow-y-auto">
          {entries.slice(0, 50).map((entry: any, i: number) => (
            <EntryCard key={i} entry={entry} source={sourceKey} />
          ))}
          {entries.length > 50 && (
            <p className="text-center text-gray-500 text-xs py-2">
              … та ще {entries.length - 50} записів
            </p>
          )}
        </div>
      )}

      {/* "No key" hint */}
      {isNoKey && meta?.url && (
        <div className="border-t border-gray-800 px-4 pb-3 pt-2 flex items-center justify-between">
          <code className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded">{meta.env}</code>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">{meta.price}</span>
            <a href={meta.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300">Отримати →</a>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Catalog Tab ──────────────────────────────────────────────────────────────
function CatalogTab() {
  const [q, setQ]                     = useState('')
  const [loading, setLoading]         = useState(false)
  const [results, setResults]         = useState<any[]>([])
  const [total, setTotal]             = useState(0)
  const [stats, setStats]             = useState<any>(null)
  const [statsLoading, setStatsLoad]  = useState(true)

  useEffect(() => {
    fetch('/api/breach/catalog?stats=1')
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d) })
      .catch(() => {})
      .finally(() => setStatsLoad(false))
  }, [])

  async function search() {
    if (!q.trim()) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/breach/catalog?q=${encodeURIComponent(q.trim())}&limit=50`)
      const data = await res.json()
      if (data.success) { setResults(data.results || []); setTotal(data.total || 0) }
    } finally { setLoading(false) }
  }

  return (
    <div>
      {statsLoading ? (
        <div className="text-gray-500 text-sm mb-4">⟳ Завантаження статистики...</div>
      ) : stats && (
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="bg-gray-800 rounded-lg px-4 py-2 text-center">
            <div className="text-xl font-bold text-white">{stats.catalog_total?.toLocaleString()}</div>
            <div className="text-xs text-gray-400">відомих витоків</div>
          </div>
          <div className="bg-gray-800 rounded-lg px-4 py-2 text-center">
            <div className="text-xl font-bold text-blue-400">{stats.leaks_total?.toLocaleString()}</div>
            <div className="text-xs text-gray-400">особистих записів</div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {(stats.sources || []).slice(0, 6).map((s: any) => (
              <span key={s.source} className="text-xs bg-gray-900 text-gray-400 px-2 py-1 rounded border border-gray-700">
                {s.source}: <span className="text-white">{Number(s.cnt).toLocaleString()}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-xl mb-6">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Назва сервісу: facebook, gmail, vk, linkedin..."
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white focus:border-orange-500 focus:outline-none placeholder-gray-500"
          />
          <button onClick={search} disabled={!q.trim() || loading}
            className="px-5 py-3 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 rounded-xl font-semibold text-sm transition">
            {loading ? '⟳' : '🔍'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {['facebook', 'gmail', 'vk.com', 'linkedin', 'adobe', 'twitter', 'telegram', 'mail.ru'].map(ex => (
            <button key={ex} onClick={() => { setQ(ex); setTimeout(search, 0) }}
              className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg border border-gray-700 transition">
              {ex}
            </button>
          ))}
        </div>
      </div>

      {results.length > 0 && (
        <>
          <p className="text-sm text-gray-400 mb-3">
            Знайдено <span className="text-white font-bold">{total}</span> витоків для «{q}»
          </p>
          <div className="space-y-2 max-w-3xl">
            {results.map((r: any) => (
              <div key={r.id} className="bg-gray-900 rounded-lg border border-gray-700 p-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{r.dump_name}</span>
                    {r.source && (
                      <span className="text-xs text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded shrink-0">
                        {r.source}
                      </span>
                    )}
                  </div>
                  {r.info && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{r.info.replace(/<[^>]+>/g, '')}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {r.breach_date && r.breach_date !== 'Unknown' && (
                    <div className="text-xs text-gray-400">{r.breach_date.slice(0, 10)}</div>
                  )}
                  {r.record_count && (
                    <div className="text-xs font-mono text-orange-300">
                      {Number(r.record_count).toLocaleString()} записів
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {total > results.length && (
            <p className="text-gray-500 text-xs mt-3">
              Показано {results.length} з {total}. Уточніть запит.
            </p>
          )}
        </>
      )}
      {!results.length && !loading && q && (
        <div className="text-gray-500 text-sm">Нічого не знайдено для «{q}»</div>
      )}
      {!q && (
        <div className="max-w-2xl bg-amber-950/20 border border-amber-900/30 rounded-xl p-4 text-xs text-gray-400">
          <p className="font-semibold text-amber-400 mb-1">📋 Каталог відомих витоків (known-breaches)</p>
          <p>181,403 записів з агрегаторів: HackNotice, DeHashed, Cit0day, WeLeakInfo, DataViper та ін.</p>
          <p className="mt-1">Пошук по назві сервісу, сайту або дампу.</p>
        </div>
      )}
    </div>
  )
}

// ─── Key setup guide ──────────────────────────────────────────────────────────
function KeysGuide() {
  const keys = [
    {
      name: 'HaveIBeenPwned',
      env:  'HIBP_API_KEY',
      price: '$3.50/міс',
      color: 'border-orange-800/50',
      badge: 'bg-orange-900/30 text-orange-400',
      steps: [
        '1. Зайдіть на haveibeenpwned.com/API/Key',
        '2. Натисніть "Get an API key"',
        '3. Вкажіть email — ключ прийде на пошту',
        '4. Додайте в .env.local: HIBP_API_KEY=ваш_ключ',
      ],
      url: 'https://haveibeenpwned.com/API/Key',
    },
    {
      name: 'DeHashed',
      env:  'DEHASHED_API_KEY + DEHASHED_EMAIL',
      price: '$5.49/міс',
      color: 'border-red-800/50',
      badge: 'bg-red-900/30 text-red-400',
      steps: [
        '1. Зареєструйтесь на dehashed.com',
        '2. Перейдіть в Profile → API Key',
        '3. Скопіюйте API Key',
        '4. DEHASHED_API_KEY=ключ, DEHASHED_EMAIL=ваш_email',
      ],
      url: 'https://dehashed.com',
    },
    {
      name: 'LeakCheck Pro',
      env:  'LEAKCHECK_API_KEY',
      price: '$9/міс',
      color: 'border-blue-800/50',
      badge: 'bg-blue-900/30 text-blue-400',
      steps: [
        '1. Зареєструйтесь на leakcheck.io',
        '2. Перейдіть в Profile → API Access',
        '3. Увімкніть API і скопіюйте ключ',
        '4. LEAKCHECK_API_KEY=ваш_ключ',
      ],
      url: 'https://leakcheck.io',
    },
    {
      name: 'SnusBase',
      env:  'SNUSBASE_API_KEY',
      price: '$6/міс',
      color: 'border-purple-800/50',
      badge: 'bg-purple-900/30 text-purple-400',
      steps: [
        '1. Зареєструйтесь на snusbase.com',
        '2. Придбайте будь-який план',
        '3. API ключ в Account Settings',
        '4. SNUSBASE_API_KEY=ваш_ключ',
      ],
      url: 'https://snusbase.com',
    },
    {
      name: '🇺🇦 OsintKit',
      env:  'OSINTKIT_API_KEY',
      price: 'від $5/міс',
      color: 'border-yellow-800/50',
      badge: 'bg-yellow-900/30 text-yellow-400',
      steps: [
        '1. Зареєструйтесь на osintkit.net',
        '2. Підтвердіть email',
        '3. Settings → API Token → скопіювати',
        '4. OSINTKIT_API_KEY=ваш_токен',
      ],
      url: 'https://osintkit.net',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-green-950/20 border border-green-800/40 rounded-xl p-4 text-sm">
        <p className="text-green-400 font-semibold mb-1">✅ Вже працює без ключів:</p>
        <p className="text-gray-400 text-xs">
          <strong className="text-white">LeakCheck Public</strong> — показує назви баз де є email (без деталей).
          Введіть будь-який email вище щоб перевірити.
        </p>
      </div>

      <p className="text-gray-400 text-sm font-semibold">🔑 Платні джерела — інструкція підключення:</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {keys.map(k => (
          <div key={k.name} className={`bg-gray-900 border ${k.color} rounded-xl p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${k.badge}`}>{k.name}</span>
              <span className="text-xs text-gray-500">{k.price}</span>
              <a href={k.url} target="_blank" rel="noopener noreferrer"
                className="ml-auto text-xs text-blue-400 hover:text-blue-300">
                Відкрити сайт →
              </a>
            </div>
            <ol className="space-y-1">
              {k.steps.map(s => (
                <li key={s} className="text-xs text-gray-400">{s}</li>
              ))}
            </ol>
            <div className="mt-3 bg-gray-800 rounded px-2 py-1.5">
              <code className="text-xs text-green-300">{k.env}=...</code>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500">
        <p className="font-semibold text-gray-400 mb-1">
          📁 Де редагувати: <code className="bg-gray-800 px-1 rounded text-green-300">.env.local</code>
        </p>
        <p>Після додавання ключів — перезапустіть dev-сервер (<code className="bg-gray-800 px-1 rounded">npm run dev</code>).</p>
      </div>
    </div>
  )
}

// ─── AI Profile Component ─────────────────────────────────────────────────────
function AIProfileView({ profile, query, total }: { profile: any; query: string; total: number }) {
  if (profile?.parse_error) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mt-4 max-w-3xl">
        <p className="text-yellow-400 font-semibold mb-2">🤖 AI Аналіз (raw)</p>
        <pre className="text-xs text-gray-400 whitespace-pre-wrap">{profile.raw}</pre>
      </div>
    )
  }

  const persons: any[] = profile?.persons || []
  const rels: any[]    = profile?.relationships || []

  return (
    <div className="mt-4 max-w-3xl space-y-3">
      {/* Summary */}
      <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-indigo-400 font-bold text-sm">🤖 AI Профіль</span>
          <span className="text-xs text-gray-500">{total} записів проаналізовано</span>
          {profile?.military_alert && profile.military_alert !== 'Немає' && (
            <span className="ml-auto text-xs bg-red-900/40 text-red-400 border border-red-800 px-2 py-0.5 rounded">
              ⚔️ {profile.military_alert}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-300">{profile?.summary}</p>
      </div>

      {/* Person cards */}
      {persons.map((p: any) => (
        <div key={p.id} className="bg-gray-900 border border-indigo-800/40 rounded-xl overflow-hidden">
          {/* Person header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-indigo-950/20">
            <div className="w-9 h-9 rounded-full bg-indigo-800/60 flex items-center justify-center text-indigo-300 font-bold text-sm shrink-0">
              {(p.full_name || '?').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm">{p.full_name}</div>
              {p.aliases?.length > 0 && (
                <div className="text-xs text-gray-500">також: {p.aliases.join(', ')}</div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-gray-400">{p.birth_date}</div>
              <div className="text-xs text-indigo-400">{p.source_count} баз · {p.confidence}</div>
            </div>
          </div>

          {/* Details grid */}
          <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
            {p.phones?.length > 0 && (
              <div className="col-span-2">
                <span className="text-xs text-gray-500">📞 Телефони: </span>
                <span className="text-xs text-green-300 font-mono">{p.phones.join(' · ')}</span>
              </div>
            )}
            {p.emails?.length > 0 && (
              <div className="col-span-2">
                <span className="text-xs text-gray-500">✉️ Email: </span>
                <span className="text-xs text-blue-300 font-mono">{p.emails.join(' · ')}</span>
              </div>
            )}
            {p.addresses?.length > 0 && (
              <div className="col-span-2">
                <span className="text-xs text-gray-500">🏠 Адреси: </span>
                <span className="text-xs text-gray-200">{p.addresses.join('; ')}</span>
              </div>
            )}
            {p.passports?.length > 0 && (
              <div className="col-span-2">
                <span className="text-xs text-gray-500">🪪 Паспорт: </span>
                <span className="text-xs text-gray-200 font-mono">
                  {p.passports.map((pass: any) => typeof pass === 'object' ? JSON.stringify(pass) : String(pass)).join(' · ')}
                </span>
              </div>
            )}
            {p.passport_issuer && (
              <div className="col-span-2">
                <span className="text-xs text-gray-500">🏛️ Ким видано: </span>
                <span className="text-xs text-gray-300">{p.passport_issuer}</span>
              </div>
            )}
            {p.birthplace && (
              <div className="col-span-2">
                <span className="text-xs text-gray-500">📍 Місце народження: </span>
                <span className="text-xs text-gray-300">{p.birthplace}</span>
              </div>
            )}
            {p.inn && (
              <div>
                <span className="text-xs text-gray-500">ІПН: </span>
                <span className="text-xs text-gray-200 font-mono">{p.inn}</span>
              </div>
            )}
            {p.snils && (
              <div>
                <span className="text-xs text-gray-500">СНІЛС: </span>
                <span className="text-xs text-gray-200 font-mono">{p.snils}</span>
              </div>
            )}
            {p.vehicles?.length > 0 && (
              <div className="col-span-2">
                <span className="text-xs text-gray-500">🚗 Авто: </span>
                <span className="text-xs text-gray-200">{p.vehicles.join(', ')}</span>
              </div>
            )}
            {p.military && (p.military.rank || p.military.unit) && (
              <div className="col-span-2 bg-red-950/30 border border-red-900/40 rounded px-2 py-1.5 mt-1">
                <span className="text-xs text-red-400 font-semibold">⚔️ ВІЙСЬКО: </span>
                <span className="text-xs text-red-200">
                  {[p.military.rank, p.military.position, p.military.unit].filter(Boolean).join(' · ')}
                </span>
              </div>
            )}
            {p.logins?.length > 0 && (
              <div className="col-span-2">
                <span className="text-xs text-gray-500">🔑 Логіни: </span>
                {p.logins.slice(0, 3).map((l: any, i: number) => (
                  <span key={i} className="text-xs font-mono text-yellow-300 mr-2">
                    {l.service}: {l.login}{l.password ? ':' + l.password : ''}
                  </span>
                ))}
              </div>
            )}
            {p.notes && (
              <div className="col-span-2 text-xs text-gray-500 italic mt-1">{p.notes}</div>
            )}
            {p.sources?.length > 0 && (
              <div className="col-span-2 flex flex-wrap gap-1 mt-1">
                {p.sources.slice(0, 6).map((s: string, i: number) => (
                  <span key={i} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-700">{s}</span>
                ))}
                {p.sources.length > 6 && (
                  <span className="text-xs text-gray-600">+{p.sources.length - 6} ще</span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Relationships */}
      {rels.length > 0 && (
        <div className="bg-gray-900 border border-amber-800/40 rounded-xl p-4">
          <p className="text-amber-400 font-semibold text-sm mb-2">🔗 Зв'язки між особами</p>
          <div className="space-y-1.5">
            {rels.map((r: any, i: number) => {
              const p1 = persons.find(p => p.id === r.person1_id)
              const p2 = persons.find(p => p.id === r.person2_id)
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-white">{p1?.full_name || `#${r.person1_id}`}</span>
                  <span className="text-amber-500">─ {r.type} ─</span>
                  <span className="text-white">{p2?.full_name || `#${r.person2_id}`}</span>
                  {r.evidence && <span className="text-gray-500 ml-1">({r.evidence})</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function BreachIntelContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [tab,        setTab]       = useState<'smart' | 'search' | 'catalog' | 'keys'>('smart')
  const [query,      setQuery]     = useState('')
  const [advanced,   setAdvanced]  = useState(false)
  const [fields,     setFields]    = useState<Record<string, string>>({
    name: '', phone: '', email: '', dob: '', inn: '', snils: '', passport: '', address: '', plate: '', vin: '',
  })
  const [loading,    setLoading]   = useState(false)
  const [result,     setResult]    = useState<any>(null)
  const [error,      setError]     = useState('')
  const [configured, setConfigured]= useState<Record<string, boolean>>({})
  const [aiLoading,  setAiLoading] = useState(false)
  const [aiProfile,  setAiProfile] = useState<any>(null)
  const [showRaw,    setShowRaw]   = useState(false)
  const [pivotLoading, setPivotLoading] = useState(false)
  const [pivotDone,    setPivotDone]    = useState(false)

  useEffect(() => {
    fetch('/api/breach/search').then(r => r.json()).then(d => {
      setConfigured(d.configured || {})
    }).catch(() => {})
  }, [])

  // ── Авто-запуск при переході через ?q= ──────────────────────────────────────
  // searchParams доступний тільки після монтування (Suspense boundary)
  const autoRanRef = useRef(false)
  useEffect(() => {
    const q = searchParams.get('q')
    if (!q || autoRanRef.current) return
    setQuery(q)
    setTab('smart')
    autoRanRef.current = true
    // Запускаємо пошук з невеликою затримкою щоб query встиг оновитися
    const timer = setTimeout(() => {
      setLoading(true); setError(''); setResult(null); setAiProfile(null); setPivotDone(false)
      fetch('/api/breach/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim() }),
      })
        .then(r => r.json())
        .then(d => { if (d.error) setError(d.error); else setResult(d) })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
    }, 50)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function setField(k: string, v: string) { setFields(f => ({ ...f, [k]: v })) }

  const typeLabel = /@/.test(query) ? '✉️ Email'
    : /^\+?\d{10,15}$/.test(query.replace(/[\s\-\(\)]/g, '')) ? '📞 Телефон'
    : /^\d{10}$/.test(query) ? '🔢 ІПН'
    : query.length > 2 ? "🔍 Ім'я" : ''

  const hasAdvancedFields = Object.values(fields).some(v => v.trim())

  async function search() {
    const useAdvanced = advanced && hasAdvancedFields
    if (!useAdvanced && (!query.trim() || query.length < 3)) return
    setLoading(true); setError(''); setResult(null); setAiProfile(null); setPivotDone(false)
    try {
      const body = useAdvanced
        ? { fields: Object.fromEntries(Object.entries(fields).filter(([,v]) => v.trim())) }
        : { query: query.trim() }
      const res  = await fetch('/api/breach/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function buildProfile() {
    if (!result) return
    setAiLoading(true); setAiProfile(null)
    try {
      const res = await fetch('/api/breach/profile', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: result.query, sources: result.sources }),
      })
      const data = await res.json()
      if (data.error && data.error !== 'no_data') throw new Error(data.error)
      setAiProfile(data)
    } catch (e: any) { setError('AI профіль: ' + e.message) }
    finally { setAiLoading(false) }
  }

  // Auto-pivot: extract identifiers from results → search each in all sources
  async function autoPivot() {
    if (!result) return
    setPivotLoading(true)
    try {
      // Collect all unique phones/emails/IPs/passports from results
      const phones   = new Set<string>()
      const emails   = new Set<string>()
      const passports= new Set<string>()
      const ips      = new Set<string>()
      const ipRe     = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/

      for (const [, src] of Object.entries(result.sources as Record<string, any>)) {
        for (const e of (src?.entries || [])) {
          if (e.phone)    phones.add(e.phone.replace(/\D/g, ''))
          if (e.email)    emails.add(e.email.toLowerCase())
          if (e.passport) passports.add(e.passport)
          if (e.ip && ipRe.test(e.ip)) ips.add(e.ip.trim())
          // extra phones/emails
          if (e.extra_phones) e.extra_phones.split(', ').forEach((p: string) => p.replace(/\D/g,'').length >= 10 && phones.add(p.replace(/\D/g, '')))
          if (e.extra_emails) e.extra_emails.split(', ').forEach((em: string) => emails.add(em.toLowerCase()))
          // extract IPs from banners/notes
          if (e.note) { const m = e.note.match(ipRe); if (m) ips.add(m[1]) }
        }
      }

      const identifiers: { value: string; type: string }[] = [
        ...Array.from(phones).slice(0, 4).map(v => ({ value: v, type: 'phone' })),
        ...Array.from(emails).slice(0, 3).map(v => ({ value: v, type: 'email' })),
        ...Array.from(passports).slice(0, 2).map(v => ({ value: v, type: 'passport' })),
        ...Array.from(ips).slice(0, 2).map(v => ({ value: v, type: 'ip' })),
      ]

      if (identifiers.length === 0) { setError('Не знайдено ідентифікаторів для пошук по ідентифікатораху'); return }

      const res = await fetch('/api/breach/pivot', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ identifiers }),
      })
      const data = await res.json()

      // Merge pivot results into existing result
      if (data.success) {
        setResult((prev: any) => {
          const merged = { ...prev }
          for (const pivotResult of (data.pivots || [])) {
            for (const [srcKey, srcData] of Object.entries((pivotResult.sources || {}) as Record<string, any>)) {
              if (!merged.sources[srcKey]) merged.sources[srcKey] = { entries: [], total: 0 }
              const existing = new Set(merged.sources[srcKey].entries.map((e: any) => JSON.stringify(e)))
              const newEntries = (srcData?.entries || []).filter((e: any) => {
                const tagged = { ...e, _pivot: pivotResult.pivot_value }
                return !existing.has(JSON.stringify(e))
              }).map((e: any) => ({ ...e, _pivot_from: `${pivotResult.pivot_type}:${pivotResult.pivot_value}` }))
              merged.sources[srcKey].entries = [...merged.sources[srcKey].entries, ...newEntries]
              merged.sources[srcKey].total = merged.sources[srcKey].entries.length
            }
          }
          merged.total_hits = Object.values(merged.sources as Record<string, any>)
            .reduce((s: number, r: any) => s + (!r.error ? (r.total || 0) : 0), 0)
          merged.pivoted = identifiers.map(i => `${i.type}:${i.value}`)
          return { ...merged }
        })
        setPivotDone(true)
      }
    } catch (e: any) { setError('Пошук по ідентифікаторах: ' + e.message) }
    finally { setPivotLoading(false) }
  }

  // ── Smart Enrich state ──
  const [enrichLoading, setEnrichLoading] = useState(false)
  const [enrichResult,  setEnrichResult]  = useState<any>(null)
  const [enrichFields,  setEnrichFields]  = useState({ name:'', phone:'', email:'', dob:'', inn:'', passport:'' })
  function setEF(k: string, v: string) { setEnrichFields(f => ({...f, [k]: v})) }

  async function runEnrich(forceRefresh = false) {
    const hasAny = Object.values(enrichFields).some(v => v.trim())
    if (!hasAny) return
    setEnrichLoading(true); setEnrichResult(null); setError('')
    try {
      const body = { ...Object.fromEntries(Object.entries(enrichFields).filter(([,v]) => v.trim())), force_refresh: forceRefresh }
      const res  = await fetch('/api/persons/enrich', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setEnrichResult(data)
    } catch (e: any) { setError(e.message) }
    finally { setEnrichLoading(false) }
  }

  const totalHits   = result?.total_hits || 0
  const activeSrcs  = result?.active_keys || []
  const freeCount   = Object.entries(configured).filter(([k, v]) => v && ['leakcheck_public', 'local_leaks'].includes(k)).length
  const paidCount   = Object.entries(configured).filter(([k, v]) => v && !['leakcheck_public', 'local_leaks'].includes(k)).length

  // Source display order
  const sourceOrder = ['osintkit', 'peoplefind_bot', 'leakcheck_public', 'hibp', 'leakcheck', 'dehashed', 'snusbase', 'shodan', 'censys', 'local_leaks']

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-bold text-white">🔓 Breach Intelligence</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              LeakCheck · HaveIBeenPwned · DeHashed · SnusBase · 181k витоків у каталозі
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 bg-green-900/30 text-green-400 border border-green-800/50 rounded">
              ✅ {freeCount} free
            </span>
            {paidCount > 0 && (
              <span className="text-xs px-2 py-1 bg-blue-900/30 text-blue-400 border border-blue-800/50 rounded">
                🔑 {paidCount} платних
              </span>
            )}
            <button onClick={() => router.push('/admin/leaks-import')}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs transition">
              📥 Імпорт
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 border-b border-gray-800 flex gap-1 shrink-0">
          {[
            { key: 'smart',   label: '🧠 Smart Search' },
            { key: 'search',  label: '🔍 Ручний пошук' },
            { key: 'catalog', label: '📋 Каталог витоків' },
            { key: 'keys',    label: '🔑 Джерела' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 text-sm rounded-t-lg transition ${
                tab === t.key
                  ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700'
                  : 'text-gray-500 hover:text-gray-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Tab: Smart Search (self-populating DB) ── */}
          {tab === 'smart' && (
            <div className="max-w-2xl">
              {/* Header */}
              <div className="mb-5 bg-indigo-950/30 border border-indigo-800/40 rounded-xl p-4">
                <h2 className="text-indigo-300 font-bold text-sm mb-1">🧠 Smart Search — самонаповнювана база</h2>
                <p className="text-xs text-gray-400">
                  Шукає у <strong className="text-white">всіх підключених базах</strong> одночасно →
                  автоматично шукає по знайдених телефонах/email/паспортах →
                  AI збирає єдиний профіль → <strong className="text-indigo-300">зберігає у вашу базу на 167k осіб</strong>.
                  Наступний пошук — миттєво з кешу.
                </p>
              </div>

              {/* Search form */}
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-500 mb-3">Заповни що знаєш — чим більше, тим точніший результат:</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">ПІБ *</label>
                    <input value={enrichFields.name} onChange={e => setEF('name', e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && runEnrich()}
                      placeholder="Романов Александр Викторович"
                      className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm
                                 focus:border-indigo-500 focus:outline-none placeholder-gray-600" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Дата народження</label>
                    <input value={enrichFields.dob} onChange={e => setEF('dob', e.target.value)}
                      placeholder="05.03.1989"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm
                                 focus:border-indigo-500 focus:outline-none placeholder-gray-600 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Телефон</label>
                    <input value={enrichFields.phone} onChange={e => setEF('phone', e.target.value)}
                      placeholder="79888385632"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm
                                 focus:border-indigo-500 focus:outline-none placeholder-gray-600 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Email</label>
                    <input value={enrichFields.email} onChange={e => setEF('email', e.target.value)}
                      placeholder="romanov@mail.ru"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm
                                 focus:border-indigo-500 focus:outline-none placeholder-gray-600 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ІПН</label>
                    <input value={enrichFields.inn} onChange={e => setEF('inn', e.target.value)}
                      placeholder="123456789012"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm
                                 focus:border-indigo-500 focus:outline-none placeholder-gray-600 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Паспорт</label>
                    <input value={enrichFields.passport} onChange={e => setEF('passport', e.target.value)}
                      placeholder="4516409823"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm
                                 focus:border-indigo-500 focus:outline-none placeholder-gray-600 font-mono" />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => runEnrich(false)}
                    disabled={enrichLoading || !Object.values(enrichFields).some(v => v.trim())}
                    className="flex-1 py-3 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2">
                    {enrichLoading
                      ? <><span className="animate-spin">⟳</span> Шукаю + збагачую + зберігаю...</>
                      : <>🧠 Smart Search + Зберегти в базу</>}
                  </button>
                  {enrichResult && (
                    <button onClick={() => runEnrich(true)}
                      className="px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-xs text-gray-400 transition">
                      🔄 Оновити
                    </button>
                  )}
                </div>
              </div>

              {error && (
                <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl p-3 mb-4 text-sm">⚠️ {error}</div>
              )}

              {/* Results */}
              {enrichResult && (
                <div className="space-y-3">
                  {/* Status bar */}
                  <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
                    enrichResult.source === 'cache'
                      ? 'bg-green-950/30 border-green-800'
                      : 'bg-indigo-950/30 border-indigo-800'
                  }`}>
                    <span className="text-2xl">{enrichResult.source === 'cache' ? '⚡' : '🔍'}</span>
                    <div className="flex-1">
                      <div className="font-bold text-sm text-white">
                        {enrichResult.source === 'cache' ? 'Знайдено в локальній базі' : `Пошук завершено`}
                      </div>
                      <div className="text-xs text-gray-400">
                        {enrichResult.source === 'cache'
                          ? `Остання розвідка: ${enrichResult.cached_at ? new Date(enrichResult.cached_at).toLocaleString('uk') : '?'}`
                          : `${enrichResult.direct_hits || 0} прямих + ${enrichResult.pivot_hits || 0} через пів'от = ${enrichResult.total_records || 0} записів`
                        }
                      </div>
                    </div>
                    {enrichResult.saved_to_db && (
                      <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-1 rounded-lg">
                        ✅ Збережено в базу
                      </span>
                    )}
                    {enrichResult.person_id && (
                      <a href={`/persons/${enrichResult.person_id}`}
                        className="text-xs bg-indigo-900/40 text-indigo-400 border border-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-900/60">
                        👤 Відкрити картку →
                      </a>
                    )}
                  </div>

                  {/* AI Profile */}
                  {enrichResult.ai_profile && !enrichResult.ai_profile?.parse_error && (
                    <AIProfileView
                      profile={enrichResult.ai_profile}
                      query={enrichResult.query}
                      total={enrichResult.total_records || 0}
                    />
                  )}

                  {/* Source breakdown (collapsed) */}
                  {enrichResult.search_result?.sources && (
                    <details className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      <summary className="px-4 py-3 cursor-pointer text-sm text-gray-400 hover:text-white select-none">
                        📦 Сирі дані по джерелах ({enrichResult.total_records} записів)
                      </summary>
                      <div className="p-4 space-y-2 border-t border-gray-800">
                        {sourceOrder
                          .filter(key => enrichResult.search_result.sources?.[key])
                          .map(key => (
                            <SourceBlock key={key} sourceKey={key} data={enrichResult.search_result.sources[key]} />
                          ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Search ── */}
          {tab === 'search' && (
            <>
              {/* ── Search form ── */}
              <div className="max-w-2xl mb-4">
                {/* Mode toggle */}
                <div className="flex items-center gap-3 mb-3">
                  <button onClick={() => setAdvanced(false)}
                    className={`text-xs px-3 py-1 rounded-lg transition ${!advanced ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                    🔍 Простий
                  </button>
                  <button onClick={() => setAdvanced(true)}
                    className={`text-xs px-3 py-1 rounded-lg transition ${advanced ? 'bg-indigo-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                    ⚙️ Розширений
                  </button>
                  <span className="text-xs text-gray-600">Розширений = кілька параметрів одночасно (OsintKit)</span>
                </div>

                {!advanced ? (
                  /* Simple search */
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && search()}
                        placeholder="Email, телефон, ім'я, ІПН, паспорт..."
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white
                                   focus:border-red-500 focus:outline-none placeholder-gray-500 font-mono"
                      />
                      {typeLabel && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{typeLabel}</span>
                      )}
                    </div>
                    <button onClick={search} disabled={!query.trim() || loading}
                      className="px-5 py-3 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-xl font-semibold text-sm transition">
                      {loading ? <span className="animate-spin inline-block">⟳</span> : '🔍'}
                    </button>
                  </div>
                ) : (
                  /* Advanced multi-field search */
                  <div className="bg-gray-900 border border-indigo-800/40 rounded-xl p-4">
                    <p className="text-xs text-indigo-400 mb-3 font-semibold">Заповни будь-які поля — чим більше, тим точніший результат:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'name',     label: "ПІБ",         ph: 'Романов Александр Викторович' },
                        { key: 'phone',    label: 'Телефон',     ph: '79888385632' },
                        { key: 'email',    label: 'Email',       ph: 'romanov@mail.ru' },
                        { key: 'dob',      label: 'Дата народж.', ph: '05.03.1989' },
                        { key: 'inn',      label: 'ІПН',         ph: '123456789012' },
                        { key: 'snils',    label: 'СНІЛС',       ph: '123-456-789 00' },
                        { key: 'passport', label: 'Паспорт',     ph: '4516409823' },
                        { key: 'address',  label: 'Адреса',      ph: 'Курск Малышева 223' },
                        { key: 'plate',    label: 'Номер авто',  ph: 'Н110АТ126' },
                        { key: 'vin',      label: 'VIN',         ph: 'XTA210990...' },
                      ].map(({ key, label, ph }) => (
                        <div key={key}>
                          <label className="text-xs text-gray-500 mb-0.5 block">{label}</label>
                          <input
                            value={fields[key] || ''}
                            onChange={e => setField(key, e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && search()}
                            placeholder={ph}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs
                                       focus:border-indigo-500 focus:outline-none placeholder-gray-600 font-mono"
                          />
                        </div>
                      ))}
                    </div>
                    <button onClick={search} disabled={!hasAdvancedFields || loading}
                      className="mt-3 w-full py-2.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded-xl font-semibold text-sm transition">
                      {loading ? <><span className="animate-spin inline-block">⟳</span> Шукаю...</> : '🔍 Розширений пошук'}
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div className="max-w-2xl bg-red-950 border border-red-800 text-red-300 rounded-xl p-3 mb-4 text-sm">
                  ⚠️ {error}
                </div>
              )}

              {/* Results summary + action buttons */}
              {result && (
                <div className={`max-w-2xl mb-3 px-4 py-3 rounded-xl border ${
                  totalHits > 0 ? 'bg-red-950/30 border-red-800' : 'bg-gray-800 border-gray-700'
                }`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className={`font-bold text-lg ${totalHits > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        {totalHits > 0 ? `⚠️ ${totalHits} знайдено` : '✓ Не знайдено'}
                      </span>
                      <span className="text-gray-500 text-xs ml-2">для «{result.query}»</span>
                      {result.pivoted && (
                        <span className="text-xs text-indigo-400 ml-2">+ пошук по ідентифікаторах по {result.pivoted.length} ідент.</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {activeSrcs.map((k: string) => (
                        <span key={k} className={`text-xs px-1.5 py-0.5 rounded border ${
                          SOURCE_META[k]?.free ? 'text-green-400 bg-green-900/30 border-green-800'
                                               : 'text-blue-400 bg-blue-900/30 border-blue-800'
                        }`}>{SOURCE_META[k]?.label || k}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons row */}
              {result && totalHits > 0 && (
                <div className="max-w-2xl mb-5 flex flex-wrap items-center gap-2">
                  {/* AI Profile */}
                  <button onClick={buildProfile} disabled={aiLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-60 rounded-xl text-sm font-semibold transition">
                    {aiLoading
                      ? <><span className="animate-spin">⟳</span> AI аналізує...</>
                      : <>🤖 AI профіль</>}
                  </button>

                  {/* Auto-pivot */}
                  <button onClick={autoPivot} disabled={pivotLoading || pivotDone}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                      pivotDone ? 'bg-green-900/40 text-green-400 border border-green-800'
                                : 'bg-amber-800/60 hover:bg-amber-700 disabled:opacity-60'
                    }`}>
                    {pivotLoading
                      ? <><span className="animate-spin">⟳</span> Пошук по ідентифікаторах...</>
                      : pivotDone ? <>✅ Пошук по ідентифікаторах завершено</>
                      : <>🔄 Авто-пошук по ідентифікаторах (телефони/email/паспорти)</>}
                  </button>

                  {/* Toggle raw/profile */}
                  {aiProfile && (
                    <button onClick={() => setShowRaw(!showRaw)}
                      className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 px-3 py-2 rounded-lg">
                      {showRaw ? '← AI профіль' : '📋 Сирі дані'}
                    </button>
                  )}
                </div>
              )}

              {/* AI Profile view */}
              {aiProfile && !showRaw && (
                <AIProfileView profile={aiProfile.profile} query={aiProfile.query} total={aiProfile.total_records} />
              )}

              {/* Raw source blocks */}
              {(!aiProfile || showRaw) && result && (
                <div className="max-w-3xl space-y-3">
                  {sourceOrder
                    .filter(key => result.sources?.[key])
                    .map(key => (
                      <SourceBlock key={key} sourceKey={key} data={result.sources[key]} />
                    ))}
                </div>
              )}

              {!result && !loading && !error && (
                <div className="max-w-3xl">
                  {/* Status grid */}
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {sourceOrder.map(key => {
                      const meta = SOURCE_META[key]
                      const isConfigured = configured[key]
                      return (
                        <div key={key} className={`bg-gray-900 border rounded-xl p-4 ${
                          isConfigured ? 'border-gray-700' : 'border-gray-800'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{meta?.icon}</span>
                            <span className={`font-semibold text-xs ${meta?.color}`}>{meta?.label}</span>
                            {meta?.free ? (
                              <span className="ml-auto text-xs text-green-400">✓ free</span>
                            ) : isConfigured ? (
                              <span className="ml-auto text-xs text-blue-400">✓ active</span>
                            ) : (
                              <span className="ml-auto text-xs text-gray-600">○ off</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600">{meta?.desc}</p>
                        </div>
                      )
                    })}
                  </div>

                  <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-xs text-gray-500">
                    <p className="font-semibold text-gray-400 mb-2">⚖️ Правова основа використання:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Розслідування шахрайства та ідентифікація шахраїв</li>
                      <li>Журналістські розслідування (публічний інтерес)</li>
                      <li>Кримінальні провадження (правоохоронні органи)</li>
                      <li>Пошук воєнних злочинців (ICC, трибунали)</li>
                      <li>Перевірка власних даних на витоки</li>
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Tab: Catalog ── */}
          {tab === 'catalog' && <CatalogTab />}

          {/* ── Tab: Keys guide ── */}
          {tab === 'keys' && <KeysGuide />}
        </div>
      </main>
    </div>
  )
}

// Suspense wrapper — обов'язковий для useSearchParams() в Next.js App Router
export default function BreachIntelPage() {
  return (
    <Suspense fallback={null}>
      <BreachIntelContent />
    </Suspense>
  )
}
