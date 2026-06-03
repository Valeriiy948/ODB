'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../components/Sidebar'

// ─── Типи полів ─────────────────────────────────────────────────────────────
interface FieldDef {
  key: string
  label: string
  icon: string
  placeholder: string
  group: string
  hint?: string
}

const ALL_FIELDS: FieldDef[] = [
  // Особисті
  { key: 'last_name',     label: 'Прізвище',         icon: '👤', placeholder: 'Іванов',            group: 'person' },
  { key: 'first_name',    label: "Ім'я",              icon: '👤', placeholder: 'Іван',              group: 'person' },
  { key: 'middle_name',   label: 'По батькові',       icon: '👤', placeholder: 'Іванович',          group: 'person' },
  { key: 'dob',           label: 'Дата народження',   icon: '📅', placeholder: '01.01.1990 або 1990', group: 'person', hint: 'Повна дата або рік' },
  { key: 'gender',        label: 'Стать',             icon: '⚧',  placeholder: 'male / female',    group: 'person' },
  // Документи
  { key: 'passport',      label: 'Паспорт / Серія+№', icon: '🛂', placeholder: '4506 123456',      group: 'docs' },
  { key: 'ipn',           label: 'ІПН / ІНН',         icon: '🔢', placeholder: '260201699865',     group: 'docs' },
  { key: 'snils',         label: 'СНІЛС',              icon: '🔢', placeholder: '123-456-789 00',   group: 'docs' },
  { key: 'military_id',   label: 'Особистий №',        icon: '🪖', placeholder: '812679',          group: 'docs' },
  // Контакти
  { key: 'phone',         label: 'Телефон',            icon: '📞', placeholder: '+79147441444',    group: 'contacts' },
  { key: 'email',         label: 'Email',              icon: '✉️', placeholder: 'ivan@mail.ru',    group: 'contacts' },
  { key: 'vk_url',        label: 'VK профіль',         icon: '💙', placeholder: 'vk.com/id...',    group: 'contacts' },
  // Географія
  { key: 'region',        label: 'Регіон',             icon: '🗺️', placeholder: 'Ставропольський', group: 'geo' },
  { key: 'city',          label: 'Місто',              icon: '🏙️', placeholder: 'Москва',          group: 'geo' },
  // Військове
  { key: 'rank',          label: 'Звання',             icon: '🎖️', placeholder: 'майор',           group: 'military' },
  { key: 'unit',          label: 'Підрозділ / В/Ч',   icon: '🏢', placeholder: '64-а ОМСБр',      group: 'military' },
  // Додаткові
  { key: 'vehicle_plate', label: 'Номерний знак',      icon: '🚗', placeholder: 'А123БВ77',        group: 'extra' },
  { key: 'relative_name', label: 'Родич (ПІБ)',        icon: '👨‍👩‍👧', placeholder: 'Іванова Марія',   group: 'extra', hint: 'Пошук у Telegram витоках' },
]

const GROUP_LABELS: Record<string, string> = {
  person:   '👤 Особисті дані',
  docs:     '🛂 Документи',
  contacts: '📞 Контакти',
  geo:      '🗺️ Географія',
  military: '🪖 Військове',
  extra:    '🔍 Додаткові',
}

// Популярні комбінації (пресети)
const PRESETS = [
  { label: 'Прізвище + ДН',        fields: ['last_name', 'dob'],           icon: '👤' },
  { label: 'Прізвище + Регіон',    fields: ['last_name', 'region'],        icon: '🗺️' },
  { label: 'ПІБ повне',            fields: ['last_name', 'first_name', 'middle_name'], icon: '📋' },
  { label: 'ІПН / Паспорт',        fields: ['ipn', 'passport'],            icon: '🛂' },
  { label: 'Телефон + Прізвище',   fields: ['phone', 'last_name'],         icon: '📞' },
  { label: 'Підрозділ + Звання',   fields: ['unit', 'rank'],               icon: '🪖' },
  { label: 'Авто + Прізвище',      fields: ['vehicle_plate', 'last_name'], icon: '🚗' },
  { label: 'Родичі + Регіон',      fields: ['relative_name', 'region'],    icon: '👨‍👩‍👧' },
]

