'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../components/Sidebar'
import Icon from '../components/Icon'

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuleStatus = 'active' | 'coming_soon' | 'needs_token'

interface SearchField {
  key: string
  label: string
  placeholder: string
  required?: boolean
  type?: 'text' | 'select'
  options?: { value: string; label: string }[]
}

interface Module {
  id: string
  icon: string
  title: string
  category: string
  status: ModuleStatus
  description: string
  href?: string
  endpoint?: string           // VPS proxy → /api/registries/{endpoint}
  directApi?: string          // Next.js API route
  directPayload?: Record<string, any>
  fields?: SearchField[]
  price?: string
  count?: string
  tokenUrl?: string           // Setup link for needs_token modules
}

// ─── Modules ─────────────────────────────────────────────────────────────────

const ALL_MODULES: Module[] = [

  // ══ МВС / Поліція ══════════════════════════════════════════════════════════
  { id: 'mvs-wanted', icon: '🚔', title: 'МВС — Розшук', category: 'МВС / Поліція',
    status: 'active', description: 'Розшукувані особи по базі МВС України',
    directApi: '/api/mvs/search', directPayload: { resource: 'wanted' }, price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'ПІБ / номер документа', placeholder: 'Іванов Іван Іванович', required: true }] },

  { id: 'mvs-stolen-cars', icon: '🚗', title: 'Авто в розшуку', category: 'МВС / Поліція',
    status: 'active', description: 'Викрадені транспортні засоби за номером або VIN',
    directApi: '/api/mvs/search', directPayload: { resource: 'stolen_cars' }, price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'Держ. номер / VIN / марка', placeholder: 'AA1234BB або Toyota', required: true }] },

  { id: 'mvs-lost-docs', icon: '📄', title: 'Втрачені документи', category: 'МВС / Поліція',
    status: 'active', description: 'База втрачених та вкрадених паспортів і документів',
    directApi: '/api/mvs/search', directPayload: { resource: 'lost_docs' }, price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'Серія і номер / ПІБ', placeholder: 'АА123456 або Іванов', required: true }] },

  { id: 'mvs-missing', icon: '👤', title: 'Зниклі безвісти', category: 'МВС / Поліція',
    status: 'active', description: 'Пошук зниклих безвісти осіб',
    directApi: '/api/mvs/search', directPayload: { resource: 'missing' }, price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'ПІБ особи', placeholder: 'Іванов Іван Іванович', required: true }] },

  { id: 'nais', icon: '🏎️', title: 'НАІС — автомобілі', category: 'МВС / Поліція',
    status: 'coming_soon', description: 'Реєстраційні дані ТЗ, власник, МРЕО', price: '$0.04' },

  { id: 'traffic-fines', icon: '🚦', title: 'Штрафи ПДР', category: 'МВС / Поліція',
    status: 'coming_soon', description: 'Штрафи за порушення ПДР за номером авто', price: '$0.10' },

  // ══ НАЗК / Антикорупція ═════════════════════════════════════════════════════
  { id: 'nazk-declarations', icon: '🏛️', title: 'Декларації НАЗК', category: 'НАЗК / Антикорупція',
    status: 'active', description: 'Декларації держслужбовців: майно, авто, доходи',
    href: '/nazk-search', price: 'free', count: '∞' },

  { id: 'nazk-lustration', icon: '⚖️', title: 'Люстрація (НАЗК)', category: 'НАЗК / Антикорупція',
    status: 'active', description: 'Реєстр люстрованих осіб — колишні чиновники режиму Януковича',
    directApi: '/api/nazk/lustration', price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'ПІБ особи', placeholder: 'Іванов Іван', required: true }] },

  { id: 'nazk-corruption', icon: '🚫', title: 'Корупціонери (НАЗК)', category: 'НАЗК / Антикорупція',
    status: 'active', description: 'Держреєстр осіб, що вчинили корупційні правопорушення',
    directApi: '/api/nazk/corruption', price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'ПІБ особи', placeholder: 'Іванов Іван', required: true }] },

  // ══ Санкції ═════════════════════════════════════════════════════════════════
  { id: 'sanctions', icon: '🌍', title: 'Санкції OFAC/EU/ООН/РНБО', category: 'Санкції',
    status: 'active', description: '1.5M+ записів: OFAC, EU, ООН, UK, РНБО, Інтерпол, Panama Papers',
    directApi: '/api/sanctions/search', price: 'free', count: '1.5M',
    fields: [{ key: 'query', label: 'ПІБ / назва організації', placeholder: 'Путін Владімір або Газпром', required: true }] },

  // ══ Держреєстри ════════════════════════════════════════════════════════════
  { id: 'erb', icon: '💳', title: 'Реєстр боржників (ЄРБ)', category: 'Держреєстри',
    status: 'active', description: 'Боржники за рішеннями виконавчої служби України',
    directApi: '/api/erb/search', price: 'free', count: '∞',
    fields: [
      { key: 'last_name',  label: 'Прізвище', placeholder: 'Іванов', required: true },
      { key: 'first_name', label: "Ім'я",     placeholder: 'Іван' },
    ] },

  { id: 'myrotvorets', icon: '🎯', title: 'Миротворець', category: 'Держреєстри',
    status: 'active', description: 'База осіб, що загрожують нацбезпеці та суверенітету України',
    directApi: '/api/myrotvorets/search', price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'ПІБ / псевдонім', placeholder: 'Іванов Іван', required: true }] },

  { id: 'advocates', icon: '⚖️', title: 'Реєстр адвокатів', category: 'Держреєстри',
    status: 'active', description: 'Єдиний реєстр адвокатів України — статус, свідоцтво, регіон',
    endpoint: 'advocates', price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'ПІБ адвоката', placeholder: 'Іванов Іван', required: true }] },

  { id: 'court', icon: '🏛️', title: 'Судові рішення (ЄДРСР)', category: 'Держреєстри',
    status: 'active', description: 'Єдиний реєстр судових рішень — вироки, ухвали, рішення',
    directApi: '/api/court/search', price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'ПІБ / назва / справа', placeholder: 'Іванов Іван або справа №1-123', required: true }] },

  { id: 'notaries', icon: '📋', title: 'Реєстр нотаріусів', category: 'Держреєстри',
    status: 'active', description: 'Реєстр нотаріусів України — статус, округ, ліцензія',
    endpoint: 'notaries', price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'ПІБ нотаріуса', placeholder: 'Іванов Іван', required: true }] },

  { id: 'patents', icon: '💡', title: 'Патенти України', category: 'Держреєстри',
    status: 'coming_soon', description: 'Реєстр патентів та торгових марок (Укрпатент)', price: 'free' },

  { id: 'bankrupt', icon: '📉', title: 'Банкрутства', category: 'Держреєстри',
    status: 'coming_soon', description: 'Єдиний реєстр підприємств у стані банкрутства', price: 'free' },

  { id: 'asvp', icon: '🔒', title: 'АСВП', category: 'Держреєстри',
    status: 'coming_soon', description: 'Автоматизована система виконавчих проваджень', price: 'free' },

  // ══ Бізнес / ЄДР ════════════════════════════════════════════════════════════
  { id: 'company', icon: '🏢', title: 'Компанії України (ЄДР)', category: 'Бізнес / ЄДР',
    status: 'active', description: 'ЄДР: юридичні особи, ФОП, власники, реєстраційні дані',
    directApi: '/api/company/search', price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'Назва / ЄДРПОУ / власник', placeholder: 'Газпром Україна або 12345678', required: true }] },

  { id: 'ipn', icon: '🔢', title: 'Розшифровка ІПН / ЄДРПОУ', category: 'Бізнес / ЄДР',
    status: 'active', description: 'Інформація за ІПН фізичної особи або ЄДРПОУ компанії',
    endpoint: 'ipn', price: 'free', count: '∞',
    fields: [{ key: 'code', label: 'ІПН / ЄДРПОУ', placeholder: '1234567890', required: true }] },

  { id: 'fns-russia', icon: '🇷🇺', title: 'ФНС Росії (ЄГРЮЛ)', category: 'Бізнес / ЄДР',
    status: 'active', description: 'Реєстр юридичних осіб та ІП Росії — ФНС/ЄГРЮЛ/ЄГРІП',
    directApi: '/api/fns/search', price: 'free', count: '∞',
    fields: [
      { key: 'query', label: 'Назва компанії / ІПН / ОГРН', placeholder: 'Газпром або 7736050003', required: true },
    ] },

  { id: 'scanbe', icon: '🔍', title: 'Реєстри Scanbe', category: 'Бізнес / ЄДР',
    status: 'coming_soon', description: 'Комплексна перевірка компаній через Scanbe.ua', price: '$0.01' },

  { id: 'tax-debt', icon: '💰', title: 'Податковий борг (ДПС)', category: 'Бізнес / ЄДР',
    status: 'coming_soon', description: 'Заборгованість перед ДПС за ЄДРПОУ', price: 'free' },

  { id: 'vat', icon: '🧾', title: 'Реєстр платників ПДВ', category: 'Бізнес / ЄДР',
    status: 'coming_soon', description: 'Перевірка статусу платника ПДВ', price: 'free' },

  // ══ Телефон / Месенджери ════════════════════════════════════════════════════
  { id: 'numbuster', icon: '📱', title: 'NumBuster', category: 'Телефон',
    status: 'active', description: "Ім'я абонента за номером телефону",
    endpoint: 'numbuster', price: 'free', count: '286М+',
    fields: [{ key: 'phone', label: 'Номер телефону', placeholder: '0671234567', required: true }] },

  { id: 'getcontact', icon: '📞', title: 'GetContact', category: 'Телефон',
    status: 'active', description: "Як збережено номер у людей (GetContact)",
    directApi: '/api/getcontact/search', price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'Номер телефону', placeholder: '+380671234567', required: true }] },

  { id: 'truecaller', icon: '✅', title: 'Truecaller', category: 'Телефон',
    status: 'needs_token', description: 'Глобальна база імен за номером телефону',
    price: '$0.04', tokenUrl: 'https://developer.truecaller.com/' },

  // ══ Соцмережі ═══════════════════════════════════════════════════════════════
  { id: 'telegram', icon: '✈️', title: 'Telegram', category: 'Соцмережі',
    status: 'active', description: 'Пошук по базі Telegram: Username, ID, phone',
    href: '/search-all', price: 'free', count: '167k' },

  { id: 'vk', icon: '🔵', title: 'ВКонтакте', category: 'Соцмережі',
    status: 'active', description: 'Пошук VK профілів через Google/Yandex дорки',
    directApi: '/api/vk/search', price: 'free', count: '∞',
    fields: [{ key: 'query', label: 'ПІБ / нікнейм / телефон', placeholder: 'Іванов Іван або ivan_ivanov', required: true }] },

  { id: 'instagram', icon: '📸', title: 'Instagram', category: 'Соцмережі',
    status: 'active', description: 'Пошук профілів та постів Instagram',
    href: '/search-all', price: 'free' },

  { id: 'tiktok', icon: '🎵', title: 'TikTok', category: 'Соцмережі',
    status: 'active', description: 'Профілі та статистика TikTok',
    href: '/search-all', price: 'free' },

  { id: 'username-search', icon: '🌐', title: 'Username Search', category: 'Соцмережі',
    status: 'active', description: 'Пошук нікнейму на 500+ платформах (Sherlock + Maigret)',
    href: '/search-all', price: 'free' },

  { id: 'facebook', icon: '📘', title: 'Facebook', category: 'Соцмережі',
    status: 'coming_soon', description: 'Пошук профілів Facebook', price: 'free' },

  { id: 'telezip', icon: '🗜️', title: 'TeleZip', category: 'Соцмережі',
    status: 'coming_soon', description: 'Архів Telegram груп і каналів', price: '$0.10' },

  { id: 'tgdev-groups', icon: '👥', title: 'TgDev — Групи', category: 'Соцмережі',
    status: 'coming_soon', description: 'Членство у Telegram групах', price: '$0.04' },

  { id: 'kabanchik', icon: '🐷', title: 'Кабанчик', category: 'Соцмережі',
    status: 'coming_soon', description: 'Пошук оголошень на Kabanchik.ua', price: 'free' },

  // ══ OSINT / Витоки ══════════════════════════════════════════════════════════
  { id: 'fragment-search', icon: '🔍', title: 'Фрагментний пошук', category: 'OSINT / Витоки',
    status: 'active', description: 'Пошук по 167k записах локальної Telegram-бази',
    href: '/search-all', price: 'free', count: '167k' },

  { id: 'breach-intel', icon: '🔓', title: 'Витоки (DeHashed + LeakCheck)', category: 'OSINT / Витоки',
    status: 'active', description: 'Пошук по злитих базах: email, пароль, IP, телефон',
    href: '/breach-intel', price: 'free*', count: '12B+' },

  { id: 'leakcheck', icon: '💧', title: 'LeakCheck', category: 'OSINT / Витоки',
    status: 'needs_token', description: 'Перевірка по 999k+ витоків email/паролів',
    price: '$0.02', count: '999 672', tokenUrl: 'https://leakcheck.io' },

  { id: 'dataleak', icon: '🔓', title: 'DataLeak', category: 'OSINT / Витоки',
    status: 'needs_token', description: 'Глобальна база витоків', price: '$0.002',
    tokenUrl: 'https://t.me/DataLeakBot' },

  { id: 'bigleaksbot', icon: '🤖', title: 'BigLeaksBot', category: 'OSINT / Витоки',
    status: 'needs_token', description: 'Великі бази витоків', price: '$0.05',
    tokenUrl: 'https://t.me/BigLeaksBot' },

  { id: 'osintkit', icon: '🕵️', title: 'OsintKit', category: 'OSINT / Витоки',
    status: 'needs_token', description: 'Комплексний OSINT toolkit', price: '$0.03', count: '28 126',
    tokenUrl: 'https://osintkit.net' },

  { id: 'checkerua', icon: '✔️', title: 'CheckerUA', category: 'OSINT / Витоки',
    status: 'needs_token', description: 'Перевірка по українських базах', price: '$0.005', count: '1 000',
    tokenUrl: 'https://t.me/CheckerUA_bot' },

  { id: 'himerasearch', icon: '🌀', title: 'Himerasearch', category: 'OSINT / Витоки',
    status: 'needs_token', description: 'Глибокий пошук за даними', price: '$1.60', count: '3 601',
    tokenUrl: 'https://himerasearch.com' },

  // ══ Фотопошук ═══════════════════════════════════════════════════════════════
  { id: 'findface', icon: '😶', title: 'FindFace (VPS)', category: 'Фотопошук',
    status: 'active', description: 'Розпізнавання облич на VPS — пошук у відкритих джерелах',
    href: '/persons', price: '$0.001' },

  { id: 'search4faces', icon: '🎭', title: 'Search4Faces', category: 'Фотопошук',
    status: 'needs_token', description: 'Пошук за фото у VK та ОК', price: '$0.01',
    tokenUrl: 'https://search4faces.com' },

  { id: 'facehunt', icon: '🔍', title: 'FaceHunt', category: 'Фотопошук',
    status: 'needs_token', description: 'Пошук облич у відкритих джерелах', price: '$0.001',
    tokenUrl: 'https://facehunt.net' },

  { id: 'findclone', icon: '🖼️', title: 'FindClone', category: 'Фотопошук',
    status: 'needs_token', description: 'Пошук фото у ВКонтакте', price: '$0.04', count: '17',
    tokenUrl: 'https://findclone.ru' },

  { id: 'pimeyes', icon: '👀', title: 'PimEyes', category: 'Фотопошук',
    status: 'needs_token', description: 'Зворотній пошук облич по всьому інтернету', price: '$0.20', count: '29',
    tokenUrl: 'https://pimeyes.com' },
]

