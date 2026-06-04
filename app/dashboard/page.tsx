'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase/client'

function detectType(q: string): string {
  const clean = q.replace(/[\s\-\(\)\+]/g, '')
  if (/^\d{8}$/.test(clean))  return 'edrpou'
  if (/^\d{10}$/.test(clean)) return 'inn'
  if (/^\d{11}$/.test(clean)) return 'snils'
  if (/^\+?\d{10,15}$/.test(clean)) return 'phone'
  if (/@/.test(q))             return 'email'
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(q)) return 'ip'
  if (/^[a-z0-9][a-z0-9\-]*\.[a-z]{2,}/i.test(q) && !q.includes(' ')) return 'domain'
  if (/^[a-z0-9_\.]{3,25}$/i.test(q) && !q.includes(' ')) return 'username'
  return 'name'
}

const TYPE_HINT: Record<string, { label: string; icon: string; color: string }> = {
  phone:    { label: 'Телефон',   icon: '📞', color: 'text-green-400' },
  email:    { label: 'Email',     icon: '✉️', color: 'text-blue-400' },
  inn:      { label: 'ІПН',       icon: '🆔', color: 'text-yellow-400' },
  snils:    { label: 'СНІЛС',     icon: '🆔', color: 'text-yellow-400' },
  edrpou:   { label: 'ЄДРПОУ',    icon: '🏢', color: 'text-cyan-400' },
  ip:       { label: 'IP адреса', icon: '🌐', color: 'text-purple-400' },
  domain:   { label: 'Домен',     icon: '🌍', color: 'text-purple-300' },
  username: { label: 'Username',  icon: '👤', color: 'text-orange-400' },
  name:     { label: "ПІБ / Ім'я",icon: '🔍', color: 'text-gray-300' },
}

const EXAMPLES = [
  { label: '+380501234567', hint: 'Телефон' },
  { label: 'Іванов Іван', hint: 'ПІБ' },
  { label: 'ivanov_ivan', hint: 'Username' },
  { label: 'ivan@gmail.com', hint: 'Email' },
  { label: '14223150', hint: 'ЄДРПОУ' },
  { label: '185.87.152.1', hint: 'IP' },
]

const QUICK_LINKS = [
  { icon: '👥', label: 'Картотека', desc: 'База осіб', href: '/persons' },
  { icon: '⚖️', label: 'Справи', desc: 'Інциденти', href: '/incidents' },
  { icon: '📋', label: 'Реєстри', desc: 'НАЗК, МВС та ін.', href: '/registries' },
  { icon: '🔓', label: 'Витоки', desc: 'Бази даних', href: '/breach-intel' },
  { icon: '🏢', label: 'Бізнес', desc: 'ЄДР, контрагенти', href: '/company-search' },
  { icon: '🌐', label: 'Мережа', desc: 'IP та домени', href: '/network-intel' },
]

