'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase/client'
import Icon, { type IconName } from '../components/Icon'

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

const TYPE_HINT: Record<string, { label: string; color: string }> = {
  phone:    { label: 'Телефон',   color: 'text-[var(--odb-ok)]' },
  email:    { label: 'Email',     color: 'text-[var(--odb-info)]' },
  inn:      { label: 'ІПН',       color: 'text-[var(--odb-warn)]' },
  snils:    { label: 'СНІЛС',     color: 'text-[var(--odb-warn)]' },
  edrpou:   { label: 'ЄДРПОУ',    color: 'text-[var(--odb-info)]' },
  ip:       { label: 'IP адреса', color: 'text-purple-400' },
  domain:   { label: 'Домен',     color: 'text-purple-300' },
  username: { label: 'Username',  color: 'text-orange-400' },
  name:     { label: "ПІБ / Ім'я",color: 'text-[var(--odb-text-dim)]' },
}

const EXAMPLES = [
  { label: '+380501234567', hint: 'Телефон' },
  { label: 'Іванов Іван', hint: 'ПІБ' },
  { label: 'ivanov_ivan', hint: 'Username' },
  { label: 'ivan@gmail.com', hint: 'Email' },
  { label: '14223150', hint: 'ЄДРПОУ' },
  { label: '185.87.152.1', hint: 'IP' },
]

const QUICK_LINKS: { icon: IconName; label: string; desc: string; href: string }[] = [
  { icon: 'users',    label: 'Картотека', desc: 'База осіб',        href: '/persons' },
  { icon: 'scale',    label: 'Справи',    desc: 'Інциденти',        href: '/incidents' },
  { icon: 'clipboard',label: 'Реєстри',   desc: 'НАЗК, МВС та ін.', href: '/registries' },
  { icon: 'database', label: 'Витоки',    desc: 'Бази даних',       href: '/breach-intel' },
  { icon: 'building', label: 'Бізнес',    desc: 'ЄДР, контрагенти', href: '/company-search' },
  { icon: 'network',  label: 'Мережа',    desc: 'IP та домени',     href: '/network-intel' },
]

const DATABASES = [
  { label: 'LeakOsint',     sub: '800+ RU/CIS баз', dot: 'bg-orange-400' },
  { label: 'OsintKit',      sub: '731 RU база',     dot: 'bg-yellow-400' },
  { label: 'PeopleFindBase',sub: '308 файлів',      dot: 'bg-sky-400' },
  { label: 'DeHashed',      sub: 'Витоки',          dot: 'bg-red-400' },
  { label: 'LeakCheck',     sub: 'Витоки',          dot: 'bg-green-400' },
  { label: 'HIBP',          sub: 'Email',           dot: 'bg-purple-400' },
  { label: 'VKontakte',     sub: 'Соцмережа',       dot: 'bg-blue-400' },
  { label: 'Telegram',      sub: 'Месенджер',       dot: 'bg-sky-400' },
  { label: 'Санкції',       sub: 'РНБО/OFAC/EU',    dot: 'bg-red-400' },
  { label: 'НАЗК/МВС',      sub: 'Реєстри UA',      dot: 'bg-green-400' },
  { label: 'Shodan',        sub: 'Мережа',          dot: 'bg-purple-400' },
  { label: 'Web',           sub: 'Інтернет',        dot: 'bg-emerald-400' },
]