// ─── Meta ─────────────────────────────────────────────────────────────────────

const CATEGORIES = ['Всі', ...Array.from(new Set(ALL_MODULES.map(m => m.category)))]

const STATUS_LABEL: Record<ModuleStatus, string> = {
  active:       '● Активний',
  coming_soon:  '◐ В розробці',
  needs_token:  '🔑 Токен',
}

const STATUS_DOT: Record<ModuleStatus, string> = {
  active:       'bg-green-500',
  coming_soon:  'bg-yellow-500',
  needs_token:  'bg-orange-500',
}

// ─── Result Renderers ─────────────────────────────────────────────────────────

function renderResults(moduleId: string, result: any) {
  if (!result) return null

  if (result.error) return (
    <div className="text-red-400 text-sm p-3 bg-red-950/30 rounded-lg space-y-1">
      <p>❌ {result.error}</p>
      {(result.fallback_url || result.fallback_url2) && (
        <div className="space-y-1 mt-2">
          {result.fallback_url && <a href={result.fallback_url} target="_blank" rel="noopener noreferrer" className="block text-blue-400 underline text-xs">🔗 Перевірити вручну ↗</a>}
          {result.fallback_url2 && <a href={result.fallback_url2} target="_blank" rel="noopener noreferrer" className="block text-blue-400 underline text-xs">🔗 Rusprofile ↗</a>}
        </div>
      )}
    </div>
  )

  // ── VK results (check before sanctions since VK also has entries)
  if (result.entries !== undefined && result.search_links !== undefined) {
    return (
      <div className="space-y-2">
        {result.entries?.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">Профілів VK не знайдено</p>
        ) : (
          result.entries.slice(0, 10).map((e: any, i: number) => (
            <div key={i} className="bg-gray-800/60 rounded-lg p-3 text-xs space-y-1">
              <p className="text-white font-medium">{e.name}</p>
              {e.username && <p className="text-gray-400">@{e.username}</p>}
              {e.city && <p className="text-gray-500">📍 {e.city}</p>}
              {e.snippet && <p className="text-gray-600">{e.snippet}</p>}
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">VK ↗</a>
            </div>
          ))
        )}
        <div className="border-t border-gray-800 pt-2 space-y-1">
          {result.search_links?.map((link: any, i: number) => (
            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="block text-blue-400 text-xs hover:underline">🔗 {link.label} ↗</a>
          ))}
        </div>
      </div>
    )
  }

  // ── Sanctions
  if (result.entries !== undefined) {
    if (result.no_key || result.total === 0) return (
      <div className="space-y-2">
        {result.no_key && <p className="text-yellow-400 text-xs">{result.note}</p>}
        {result.entries?.length === 0
          ? <p className="text-gray-400 text-sm text-center py-4">✅ В санкційних списках не знайдено</p>
          : (
            <div className="space-y-2">
              {result.entries?.map((e: any, i: number) => <SanctionCard key={i} e={e} />)}
            </div>
          )
        }
        {result.fallback_urls && (
          <div className="border-t border-gray-800 pt-3 space-y-1.5">
            <p className="text-gray-500 text-xs">Перевірити вручну:</p>
            {Object.entries(result.fallback_urls).map(([k, url]) => (
              <a key={k} href={String(url)} target="_blank" rel="noopener noreferrer"
                 className="block text-blue-400 hover:text-blue-300 text-xs underline">
                🔗 {k.replace(/_/g, ' ').toUpperCase()} ↗
              </a>
            ))}
          </div>
        )}
      </div>
    )
    return (
      <div className="space-y-2">
        <p className="text-green-400 text-xs font-medium">⚠️ Знайдено в санкційних списках: {result.total}</p>
        {result.entries?.slice(0, 10).map((e: any, i: number) => <SanctionCard key={i} e={e} />)}
        {result.source_url && (
          <a href={result.source_url} target="_blank" rel="noopener noreferrer" className="block text-blue-400 text-xs underline pt-1">🔗 Відкрити в OpenSanctions ↗</a>
        )}
      </div>
    )
  }

  // ── MVS records
  if (result.records !== undefined) {
    if (!result.records?.length) return (
      <div className="text-gray-400 text-sm text-center py-4">
        ✅ {result.error || 'Нічого не знайдено в базі МВС'}
        {result.fallback_url && <div className="mt-2"><a href={result.fallback_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline text-xs">Перевірити вручну ↗</a></div>}
      </div>
    )
    return (
      <div className="space-y-2">
        <p className="text-orange-400 text-xs font-medium">🚔 Знайдено: {result.total?.toLocaleString('uk-UA')} · показано {result.records.length}</p>
        {result.records.map((r: any, i: number) => (
          <div key={i} className="bg-gray-800/60 rounded-lg p-3 text-xs space-y-1">
            {Object.entries(r).filter(([k]) => !k.startsWith('_') && String(r[k as keyof typeof r])).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-gray-500 w-28 flex-shrink-0 capitalize">{k.replace(/_/g, ' ')}:</span>
                <span className="text-gray-200">{String(v)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  // ── ERB debtors
  if (result.debtors !== undefined) {
    if (!result.debtors?.length) return <div className="text-gray-400 text-sm text-center py-4">✅ Боргів не знайдено</div>
    return (
      <div className="space-y-2">
        <p className="text-orange-400 text-xs font-medium">💳 Боржників знайдено: {result.found}</p>
        {result.debtors.slice(0, 10).map((d: any, i: number) => (
          <div key={i} className="bg-orange-950/20 border border-orange-800/40 rounded-lg p-3 text-xs">
            <p className="text-white font-medium">{d.fullName || d.name || [d.lastName, d.firstName].filter(Boolean).join(' ')}</p>
            {d.sum && <p className="text-orange-300 mt-1">Сума боргу: {Number(d.sum).toLocaleString('uk-UA')} грн</p>}
            {d.creditor && <p className="text-gray-400">Стягувач: {d.creditor}</p>}
            {d.executor && <p className="text-gray-500">Виконавець: {d.executor}</p>}
          </div>
        ))}
      </div>
    )
  }

  // ── Generic results array
  if (result.results !== undefined) {
    if (!result.results?.length) return (
      <div className="text-gray-400 text-sm text-center py-4 space-y-2">
        <p>✅ {result.note || 'Нічого не знайдено'}</p>
        {result.fallback_url && <a href={result.fallback_url} target="_blank" rel="noopener noreferrer" className="block text-blue-400 underline text-xs">🔗 Перевірити вручну ↗</a>}
      </div>
    )
    const items = result.results.slice(0, 15)
    return (
      <div className="space-y-2">
        <p className="text-green-400 text-xs font-medium">Знайдено: {result.total || items.length}</p>
        {items.map((r: any, i: number) => <GenericCard key={i} item={r} />)}
        {result.source_url && (
          <a href={result.source_url} target="_blank" rel="noopener noreferrer" className="block text-blue-400 text-xs underline pt-1">🔗 Відкрити на сайті ↗</a>
        )}
      </div>
    )
  }

  // ── NumBuster
  if (result.name !== undefined || (result.phone !== undefined && !result.entries)) {
    return (
      <div className="bg-gray-800/60 rounded-lg p-4 text-sm space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📱</span>
          <div>
            <p className="text-white font-semibold">{result.name || "Ім'я не знайдено"}</p>
            <p className="text-gray-400">{result.phone}</p>
          </div>
        </div>
        {result.rating > 0 && <p className="text-yellow-300 text-xs">Рейтинг: {result.rating}</p>}
        {result.comment && <p className="text-gray-400 text-xs">{result.comment}</p>}
        {result.spam_count > 0 && <p className="text-red-400 text-xs">⚠️ Скарги на спам: {result.spam_count}</p>}
        {result.url && <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs hover:underline">Відкрити ↗</a>}
      </div>
    )
  }

  // ── GetContact
  if (result.phone !== undefined && result.found === false && result.alternatives) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-yellow-400 text-xs">{result.note}</p>
        <div className="space-y-1.5">
          {result.alternatives.map((alt: any, i: number) => (
            <a key={i} href={alt.url} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-xs">
              🔗 {alt.label} ↗
            </a>
          ))}
        </div>
      </div>
    )
  }

  // ── Company/ЄДР
  if (result.companies !== undefined || result.edr !== undefined) {
    const companies = result.companies || result.edr || []
    if (!companies.length) return <div className="text-gray-400 text-sm text-center py-4">✅ Компаній не знайдено</div>
    return (
      <div className="space-y-2">
        <p className="text-blue-400 text-xs font-medium">🏢 Знайдено компаній: {companies.length}</p>
        {companies.slice(0, 10).map((c: any, i: number) => (
          <div key={i} className="bg-blue-950/20 border border-blue-800/30 rounded-lg p-3 text-xs space-y-1">
            <p className="text-white font-medium">{c.name || c.fullName}</p>
            {c.edrpou && <p className="text-gray-400">ЄДРПОУ: {c.edrpou}</p>}
            {c.status && <p className={c.status.includes('діюч') || c.status.includes('Зареє') ? 'text-green-400' : 'text-red-400'}>{c.status}</p>}
            {c.address && <p className="text-gray-500">📍 {c.address}</p>}
            {c.director && <p className="text-gray-400">Директор: {c.director}</p>}
          </div>
        ))}
      </div>
    )
  }

  // ── FNS Russia
  if (result.source === 'fns_egrul' || result.source === 'fns_egrul_vps') {
    if (!result.results?.length) return (
      <div className="space-y-2 text-sm">
        <p className="text-gray-400 text-center py-2">{result.note || 'Нічого не знайдено в ЄГРЮЛ'}</p>
        {result.fallback_url && <a href={result.fallback_url} target="_blank" rel="noopener noreferrer" className="block text-blue-400 underline text-xs">🔗 egrul.nalog.ru ↗</a>}
        {result.fallback_url2 && <a href={result.fallback_url2} target="_blank" rel="noopener noreferrer" className="block text-blue-400 underline text-xs">🔗 Rusprofile ↗</a>}
      </div>
    )
    return (
      <div className="space-y-2">
        <p className="text-red-400 text-xs font-medium">🇷🇺 ЄГРЮЛ: знайдено {result.results.length}</p>
        {result.results.slice(0, 10).map((r: any, i: number) => (
          <div key={i} className="bg-red-950/20 border border-red-800/30 rounded-lg p-3 text-xs space-y-1">
            <p className="text-white font-medium">{r.name}</p>
            <div className="flex gap-3 flex-wrap">
              {r.inn && <span className="text-gray-400">ІНН: {r.inn}</span>}
              {r.ogrn && <span className="text-gray-400">ОГРН: {r.ogrn}</span>}
            </div>
            {r.status && <p className={r.status === 'ДІЮЧА' ? 'text-green-400' : 'text-red-400'}>{r.type} · {r.status}</p>}
            {r.region && <p className="text-gray-500">📍 {r.region}</p>}
            {r.address && <p className="text-gray-500">{r.address}</p>}
          </div>
        ))}
      </div>
    )
  }

  // ── IPN fallback links
  if (result.fallback_urls && Array.isArray(result.fallback_urls)) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-yellow-400 text-xs">{result.message}</p>
        <div className="space-y-1.5">
          {result.fallback_urls.map((url: string, i: number) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
               className="block text-blue-400 hover:text-blue-300 text-xs underline transition">
              🔗 {url.replace('https://', '')} ↗
            </a>
          ))}
        </div>
      </div>
    )
  }

  // ── Generic data
  if (result.data) {
    return (
      <pre className="bg-gray-800 rounded-lg p-3 text-xs text-gray-300 overflow-auto max-h-60">
        {JSON.stringify(result.data, null, 2)}
      </pre>
    )
  }

  // ── Generic JSON fallback
  return <pre className="text-xs text-gray-400 overflow-auto max-h-60">{JSON.stringify(result, null, 2)}</pre>
}

function SanctionCard({ e }: { e: any }) {
  return (
    <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-3 text-xs space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-white font-semibold">{e.name}</p>
        {e.schema && <span className="text-gray-500 text-xs shrink-0">{e.schema}</span>}
      </div>
      {e.aliases?.length > 0 && <p className="text-gray-400">Псевдоніми: {e.aliases.slice(0, 3).join(' / ')}</p>}
      {e.dob && <p className="text-gray-400">Дата народження: {e.dob}</p>}
      {e.nationality && <p className="text-gray-400">Громадянство: {e.nationality}</p>}
      {e.positions?.length > 0 && <p className="text-gray-400">Посади: {e.positions.join(', ')}</p>}
      {e.programs?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {e.programs.slice(0, 4).map((p: string, i: number) => (
            <span key={i} className="bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded text-xs">{p}</span>
          ))}
        </div>
      )}
      {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-xs">Відкрити ↗</a>}
    </div>
  )
}

function GenericCard({ item }: { item: any }) {
  const mainFields = ['name', 'fullName', 'full_name', 'title', 'number']
  const name = mainFields.map(f => item[f]).find(Boolean) || '—'
  const skip = new Set([...mainFields, 'url', 'id', '_id', 'excerpt', 'text'])

  return (
    <div className="bg-gray-800/60 rounded-lg p-3 text-xs space-y-1">
      <p className="text-white font-medium">{name}</p>
      {item.excerpt && <p className="text-gray-400 line-clamp-3">{item.excerpt}</p>}
      {Object.entries(item)
        .filter(([k, v]) => !skip.has(k) && v && typeof v !== 'object' && String(v).length < 100)
        .slice(0, 5)
        .map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-gray-500 w-24 flex-shrink-0 capitalize">{k.replace(/_/g, ' ')}:</span>
            <span className="text-gray-300">{String(v)}</span>
          </div>
        ))}
      {item.url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
          Відкрити ↗
        </a>
      )}
    </div>
  )
}

// ─── Module Card ──────────────────────────────────────────────────────────────

function ModuleCard({ mod, onSelect }: { mod: Module; onSelect: (m: Module) => void }) {
  const isClickable = mod.status !== 'coming_soon'
  return (
    <div
      onClick={() => isClickable && onSelect(mod)}
      className={`rounded-xl p-4 flex flex-col gap-2.5 transition-all
        ${isClickable ? 'cursor-pointer odb-card-hover' : 'cursor-default'}
        ${mod.status !== 'active' ? 'opacity-70' : ''}`}
      style={{ background: 'var(--odb-surface)', border: `1px solid ${mod.status === 'active' ? 'var(--odb-border)' : 'var(--odb-border-soft)'}` }}
    >
      <div className="flex items-start justify-between">
        <span className="text-2xl">{mod.icon}</span>
        <span className={`w-2 h-2 rounded-full mt-1 ${STATUS_DOT[mod.status]}`} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--odb-text)' }}>{mod.title}</p>
        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--odb-text-dim)' }}>{mod.description}</p>
      </div>
      <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid var(--odb-border-soft)' }}>
        {mod.count
          ? <span className="text-green-400 text-xs font-medium">{mod.count}</span>
          : <span className="text-gray-600 text-xs">{STATUS_LABEL[mod.status]}</span>
        }
      </div>
    </div>
  )
}

