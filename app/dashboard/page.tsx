'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase/client'
import Icon, { type IconName } from '../components/Icon'
import Sidebar from '../components/Sidebar'

function detectType(q: string): string {
  const clean = q.replace(/[\s\-\(\)\+]/g, '')
  if (/^\d{8}$/.test(clean))  return 'edrpou'
  if (/^\d{10}$/.test(clean)) return 'inn'
  if (/^\d{11}$/.test(clean)) return 'snils'
  if (/^\+?\d{10,15}$/.test(clean)) return 'phone'
  if (/@/.test(q))             return 'email'
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(q)) return 'ip'
  // Крипто — перед domain/username щоб уникнути хибних спрацювань
  if (/^0x[0-9a-fA-F]{40}$/.test(q))                return 'crypto_eth'
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(q))        return 'crypto_tron'
  if (/^(1|3)[1-9A-HJ-NP-Za-km-z]{25,33}$/.test(q)) return 'crypto_btc'
  if (/^bc1[0-9a-z]{6,87}$/i.test(q))               return 'crypto_btc'
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,33}$/.test(q))     return 'crypto_xrp'
  if (/^[0-9a-fA-F]{64}$/.test(q))                  return 'crypto_tx'
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
  ip:          { label: 'IP адреса',   color: 'text-purple-400' },
  domain:      { label: 'Домен',       color: 'text-purple-300' },
  username:    { label: 'Username',    color: 'text-orange-400' },
  name:        { label: "ПІБ / Ім'я", color: 'text-[var(--odb-text-dim)]' },
  crypto_eth:  { label: '⟠ ETH',      color: 'text-blue-400' },
  crypto_tron: { label: '◈ TRON',     color: 'text-red-400' },
  crypto_btc:  { label: '₿ BTC',      color: 'text-yellow-400' },
  crypto_xrp:  { label: '✕ XRP',      color: 'text-sky-400' },
  crypto_tx:   { label: '# TX Hash',  color: 'text-violet-400' },
}

const EXAMPLES = [
  { label: '+380501234567',                           hint: 'Телефон' },
  { label: 'Іванов Іван',                             hint: 'ПІБ' },
  { label: 'ivanov_ivan',                             hint: 'Username' },
  { label: 'ivan@gmail.com',                          hint: 'Email' },
  { label: '14223150',                                hint: 'ЄДРПОУ' },
  { label: '185.87.152.1',                            hint: 'IP' },
  { label: 'TJCTzdEMnYuMnqaE9pHMVrFkFfB3Yyxh9T',    hint: 'TRON' },
  { label: '0x742d35Cc6634C0532925a3b8D4C9b2A4d6f8', hint: 'ETH' },
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
  { label: 'Bitcoin',       sub: 'BTC blockchain',  dot: 'bg-yellow-400' },
  { label: 'Ethereum',      sub: 'ETH blockchain',  dot: 'bg-blue-400' },
  { label: 'TRON',          sub: 'TRX + Tronscan',  dot: 'bg-red-400' },
  { label: 'OFAC SDN',      sub: '780 крипто адрес',dot: 'bg-rose-400' },
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
    if (detectType(sq).startsWith('crypto_'))
      router.push(`/crypto-intel?address=${encodeURIComponent(sq)}`)
    else
      router.push(`/search-all?q=${encodeURIComponent(sq)}`)
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)' }}>
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">

      {/* Декоративне фонове світіння */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ left: '224px' }}>
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full blur-[120px] opacity-[0.13]"
             style={{ background: 'radial-gradient(circle, var(--odb-accent), transparent 70%)' }} />
      </div>

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
    </div>
  )
}
