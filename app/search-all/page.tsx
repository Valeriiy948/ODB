'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '../components/Sidebar'
import { createClient } from '../lib/supabase/client'
import Icon from '../components/Icon'

// ─── Internal source → user-facing category mapping ───────────────────────────
// Technical tool names are NEVER shown to the end user.
// Each source belongs to a visible "category" shown as a card.

const CATEGORIES = [
  {
    key: 'sanctions',
    icon: '🚫',
    label: 'Санкційні списки',
    color: 'text-red-300',
    borderHit: 'border-red-700/60',
    bgHit: 'bg-red-950/20',
    sources: ['sanctions'],
    types: ['name', 'inn', 'rinn', 'ogrn', 'ogrnip', 'phone', 'email'],
  },
  {
    key: 'vk',
    icon: '💙',
    label: 'ВКонтакте',
    color: 'text-blue-300',
    borderHit: 'border-blue-700/50',
    bgHit: 'bg-blue-950/20',
    sources: ['vk'],
    types: ['name', 'username', 'phone', 'vk_url'],
  },
  {
    key: 'social',
    icon: '📱',
    label: 'Соцмережі та акаунти',
    color: 'text-yellow-400',
    borderHit: 'border-yellow-800/50',
    bgHit: 'bg-yellow-950/10',
    sources: ['sherlock', 'chimera', 'social'],
    types: ['username', 'name', 'email'],
  },
  {
    key: 'persons',
    icon: '👤',
    label: 'Картотека осіб',
    color: 'text-blue-400',
    borderHit: 'border-blue-800/50',
    bgHit: 'bg-blue-950/10',
    sources: ['odb'],
    types: ['phone', 'email', 'inn', 'name', 'username', 'snils'],
  },
  {
    key: 'messengers',
    icon: '💬',
    label: 'Месенджери',
    color: 'text-sky-400',
    borderHit: 'border-sky-800/50',
    bgHit: 'bg-sky-950/10',
    sources: ['telegram', 'getcontact', 'phone_presence', 'tg_bots'],
    types: ['phone', 'username', 'name', 'tg_username'],
  },
  {
    key: 'vehicles',
    icon: '🚗',
    label: 'Транспорт',
    color: 'text-orange-400',
    borderHit: 'border-orange-800/50',
    bgHit: 'bg-orange-950/10',
    sources: ['vehicles'],
    types: ['plate_ru', 'plate_ua', 'vin'],
  },
  {
    key: 'registries',
    icon: '📋',
    label: 'Публічні реєстри',
    color: 'text-green-400',
    borderHit: 'border-green-800/50',
    bgHit: 'bg-green-950/10',
    sources: ['nazk', 'mvs', 'myrotvorets', 'erb'],
    types: ['name', 'inn'],
  },
  {
    key: 'leaks',
    icon: '🔓',
    label: 'Витоки даних',
    color: 'text-red-400',
    borderHit: 'border-red-800/50',
    bgHit: 'bg-red-950/10',
    sources: ['leaks', 'breach_catalog'],
    types: ['phone', 'email', 'inn', 'snils', 'name', 'username', 'domain'],
  },
  {
    key: 'business',
    icon: '🏢',
    label: 'Бізнес та юридичні особи',
    color: 'text-cyan-400',
    borderHit: 'border-cyan-800/50',
    bgHit: 'bg-cyan-950/10',
    sources: ['company'],
    types: ['name', 'edrpou', 'inn'],
  },
  {
    key: 'network',
    icon: '🌐',
    label: 'Мережева розвідка',
    color: 'text-purple-400',
    borderHit: 'border-purple-800/50',
    bgHit: 'bg-purple-950/10',
    sources: ['network', 'spiderfoot'],
    types: ['ip', 'domain', 'email', 'name', 'phone'],
  },
  {
    key: 'web',
    icon: '🔍',
    label: 'Результати з інтернету',
    color: 'text-emerald-400',
    borderHit: 'border-emerald-800/50',
    bgHit: 'bg-emerald-950/10',
    sources: ['web'],
    types: ['name', 'email', 'phone', 'username', 'domain', 'ip', 'edrpou', 'inn'],
  },
]

// Category key → SVG icon (нова система іконок замість емодзі)
const CAT_ICON: Record<string, import('../components/Icon').IconName> = {
  sanctions:  'alert',
  vk:         'globe',
  social:     'message',
  persons:    'users',
  messengers: 'message',
  vehicles:   'car',
  registries: 'clipboard',
  leaks:      'database',
  business:   'building',
  network:    'network',
  web:        'search',
}

// Which API sources are active for each query type
const SOURCE_TYPES: Record<string, string[]> = {
  odb:           ['phone', 'email', 'inn', 'name', 'username'],
  telegram:      ['phone', 'username', 'name', 'tg_username'],
  sherlock:      ['username', 'name', 'email'],
  chimera:       ['username', 'name'],
  leaks:         ['phone', 'email', 'inn', 'snils', 'rinn', 'name', 'username'],
  breach_catalog:['domain', 'username', 'name'],
  nazk:          ['name'],
  mvs:           ['name'],
  myrotvorets:   ['name'],
  erb:           ['name', 'inn'],
  company:       ['name', 'edrpou', 'inn', 'ogrn', 'ogrnip', 'rinn'],
  network:       ['ip', 'domain'],
  spiderfoot:    ['email', 'domain', 'ip', 'name', 'phone'],
  web:           ['name', 'email', 'phone', 'username', 'domain', 'ip', 'edrpou', 'inn', 'rinn', 'ogrn', 'plate_ru', 'plate_ua', 'vin'],
  // ── Нові джерела ──────────────────────────────────────────────────────────
  sanctions:     ['name', 'inn', 'rinn', 'ogrn', 'ogrnip', 'phone', 'email'],
  vk:            ['name', 'username', 'phone', 'vk_url'],
  getcontact:    ['phone'],
  vehicles:      ['plate_ru', 'plate_ua', 'vin'],
  yandex:        ['name', 'phone', 'email', 'username', 'plate_ru', 'ogrn', 'rinn'],
  tg_bots:       ['name', 'phone'],
}

const TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  phone:       { label: 'Телефон',        color: 'text-green-400',  icon: '📞' },
  email:       { label: 'Email',          color: 'text-blue-400',   icon: '✉️' },
  inn:         { label: 'ІПН',            color: 'text-yellow-400', icon: '🆔' },
  rinn:        { label: 'ІПН (рос.)',     color: 'text-red-400',    icon: '🆔' },
  snils:       { label: 'СНІЛС',          color: 'text-yellow-400', icon: '🆔' },
  edrpou:      { label: 'ЄДРПОУ',         color: 'text-cyan-400',   icon: '🏢' },
  ogrn:        { label: 'ОГРН (рос.)',    color: 'text-red-400',    icon: '🏢' },
  ogrnip:      { label: 'ОГРНІП (рос.)', color: 'text-red-400',    icon: '👤' },
  ip:          { label: 'IP адреса',      color: 'text-purple-400', icon: '🌐' },
  domain:      { label: 'Домен',          color: 'text-purple-300', icon: '🌍' },
  username:    { label: 'Username',       color: 'text-orange-400', icon: '👤' },
  vk_url:      { label: 'VK профіль',     color: 'text-blue-300',   icon: '💙' },
  tg_username: { label: 'Telegram',       color: 'text-sky-400',    icon: '✈️' },
  plate_ru:    { label: 'Номер авто 🇷🇺', color: 'text-red-400',    icon: '🚗' },
  plate_ua:    { label: 'Номер авто 🇺🇦', color: 'text-blue-400',   icon: '🚗' },
  vin:         { label: 'VIN',            color: 'text-orange-400', icon: '🔑' },
  name:        { label: "ПІБ / Ім'я",     color: 'text-gray-300',   icon: '🔍' },
}

