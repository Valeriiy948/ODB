'use client'

import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'

const TOOLS = [
  {
    section: 'ПОШУК ПО USERNAME',
    items: [
      {
        icon: '🔍', name: 'Sherlock', tag: 'v0.16',
        desc: '400+ соцмереж та платформ. Quick mode (30 сайтів, ~8с) та Full mode (всі 400+, ~2хв).',
        href: '/sherlock',
        color: 'border-yellow-800/50 hover:border-yellow-700',
        badge: 'bg-yellow-900/30 text-yellow-400',
      },
      {
        icon: '🧬', name: 'Chimera (Maigret)', tag: 'v0.6.1',
        desc: '3000+ сайтів з фокусом на RU/CIS платформах. Витягує додаткові дані з профілів (телефон, фото, ID).',
        href: '/sherlock',
        color: 'border-purple-800/50 hover:border-purple-700',
        badge: 'bg-purple-900/30 text-purple-400',
      },
    ],
  },
  {
    section: 'АВТОМАТИЗОВАНИЙ OSINT',
    items: [
      {
        icon: '🕷️', name: 'SpiderFoot', tag: 'v4.0',
        desc: 'Автоматизований збір OSINT по цілі. Email, домен, IP, ім\'я. Граф зв\'язків, DNS, WHOIS, pwnedpass.',
        href: '/spiderfoot',
        color: 'border-gray-700 hover:border-gray-600',
        badge: 'bg-gray-800 text-gray-300',
      },
      {
        icon: '🔄', name: 'Масовий OSINT', tag: 'Batch',
        desc: 'Запуск OSINT-збагачення для великої кількості осіб одночасно. CSV-імпорт, черга завдань.',
        href: '/admin/batch',
        color: 'border-gray-700 hover:border-gray-600',
        badge: 'bg-gray-800 text-gray-300',
      },
      {
        icon: '✨', name: 'Збагачення (Enrich)', tag: 'Auto',
        desc: 'Автоматичне збагачення даних по осіб. Телефони, email, соцмережі через зовнішні API.',
        href: '/admin/enrich',
        color: 'border-gray-700 hover:border-gray-600',
        badge: 'bg-gray-800 text-gray-300',
      },
    ],
  },
  {
    section: 'БАЗИ ДАНИХ ТА ВИТОКИ',
    items: [
      {
        icon: '🔓', name: 'Breach Intel', tag: 'DeHashed + LeakCheck',
        desc: 'Пошук по злитим базам даних. DeHashed, LeakCheck, SnusBase. Більше 12+ млрд записів.',
        href: '/breach-intel',
        color: 'border-red-800/50 hover:border-red-700',
        badge: 'bg-red-900/30 text-red-400',
      },
      {
        icon: '📦', name: 'Імпорт витоків', tag: 'Admin',
        desc: 'Завантаження та індексація нових баз витоків у локальну PostgreSQL. Парсер JSON/CSV/SQL.',
        href: '/admin/leaks-import',
        color: 'border-orange-800/50 hover:border-orange-700',
        badge: 'bg-orange-900/30 text-orange-400',
      },
    ],
  },
  {
    section: 'СПЕЦІАЛІЗОВАНИЙ ПОШУК',
    items: [
      {
        icon: '🌐', name: 'Соцмережі OSINT', tag: 'Social',
        desc: 'Детальний пошук по соціальних мережах. VK, Instagram, Facebook, TikTok та ін.',
        href: '/social-search',
        color: 'border-sky-800/50 hover:border-sky-700',
        badge: 'bg-sky-900/30 text-sky-400',
      },
      {
        icon: '🔍', name: 'Фрагментний пошук', tag: 'Fragment',
        desc: 'Пошук по окремих фрагментах даних. Частина імені, неповний телефон, шаблон email.',
        href: '/fragment-search',
        color: 'border-gray-700 hover:border-gray-600',
        badge: 'bg-gray-800 text-gray-300',
      },
    ],
  },
]

export default function AdminToolsPage() {
  const router = useRouter()

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold text-white">🔧 Інструменти</h1>
              <p className="text-gray-500 text-xs mt-0.5">
                Технічні модулі та інструменти розвідки — адміністративний розділ
              </p>
            </div>
            <span className="ml-auto px-2.5 py-1 text-xs bg-amber-900/30 text-amber-400 border border-amber-800/50 rounded-lg">
              Admin
            </span>
          </div>
        </div>

        <div className="p-6 space-y-8 max-w-4xl">

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
                                text-left transition-all group hover:bg-gray-800/80 ${tool.color}`}
                  >
                    <span className="text-3xl shrink-0 mt-0.5">{tool.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-white group-hover:text-blue-200 text-sm">
                          {tool.name}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${tool.badge}`}>
                          {tool.tag}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">{tool.desc}</p>
                    </div>
                    <span className="text-gray-600 group-hover:text-gray-400 shrink-0 mt-1">→</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Quick diagnostics */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 tracking-widest uppercase mb-3">
              ДІАГНОСТИКА
            </h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-3">Статус зовнішніх сервісів</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: 'VPS (161.35.86.145)', port: ':8001', color: 'text-green-400' },
                  { label: 'Sherlock',    port: '/search/sherlock', color: 'text-yellow-400' },
                  { label: 'Maigret',     port: '/search/maigret',  color: 'text-purple-400' },
                  { label: 'SpiderFoot',  port: ':8007',             color: 'text-gray-300' },
                  { label: 'PostgreSQL',  port: 'odb_leaks',         color: 'text-cyan-400' },
                  { label: 'Supabase',    port: 'persons DB',        color: 'text-blue-400' },
                ].map(svc => (
                  <div key={svc.label} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full bg-current ${svc.color}`} />
                    <span className="text-gray-400">{svc.label}</span>
                    <span className="text-gray-700 font-mono">{svc.port}</span>
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
