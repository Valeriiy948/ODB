'use client'

import { Card, Field } from './shared'

interface UnitTabProps {
  person:        any
  osintRelatives: any[]
}

export function UnitTab({ person, osintRelatives }: UnitTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="🏢 Військова частина">
          <Field label="Підрозділ"          value={person.unit} />
          <Field label="Номер в/ч"          value={person.unit_num} />
          <Field label="Звання"             value={person.rank} />
          <Field label="Посада"             value={person.position} />
          <Field label="Військовий ID"      value={person.military_id} />
          <Field label="Регіон дислокації"  value={person.region} />
        </Card>
        <Card title="⚙️ Матеріальна частина та озброєння">
          <div className="text-center py-8 text-gray-600">
            <p className="text-3xl mb-2">🔧</p>
            <p className="text-sm">В розробці</p>
            <p className="text-xs mt-1 text-gray-700">Тут буде техніка та озброєння підрозділу</p>
          </div>
        </Card>
      </div>

      <Card title="🌐 Відкриті джерела по підрозділу">
        {(person.unit || person.unit_num) ? (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm mb-4">
              Підрозділ: <span className="text-white font-medium">{person.unit}</span>
              {person.unit_num && <span className="text-gray-500 ml-2">({person.unit_num})</span>}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  href:   `https://www.google.com/search?q=${encodeURIComponent('"' + (person.unit_num || person.unit) + '" досьє злочини')}`,
                  color:  'blue', icon: '🔍', label: 'Злочини', desc: 'Пошук за в/ч + злочини',
                },
                {
                  href:   `https://www.google.com/search?q=${encodeURIComponent('"' + (person.unit_num || person.unit) + '" Украина военные преступления')}&gl=ru&hl=ru`,
                  color:  'red', icon: '⚖️', label: 'МКС', desc: 'Пошук воєнних злочинів',
                },
                {
                  href:   'https://www.oryxspioenkop.com/',
                  color:  'orange', icon: '📊', label: 'Oryx', desc: 'Підтверджені втрати техніки',
                },
                {
                  href:   'https://deepstatemap.live/',
                  color:  'green', icon: '🗺️', label: 'DeepState', desc: 'Актуальна карта фронту',
                },
                {
                  href:   `https://www.google.com/search?q=${encodeURIComponent('"' + (person.unit_num || person.unit) + '" личный состав список')}&gl=ru&hl=ru`,
                  color:  'purple', icon: '📋', label: 'Склад в/ч', desc: 'Список особового складу',
                },
                {
                  href:   `https://www.google.com/search?q=${encodeURIComponent((person.unit_num || person.unit) + ' site:vk.com')}`,
                  color:  'indigo', icon: '💙', label: 'VK в/ч', desc: 'Сторінки підрозділу у VK',
                },
                {
                  href:   'https://analytics.ulif.org.ua/index.php?gid=2132',
                  color:  'teal', icon: '📱', label: 'ULIF', desc: 'База ЗС РФ (Ontology)',
                },
                {
                  href:   `https://www.google.com/search?q=${encodeURIComponent('"' + (person.unit_num || person.unit) + '" техника вооружение')}&gl=ru&hl=ru`,
                  color:  'yellow', icon: '🔫', label: 'Техніка', desc: 'Озброєння підрозділу',
                },
              ].map(({ href, color, icon, label, desc }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-3 bg-${color}-900/20 hover:bg-${color}-900/40 border border-${color}-800/50 rounded-lg text-center transition`}
                >
                  <p className={`text-${color}-400 font-medium text-sm`}>{icon} {label}</p>
                  <p className="text-gray-500 text-xs mt-1">{desc}</p>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-600 text-sm">Підрозділ не вказано в картці</p>
        )}
      </Card>

      {osintRelatives.length > 0 && (
        <Card title="👨‍👩‍👧 Родичі (знайдено через OSINT)">
          {osintRelatives.map(v => (
            <div key={v.vector} className="mb-4">
              <p className="text-gray-500 text-xs mb-2">Вектор: {v.label}</p>
              <div className="space-y-2">
                {v.results.map((r: any, i: number) => (
                  <div key={i} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                    <a href={r.link} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 text-sm hover:text-blue-300">{r.title}</a>
                    {r.snippet && <p className="text-gray-400 text-xs mt-1">{r.snippet}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      {person.tags?.length > 0 && (
        <Card title="🏷️ Теги">
          <div className="flex flex-wrap gap-2">
            {person.tags.map((tag: string, i: number) => (
              <span key={i} className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm border border-gray-600">
                {tag}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