// ─── Search Panel ─────────────────────────────────────────────────────────────

function SearchPanel({ mod, onClose }: { mod: Module; onClose: () => void }) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function runSearch() {
    setLoading(true)
    setResult(null)
    try {
      const url = mod.directApi ?? `/api/registries/${mod.endpoint}`
      const payload = { ...values, ...(mod.directPayload || {}) }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setResult(await res.json())
    } catch (e: any) {
      setResult({ error: e.message })
    } finally {
      setLoading(false)
    }
  }

  const hasSearch = mod.endpoint || mod.directApi
  const requiredFilled = (mod.fields || []).filter(f => f.required).every(f => values[f.key]?.trim())

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg flex flex-col h-full shadow-2xl overflow-hidden"
        style={{ background: 'var(--odb-surface)', borderLeft: '1px solid var(--odb-border)' }}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid var(--odb-border)' }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{mod.icon}</span>
            <div>
              <p className="font-bold" style={{ color: 'var(--odb-text)' }}>{mod.title}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[mod.status]}`} />
                <span className="text-xs" style={{ color: 'var(--odb-text-faint)' }}>{mod.category}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="text-xl transition w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--odb-text-dim)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--odb-surface3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Needs token */}
          {mod.status === 'needs_token' && (
            <div className="bg-orange-950/30 border border-orange-800/50 rounded-xl p-4">
              <p className="text-orange-400 font-semibold mb-1">🔑 Потрібен API токен</p>
              <p className="text-gray-400 text-sm mb-3">Для роботи цього модуля потрібен API ключ.</p>
              {mod.tokenUrl && (
                <a href={mod.tokenUrl} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-900/40 hover:bg-orange-900/60 border border-orange-700/50 text-orange-300 rounded-lg text-sm transition">
                  Отримати токен ↗
                </a>
              )}
              <p className="text-gray-600 text-xs mt-2">Після отримання: Налаштування → API Ключі</p>
            </div>
          )}

          {/* Coming soon */}
          {mod.status === 'coming_soon' && (
            <div className="bg-yellow-950/30 border border-yellow-800/50 rounded-xl p-4 text-center">
              <p className="text-yellow-400 font-semibold mb-1">🔧 В розробці</p>
              <p className="text-gray-400 text-sm">Модуль буде доступний у найближчому оновленні</p>
            </div>
          )}

          {/* Link to page */}
          {mod.href && mod.status === 'active' && (
            <button
              onClick={() => router.push(mod.href!)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              Відкрити {mod.title} {mod.icon}
            </button>
          )}

          {/* Search form */}
          {hasSearch && mod.status === 'active' && (mod.fields || []).map(f => (
            <div key={f.key}>
              <label className="text-gray-400 text-xs mb-1.5 block">
                {f.label}{f.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              <input
                value={values[f.key] || ''}
                onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && requiredFilled && runSearch()}
                placeholder={f.placeholder}
                className="w-full rounded-xl px-4 py-2.5 outline-none transition text-sm"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--odb-accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
              />
            </div>
          ))}

          {hasSearch && mod.status === 'active' && (
            <button
              onClick={runSearch}
              disabled={loading || !requiredFilled}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {loading
                ? <><span className="animate-spin inline-block">⟳</span> Шукаю...</>
                : <><span>🔍</span> Пошук — {mod.title}</>
              }
            </button>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Результати</p>
                <button onClick={() => setResult(null)} className="text-gray-700 hover:text-gray-500 text-xs ml-auto">очистити</button>
              </div>
              {renderResults(mod.id, result)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RegistriesPage() {
  const [search,       setSearch]       = useState('')
  const [category,     setCategory]     = useState('Всі')
  const [statusFilter, setStatusFilter] = useState<'all' | ModuleStatus>('all')
  const [selected,     setSelected]     = useState<Module | null>(null)

  const filtered = useMemo(() => {
    return ALL_MODULES.filter(m => {
      const q = search.toLowerCase()
      const matchSearch = !search ||
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      const matchCat    = category === 'Всі' || m.category === category
      const matchStatus = statusFilter === 'all' || m.status === statusFilter
      return matchSearch && matchCat && matchStatus
    })
  }, [search, category, statusFilter])

  const activeCount  = ALL_MODULES.filter(m => m.status === 'active').length
  const comingCount  = ALL_MODULES.filter(m => m.status === 'coming_soon').length
  const tokenCount   = ALL_MODULES.filter(m => m.status === 'needs_token').length

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--odb-bg)', color: 'var(--odb-text)' }}>
      <Sidebar />
      <div className="flex-1 overflow-y-auto">

        {/* Sticky header */}
        <div className="sticky top-0 z-10 backdrop-blur px-6 py-4"
          style={{ background: 'var(--odb-surface)', borderBottom: '1px solid var(--odb-border)' }}>
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', boxShadow: '0 0 16px rgba(59,130,246,0.3)' }}>
                  <Icon name="clipboard" size={20} strokeWidth={1.8} />
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-tight">Модулі платформи</h1>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--odb-text-dim)' }}>
                    {ALL_MODULES.length} модулів · {activeCount} активних · {comingCount} в розробці · {tokenCount} потребують токен
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <StatBadge count={activeCount}  label="Активних" color="green" />
                <StatBadge count={comingCount}  label="Скоро"    color="yellow" />
                <StatBadge count={tokenCount}   label="Токен"    color="orange" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Пошук модуля..."
                className="rounded-lg px-3 py-1.5 text-sm outline-none transition w-48"
                style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--odb-accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
              />
              <div className="flex gap-1">
                {(['all', 'active', 'coming_soon', 'needs_token'] as const).map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition"
                    style={statusFilter === s
                      ? { background: 'var(--odb-accent)', color: '#fff' }
                      : { background: 'var(--odb-surface3)', color: 'var(--odb-text-dim)' }}>
                    {s === 'all' ? 'Всі' : s === 'active' ? '● Активні' : s === 'coming_soon' ? '◐ Скоро' : '🔑 Токен'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6">

          {/* Category tabs */}
          <div className="flex flex-wrap gap-1.5 mb-6 pb-4" style={{ borderBottom: '1px solid var(--odb-border)' }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition"
                style={category === cat
                  ? { background: 'var(--odb-accent)', color: '#fff' }
                  : { background: 'var(--odb-surface3)', color: 'var(--odb-text-dim)' }}>
                {cat}
              </button>
            ))}
          </div>

          <p className="text-xs mb-4" style={{ color: 'var(--odb-text-faint)' }}>Показано: {filtered.length} з {ALL_MODULES.length}</p>

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map(mod => (
              <ModuleCard key={mod.id} mod={mod} onSelect={setSelected} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20 text-gray-600">
              <p className="text-4xl mb-3">🔍</p>
              <p>Модулів не знайдено</p>
            </div>
          )}
        </div>
      </div>

      {selected && <SearchPanel mod={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function StatBadge({ count, label, color }: { count: number; label: string; color: 'green' | 'yellow' | 'orange' }) {
  const cls = {
    green:  'bg-green-950/40 border-green-800/50 text-green-400',
    yellow: 'bg-yellow-950/30 border-yellow-800/40 text-yellow-400',
    orange: 'bg-orange-950/30 border-orange-800/40 text-orange-400',
  }[color]
  return (
    <div className={`border rounded-lg px-3 py-1.5 text-center ${cls}`}>
      <p className="font-bold text-sm">{count}</p>
      <p className="text-gray-500 text-xs">{label}</p>
    </div>
  )
}