function detectType(q: string): string {
  const clean = q.replace(/[\s\-\(\)\+]/g, '')
  // Phone with explicit + prefix = always phone
  if (q.trimStart().startsWith('+') && /^\d{10,15}$/.test(clean)) return 'phone'
  // UA phone without + (380XXXXXXXXX = 12 digits starting with 380)
  if (/^380\d{9}$/.test(clean)) return 'phone'
  // RU phone without + (7XXXXXXXXXX = 11 digits starting with 7)
  if (/^7\d{10}$/.test(clean))  return 'phone'
  if (/^\d{8}$/.test(clean))  return 'edrpou'
  if (/^\d{10}$/.test(clean)) return 'inn'
  if (/^\d{11}$/.test(clean)) return 'snils'
  if (/^\d{12}$/.test(clean)) return 'rinn'
  if (/^\d{13}$/.test(clean)) return 'ogrn'
  if (/^\d{15}$/.test(clean)) return 'ogrnip'
  if (/^\+?\d{10,15}$/.test(clean)) return 'phone'
  if (/@/.test(q))             return 'email'
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(q)) return 'ip'
  if (/^(https?:\/\/)?(vk\.com|vkontakte\.ru)\//i.test(q)) return 'vk_url'
  if (/^@[a-z0-9_]{4,32}$/i.test(q)) return 'tg_username'
  if (/^[А-ЯЁ]\d{3}[А-ЯЁ]{2}\d{2,3}$/i.test(q)) return 'plate_ru'
  if (/^[А-ЯA-Z]{2}\s?\d{4}\s?[А-ЯA-Z]{2}$/i.test(q)) return 'plate_ua'
  if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(q)) return 'vin'
  if (/^[a-z0-9][a-z0-9\-]*\.[a-z]{2,}/i.test(q) && !q.includes(' ')) return 'domain'
  if (/^[a-z0-9_\.]{3,32}$/i.test(q) && !q.includes(' ')) return 'username'
  return 'name'
}

// ─── Extract structured person data from all search results ──────────────────
function extractPersonData(
  sources: Record<string, { status: string; data: any }>,
  query: string,
  type: string
) {
  const names: string[] = []
  const phones: string[] = []
  const emails: string[] = []
  const dobs: string[] = []
  const addresses: string[] = []
  const inns: string[] = []
  const snilsList: string[] = []
  const passports: string[] = []
  const usernames: string[] = []
  let photo_url: string | null = null
  let vk_url: string | null = null
  let tg_username: string | null = null

  // From the query itself
  if (type === 'name')  names.push(query)
  else if (type === 'phone') phones.push(query)
  else if (type === 'email') emails.push(query)
  else if (type === 'inn')   inns.push(query)

  // From leaks — iterate all sub-sources (leakosint, osintkit, dehashed, peoplefind_bot…)
  const leaksData = sources.leaks?.data
  if (leaksData?.sources) {
    for (const srcData of Object.values(leaksData.sources as Record<string, any>)) {
      for (const e of (srcData?.entries || [])) {
        if (e.name)         names.push(e.name)
        if (e.phone)        phones.push(String(e.phone))
        if (e.extra_phones) phones.push(...String(e.extra_phones).split(',').map((s: string) => s.trim()).filter(Boolean))
        if (e.email)        emails.push(e.email)
        if (e.dob)          dobs.push(e.dob)
        if (e.address)      addresses.push(e.address)
        if (e.inn)          inns.push(e.inn)
        if (e.snils)        snilsList.push(e.snils)
        if (e.passport)     passports.push(e.passport)
        if (e.username)     usernames.push(e.username)
        if (e.vk_id && !vk_url) vk_url = `https://vk.com/id${e.vk_id}`
      }
    }
  }

  // From VK
  const vkEntries = sources.vk?.data?.entries || []
  if (vkEntries.length > 0) {
    const vk = vkEntries[0]
    if (vk.name)     names.push(vk.name)
    if (vk.url && !vk_url)  vk_url = vk.url
    if (vk.photo && !photo_url) photo_url = vk.photo
    if (vk.username) usernames.push(vk.username)
  }

  // From Telegram
  const tgResult = sources.telegram?.data?.result
  if (tgResult) {
    const tgName = [tgResult.first_name, tgResult.last_name].filter(Boolean).join(' ')
    if (tgName) names.push(tgName)
    if (tgResult.username) tg_username = '@' + tgResult.username
    if (tgResult.phone)    phones.push(String(tgResult.phone))
  }

  const uniq = (arr: string[]) =>
    [...new Set(arr.map(s => String(s).trim()).filter(Boolean))]

  return {
    name:       uniq(names)[0]     || null,
    phones:     uniq(phones)[0]    || null,
    email:      uniq(emails)[0]    || null,
    dob:        uniq(dobs)[0]      || null,
    addr_live:  uniq(addresses)[0] || null,
    ipn:        uniq(inns)[0]      || null,
    snils:      uniq(snilsList)[0] || null,
    passport:   uniq(passports)[0] || null,
    username:   uniq(usernames)[0] || null,
    photo_url,
    vk_url,
    tg_username,
    all_names:     uniq(names),
    all_phones:    uniq(phones),
    all_emails:    uniq(emails),
    all_addresses: uniq(addresses),
  }
}

// ─── Count hits per source ────────────────────────────────────────────────────
function countHits(key: string, data: any): number {
  if (!data || data.error) return 0
  switch (key) {
    case 'odb':            return data.total || data.persons?.length || 0
    case 'telegram':       return (data.found || data.result?.user_id) ? 1 : (data.results?.length || 0)
    case 'sherlock':       return data.total || data.found?.length || 0
    case 'chimera':        return data.total || data.found?.length || 0
    case 'leaks': {
      // Рахуємо реальні записи після relevance-фільтра (не сире total_hits)
      if (data.sources) {
        return Object.values(data.sources as Record<string, any>)
          .reduce((s: number, src: any) => s + (src?.entries?.length || 0), 0)
      }
      return data.total_hits || 0
    }
    case 'breach_catalog': return data.total || 0
    case 'nazk':           return data.found || data.total || 0
    case 'mvs':            return data.found || data.total || 0
    case 'myrotvorets':    return data.found || data.total || 0
    case 'erb':            return data.found || data.total || 0
    case 'company':        return data.companies?.filter((c: any) => c.type !== 'fallback').length || 0
    case 'web':            return data.results?.length || data.total || 0
    // web with google fallback — treat as 1 so card opens
    // (handled in hasFallbacks logic in CategoryCard)
    case 'network':        return data.success ? 1 : 0
    case 'spiderfoot':     return data.scan_id ? 1 : 0
    case 'sanctions':      return data.total || data.entries?.length || 0
    case 'vk':             return data.total || data.entries?.length || 0
    case 'getcontact':     return data.total || data.entries?.length || 0
    case 'vehicles':       return data.total || data.results?.length || 0
    case 'yandex':         return data.results?.length || 0
    case 'social':         return data.found?.filter((f: any) => f.found).length || data.total || 0
    case 'phone_presence': {
      const m = data.messengers || {}
      const hits = Object.values(m).filter((v: any) => v?.found).length
      // carrier_info always available for any valid phone number
      return hits || (data.carrier_info ? 1 : 0)
    }
    default:               return 0
  }
}

// ─── Category totals ──────────────────────────────────────────────────────────
function categoryHits(
  cat: typeof CATEGORIES[0],
  sources: Record<string, { status: string; data: any }>
): number {
  return cat.sources.reduce((sum, src) => {
    const s = sources[src]
    return sum + (s?.status === 'done' ? countHits(src, s.data) : 0)
  }, 0)
}

function categoryLoading(
  cat: typeof CATEGORIES[0],
  sources: Record<string, { status: string; data: any }>,
  type: string
): boolean {
  return cat.sources.some(src =>
    cat.types.includes(type) &&
    SOURCE_TYPES[src]?.includes(type) &&
    sources[src]?.status === 'loading'
  )
}

