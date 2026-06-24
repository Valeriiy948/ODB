'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '../lib/supabase/client'
import { useLang } from '../lib/i18n/LanguageContext'
import type { Locale } from '../lib/i18n/translations'
import Icon, { type IconName } from './Icon'

const DONATE_ADDR = 'TCfRTKRbdJvry5HmJuzv3fJGLP5FyDMuTi'

const LOCALES: { code: Locale; flag: string; name: string }[] = [
  { code: 'uk', flag: '🇺🇦', name: 'УКР' },
  { code: 'en', flag: '🇬🇧', name: 'ENG' },
  { code: 'ru', flag: '🇷🇺', name: 'РУС' },
]

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
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
    if (href === '/investigations' && pathname.startsWith('/investigations')) return true
    if (href === '/face-search'         && pathname.startsWith('/face-search'))         return true
    if (href === '/crime-reports'       && pathname.startsWith('/crime-reports'))       return true
    if (href === '/admin/whitebit-intel' && pathname.startsWith('/admin/whitebit-intel')) return true
    return pathname === href
  }

  type NavItem = { icon: IconName; label: string; href: string }
  type NavSection = { title: string; items: NavItem[] }

  const t = (uk: string, en: string, ru: string) =>
    locale === 'en' ? en : locale === 'ru' ? ru : uk

  const navSections: NavSection[] = [
    {
      title: t('ПОШУК', 'SEARCH', 'ПОИСК'),
      items: [
        { icon: 'search', label: t('Єдиний пошук',          'Unified Search',  'Единый поиск'),        href: '/breach-intel' },
        { icon: 'globe',  label: t('Пошук по всіх джерелах','Web Search',      'Поиск по источникам'), href: '/search-all' },
      ],
    },
    {
      title: t('РОЗВІДКА', 'INTELLIGENCE', 'РАЗВЕДКА'),
      items: [
        { icon: 'scan',     label: t('Авто-слідчий',     'Auto-Investigator','Авто-следователь'), href: '/agent' },
        { icon: 'folder',   label: t('Розслідування',    'Investigations',  'Расследования'),    href: '/investigations' },
        { icon: 'eye',      label: t('Пошук за фото',    'Face Search',     'Поиск по фото'),    href: '/face-search' },
        { icon: 'users',    label: t('Картотека осіб',   'Persons DB',      'Картотека лиц'),    href: '/persons' },
        { icon: 'scale',    label: t('Справи',           'Cases',           'Дела'),             href: '/incidents' },
        { icon: 'file',     label: t('Довідки по злочинах','Crime Reports',  'Справки о преступлениях'), href: '/crime-reports' },
        { icon: 'phone',    label: t('Телефон / ІПН',    'Phone / ID',      'Телефон / ИНН'),    href: '/phone-search' },
        { icon: 'building', label: t('Бізнес-розвідка',  'Business Intel',  'Бизнес-разведка'),  href: '/company-search' },
        { icon: 'network',  label: t('Мережева розвідка','Network Intel',   'Сетевая разведка'), href: '/network-intel' },
        { icon: 'bitcoin',  label: t('Крипто-розвідка',  'Crypto Intel',    'Крипто-разведка'),  href: '/crypto-intel' },
      ],
    },
    {
      title: t('РЕЄСТРИ', 'REGISTRIES', 'РЕЕСТРЫ'),
      items: [
        { icon: 'clipboard', label: t('Всі реєстри',     'All Registries',   'Все реестры'),     href: '/registries' },
        { icon: 'file',      label: t('НАЗК декларації', 'NAZK Declarations','Декларации НАЗК'), href: '/nazk-search' },
      ],
    },
    {
      title: t('СИСТЕМА', 'SYSTEM', 'СИСТЕМА'),
      items: [
        { icon: 'download', label: t('Імпорт осіб',  'Import',   'Импорт лиц'), href: '/admin/import' },
        { icon: 'settings', label: t('Налаштування', 'Settings', 'Настройки'),  href: '/settings' },
        { icon: 'activity', label: t('Активність',   'Activity', 'Активность'), href: '/admin/activity' },
        { icon: 'tools',    label: t('Інструменти',  'Tools',    'Инструменты'),href: '/admin/tools' },
        { icon: 'network',  label: t('Стан джерел',  'Sources',  'Источники'),  href: '/admin/source-health' },
        { icon: 'alert',   label: t('Whale Alert',  'Whale Alert','Whale Alert'), href: '/admin/whale-alert' },
        { icon: 'bitcoin', label: t('WB Intelligence','WB Intel','WB Intel'),    href: '/admin/whitebit-intel' },
      ],
    },
  ]

  return (
    <aside className="w-56 min-h-screen flex flex-col shrink-0 border-r"
           style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>

      {/* Logo */}
      <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--odb-border-soft)' }}>
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2.5 hover:opacity-90 transition w-full text-left"
        >
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--odb-accent-hi), var(--odb-accent-lo))', boxShadow: 'var(--odb-shadow-accent)' }}>
            <Icon name="shield" size={20} strokeWidth={2} />
          </span>
          <div>
            <div className="text-white font-bold text-sm">ODB Platform</div>
            <div className="text-[var(--odb-text-faint)] text-xs leading-tight">
              {t('Розвідка відкритих джерел', 'Open Source Intelligence', 'Разведка открытых источников')}
            </div>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-4">
        {navSections.map(section => (
          <div key={section.title}>
            <p className="text-[var(--odb-text-faint)] text-[10px] font-semibold px-2 mb-1.5 tracking-[0.12em] uppercase">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = isActive(item.href)
                return (
                  <button
                    key={item.href}
                    onClick={() => router.push(item.href)}
                    className="group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200 text-left"
                    style={active
                      ? { background: 'var(--odb-accent-glow)', color: 'var(--odb-accent-hi)' }
                      : { color: 'var(--odb-text-dim)' }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--odb-surface-3)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* активна смужка зліва */}
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full"
                            style={{ background: 'var(--odb-accent-hi)' }} />
                    )}
                    <span className={`shrink-0 transition-colors ${active ? '' : 'group-hover:text-white'}`}>
                      <Icon name={item.icon} size={18} />
                    </span>
                    <span className={`truncate transition-colors ${active ? '' : 'group-hover:text-white'}`}>
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Language switcher */}
      <div className="px-3 py-3 border-t" style={{ borderColor: 'var(--odb-border-soft)' }}>
        <div className="flex gap-1">
          {LOCALES.map(l => {
            const on = locale === l.code
            return (
              <button
                key={l.code}
                onClick={() => setLocale(l.code)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={on
                  ? { background: 'var(--odb-accent-glow)', color: 'var(--odb-accent-hi)' }
                  : { background: 'var(--odb-surface-2)', color: 'var(--odb-text-faint)' }}
              >
                <span>{l.flag}</span>
                <span>{l.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Support / Donate */}
      <div className="px-3 pb-2">
        <div className="rounded-xl p-2.5 border"
             style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)' }}>
          <p className="text-[var(--odb-warn)] text-xs font-semibold mb-1 flex items-center gap-1.5">
            <Icon name="spark" size={13} />
            <span>{t('Підтримати проект', 'Support project', 'Поддержать проект')}</span>
          </p>
          <p className="text-[var(--odb-text-faint)] text-xs mb-1.5">USDT / TRX (TRC20)</p>
          <button
            onClick={() => {
              copyToClipboard(DONATE_ADDR)
                .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
                .catch(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
            }}
            title={t('Скопіювати адресу', 'Copy address', 'Скопировать адрес')}
            className="w-full text-left font-mono text-xs rounded-lg px-2 py-1.5 transition-all active:scale-95 flex items-center justify-between gap-1 border"
            style={copied
              ? { background: 'var(--odb-accent-glow)', borderColor: 'var(--odb-accent-lo)', color: 'var(--odb-accent-hi)' }
              : { background: 'var(--odb-bg)', borderColor: 'var(--odb-border-soft)', color: 'var(--odb-text-faint)' }}
          >
            <span className="truncate flex items-center gap-1.5">
              {copied
                ? <><Icon name="check" size={13} /> {t('Скопійовано!', 'Copied!', 'Скопировано!')}</>
                : 'TCfRTKRb…FyDMuTi'}
            </span>
            {!copied && <span className="shrink-0"><Icon name="copy" size={13} /></span>}
          </button>
        </div>
      </div>

      {/* Logout */}
      <div className="px-3 pb-3">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all border"
          style={{ background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.2)', color: 'var(--odb-danger)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.16)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)' }}
        >
          <Icon name="logout" size={17} />
          <span>{t('Вийти', 'Logout', 'Выйти')}</span>
        </button>
      </div>
    </aside>
  )
}