export default function Dashboard() {
  const router   = useRouter()
  const supabase = createClient()
  const [query,   setQuery]   = useState('')
  const [focused, setFocused] = useState(false)

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
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--odb-bg)' }}>

      {/* Декоративне фонове світіння */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full blur-[120px] opacity-[0.13]"
             style={{ background: 'radial-gradient(circle, var(--odb-accent), transparent 70%)' }} />
      </div>

      {/* Top nav — скляний */}
      <header className="odb-glass sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b"
              style={{ borderColor: 'var(--odb-border-soft)' }}>
        <div className="flex items-center gap-2.5">
          <span className="text-[var(--odb-accent-hi)]"><Icon name="shield" size={22} /></span>
          <span className="font-bold text-sm text-white tracking-wide">ODB</span>
          <span className="text-[var(--odb-text-faint)] text-xs hidden sm:block">Intelligence Platform</span>
        </div>
        <nav className="flex items-center gap-1">
          <button onClick={() => router.push('/persons')}
            className="px-3 py-1.5 text-xs text-[var(--odb-text-dim)] hover:text-white hover:bg-[var(--odb-surface-3)] rounded-lg transition">
            Картотека
          </button>
          <button onClick={() => router.push('/incidents')}
            className="px-3 py-1.5 text-xs text-[var(--odb-text-dim)] hover:text-white hover:bg-[var(--odb-surface-3)] rounded-lg transition">
            Справи
          </button>
          <button onClick={() => router.push('/settings')}
            className="p-1.5 text-[var(--odb-text-dim)] hover:text-white hover:bg-[var(--odb-surface-3)] rounded-lg transition">
            <Icon name="settings" size={16} />
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            className="p-1.5 text-[var(--odb-danger)] hover:bg-red-950/40 rounded-lg transition ml-1">
            <Icon name="logout" size={16} />
          </button>
        </nav>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-16 pt-10">

        {/* Logo */}
        <div className="mb-9 text-center select-none odb-animate-up">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-4 odb-glow"
               style={{ background: 'linear-gradient(135deg, var(--odb-accent-hi), var(--odb-accent-lo))' }}>
            <span className="text-white"><Icon name="shield" size={42} strokeWidth={2} /></span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-white">ODB </span>
            <span className="odb-gradient-text">Platform</span>
          </h1>
          <p className="text-[var(--odb-text-faint)] text-sm mt-2">Розвідувальна система відкритих джерел</p>
        </div>

        {/* Search box */}
        <div className="w-full max-w-2xl odb-animate-up" style={{ animationDelay: '0.08s' }}>
          <div className="relative flex items-center rounded-2xl border transition-all duration-300"
               style={{
                 background: 'var(--odb-surface-2)',
                 borderColor: focused ? 'var(--odb-accent)' : 'var(--odb-border)',
                 boxShadow: focused ? 'var(--odb-shadow-accent)' : 'var(--odb-shadow)',
               }}>
            <span className="pl-5 text-[var(--odb-text-faint)] shrink-0"><Icon name="search" size={22} /></span>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Телефон, ПІБ, email, username, IP-адреса, домен, ЄДРПОУ…"
              className="flex-1 px-4 py-4 bg-transparent text-white text-base placeholder-[var(--odb-text-faint)] outline-none font-mono"
            />
            {hint && (
              <div className={`mr-3 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 odb-animate-scale ${hint.color}`}
                   style={{ background: 'var(--odb-surface-3)', border: '1px solid var(--odb-border)' }}>
                {hint.label}
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-4 justify-center">
            <button onClick={() => handleSearch()} disabled={!query.trim()}
              className="odb-btn-accent px-10 py-2.5 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2">
              <Icon name="search" size={16} /> Пошук
            </button>
            <button onClick={() => setQuery('')}
              className="px-6 py-2.5 rounded-xl text-sm text-[var(--odb-text-dim)] hover:text-white transition-all"
              style={{ background: 'var(--odb-surface-2)', border: '1px solid var(--odb-border)' }}>
              Очистити
            </button>
          </div>

          {/* Examples */}
          <div className="flex flex-wrap gap-2 mt-5 justify-center">
            {EXAMPLES.map(ex => (
              <button key={ex.label} onClick={() => handleSearch(ex.label)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-[var(--odb-text-faint)] hover:text-white transition-all font-mono"
                style={{ background: 'var(--odb-surface)', border: '1px solid var(--odb-border-soft)' }}>
                <span className="font-sans text-[var(--odb-text-faint)]">{ex.hint}:</span>
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Connected databases */}
        <div className="mt-9 max-w-2xl w-full odb-animate-up" style={{ animationDelay: '0.16s' }}>
          <p className="text-center text-xs text-[var(--odb-text-faint)] mb-3 tracking-wider uppercase">Підключені бази даних</p>
          <div className="flex flex-wrap gap-2 justify-center odb-stagger">
            {DATABASES.map(db => (
              <div key={db.label}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs"
                style={{ background: 'var(--odb-surface)', border: '1px solid var(--odb-border-soft)' }}>
                <span className={`w-1.5 h-1.5 rounded-full ${db.dot}`} />
                <span className="font-semibold text-[var(--odb-text-dim)]">{db.label}</span>
                <span className="text-[var(--odb-text-faint)] hidden sm:block">· {db.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick access */}
        <div className="mt-9 max-w-2xl w-full odb-animate-up" style={{ animationDelay: '0.24s' }}>
          <p className="text-center text-xs text-[var(--odb-text-faint)] mb-4 tracking-wider uppercase">Швидкий доступ</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 odb-stagger">
            {QUICK_LINKS.map(item => (
              <button key={item.href} onClick={() => router.push(item.href)}
                className="odb-card odb-card-hover flex flex-col items-center p-3.5 text-center group">
                <span className="mb-2 text-[var(--odb-text-dim)] group-hover:text-[var(--odb-accent-hi)] transition-colors">
                  <Icon name={item.icon} size={24} />
                </span>
                <span className="text-xs font-semibold text-[var(--odb-text-dim)] group-hover:text-white leading-tight transition-colors">
                  {item.label}
                </span>
                <span className="text-xs text-[var(--odb-text-faint)] mt-0.5 leading-tight hidden sm:block">
                  {item.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-3 text-center text-xs text-[var(--odb-text-faint)] border-t"
              style={{ borderColor: 'var(--odb-border-soft)' }}>
        ODB Intelligence Platform · OSINT &amp; War Crimes Documentation
      </footer>
    </div>
  )
}