export default function Dashboard() {
  const router   = useRouter()
  const supabase = createClient()
  const [query,   setQuery]   = useState('')
  const [focused, setFocused] = useState(false)

  // Auth guard
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/login')
    })
  }, [])

  const qType = query.trim() ? detectType(query.trim()) : ''
  const hint  = TYPE_HINT[qType]

  function handleSearch(q?: string) {
    const sq = (q ?? query).trim()
    if (!sq) return
    router.push(`/search-all?q=${encodeURIComponent(sq)}`)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* Top nav */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-900">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🛡️</span>
          <span className="font-bold text-sm text-white tracking-wide">ODB</span>
          <span className="text-gray-600 text-xs hidden sm:block">Intelligence Platform</span>
        </div>
        <nav className="flex items-center gap-1">
          <button onClick={() => router.push('/persons')}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition">
            Картотека
          </button>
          <button onClick={() => router.push('/incidents')}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition">
            Справи
          </button>
          <button onClick={() => router.push('/settings')}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition">
            ⚙️
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-950 rounded-lg transition ml-1">
            Вийти
          </button>
        </nav>
      </header>

      {/* Main search area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-16">

        {/* Logo */}
        <div className="mb-10 text-center select-none">
          <div className="text-6xl mb-4">🛡️</div>
          <h1 className="text-4xl font-bold text-white tracking-tight">ODB Platform</h1>
          <p className="text-gray-500 text-sm mt-2">Розвідувальна система відкритих джерел</p>
        </div>

        {/* Search box */}
        <div className="w-full max-w-2xl">
          <div className={`relative flex items-center rounded-2xl border-2 transition-all duration-200
            bg-gray-900 ${focused ? 'border-blue-500 shadow-xl shadow-blue-900/20' : 'border-gray-700'}`}>
            <span className="pl-5 text-gray-500 text-xl shrink-0">🔍</span>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Телефон, ПІБ, email, username, IP-адреса, домен, ЄДРПОУ..."
              className="flex-1 px-4 py-4 bg-transparent text-white text-base
                         placeholder-gray-600 outline-none font-mono"
            />
            {hint && (
              <div className={`mr-3 flex items-center gap-1.5 text-xs font-semibold
                px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 shrink-0 ${hint.color}`}>
                {hint.icon} {hint.label}
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-4 justify-center">
            <button
              onClick={() => handleSearch()}
              disabled={!query.trim()}
              className="px-10 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30
                         disabled:cursor-not-allowed rounded-xl text-sm font-semibold transition-all
                         hover:scale-[1.02] active:scale-[0.98]"
            >
              Пошук
            </button>
            <button
              onClick={() => setQuery('')}
              className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm
                         text-gray-400 hover:text-white transition-all"
            >
              Очистити
            </button>
          </div>

          {/* Example queries */}
          <div className="flex flex-wrap gap-2 mt-5 justify-center">
            {EXAMPLES.map(ex => (
              <button
                key={ex.label}
                onClick={() => handleSearch(ex.label)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800
                           border border-gray-800 hover:border-gray-600 rounded-xl
                           text-xs text-gray-500 hover:text-white transition-all font-mono"
              >
                <span className="text-gray-600 font-sans not-italic">{ex.hint}:</span>
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Connected databases */}
        <div className="mt-8 max-w-2xl w-full">
          <p className="text-center text-xs text-gray-600 mb-3 tracking-wider uppercase">Підключені бази даних</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              { icon: '🔥', label: 'LeakOsint', color: 'text-orange-400 border-orange-900/50 bg-orange-950/20', sub: '800+ RU/CIS баз' },
              { icon: '🗂', label: 'OsintKit',  color: 'text-yellow-400 border-yellow-900/50 bg-yellow-950/20', sub: '731 RU база' },
              { icon: '👥', label: 'PeopleFindBase', color: 'text-sky-400 border-sky-900/50 bg-sky-950/20', sub: '308 файлів' },
              { icon: '🔓', label: 'DeHashed',  color: 'text-red-400 border-red-900/50 bg-red-950/20', sub: 'Витоки' },
              { icon: '✅', label: 'LeakCheck', color: 'text-green-400 border-green-900/50 bg-green-950/20', sub: 'Витоки' },
              { icon: '🔔', label: 'HIBP',      color: 'text-purple-400 border-purple-900/50 bg-purple-950/20', sub: 'Email' },
              { icon: '💙', label: 'VKontakte', color: 'text-blue-400 border-blue-900/50 bg-blue-950/20', sub: 'Соцмережа' },
              { icon: '✈️', label: 'Telegram',  color: 'text-sky-400 border-sky-900/50 bg-sky-950/20', sub: 'Месенджер' },
              { icon: '🚫', label: 'Санкції',   color: 'text-red-400 border-red-900/50 bg-red-950/20', sub: 'РНБО/OFAC/EU' },
              { icon: '📋', label: 'НАЗК/МВС',  color: 'text-green-400 border-green-900/50 bg-green-950/20', sub: 'Реєстри UA' },
              { icon: '🌐', label: 'Shodan',    color: 'text-purple-400 border-purple-900/50 bg-purple-950/20', sub: 'Мережа' },
              { icon: '🔍', label: 'Web',       color: 'text-emerald-400 border-emerald-900/50 bg-emerald-950/20', sub: 'Інтернет' },
            ].map(db => (
              <div key={db.label}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs ${db.color}`}>
                <span>{db.icon}</span>
                <span className="font-semibold">{db.label}</span>
                <span className="text-gray-600 hidden sm:block">· {db.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick access grid */}
        <div className="mt-8 max-w-2xl w-full">
          <p className="text-center text-xs text-gray-600 mb-4 tracking-wider uppercase">Швидкий доступ</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {QUICK_LINKS.map(item => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="flex flex-col items-center p-3 bg-gray-900 hover:bg-gray-800
                           border border-gray-800 hover:border-gray-700 rounded-xl
                           transition-all text-center group hover:scale-[1.03]"
              >
                <span className="text-2xl mb-1.5">{item.icon}</span>
                <span className="text-xs font-semibold text-gray-300 group-hover:text-white leading-tight">
                  {item.label}
                </span>
                <span className="text-xs text-gray-600 mt-0.5 leading-tight hidden sm:block">
                  {item.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>

      <footer className="py-3 text-center text-xs text-gray-800 border-t border-gray-900">
        ODB Intelligence Platform · OSINT &amp; War Crimes Documentation
      </footer>
    </div>
  )
}
