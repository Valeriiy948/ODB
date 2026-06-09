'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '../lib/supabase/client'
import { useLang } from '../lib/i18n/LanguageContext'
import type { Locale } from '../lib/i18n/translations'

const DONATE_ADDR = 'TCfRTKRbdJvry5HmJuzv3fJGLP5FyDMuTi'

const LOCALES: { code: Locale; flag: string; name: string }[] = [
  { code: 'uk', flag: '🇺🇦', name: 'УКР' },
  { code: 'en', flag: '🇬🇧', name: 'ENG' },
  { code: 'ru', flag: '🇷🇺', name: 'РУС' },
]

function copyToClipboard(text: string): Promise<void> {
  // Спробуємо Clipboard API
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  // Fallback — execCommand
  return new Promise((resolve, reject) => {
    const el = document.createElement('textarea')
    el.value = text
    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
    document.body.appendChild(el)
    el.focus()
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    ok ? resolve() : reject(new Error('execCommand failed'))
  })
}

export default function Sidebar() {
  const router   = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { locale, setLocale } = useLang()
  const [copied, setCopied] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isActive(href: string) {
    if (href === '/search-all' && pathname.startsWith('/search-all')) return true
    if (href === '/persons'    && (pathname === '/persons' || pathname.startsWith('/persons/'))) return true
    if (href === '/incidents'  && (pathname === '/incidents' || pathname.startsWith('/incidents/'))) return true
    if (href.startsWith('/registries') && pathname.startsWith('/registries')) return true
    if (href === '/breach-intel'   && pathname.startsWith('/breach-intel'))   return true
    if (href === '/phone-search'   && pathname.startsWith('/phone-search'))   return true
    if (href === '/network-intel'  && pathname.startsWith('/network-intel'))  return true
    if (href === '/company-search' && pathname.startsWith('/company-search')) return true
    if (href === '/nazk-search'    && pathname.startsWith('/nazk-search'))    return true
    if (href === '/settings'       && pathname.startsWith('/settings'))       return true
    if (href === '/admin'          && pathname.startsWith('/admin'))          return true
    if (href === '/agent'          && pathname.startsWith('/agent'))          return true
    return pathname === href
  }

  type NavItem = { icon: string; label: string; href: string }
  type NavSection = { title: string; items: NavItem[] }

  const t = (uk: string, en: string, ru: string) =>
    locale === 'en' ? en : locale === 'ru' ? ru : uk

  const navSections: NavSection[] = [
    {
      title: t('ПОШУК', 'SEARCH', 'ПОИСК'),
      items: [
        { icon: '🔎', label: t('Єдиний пошук',          'Unified Search',  'Единый поиск'),     href: '/breach-intel' },
        { icon: '🔍', label: t('Пошук по всіх джерелах','Web Search',      'Поиск по источникам'), href: '/search-all' },
      ],
    },
    {
      title: t('РОЗВІДКА', 'INTELLIGENCE', 'РАЗВЕДКА'),
      items: [
        { icon: '🕵️', label: t('Авто-слідчий',      'Auto-Investigator','Авто-следователь'), href: '/agent' },
        { icon: '👥', label: t('Картотека осіб',    'Persons DB',      'Картотека лиц'),    href: '/persons' },
        { icon: '⚖️', label: t('Справи',            'Cases',           'Дела'),             href: '/incidents' },
        { icon: '📞', label: t('Телефон / ІПН',     'Phone / ID',      'Телефон / ИНН'),    href: '/phone-search' },
        { icon: '🏢', label: t('Бізнес-розвідка',    'Business Intel',  'Бизнес-разведка'),  href: '/company-search' },
        { icon: '🌐', label: t('Мережева розвідка',  'Network Intel',   'Сетевая разведка'), href: '/network-intel' },
        { icon: '₿',  label: t('Крипто-розвідка',   'Crypto Intel',    'Крипто-разведка'),  href: '/crypto-intel' },
      ],
    },
    {
      title: t('РЕЄСТРИ', 'REGISTRIES', 'РЕЕСТРЫ'),
      items: [
        { icon: '📋', label: t('Всі реєстри',        'All Registries',  'Все реестры'),       href: '/registries' },
        { icon: '📋', label: t('НАЗК декларації',    'NAZK Declarations','Декларации НАЗК'),  href: '/nazk-search' },
      ],
    },
    {
      title: t('СИСТЕМА', 'SYSTEM', 'СИСТЕМА'),
      items: [
        { icon: '📥', label: t('Імпорт осіб',    'Import',      'Импорт лиц'),    href: '/admin/import' },
        { icon: '⚙️', label: t('Налаштування',   'Settings',    'Настройки'),     href: '/settings' },
        { icon: '📊', label: t('Активність',      'Activity',    'Активность'),    href: '/admin/activity' },
        { icon: '🔧', label: t('Інструменти',    'Tools',       'Инструменты'),   href: '/admin/tools' },
      ],
    },
  ]

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 min-h-screen flex flex-col shrink-0">

      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-800">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 hover:opacity-80 transition w-full text-left"
        >
          <span className="text-xl">🛡️</span>
          <div>
            <div className="text-white font-bold text-sm">ODB Platform</div>
            <div className="text-gray-600 text-xs">
              {t('Розвідка відкритих джерел', 'Open Source Intelligence', 'Разведка открытых источников')}
            </div>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
        {navSections.map(section => (
          <div key={section.title}>
            <p className="text-gray-600 text-xs font-semibold px-2 mb-1 tracking-wider uppercase">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition text-left ${
                    isActive(item.href)
                      ? 'bg-blue-900/50 text-blue-300 border border-blue-800/60'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span className="text-base shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Language switcher */}
      <div className="px-3 py-3 border-t border-gray-800">
        <div className="flex gap-1">
          {LOCALES.map(l => (
            <button
              key={l.code}
              onClick={() => setLocale(l.code)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition ${
                locale === l.code
                  ? 'bg-blue-800 text-blue-200 border border-blue-700'
                  : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span>{l.flag}</span>
              <span>{l.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Support / Donate */}
      <div className="px-3 pb-2">
        <div className="rounded-lg border border-yellow-900/40 bg-yellow-950/20 p-2">
          <p className="text-yellow-600 text-xs font-semibold mb-1 flex items-center gap-1">
            <span>💛</span>
            <span>{t('Підтримати проект', 'Support project', 'Поддержать проект')}</span>
          </p>
          <p className="text-gray-600 text-xs mb-1.5">USDT / TRX (TRC20)</p>
          <button
            onClick={() => {
              copyToClipboard(DONATE_ADDR)
                .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
                .catch(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
            }}
            title={t('Скопіювати адресу', 'Copy address', 'Скопировать адрес')}
            className={`w-full text-left font-mono text-xs rounded px-1.5 py-1.5 transition border
                        active:scale-95 flex items-center justify-between gap-1
                        ${copied
                          ? 'bg-yellow-900/40 border-yellow-700/60 text-yellow-300'
                          : 'bg-gray-950/60 border-gray-800 text-yellow-700 hover:text-yellow-400 hover:border-yellow-900/60'
                        }`}
          >
            <span className="truncate">{copied ? '✓ ' + t('Скопійовано!', 'Copied!', 'Скопировано!') : 'TCfRTKRb…FyDMuTi'}</span>
            {!copied && <span className="shrink-0 text-gray-700">⧉</span>}
          </button>
        </div>
      </div>

      {/* Logout */}
      <div className="px-3 pb-3">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 bg-red-950/60 hover:bg-red-900/60
                     text-red-400 hover:text-red-300 rounded-lg text-sm transition border border-red-900/40"
        >
          <span>🚪</span>
          <span>{t('Вийти', 'Logout', 'Выйти')}</span>
        </button>
      </div>
    </aside>
  )
}
