'use client'

import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '../lib/supabase/client'
import { useLang } from '../lib/i18n/LanguageContext'
import type { Locale } from '../lib/i18n/translations'

const LOCALES: { code: Locale; flag: string; name: string }[] = [
  { code: 'uk', flag: '🇺🇦', name: 'УКР' },
  { code: 'en', flag: '🇬🇧', name: 'ENG' },
  { code: 'ru', flag: '🇷🇺', name: 'РУС' },
]

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { locale, setLocale, t } = useLang()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isActive(href: string) {
    if (href === '/persons' && pathname.startsWith('/persons/')) return true
    if (href === '/incidents' && pathname.startsWith('/incidents/')) return true
    if (href === '/admin/enrich' && pathname.startsWith('/admin/enrich')) return true
    if (href === '/admin/batch' && pathname.startsWith('/admin/batch')) return true
    return pathname === href
  }

  const navSections = [
    {
      title: locale === 'en' ? 'MAIN' : locale === 'ru' ? 'ГЛАВНОЕ' : 'ГОЛОВНЕ',
      items: [
        { icon: '🏠', label: t('nav_dashboard'), href: '/dashboard' },
        { icon: '👥', label: t('nav_persons'), href: '/persons' },
        { icon: '⚖️', label: t('nav_incidents'), href: '/incidents' },
        { icon: '➕', label: locale === 'en' ? 'Add person' : locale === 'ru' ? 'Добавить' : 'Додати особу', href: '/persons/new' },
      ],
    },
    {
      title: locale === 'en' ? 'INTELLIGENCE' : locale === 'ru' ? 'РАЗВЕДКА' : 'РОЗВІДКА',
      items: [
        { icon: '🔄', label: t('nav_enrich'), href: '/admin/enrich' },
        { icon: '⚡', label: locale === 'en' ? 'Batch OSINT' : locale === 'ru' ? 'Массовый OSINT' : 'Масовий OSINT', href: '/admin/batch' },
      ],
    },
    {
      title: locale === 'en' ? 'SYSTEM' : locale === 'ru' ? 'СИСТЕМА' : 'СИСТЕМА',
      items: [
        { icon: '⚙️', label: locale === 'en' ? 'Settings' : locale === 'ru' ? 'Настройки' : 'Налаштування', href: '/settings' },
      ],
    },
  ]

  return (
    <aside className="w-60 bg-gray-900 border-r border-gray-700 min-h-screen flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛡️</span>
          <div>
            <div className="text-white font-bold text-sm">ODB Platform</div>
            <div className="text-gray-500 text-xs">
              {locale === 'en' ? 'Evidence Database' : locale === 'ru' ? 'Оперативная База' : 'Оперативна База Даних'}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
        {navSections.map(section => (
          <div key={section.title}>
            <p className="text-gray-600 text-xs font-semibold px-2 mb-1 tracking-wider">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition text-left ${
                    isActive(item.href)
                      ? 'bg-blue-900/60 text-blue-300 border border-blue-800'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Перемикач мови */}
      <div className="px-3 py-3 border-t border-gray-700">
        <p className="text-gray-600 text-xs mb-2 px-1">
          {locale === 'en' ? 'Language' : locale === 'ru' ? 'Язык' : 'Мова'}
        </p>
        <div className="flex gap-1.5">
          {LOCALES.map(l => (
            <button
              key={l.code}
              onClick={() => setLocale(l.code)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition ${
                locale === l.code
                  ? 'bg-blue-800 text-blue-200 border border-blue-600'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span>{l.flag}</span>
              <span>{l.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Logout */}
      <div className="px-3 pb-3">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 bg-red-950 hover:bg-red-900 text-red-400 rounded-lg text-sm transition"
        >
          <span>🚪</span>
          <span>{locale === 'en' ? 'Logout' : locale === 'ru' ? 'Выйти' : 'Вийти'}</span>
        </button>
      </div>
    </aside>
  )
}
