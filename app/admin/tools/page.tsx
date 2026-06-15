'use client'

import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Icon, { type IconName } from '../../components/Icon'

const TOOLS: {
  section: string
  items: { icon: IconName; name: string; tag: string; desc: string; href: string; accent: string }[]
}[] = [
  {
    section: 'ПОШУК ПО USERNAME',
    items: [
      {
        icon: 'search',
        name: 'Sherlock',
        tag: 'v0.16',
        desc: '400+ соцмереж та платформ. Quick mode (~8с) та Full mode (~2хв).',
        href: '/search-all',
        accent: 'text-yellow-400 border-yellow-800/40 hover:border-yellow-700',
      },
      {
        icon: 'scan',
        name: 'Chimera (Maigret)',
        tag: 'v0.6.1',
        desc: '3000+ сайтів з фокусом на RU/CIS. Витягує телефон, фото, ID з профілів.',
        href: '/search-all',
        accent: 'text-purple-400 border-purple-800/40 hover:border-purple-700',
      },
    ],
  },
  {
    section: 'АВТОМАТИЗОВАНИЙ OSINT',
    items: [
      {
        icon: 'network',
        name: 'SpiderFoot',
        tag: 'v4.0',
        desc: "Автоматизований збір OSINT по цілі. Email, домен, IP, ім'я. DNS, WHOIS, pwnedpass.",
        href: '/search-all',
        accent: 'text-gray-300 border-gray-700 hover:border-gray-600',
      },
      {
        icon: 'users',
        name: 'Масовий OSINT',
        tag: 'Batch',
        desc: 'Запуск OSINT-збагачення для великої кількості осіб. CSV-імпорт, черга завдань.',
        href: '/admin/batch',
        accent: 'text-gray-300 border-gray-700 hover:border-gray-600',
      },
      {
        icon: 'spark',
        name: 'Збагачення (Enrich)',
        tag: 'Auto',
        desc: 'Автоматичне збагачення даних по осіб. Телефони, email, соцмережі через зовнішні API.',
        href: '/admin/enrich',
        accent: 'text-gray-300 border-gray-700 hover:border-gray-600',
      },
    ],
  },
  {
    section: 'БАЗИ ДАНИХ ТА ВИТОКИ',
    items: [
      {
        icon: 'shield',
        name: 'Breach Intel',
        tag: 'DeHashed + LeakCheck',
        desc: 'Пошук по злитим базам. DeHashed, LeakCheck, SnusBase. 12+ млрд записів.',
        href: '/breach-intel',
        accent: 'text-red-400 border-red-800/40 hover:border-red-700',
      },
      {
        icon: 'download',
        name: 'Імпорт витоків',
        tag: 'Admin',
        desc: 'Завантаження та індексація нових баз витоків. Парсер JSON/CSV/SQL.',
        href: '/admin/leaks-import',
        accent: 'text-orange-400 border-orange-800/40 hover:border-orange-700',
      },
    ],
  },
  {
    section: 'СПЕЦІАЛІЗОВАНИЙ ПОШУК',
    items: [
      {
        icon: 'globe',
        name: 'Соцмережі OSINT',
        tag: 'Social',
        desc: 'Детальний пошук по соціальних мережах. VK, Instagram, Facebook, TikTok.',
        href: '/search-all',
        accent: 'text-sky-400 border-sky-800/40 hover:border-sky-700',
      },
      {
        icon: 'search',
        name: 'Фрагментний пошук',
        tag: 'Fragment',
        desc: 'Пошук по окремих фрагментах даних. Частина імені, неповний телефон, шаблон email.',
        href: '/search-all',
        accent: 'text-gray-300 border-gray-700 hover:border-gray-600',
      },
    ],
  },
]

const SERVICES = [
  { label: 'VPS (161.35.86.145)', sub: ':8001',         color: 'bg-[var(--odb-ok)]' },
  { label: 'Sherlock',           sub: '/search/sherlock',color: 'bg-[var(--odb-warn)]' },
  { label: 'Maigret',            sub: '/search/maigret', color: 'bg-purple-400' },
  { label: 'SpiderFoot',         sub: ':8007',           color: 'bg-gray-500' },
  { label: 'PostgreSQL',         sub: 'odb_leaks',       color: 'bg-[var(--odb-info)]' },
  { label: 'Supabase',           sub: 'persons DB',      color: 'bg-[var(--odb-accent)]' },
]

export default function AdminToolsPage() {
  const router = useRouter()

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
              <Icon name="tools" size={17} className="text-[var(--odb-accent)]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Інструменти</h1>
              <p className="text-gray-500 text-xs">Технічні модулі та інструменти розвідки</p>
            </div>
            <span className="ml-auto text-xs px-2.5 py-1 bg-amber-900/30 text-amber-400 border border-amber-800/50 rounded-lg">
              Адмін
            </span>
          </div>
        </div>

        <div className="p-6 space-y-8 max-w-4xl odb-animate-up">

          {TOOLS.map(group => (
            <div key={group.section}>
              <h2 className="text-xs font-semibold text-gray-500 tracking-widest uppercase mb-3">
                {group.section}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.items.map(tool => (
                  <button
                    key={tool.name}
                    onClick={() => router.push(tool.href)}
                    className={`flex items-start gap-4 p-4 bg-gray-900 border rounded-xl
                                text-left transition-all group hover:bg-gray-800/80 ${tool.accent}`}
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gray-800 border border-gray-700/50 flex items-center justify-center shrink-0 ${tool.accent.split(' ')[0]}`}>
                      <Icon name={tool.icon} size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-white group-hover:text-blue-200 text-sm transition">
                          {tool.name}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono border border-gray-700/50">
                          {tool.tag}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{tool.desc}</p>
                    </div>
                    <Icon name="chevron-right" size={15} className="text-gray-600 group-hover:text-gray-400 shrink-0 mt-1 transition" />
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Diagnostics */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 tracking-widest uppercase mb-3">
              СТАТУС СЕРВІСІВ
            </h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SERVICES.map(svc => (
                  <div key={svc.label} className="flex items-center gap-2.5 text-xs">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${svc.color}`} />
                    <div className="min-w-0">
                      <span className="text-gray-300 block truncate">{svc.label}</span>
                      <span className="text-gray-600 font-mono">{svc.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