// ─── Result renderers (category-based, no tool names) ────────────────────────
function SocialResults({ sources }: { sources: Record<string, any> }) {
  const allFound: { site: string; url: string; ids?: Record<string, string> }[] = []
  // sherlock + chimera username search
  for (const key of ['sherlock', 'chimera']) {
    const d = sources[key]
    if (d?.status === 'done' && d.data?.found) {
      for (const f of d.data.found) {
        if (!allFound.find(x => x.url === f.url)) allFound.push(f)
      }
    }
  }
  // VPS social/username search results
  const socialD = sources.social
  if (socialD?.status === 'done' && Array.isArray(socialD.data?.found)) {
    for (const f of socialD.data.found) {
      if (f.found && f.url && !allFound.find(x => x.url === f.url)) {
        allFound.push({ site: f.platform || f.site || 'Social', url: f.url })
      }
    }
  }
  const PRIORITY = ['VK','OK','Instagram','Twitter','X','Facebook','Telegram',
    'TikTok','YouTube','LinkedIn','GitHub','GitLab','Discord','Reddit','Twitch']
  const sorted = [...allFound].sort((a, b) => {
    const ai = PRIORITY.indexOf(a.site), bi = PRIORITY.indexOf(b.site)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
  if (!sorted.length) return <p className="text-gray-500 text-sm">Акаунтів не знайдено</p>
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
      {sorted.slice(0, 60).map((f, i) => (
        <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs bg-gray-800 hover:bg-gray-700
                     border border-gray-700 rounded-lg px-3 py-2 transition group">
          <span className="text-blue-400 shrink-0">↗</span>
          <div className="min-w-0">
            <div className="font-semibold text-white truncate">{f.site}</div>
            <div className="text-gray-500 truncate">
              {f.url.replace(/^https?:\/\//, '').slice(0, 32)}
            </div>
          </div>
          {f.ids && Object.keys(f.ids).length > 0 && (
            <span className="ml-auto text-xs bg-purple-900/40 text-purple-300 px-1.5 py-0.5 rounded shrink-0">
              +дані
            </span>
          )}
        </a>
      ))}
      {sorted.length > 60 && (
        <div className="col-span-full text-center text-gray-600 text-xs py-1">
          ...та ще {sorted.length - 60} акаунтів
        </div>
      )}
    </div>
  )
}

function PersonsResults({ data }: { data: any }) {
  const items = data?.persons || data?.results || []
  if (!items.length) return <p className="text-gray-500 text-sm">Записів не знайдено</p>
  return (
    <div className="space-y-1.5">
      {items.slice(0, 10).map((p: any, i: number) => (
        <a key={i} href={`/persons/${p.id}`} target="_blank"
          className="flex items-center gap-3 text-sm hover:bg-gray-800 rounded-lg px-3 py-2 transition">
          <span className="text-gray-500">👤</span>
          <span className="text-white font-medium">{p.name_ukr || p.name_rus || p.name_eng}</span>
          {p.rank && <span className="text-xs text-gray-500">{p.rank}</span>}
          {p.threat_score >= 70 && (
            <span className="ml-auto text-xs text-red-400">🔴 {p.threat_score}</span>
          )}
        </a>
      ))}
      {data.total > 10 && (
        <p className="text-xs text-gray-600 px-3">...та ще {data.total - 10} записів</p>
      )}
    </div>
  )
}

// ─── Phone Presence: carrier + messengers + social networks ──────────────────
function PhonePresenceResults({ data }: { data: any }) {
  if (!data) return null
  const m   = data.messengers || {}
  const soc = data.social     || {}
  const c   = data.caller_id  || {}
  const ci  = data.carrier_info
  const lnk = data.links      || {}

  // null = not configured / no API   false = checked, not found   true/object = found
  const MESSENGERS: Array<{ key: string; label: string; icon: string; linkKey: string }> = [
    { key: 'telegram', label: 'Telegram', icon: '✈️', linkKey: 'telegram' },
    { key: 'whatsapp', label: 'WhatsApp', icon: '💬', linkKey: 'whatsapp' },
    { key: 'viber',    label: 'Viber',    icon: '📲', linkKey: 'viber'    },
    { key: 'signal',   label: 'Signal',   icon: '🔒', linkKey: 'signal'   },
  ]

  const SOCIAL: Array<{ key: string; label: string; icon: string; linkKey: string }> = [
    { key: 'vk',        label: 'ВКонтакте', icon: '💙', linkKey: 'vk'        },
    { key: 'instagram', label: 'Instagram',  icon: '📸', linkKey: 'instagram' },
    { key: 'facebook',  label: 'Facebook',   icon: '👥', linkKey: 'facebook'  },
  ]

  const QUICK_LINKS = [
    { key: 'getcontact', label: 'GetContact', icon: '📖' },
    { key: 'numbuster',  label: 'NumBuster',  icon: '📞' },
    { key: 'truecaller', label: 'TrueCaller',  icon: '✅' },
    { key: 'tiktok',     label: 'TikTok',     icon: '🎵' },
    { key: 'ok',         label: 'Однокласники',icon: '🔶' },
    { key: 'linkedin',   label: 'LinkedIn',   icon: '💼' },
  ]

  function MessengerChip({ info, label, icon, link }: { info: any; label: string; icon: string; link?: string }) {
    const found  = info?.found === true || (typeof info === 'boolean' && info)
    const checked = info !== null && info !== undefined

    const inner = (
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-colors ${
        found    ? 'bg-green-900/20 border-green-700/40' :
        !checked ? 'bg-gray-800/30 border-gray-700/20 opacity-60' :
                   'bg-gray-800/40 border-gray-700/30'
      }`}>
        <span className="text-base">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium truncate ${found ? 'text-white' : checked ? 'text-gray-400' : 'text-gray-600'}`}>{label}</p>
          {found && info.name     && <p className="text-xs text-gray-300 truncate">{info.name}</p>}
          {found && info.username && <p className="text-xs text-sky-400 truncate">@{info.username}</p>}
          {!checked && <p className="text-xs text-gray-600">не перевірено</p>}
        </div>
        <span className={`text-xs shrink-0 font-bold ${found ? 'text-green-400' : checked ? 'text-red-500/70' : 'text-gray-700'}`}>
          {found ? '✓' : checked ? '✗' : '?'}
        </span>
      </div>
    )

    if (link && found && info.username) {
      return <a href={`https://t.me/${info.username}`} target="_blank" rel="noopener noreferrer">{inner}</a>
    }
    return inner
  }

  return (
    <div className="space-y-3 text-sm">

      {/* Carrier info */}
      {ci && (
        <div className="rounded-lg bg-gray-800/60 border border-gray-600/40 px-3 py-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">📡 Оператор / HLR</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div><span className="text-gray-500">Оператор: </span><span className="text-white font-semibold">{ci.operator}</span></div>
            <div>
              <span className="text-gray-500">Країна: </span>
              <span className="text-white">{ci.country}</span>
              {ci.country_code && <span className="text-gray-500 ml-1">({ci.country_code})</span>}
            </div>
            <div>
              <span className="text-gray-500">Тип: </span>
              <span className="text-gray-300">
                {ci.number_type === 'mobile' ? '📱 Мобільний'
                  : ci.number_type === 'landline' ? '☎️ Стаціонарний'
                  : ci.number_type === 'voip' ? '🌐 VoIP' : '❓'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Messenger presence */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">💬 Месенджери</p>
        <div className="grid grid-cols-2 gap-2">
          {MESSENGERS.map(({ key, label, icon, linkKey }) => (
            <MessengerChip
              key={key}
              info={m[key]}
              label={label}
              icon={icon}
              link={lnk[linkKey]}
            />
          ))}
        </div>
      </div>

      {/* Social networks */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">🌐 Соцмережі</p>
        <div className="grid grid-cols-3 gap-2">
          {SOCIAL.map(({ key, label, icon, linkKey }) => {
            const info = soc[key]
            const found = info?.found === true
            const link  = lnk[linkKey]
            return (
              <a key={key} href={link} target="_blank" rel="noopener noreferrer"
                className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 border text-center transition-colors hover:border-gray-500 ${
                  found ? 'bg-blue-900/20 border-blue-700/40' : 'bg-gray-800/30 border-gray-700/20'
                }`}>
                <span className="text-lg">{icon}</span>
                <span className={`text-xs font-medium ${found ? 'text-white' : 'text-gray-500'}`}>{label}</span>
                {found && info.name
                  ? <span className="text-xs text-gray-300 truncate w-full text-center">{info.name}</span>
                  : <span className="text-xs text-gray-600">🔗 перевірити</span>
                }
              </a>
            )
          })}
        </div>
      </div>

      {/* Quick check links row */}
      {Object.keys(lnk).length > 0 && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">🔗 Швидка перевірка</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_LINKS.map(({ key, label, icon }) => lnk[key] && (
              <a key={key} href={lnk[key]} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-300 transition-colors">
                <span>{icon}</span>{label}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Caller ID */}
      {(c.numbuster?.name || c.truecaller?.name || c.getcontact?.total > 0) && (
        <div className="rounded-lg bg-yellow-900/10 border border-yellow-700/30 p-3 space-y-1">
          <p className="text-xs text-yellow-600 font-semibold mb-1">📞 Caller ID</p>
          {c.numbuster?.name && (
            <p className="text-sm text-gray-300">NumBuster: <span className="text-white">{c.numbuster.name}</span></p>
          )}
          {c.truecaller?.name && (
            <p className="text-sm text-gray-300">TrueCaller: <span className="text-white">{c.truecaller.name}</span>
              {c.truecaller.carrier && <span className="text-gray-500 text-xs ml-1">({c.truecaller.carrier})</span>}
            </p>
          )}
          {c.getcontact?.total > 0 && (
            <p className="text-sm text-gray-300">GetContact: збережений у <span className="text-white">{c.getcontact.total}</span> людей
              {c.getcontact.entries?.[0]?.name && <span className="text-yellow-300 ml-1">«{c.getcontact.entries[0].name}»</span>}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function MessengerResults({ data }: { data: any }) {
  // Phone lookup format: { result: { user_id, username, first_name, last_name, phone, verified } }
  // Name/username search format: { results: [...], total: N }
  const single = data?.result
  const list: any[] = data?.results || []

  if (!single && list.length === 0) return null

  return (
    <div className="space-y-2 text-sm">
      {single && (
        <div className="bg-sky-900/20 border border-sky-700/30 rounded-lg p-3 space-y-1">
          {single.username  && <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">Username:</span><a href={`https://t.me/${single.username}`} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline">@{single.username}</a></div>}
          {single.first_name && <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">Ім'я:</span><span className="text-white">{single.first_name} {single.last_name || ''}</span></div>}
          {single.user_id   && <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">ID:</span><span className="font-mono text-gray-300">{single.user_id}</span></div>}
          {single.phone     && <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">Телефон:</span><span className="text-green-300">{single.phone}</span></div>}
          {single.verified  && <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">Статус:</span><span className="text-blue-400">✓ Верифікований</span></div>}
        </div>
      )}
      {list.length > 0 && (
        <div className="space-y-1">
          {list.slice(0, 5).map((u: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-gray-300 py-0.5">
              {u.username
                ? <a href={`https://t.me/${u.username}`} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline font-mono">@{u.username}</a>
                : <span className="text-gray-500 font-mono text-xs">id:{u.user_id}</span>
              }
              {(u.first_name || u.last_name) && (
                <span className="text-gray-200">{[u.first_name, u.last_name].filter(Boolean).join(' ')}</span>
              )}
              {u.verified && <span className="text-blue-400 text-xs">✓</span>}
            </div>
          ))}
          {(data?.total || list.length) > 5 && (
            <p className="text-xs text-gray-500 pt-1">+{(data?.total || list.length) - 5} більше результатів</p>
          )}
        </div>
      )}
    </div>
  )
}

function RegistriesResults({ sources }: { sources: Record<string, any> }) {
  const sections = [
    {
      key: 'nazk', label: 'НАЗК декларації', icon: '📋',
      getItems: (d: any) => d?.declarations || [],
      renderItem: (r: any) => ({
        text: `${r.full_name || ''} — ${r.position || ''}`,
        sub: r.organization,
        link: r.url,
      }),
    },
    {
      key: 'myrotvorets', label: 'Миротворець', icon: '🎯',
      getItems: (d: any) => d?.results || [],
      renderItem: (r: any) => ({
        text: r.title || '',
        sub: r.date ? `Дата: ${r.date}` : undefined,
        link: r.url,
      }),
    },
    {
      key: 'mvs', label: 'МВС розшук', icon: '🚔',
      getItems: (d: any) => d?.records || [],
      renderItem: (r: any) => ({
        text: [r.LAST_NAME_U || r.last_name, r.FIRST_NAME_U || r.first_name, r.MIDDLE_NAME_U || r.middle_name]
          .filter(Boolean).join(' ') || r.name || JSON.stringify(r).slice(0, 60),
        sub: r.ARTICLE_CRIM || r.crime_article,
        link: undefined,
      }),
    },
    {
      key: 'erb', label: 'Реєстр боржників', icon: '⚖️',
      getItems: (d: any) => d?.debtors || [],
      renderItem: (r: any) => ({
        text: [r.lastName, r.firstName, r.middleName].filter(Boolean).join(' ') || r.name || '',
        sub: r.publisher || r.organization,
        link: undefined,
      }),
    },
  ]

  const hasAny = sections.some(({ key }) => {
    const d = sources[key]?.data
    return countHits(key, d) > 0 || d?.fallback_url || d?.message
  })
  if (!hasAny) return <p className="text-gray-500 text-sm">Нічого не знайдено в публічних реєстрах</p>

  return (
    <div className="space-y-3">
      {sections.map(({ key, label, icon, getItems, renderItem }) => {
        const d = sources[key]?.data
        const hits = countHits(key, d)
        const items = getItems(d)
        const fallbackUrl = d?.fallback_url
        const message = d?.message

        return (
          <div key={key} className="border-b border-gray-800/50 pb-2 last:border-0">
            <div className="flex items-center gap-2 mb-1">
              <span>{icon}</span>
              <span className="text-xs font-semibold text-gray-400">{label}</span>
              <span className={`text-xs ml-auto ${hits > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                {hits > 0 ? `✓ ${hits}` : fallbackUrl ? '🔗' : '—'}
              </span>
            </div>
            {items.length > 0 && (
              <div className="space-y-1 ml-4">
                {items.slice(0, 4).map((r: any, i: number) => {
                  const { text, sub, link } = renderItem(r)
                  return (
                    <div key={i}>
                      {link
                        ? <a href={link} target="_blank" rel="noopener noreferrer"
                            className="text-sm text-blue-300 hover:underline block">{text}</a>
                        : <div className="text-sm text-gray-300">{text}</div>
                      }
                      {sub && <div className="text-xs text-gray-500">{sub}</div>}
                    </div>
                  )
                })}
              </div>
            )}
            {items.length === 0 && (message || fallbackUrl) && (
              <div className="ml-4">
                {message && <p className="text-xs text-gray-500 mb-0.5">{message}</p>}
                {fallbackUrl && (
                  <a href={fallbackUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline">
                    Перевірити вручну →
                  </a>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function LeaksResults({ sources }: { sources: Record<string, any> }) {
  const leaksData  = sources.leaks?.data
  const catalogData = sources.breach_catalog?.data
  const [showAll, setShowAll] = useState(false)

  // Collect all entries with their source names
  const allEntries: Array<{ src: string; entry: any }> = []
  for (const [src, d] of Object.entries(leaksData?.sources || {}) as [string, any][]) {
    for (const e of (d?.entries || [])) {
      allEntries.push({ src, entry: e })
    }
  }

  const LABELS: Record<string, string> = {
    leakosint: '🔥 LeakOsint',
    osintkit:  '🗂 OsintKit',
    dehashed:  '🔓 DeHashed',
    leakcheck: '✅ LeakCheck',
    hibp:      '🔔 HIBP',
    snusbase:  '📦 SnusBase',
    peoplefind_bot: '👥 PeopleFindBase',
    eyeofgod:  '👁 EyeOfGod',
    local_leaks: '💾 Local',
  }

  const visible = showAll ? allEntries : allEntries.slice(0, 8)

  return (
    <div className="space-y-3">
      {leaksData && countHits('leaks', leaksData) > 0 && (
        <>
          {/* Summary by source */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {Object.entries(leaksData.sources || {}).map(([src, d]: any) =>
              d?.entries?.length > 0 ? (
                <span key={src} className="text-xs px-2 py-0.5 rounded-full bg-red-900/40 border border-red-800/40 text-red-300">
                  {LABELS[src] || src} · {d.total || d.entries.length}
                </span>
              ) : null
            )}
          </div>

          {/* Detailed records */}
          {allEntries.length > 0 && (
            <div className="space-y-1.5">
              {visible.map(({ src, entry: e }, i) => (
                <div key={i} className="rounded-lg border border-red-900/30 bg-red-950/10 px-3 py-2 text-xs space-y-0.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-red-400/80 font-mono">{LABELS[src] || src}</span>
                    {e.database && <span className="text-gray-600 truncate max-w-[160px]">{e.database}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {e.name         && <div><span className="text-gray-500">ПІБ:</span> <span className="text-white font-medium">{e.name}</span></div>}
                    {e.phone        && <div><span className="text-gray-500">Тел:</span> <span className="text-green-300">{e.phone}</span></div>}
                    {e.email        && <div><span className="text-gray-500">Email:</span> <span className="text-blue-300">{e.email}</span></div>}
                    {e.dob          && <div><span className="text-gray-500">Дата нар.:</span> <span className="text-yellow-300">{e.dob}</span></div>}
                    {e.address      && <div className="col-span-2"><span className="text-gray-500">Адреса:</span> <span className="text-gray-300">{e.address}</span></div>}
                    {e.inn          && <div><span className="text-gray-500">ІПН:</span> <span className="text-yellow-400 font-mono">{e.inn}</span></div>}
                    {e.snils        && <div><span className="text-gray-500">СНІЛС:</span> <span className="text-yellow-400 font-mono">{e.snils}</span></div>}
                    {e.passport     && <div><span className="text-gray-500">Паспорт:</span> <span className="text-gray-300 font-mono">{e.passport}</span></div>}
                    {e.username     && <div><span className="text-gray-500">Login:</span> <span className="text-orange-300">@{e.username}</span></div>}
                    {e.vehicle      && <div className="col-span-2"><span className="text-gray-500">Авто:</span> <span className="text-gray-300">{e.vehicle}</span></div>}
                    {e.extra_phones && <div className="col-span-2"><span className="text-gray-500">Ще тел:</span> <span className="text-green-400">{e.extra_phones}</span></div>}
                  </div>
                </div>
              ))}
              {allEntries.length > 8 && (
                <button onClick={() => setShowAll(!showAll)}
                  className="w-full text-xs text-gray-500 hover:text-gray-300 py-1.5 border border-gray-800 rounded-lg transition">
                  {showAll ? '▲ Показати менше' : `▼ Показати всі ${allEntries.length} записів`}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {catalogData && countHits('breach_catalog', catalogData) > 0 && (
        <div className="border-t border-gray-800 pt-2">
          <p className="text-xs font-semibold text-gray-400 mb-1.5">
            📋 Знайдено у {countHits('breach_catalog', catalogData)} відомих витоках
          </p>
          <div className="space-y-1">
            {(catalogData.results || []).slice(0, 6).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-300">{r.dump_name}</span>
                <span className="text-orange-300 font-mono">
                  {r.record_count ? Number(r.record_count).toLocaleString() : '?'} записів
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BusinessResults({ data }: { data: any }) {
  const companies = (data?.companies || []).filter((c: any) => c.type !== 'fallback')
  const fallbacks = (data?.companies || []).filter((c: any) => c.type === 'fallback')
  return (
    <div className="space-y-2">
      {companies.length > 0 ? (
        <div className="space-y-1.5">
          {companies.slice(0, 8).map((c: any, i: number) => (
            <div key={i} className={`rounded-lg p-2.5 border border-gray-800 text-sm ${c.url ? 'hover:border-gray-600 transition cursor-pointer' : ''}`}
              onClick={() => c.url && window.open(c.url, '_blank')}>
              <div className="flex items-center gap-2">
                <span>{c.type === 'fop' ? '👤' : '🏢'}</span>
                <span className="text-gray-200 font-medium">{c.name}</span>
                {c.edrpou && <span className="text-gray-600 text-xs font-mono ml-auto">{c.edrpou}</span>}
              </div>
              {c.status && <div className="text-xs text-green-400 mt-0.5 ml-6">{c.status}</div>}
              {c.director && <div className="text-xs text-gray-500 mt-0.5 ml-6">Директор: {c.director}</div>}
              {c.address && <div className="text-xs text-gray-600 mt-0.5 ml-6 truncate">{c.address}</div>}
            </div>
          ))}
          {data?.related_persons?.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-1">Пов'язані особи в базі:</p>
              {data.related_persons.map((p: any, i: number) => (
                <a key={i} href={`/persons/${p.id}`} target="_blank"
                  className="block text-sm text-blue-300 hover:underline">
                  {p.name_ukr || p.name_rus} {p.rank && `— ${p.rank}`}
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500 mb-2">Автоматичний пошук не знайшов записів. Перевірте вручну:</p>
      )}
      {fallbacks.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {fallbacks.map((f: any, i: number) => (
            <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
              className="text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-blue-400 hover:text-blue-300 hover:border-gray-600 transition flex items-center gap-1">
              <span>↗</span>
              <span>{f.name.replace(/^Пошук «.+» на /, '')}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function NetworkResults({ sources }: { sources: Record<string, any> }) {
  const net = sources.network?.data
  const sf  = sources.spiderfoot?.data
  return (
    <div className="space-y-2 text-sm">
      {net?.geo && (
        <div><span className="text-gray-500">Країна:</span> <span className="text-gray-200">{net.geo.country} ({net.geo.org})</span></div>
      )}
      {net?.whois?.registrar && (
        <div><span className="text-gray-500">Реєстратор:</span> <span className="text-gray-200">{net.whois.registrar}</span></div>
      )}
      {net?.ports?.length > 0 && (
        <div><span className="text-gray-500">Відкриті порти:</span> <span className="font-mono text-yellow-300">{net.ports.slice(0, 8).join(', ')}</span></div>
      )}
      {net?.vulns?.length > 0 && (
        <div className="text-red-300">⚠️ Знайдено {net.vulns.length} вразливостей</div>
      )}
      {sf?.scan_id && (
        <div className="text-gray-400">
          Глибокий аналіз запущено.{' '}
          <a href="/admin/tools" className="text-blue-400 hover:text-blue-300">Переглянути результати →</a>
        </div>
      )}
    </div>
  )
}

// ─── Score Badge ──────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  if (score >= 70) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-700/40">
        Висока релевантність
      </span>
    )
  }
  if (score >= 40) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-700/40">
        Можливий збіг
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-700/40">
      Низька релевантність
    </span>
  )
}

function SanctionsResults({ data }: { data: any }) {
  const entries = data?.entries || []
  if (!entries.length) return <p className="text-gray-500 text-sm">Не знайдено в санкційних базах</p>
  return (
    <div className="space-y-2">
      {entries.map((e: any, i: number) => (
        <a key={i} href={e.url} target="_blank" rel="noopener noreferrer"
          className="block rounded-lg p-3 border border-red-900/40 bg-red-950/20 hover:bg-red-950/40 transition">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-white text-sm">{e.name}</div>
              {e.aliases?.length > 0 && (
                <div className="text-xs text-gray-400 mt-0.5">
                  також: {e.aliases.slice(0,3).join(' / ')}
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {e.programs?.slice(0,4).map((p: string, j: number) => (
                  <span key={j} className="text-xs px-2 py-0.5 rounded bg-red-900/60 text-red-200 border border-red-800/50">
                    {p}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right shrink-0 text-xs text-gray-500 space-y-0.5">
              {e.nationality && <div>{e.nationality}</div>}
              {e.dob && <div>Нар.: {e.dob}</div>}
              {e.schema && <div className="text-gray-600">{e.schema}</div>}
            </div>
          </div>
          {e.positions?.length > 0 && (
            <div className="text-xs text-yellow-400 mt-1.5">{e.positions.join(' · ')}</div>
          )}
        </a>
      ))}
    </div>
  )
}

function VkResults({ data }: { data: any }) {
  const entries     = data?.entries || []
  const searchLinks = data?.search_links || []

  return (
    <div className="space-y-3">
      {entries.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {entries.map((e: any, i: number) => (
            <a key={i} href={e.url} target="_blank" rel="noopener noreferrer"
              className="flex gap-3 p-2.5 rounded-lg border border-blue-900/40 bg-blue-950/20 hover:bg-blue-950/40 transition">
              {e.photo
                ? <img src={e.photo} alt="" className="w-12 h-12 rounded-full object-cover shrink-0 border border-blue-800/40" />
                : <div className="w-12 h-12 rounded-full bg-blue-900/40 flex items-center justify-center text-xl shrink-0">👤</div>
              }
              <div className="min-w-0">
                <div className="font-semibold text-white text-sm truncate">{e.name}</div>
                {e.username && <div className="text-xs text-blue-400">@{e.username}</div>}
                <div className="text-xs text-gray-500 mt-0.5">
                  {[e.city, e.country].filter(Boolean).join(', ')}
                  {e.bdate && ` · ${e.bdate}`}
                </div>
                {e.snippet && <div className="text-xs text-gray-600 truncate mt-0.5">{e.snippet}</div>}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm">Автоматичний пошук не знайшов профілів</p>
      )}

      {/* Завжди показуємо прямі посилання для ручного пошуку */}
      {searchLinks.length > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <p className="text-xs text-gray-600 mb-1.5">Перевірити вручну:</p>
          <div className="flex flex-wrap gap-2">
            {searchLinks.map((l: any, i: number) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-800/50
                           text-blue-300 rounded-lg transition flex items-center gap-1">
                ↗ {l.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GetcontactResults({ data }: { data: any }) {
  const entries      = data?.entries || []
  const alternatives = data?.alternatives || []

  return (
    <div className="space-y-2">
      {entries.length > 0 ? (
        <>
          {data?.note && <p className="text-sm text-sky-400">{data.note}</p>}
          <div className="flex flex-wrap gap-2">
            {entries.map((e: any, i: number) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm">
                <span className="text-white">{e.name}</span>
                {e.count > 1 && <span className="text-gray-500 text-xs">×{e.count}</span>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-gray-500 text-sm text-xs">Перевір вручну — хто зберіг цей номер:</p>
      )}
      {alternatives.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {alternatives.map((a: any, i: number) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 bg-sky-900/30 hover:bg-sky-900/50 border border-sky-800/50
                         text-sky-300 rounded-lg transition flex items-center gap-1">
              ↗ {a.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function VehicleResults({ data }: { data: any }) {
  const results = data?.results || data?.data || []
  if (!results.length && !data?.fallback_url) {
    return <p className="text-gray-500 text-sm">Транспортний засіб не знайдено</p>
  }
  return (
    <div className="space-y-2 text-sm">
      {results.map((r: any, i: number) => (
        <div key={i} className="rounded-lg border border-orange-900/40 bg-orange-950/20 p-3">
          {r.model && <div className="font-semibold text-white">{r.brand} {r.model} {r.year}</div>}
          {r.color && <div className="text-gray-400 text-xs">Колір: {r.color}</div>}
          {r.owner && <div className="text-gray-300 mt-1">Власник: <span className="text-white">{r.owner}</span></div>}
          {r.region && <div className="text-gray-500 text-xs">Регіон: {r.region}</div>}
        </div>
      ))}
      {data?.fallback_url && (
        <a href={data.fallback_url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:underline">
          ↗ Перевірити вручну
        </a>
      )}
    </div>
  )
}

function WebResults({ data }: { data: any }) {
  const results = data?.results || []
  return (
    <div className="space-y-2">
      {results.map((r: any, i: number) => (
        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
          className="block rounded-lg p-2.5 hover:bg-gray-800/60 transition group border border-transparent hover:border-gray-700">
          <div className="text-sm font-medium text-blue-300 group-hover:text-blue-200 truncate">{r.title}</div>
          <div className="text-xs text-gray-500 truncate">{r.url.replace(/^https?:\/\//, '')}</div>
          {r.content && (
            <div className="text-xs text-gray-400 mt-1 line-clamp-2">{r.content.slice(0, 160)}</div>
          )}
        </a>
      ))}
      {results.length === 0 && data?.google_url && (
        <div className="text-sm text-gray-500">
          Автоматичний пошук не знайшов результатів.{' '}
          <a href={data.google_url} target="_blank" rel="noopener noreferrer"
            className="text-blue-400 hover:underline">
            Шукати в Google →
          </a>
        </div>
      )}
      {results.length === 0 && !data?.google_url && (
        <p className="text-gray-500 text-sm">Нічого не знайдено</p>
      )}
    </div>
  )
}

// ─── Save to Card Panel ───────────────────────────────────────────────────────
function SaveToCardPanel({
  sources, query, type, running,
}: {
  sources: Record<string, { status: string; data: any }>
  query: string
  type: string
  running: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState<{ id: string; name: string } | null>(null)
  const [error,    setError]    = useState('')

  const extracted = extractPersonData(sources, query, type)
  const [form, setForm] = useState(extracted)

  // Update form when new data arrives
  useEffect(() => {
    if (!running) {
      const fresh = extractPersonData(sources, query, type)
      setForm(fresh)
    }
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  const odbPersons: any[] = sources.odb?.data?.persons || []
  const hasAnyData = !!(form.name || form.phones || form.email || form.dob || form.addr_live || form.ipn)

  if (!hasAnyData && !running) return null

  async function saveToCard() {
    if (!form.name && !form.phones && !form.email) {
      setError('Вкажіть хоча б ім\'я, телефон або email')
      return
    }
    setSaving(true)
    setError('')
    try {
      // Pick best name variant for name_ukr vs name_rus
      const nameUkr = form.all_names?.find((n: string) => /[іїєґ]/i.test(n)) || form.name
      const nameRus = form.all_names?.find((n: string) => !/[іїєґ]/i.test(n) && /[а-яёА-ЯЁ]/i.test(n)) || form.name
      // All phones as array
      const allPhones = form.all_phones?.length > 0 ? form.all_phones : (form.phones ? [form.phones] : undefined)

      const payload: Record<string, any> = {
        name_ukr:  nameUkr || undefined,
        name_rus:  nameRus || undefined,
        phones:    allPhones || undefined,
        email:     form.email || undefined,
        dob:       form.dob || undefined,
        addr_live: form.addr_live || undefined,
        ipn:       form.ipn || undefined,
        snils:     form.snils || undefined,
        passport:  form.passport || undefined,
        photo_url: form.photo_url || undefined,
        vk_url:    form.vk_url || undefined,
        status:    'фігурант',
        sources:   [query],
        description: form.tg_username ? `Telegram: ${form.tg_username}` : undefined,
      }
      // Remove undefined keys
      for (const k of Object.keys(payload)) {
        if (payload[k] === undefined) delete payload[k]
      }
      const res = await fetch('/api/persons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSaved({ id: data.id, name: form.name || query })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const Field = ({ label, field, mono }: { label: string; field: keyof typeof form; mono?: boolean }) => (
    <div>
      <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
      <input
        value={(form[field] as string) || ''}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white
                    focus:border-blue-500 focus:outline-none ${mono ? 'font-mono' : ''}`}
        placeholder="—"
      />
    </div>
  )

  return (
    <div className={`mt-4 rounded-xl border transition-all ${
      saved ? 'border-green-700/60 bg-green-950/20' : 'border-blue-700/40 bg-blue-950/10'
    }`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">💾</span>
          <span className="font-semibold text-blue-300 text-sm">
            {saved
              ? `✅ Збережено: ${saved.name}`
              : running
              ? 'Збираємо дані...'
              : `Зберегти у картку особи ${hasAnyData ? `(знайдено: ${[form.name, form.phones, form.email].filter(Boolean).join(', ').slice(0, 60)})` : ''}`
            }
          </span>
          {odbPersons.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 border border-blue-700/40 text-blue-400">
              {odbPersons.length} в базі
            </span>
          )}
        </div>
        <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-blue-800/30 p-4 space-y-4">
          {/* If person already in ODB */}
          {odbPersons.length > 0 && (
            <div className="rounded-lg border border-blue-700/40 bg-blue-900/20 p-3">
              <p className="text-xs text-blue-400 font-semibold mb-2">👤 Вже є в базі:</p>
              <div className="space-y-1">
                {odbPersons.slice(0, 3).map((p: any, i: number) => (
                  <a key={i} href={`/persons/${p.id}`} target="_blank"
                    className="flex items-center gap-2 text-sm hover:text-blue-300 transition text-blue-200">
                    <span>→</span>
                    <span>{p.name_ukr || p.name_rus || p.name_eng}</span>
                    {p.rank && <span className="text-xs text-gray-500">{p.rank}</span>}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* All found values hint */}
          {(form.all_names?.length > 1 || form.all_phones?.length > 1 || form.all_emails?.length > 1) && (
            <div className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-3 text-xs space-y-1">
              <p className="text-gray-400 font-semibold mb-1">📋 Всі знайдені значення:</p>
              {form.all_names?.length > 1  && <div className="text-gray-300">ПІБ: {form.all_names.slice(0, 5).join(' · ')}</div>}
              {form.all_phones?.length > 1 && <div className="text-gray-300">Телефони: {form.all_phones.slice(0, 5).join(' · ')}</div>}
              {form.all_emails?.length > 1 && <div className="text-gray-300">Emails: {form.all_emails.slice(0, 5).join(' · ')}</div>}
              {form.all_addresses?.length > 1 && <div className="text-gray-300">Адреси: {form.all_addresses.slice(0, 3).join(' · ')}</div>}
            </div>
          )}

          {/* Editable form */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="ПІБ" field="name" />
            </div>
            <Field label="Телефон" field="phones" mono />
            <Field label="Email" field="email" mono />
            <Field label="Дата нар. (ДД.ММ.РРРР)" field="dob" mono />
            <Field label="ІПН" field="ipn" mono />
            <div className="col-span-2">
              <Field label="Адреса" field="addr_live" />
            </div>
            <Field label="Паспорт" field="passport" mono />
            <Field label="СНІЛС" field="snils" mono />
            {form.vk_url && (
              <div className="col-span-2">
                <Field label="VK профіль" field="vk_url" />
              </div>
            )}
            {form.tg_username && (
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Telegram</label>
                <div className="text-sm text-sky-400 py-1.5">{form.tg_username}</div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-400">⚠️ {error}</p>}

          <div className="flex gap-3">
            {saved ? (
              <a href={`/persons/${saved.id}`} target="_blank"
                className="flex-1 text-center py-2.5 bg-green-700 hover:bg-green-600 rounded-xl text-sm font-semibold transition">
                🔗 Відкрити картку →
              </a>
            ) : (
              <button
                onClick={saveToCard}
                disabled={saving || running}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                           rounded-xl text-sm font-semibold transition"
              >
                {saving ? '⟳ Зберігаємо...' : '💾 Зберегти нову картку'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Messengers Section — Telegram MTProto + phone_presence + tg_bots ────────
function MessengersSection({ sources }: { sources: Record<string, { status: string; data: any }> }) {
  const [tgBotsLoading, setTgBotsLoading] = useState(false)
  const [tgBotsData,    setTgBotsData]    = useState<any>(null)
  const [tgBotsError,   setTgBotsError]   = useState('')

  const tgBotsInfo = sources.tg_bots?.data  // { async: true, endpoint, query, dob }

  async function runTgBots() {
    if (!tgBotsInfo?.endpoint || !tgBotsInfo?.query) return
    setTgBotsLoading(true); setTgBotsError('')
    try {
      const url = new URL(tgBotsInfo.endpoint)
      url.searchParams.set('q', tgBotsInfo.query)
      if (tgBotsInfo.dob) url.searchParams.set('dob', tgBotsInfo.dob)
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(65000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setTgBotsData(d)
    } catch (e: any) {
      setTgBotsError(e.message || 'Помилка')
    } finally {
      setTgBotsLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Phone presence */}
      {sources.phone_presence?.data && (
        <div>
          <p className="text-xs text-gray-500 font-semibold mb-2">📱 Наявність у месенджерах</p>
          <PhonePresenceResults data={sources.phone_presence.data} />
        </div>
      )}

      {/* Telegram MTProto */}
      {sources.telegram?.data && (
        <div className={sources.phone_presence?.data ? 'pt-3 border-t border-gray-800' : ''}>
          <p className="text-xs text-gray-500 mb-2">✈️ Telegram MTProto</p>
          <MessengerResults data={sources.telegram.data} />
        </div>
      )}

      {/* GetContact */}
      {sources.getcontact?.data && (
        <div className="pt-3 border-t border-gray-800">
          <p className="text-xs text-gray-500 mb-2">📒 Getcontact</p>
          <GetcontactResults data={sources.getcontact.data} />
        </div>
      )}

      {/* Telegram LEAK BOTS — async, запускається вручну */}
      {tgBotsInfo?.async && (
        <div className="pt-3 border-t border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">🤖 Telegram OSINT боти (~10 ботів, 30-60с)</p>
            {!tgBotsData && (
              <button
                onClick={runTgBots}
                disabled={tgBotsLoading}
                className="px-3 py-1 bg-sky-800 hover:bg-sky-700 disabled:opacity-50 rounded-lg text-xs text-sky-200 transition flex items-center gap-1.5"
              >
                {tgBotsLoading
                  ? <><span className="animate-spin inline-block">⟳</span> Пошук...</>
                  : <>🔍 Перевірити боти</>
                }
              </button>
            )}
          </div>

          {tgBotsError && (
            <p className="text-red-400 text-xs">❌ {tgBotsError}</p>
          )}

          {tgBotsLoading && (
            <div className="text-center py-4">
              <p className="text-sky-400 text-xs animate-pulse">Запит до {'>'}10 Telegram ботів... це займе ~40 секунд</p>
            </div>
          )}

          {tgBotsData && (() => {
            const entries: any[] = tgBotsData.results || tgBotsData.entries || []
            if (!entries.length) {
              return <p className="text-gray-600 text-xs">Боти не знайшли даних</p>
            }
            return (
              <div className="space-y-2">
                {entries.slice(0, 20).map((e: any, i: number) => (
                  <div key={i} className="bg-gray-900 rounded-lg px-3 py-2 text-xs border border-gray-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sky-400 font-mono">{e.source || e.source_label || e.database}</span>
                      {e.fields?.phone && <span className="text-green-400">📱 {e.fields.phone}</span>}
                    </div>
                    {(e.fields?.name || e.name) && <p className="text-gray-300">{e.fields?.name || e.name}</p>}
                    {(e.fields?.dob || e.dob) && <p className="text-gray-500">📅 {e.fields?.dob || e.dob}</p>}
                    {(e.fields?.address || e.address) && <p className="text-gray-500">📍 {e.fields?.address || e.address}</p>}
                    {e.snippet && <p className="text-gray-400 mt-1">{e.snippet}</p>}
                  </div>
                ))}
                {entries.length > 20 && (
                  <p className="text-xs text-gray-600 text-center">...та ще {entries.length - 20} результатів</p>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ─── Category Card ─────────────────────────────────────────────────────────────
function CategoryCard({
  cat, sources, type,
}: {
  cat: typeof CATEGORIES[0]
  sources: Record<string, { status: string; data: any }>
  type: string
}) {
  const [expanded, setExpanded] = useState(false)
  const isRelevant  = cat.types.includes(type)
  const isLoading   = categoryLoading(cat, sources, type)
  const hits        = categoryHits(cat, sources)
  const hasResults  = hits > 0

  // Check if any source has fallback links (for registries, business, web)
  const hasFallbacks = !hasResults && cat.sources.some(src => {
    const d = sources[src]?.data
    return d?.fallback_url || d?.message || d?.google_url ||
      (src === 'company' && (d?.companies || []).some((c: any) => c.type === 'fallback'))
  })

  const canExpand = hasResults || hasFallbacks

  // Auto-expand when hits come in
  useEffect(() => {
    if (hasResults) setExpanded(true)
  }, [hasResults])

  if (!isRelevant) return null

  return (
    <div className={`rounded-xl border overflow-hidden transition-all duration-300 ${
      hasResults ? 'odb-card-hover' : ''
    } ${
      isLoading    ? 'border-gray-700 bg-gray-900/50' :
      hasResults   ? `${cat.borderHit} ${cat.bgHit}` :
      hasFallbacks ? 'border-gray-700 bg-gray-900/40' :
      'border-gray-800 bg-gray-900/30'
    }`}>
      <div
        className={`flex items-center justify-between px-4 py-3.5 ${canExpand ? 'cursor-pointer' : ''}`}
        onClick={() => canExpand && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className={`${cat.color} ${isLoading ? 'odb-animate-pulse rounded-full' : ''}`}>
            <Icon name={CAT_ICON[cat.key] ?? 'search'} size={20} />
          </span>
          <span className={`font-semibold text-sm ${cat.color}`}>{cat.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <span className="text-[var(--odb-accent-hi)] animate-spin"><Icon name="spark" size={16} /></span>
          )}
          {!isLoading && (
            <span className={`text-sm font-bold px-3 py-1 rounded-full transition-all ${
              hasResults   ? 'odb-animate-scale' : ''
            } ${
              hasResults   ? 'bg-green-800/60 text-green-200' :
              hasFallbacks ? 'bg-gray-700/80 text-blue-400' :
              'bg-gray-800 text-gray-500'
            }`}>
              {hasResults ? `✓ ${hits}` : hasFallbacks ? '🔗' : '—'}
            </span>
          )}
          {canExpand && (
            <span className="text-gray-500 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
          )}
        </div>
      </div>

      {expanded && canExpand && (
        <div className="border-t border-gray-800 p-4 max-h-96 overflow-y-auto">
          {cat.key === 'sanctions'   && <SanctionsResults data={sources.sanctions?.data} />}
          {cat.key === 'vk'          && <VkResults data={sources.vk?.data} />}
          {cat.key === 'social'      && <SocialResults sources={sources} />}
          {cat.key === 'persons'     && <PersonsResults data={sources.odb?.data} />}
          {cat.key === 'messengers'  && (
            <MessengersSection sources={sources} />
          )}
          {cat.key === 'vehicles'    && <VehicleResults data={sources.vehicles?.data} />}
          {cat.key === 'registries'  && <RegistriesResults sources={sources} />}
          {cat.key === 'leaks'       && <LeaksResults sources={sources} />}
          {cat.key === 'business'    && <BusinessResults data={sources.company?.data} />}
          {cat.key === 'network'     && <NetworkResults sources={sources} />}
          {cat.key === 'web'         && <WebResults data={sources.web?.data} />}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function SearchAllPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [query,        setQuery]        = useState(searchParams.get('q') || '')
  const [running,      setRunning]      = useState(false)
  const [searched,     setSearched]     = useState(false)
  const [sources,      setSources]      = useState<Record<string, { status: string; data: any }>>({})
  const [detectedType, setDetectedType] = useState('')
  const [totalHits,    setTotalHits]    = useState(0)
  const [parsedQuery,  setParsedQuery]  = useState<{ fullName?: string; dob?: string | null; dobYear?: number | null; phones?: string[] } | null>(null)
  const [searchDuration, setSearchDuration] = useState(0)
  const abortRef  = useRef<AbortController | null>(null)
  const supabase  = createClient()
  const userRef   = useRef<{ id?: string; email?: string }>({})

  // Load user info once for activity logging
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) userRef.current = { id: data.user.id, email: data.user.email || undefined }
    })
  }, [])

  const qType    = query.trim() ? detectType(query.trim()) : ''
  const typeInfo = TYPE_LABELS[qType]

  // Auto-start if query in URL
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      setQuery(q)
      startSearch(q)
    }
  }, [])

  const startSearch = useCallback(async (q?: string) => {
    const sq = (q || query).trim()
    if (!sq || running) return

    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    const type = detectType(sq)
    setDetectedType(type)
    setRunning(true)
    setSearched(true)
    setTotalHits(0)

    // Init sources
    const initSources: Record<string, any> = {}
    for (const [key, types] of Object.entries(SOURCE_TYPES)) {
      initSources[key] = {
        status: types.includes(type) ? 'loading' : 'skip',
        data: null,
      }
    }
    setSources(initSources)

    try {
      const res = await fetch('/api/search-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sq, user_id: userRef.current.id, user_email: userRef.current.email }),
        signal: abortRef.current.signal,
      })
      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6))
            if (msg.source === '__done__') {
              setRunning(false)
              if (msg.parsedQuery) setParsedQuery(msg.parsedQuery)
              if (msg.durationMs)  setSearchDuration(msg.durationMs)
              return
            }
            setSources(prev => {
              const next = { ...prev, [msg.source]: { status: msg.status, data: msg.data } }
              let hits = 0
              for (const [k, v] of Object.entries(next) as [string, { status: string; data: any }][]) {
                if (v.status === 'done') hits += countHits(k, v.data)
              }
              setTotalHits(hits)
              return next
            })
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error(err)
    } finally {
      setRunning(false)
    }
  }, [query, running])

  function newSearch() {
    setSearched(false)
    setQuery('')
    setSources({})
    setTotalHits(0)
    setParsedQuery(null)
    setSearchDuration(0)
    router.push('/search-all')
  }

  return (
    <div className="flex min-h-screen text-white" style={{ background: 'var(--odb-bg)' }}>
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-screen">

        {/* Search header */}
        <div className="px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--odb-border-soft)' }}>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-2xl">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--odb-text-faint)]">
                <Icon name="search" size={18} />
              </span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && startSearch()}
                placeholder="Телефон, ПІБ, email, username, IP, домен, ЄДРПОУ…"
                className="w-full pl-11 pr-36 py-3 rounded-xl text-white font-mono text-sm outline-none placeholder-[var(--odb-text-faint)] transition-all"
                style={{ background: 'var(--odb-surface-2)', border: '1px solid var(--odb-border)' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--odb-accent)'; e.currentTarget.style.boxShadow = 'var(--odb-shadow-accent)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--odb-border)'; e.currentTarget.style.boxShadow = 'none' }}
              />
              {typeInfo && (
                <div className={`absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1
                  text-xs font-semibold px-2.5 py-1 rounded-full ${typeInfo.color}`}
                  style={{ background: 'var(--odb-surface-3)', border: '1px solid var(--odb-border)' }}>
                  {typeInfo.label}
                </div>
              )}
            </div>

            <button
              onClick={() => startSearch()}
              disabled={!query.trim() || running}
              className="odb-btn-accent px-6 py-3 font-semibold text-sm shrink-0 disabled:opacity-40 flex items-center gap-2"
            >
              {running
                ? <span className="animate-spin inline-block"><Icon name="spark" size={16} /></span>
                : <><Icon name="search" size={16} /> Шукати</>}
            </button>

            {running && (
              <button
                onClick={() => { abortRef.current?.abort(); setRunning(false) }}
                className="px-4 py-3 rounded-xl text-sm shrink-0 transition text-[var(--odb-danger)]"
                style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)' }}
              >
                <Icon name="close" size={16} />
              </button>
            )}

            {searched && !running && (
              <button onClick={newSearch}
                className="px-4 py-3 rounded-xl text-sm text-[var(--odb-text-dim)] hover:text-white shrink-0 transition"
                style={{ background: 'var(--odb-surface-2)', border: '1px solid var(--odb-border)' }}>
                Очистити
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Status bar */}
          {searched && (
            <div className="flex flex-wrap items-center gap-3 mb-5">
              {running ? (
                <span className="text-gray-400 text-sm animate-pulse">
                  ⟳ Пошук по всіх джерелах...
                </span>
              ) : (() => {
                const sourcesWithResults = Object.entries(sources).filter(
                  ([k, v]) => v.status === 'done' && k !== '__done__' && countHits(k, v.data) > 0
                ).length
                return (
                  <span className={`font-bold text-base ${totalHits > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                    {totalHits > 0
                      ? `✅ Знайдено ${totalHits} результатів з ${sourcesWithResults} джерел`
                      : '❌ Нічого не знайдено'}
                  </span>
                )
              })()}
              {detectedType && typeInfo && (
                <span className={`text-xs px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 ${typeInfo.color}`}>
                  {typeInfo.icon} {typeInfo.label}
                </span>
              )}
              {/* Parsed query info — показуємо що розпізнано */}
              {!running && parsedQuery?.fullName && parsedQuery.fullName !== query.trim() && (
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded border border-gray-700">
                  Пошук: <span className="text-gray-300">{parsedQuery.fullName}</span>
                  {parsedQuery.dob && <span className="ml-1 text-blue-400">📅 {parsedQuery.dob}</span>}
                </span>
              )}
              {!running && searchDuration > 0 && (
                <span className="text-xs text-gray-600">{(searchDuration / 1000).toFixed(1)}с</span>
              )}
            </div>
          )}

          {/* Category cards */}
          {searched && (
            <div className="max-w-5xl">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 odb-stagger">
                {CATEGORIES.map(cat => (
                  <CategoryCard
                    key={cat.key}
                    cat={cat}
                    sources={sources}
                    type={detectedType}
                  />
                ))}
              </div>

              {/* Save to card panel */}
              <SaveToCardPanel
                sources={sources}
                query={query}
                type={detectedType}
                running={running}
              />
            </div>
          )}

          {/* Empty state */}
          {!searched && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <div className="text-6xl mb-4">🔍</div>
              <h2 className="text-xl font-bold text-white mb-2">Один запит — всі джерела</h2>
              <p className="text-gray-500 text-sm max-w-md mb-8">
                Введіть будь-який ідентифікатор — телефон, ім'я, email, username, IP або домен.
                Система автоматично перевірить усі доступні джерела і зберне результати.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-left">
                {CATEGORIES.map(cat => (
                  <div key={cat.key} className="flex items-center gap-2.5 p-3 bg-gray-900 rounded-xl border border-gray-800">
                    <span className={cat.color}><Icon name={CAT_ICON[cat.key] ?? 'search'} size={20} /></span>
                    <span className={`text-xs font-semibold ${cat.color}`}>{cat.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                {['+380501234567','Іванов Іван Іванович','ivanov_ivan','ivan@gmail.com','14223150','vk.com'].map(ex => (
                  <button key={ex} onClick={() => { setQuery(ex); startSearch(ex) }}
                    className="text-xs px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800
                               hover:border-gray-600 text-gray-500 hover:text-white rounded-xl transition font-mono">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// Suspense wrapper required for useSearchParams in Next.js App Router
export default function SearchAllPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-gray-950 text-white items-center justify-center">
        <div className="text-gray-500 animate-pulse">Завантаження...</div>
      </div>
    }>
      <SearchAllPage />
    </Suspense>
  )
}