// ─── Компонент результату ────────────────────────────────────────────────────
function ResultCard({ person, onClick }: { person: any; onClick: () => void }) {
  const name = person.name_rus || person.name_ukr || person.name || 'Невідомо'
  const score = person._score || 0
  const scoreColor = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-orange-400'
  const scoreBg = score >= 80 ? 'bg-green-900/30 border-green-700/50' : score >= 50 ? 'bg-yellow-900/20 border-yellow-700/40' : 'bg-gray-800 border-gray-700'

  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-4 border cursor-pointer hover:brightness-110 transition ${scoreBg}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {person.photo_url ? (
            <img src={person.photo_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-gray-600" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 text-lg">
              {person.gender === 'female' ? '👩' : '👤'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{name}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {person.dob && <span className="text-gray-400 text-xs">📅 {person.dob}</span>}
              {person.region && <span className="text-gray-400 text-xs">🗺️ {person.region}</span>}
              {person.rank && <span className="text-gray-400 text-xs">🎖️ {person.rank}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-lg font-bold ${scoreColor}`}>{score}</span>
          <span className="text-gray-600 text-xs">балів</span>
        </div>
      </div>

      {/* Matched fields */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {(person._matched_fields || []).map((f: string, i: number) => (
          <span key={i} className="px-2 py-0.5 rounded bg-gray-700/60 text-gray-300 text-xs">{f}</span>
        ))}
        {person.myrotvorets_url && (
          <span className="px-2 py-0.5 rounded bg-red-900/60 text-red-300 text-xs font-medium">🚨 Миротворець</span>
        )}
        {person.threat_score >= 70 && (
          <span className="px-2 py-0.5 rounded bg-orange-900/50 text-orange-300 text-xs">⚠️ Загроза {person.threat_score}</span>
        )}
      </div>
    </div>
  )
}

// ─── Головна сторінка ────────────────────────────────────────────────────────
export default function FragmentSearchPage() {
  const router = useRouter()
  const [activeFields, setActiveFields] = useState<string[]>(['last_name', 'dob'])
  const [values, setValues] = useState<Record<string, string>>({})
  const [filters, setFilters] = useState({ myrotvorets_only: false, has_photo: false, has_incidents: false })
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [leaks, setLeaks] = useState<any[]>([])
  const [error, setError] = useState('')
  const [showFieldPicker, setShowFieldPicker] = useState(false)
  const [splitHint, setSplitHint] = useState(false)

  function applyPreset(fields: string[]) {
    setActiveFields(fields)
    setValues({})
    setResults([])
    setTotal(null)
    setError('')
  }

  function addField(key: string) {
    if (!activeFields.includes(key)) {
      setActiveFields(prev => [...prev, key])
    }
    setShowFieldPicker(false)
  }

  function removeField(key: string) {
    setActiveFields(prev => prev.filter(k => k !== key))
    setValues(prev => { const n = {...prev}; delete n[key]; return n })
  }

  // Авто-розбивка ПІБ: "Іванов Іван Іванович" → last + first + middle
  function autoSplitFullName(raw: string) {
    const parts = raw.trim().split(/\s+/)
    if (parts.length < 2) return
    const [last, first, ...rest] = parts
    const newValues: Record<string, string> = { ...values, last_name: last }
    const newFields = [...activeFields]
    if (first) {
      newValues.first_name = first
      if (!newFields.includes('first_name')) newFields.push('first_name')
    }
    if (rest.length > 0) {
      newValues.middle_name = rest.join(' ')
      if (!newFields.includes('middle_name')) newFields.push('middle_name')
    }
    setValues(newValues)
    setActiveFields(newFields)
    setSplitHint(true)
    setTimeout(() => setSplitHint(false), 3000)
  }

  async function runSearch() {
    // Авто-розбивка якщо в прізвищі є пробіл
    let searchValues = { ...values }
    let extraKeys: string[] = []
    if (searchValues.last_name && searchValues.last_name.trim().includes(' ')) {
      const parts = searchValues.last_name.trim().split(/\s+/)
      searchValues.last_name = parts[0]
      if (!searchValues.first_name && parts[1]) { searchValues.first_name = parts[1]; extraKeys.push('first_name') }
      if (!searchValues.middle_name && parts[2]) { searchValues.middle_name = parts.slice(2).join(' '); extraKeys.push('middle_name') }
    }

    const allKeys = [...new Set([...activeFields, ...extraKeys])]
    const filled = allKeys.filter(k => searchValues[k]?.trim())
    if (filled.length === 0) { setError('Заповніть хоча б одне поле'); return }

    setLoading(true); setError(''); setResults([]); setTotal(null); setLeaks([])
    try {
      const body: Record<string, any> = { limit: 100 }
      for (const k of filled) {
        if (k === 'gender') body[k] = searchValues[k].trim() as any
        else body[k] = searchValues[k].trim()
      }
      if (filters.myrotvorets_only) body.myrotvorets_only = true
      if (filters.has_photo) body.has_photo = true

      const res = await fetch('/api/search/fragments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResults(data.results || [])
      setTotal(data.total)
      setLeaks(data.leaks || [])
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  const filledCount = activeFields.filter(k => values[k]?.trim()).length
  const groups = [...new Set(ALL_FIELDS.filter(f => !activeFields.includes(f.key)).map(f => f.group))]

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                🔍 Пошук за крихтами
              </h1>
              <p className="text-gray-500 text-xs mt-0.5">
                Комбінований пошук по неповним даним · 167,522 осіб у базі
              </p>
            </div>
            <button
              onClick={() => router.push('/persons')}
              className="text-gray-500 hover:text-gray-300 text-sm transition">
              ← Особи
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

          {/* Пресети */}
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Популярні комбінації</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p.fields)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                    JSON.stringify(activeFields) === JSON.stringify(p.fields)
                      ? 'bg-blue-700 border-blue-600 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Форма пошуку */}
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {activeFields.map(key => {
                const field = ALL_FIELDS.find(f => f.key === key)
                if (!field) return null
                return (
                  <div key={key} className="relative group">
                    <label className="block text-gray-400 text-xs mb-1 flex items-center gap-1">
                      <span>{field.icon}</span>
                      <span>{field.label}</span>
                      {field.hint && <span className="text-gray-600 ml-1">({field.hint})</span>}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={values[key] || ''}
                        onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                        onBlur={e => {
                          if (key === 'last_name' && e.target.value.trim().includes(' ')) {
                            autoSplitFullName(e.target.value)
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (key === 'last_name' && (e.target as HTMLInputElement).value.trim().includes(' ')) {
                              autoSplitFullName((e.target as HTMLInputElement).value)
                            }
                            runSearch()
                          }
                        }}
                        placeholder={field.placeholder}
                        className="w-full bg-gray-800 border border-gray-600 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition pr-8"
                      />
                      <button
                        onClick={() => removeField(key)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100 text-xs">
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Кнопка додати поле */}
              <div className="relative">
                <label className="block text-transparent text-xs mb-1">+</label>
                <button
                  onClick={() => setShowFieldPicker(!showFieldPicker)}
                  className="w-full h-[38px] border border-dashed border-gray-600 hover:border-blue-500 rounded-lg text-gray-500 hover:text-blue-400 text-sm transition flex items-center justify-center gap-1">
                  + Додати параметр
                </button>

                {showFieldPicker && (
                  <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-gray-800 border border-gray-600 rounded-xl shadow-xl p-3 max-h-80 overflow-y-auto">
                    {groups.map(group => {
                      const groupFields = ALL_FIELDS.filter(f => f.group === group && !activeFields.includes(f.key))
                      if (groupFields.length === 0) return null
                      return (
                        <div key={group} className="mb-3">
                          <p className="text-gray-500 text-xs font-medium mb-1.5">{GROUP_LABELS[group]}</p>
                          <div className="space-y-1">
                            {groupFields.map(f => (
                              <button
                                key={f.key}
                                onClick={() => addField(f.key)}
                                className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-gray-700 text-sm text-gray-200 transition flex items-center gap-2">
                                <span>{f.icon}</span> {f.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Фільтри */}
            <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-gray-700">
              <span className="text-gray-500 text-xs">Фільтри:</span>
              {[
                { key: 'myrotvorets_only', label: '🚨 Тільки Миротворець' },
                { key: 'has_photo',        label: '📷 Є фото' },
              ].map(f => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(filters as any)[f.key]}
                    onChange={e => setFilters(prev => ({ ...prev, [f.key]: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-500"
                  />
                  <span className="text-gray-300 text-xs">{f.label}</span>
                </label>
              ))}
              <div className="ml-auto">
                <button
                  onClick={runSearch}
                  disabled={loading || filledCount === 0}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-semibold transition flex items-center gap-2">
                  {loading
                    ? <><span className="animate-spin">⟳</span> Шукаю...</>
                    : <><span>🔍</span> Шукати ({filledCount} {filledCount === 1 ? 'параметр' : filledCount < 5 ? 'параметри' : 'параметрів'})</>
                  }
                </button>
              </div>
            </div>
          </div>

          {/* Авто-розбивка ПІБ підказка */}
          {splitHint && (
            <div className="bg-blue-950/60 border border-blue-700/50 rounded-xl px-4 py-2.5 text-blue-300 text-sm flex items-center gap-2 animate-pulse">
              ✂️ Ім'я та по батькові виділено автоматично з повного ПІБ
            </div>
          )}

          {/* Помилка */}
          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
              ❌ {error}
            </div>
          )}

          {/* Витоки БД */}
          {leaks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-red-400 text-lg">💾</span>
                <p className="text-gray-300 font-semibold text-sm">
                  Витоки БД — <span className="text-red-400">{leaks.length}</span> записів
                </p>
              </div>
              <div className="space-y-2">
                {leaks.map((leak: any, i: number) => (
                  <div key={i} className="bg-red-950/30 border border-red-800/40 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-red-300 bg-red-900/50 px-2 py-0.5 rounded">
                        {leak.source_label || leak.source}
                      </span>
                      {leak.dob && <span className="text-gray-400 text-xs">📅 {leak.dob}</span>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                      {leak.name     && <span className="text-gray-200 text-xs">👤 {leak.name}</span>}
                      {leak.phone    && <span className="text-gray-200 text-xs">📞 {leak.phone}</span>}
                      {leak.inn      && <span className="text-gray-200 text-xs">🔢 ІНН: {leak.inn}</span>}
                      {leak.passport && <span className="text-gray-200 text-xs">🛂 {leak.passport}</span>}
                      {leak.address  && <span className="text-gray-200 text-xs col-span-2">📍 {leak.address}</span>}
                      {leak.snils    && <span className="text-gray-200 text-xs">СНІЛС: {leak.snils}</span>}
                      {leak.email    && <span className="text-gray-200 text-xs">✉️ {leak.email}</span>}
                    </div>
                    {leak.snippet && (
                      <p className="text-gray-400 text-xs mt-2 line-clamp-2 italic">"{leak.snippet}"</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Повідомлення якщо leaks порожня */}
          {total !== null && leaks.length === 0 && (
            <div className="bg-gray-900/40 border border-gray-700/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-gray-600 text-lg">💾</span>
              <div>
                <p className="text-gray-500 text-xs">Витоки БД: дані не знайдені</p>
                <p className="text-gray-600 text-xs">База витоків потребує імпорту даних (РосПаспорт, Гослуслуги, ФССП...)</p>
              </div>
            </div>
          )}

          {/* Результати */}
          {total !== null && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-400 text-sm">
                  Знайдено: <span className="text-white font-semibold">{total}</span> осіб
                  {total > 0 && <span className="text-gray-600 ml-2">· відсортовано за релевантністю</span>}
                </p>
                {results.length > 0 && (
                  <div className="flex gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> 80+ висока
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block"></span> 50+ середня
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span> нижча
                    </span>
                  </div>
                )}
              </div>

              {results.length === 0 ? (
                <div className="bg-gray-900 rounded-xl border border-gray-700 p-8 text-center">
                  <p className="text-4xl mb-3">🔍</p>
                  <p className="text-gray-400">Нічого не знайдено по вказаних параметрах</p>
                  <p className="text-gray-600 text-sm mt-1">Спробуйте змінити або зменшити кількість параметрів</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {results.map((person: any) => (
                    <ResultCard
                      key={person.id}
                      person={person}
                      onClick={() => router.push(`/persons/${person.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
