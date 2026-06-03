'use client'

import { useState, useRef } from 'react'
import Sidebar from '../../components/Sidebar'

// ─── Профілі форматів витоків ────────────────────────────────────────────────
const LEAK_PROFILES = [
  {
    id: 'auto',
    label: 'Авто-визначення',
    icon: '🤖',
    desc: 'Автоматично визначає формат по заголовках CSV',
    mapping: null,
  },
  {
    id: 'ros_pasport',
    label: 'РосПаспорт',
    icon: '🛂',
    desc: 'ПІБ, серія/номер паспорта, ДН, адреса, ІНН',
    source: 'ros_pasport',
    mapping: { name: ['ФИО','FIO','Name','Имя','Фамилия'], phone: ['Телефон','Phone'], passport: ['Паспорт','Серия','PASPORT','SERIA'], inn: ['ИНН','INN','inn'], dob: ['ДатаРождения','Дата_рождения','DOB'], address: ['Адрес','address','Address'] },
  },
  {
    id: 'gosuslugi',
    label: 'Гослуслуги РФ',
    icon: '🏛️',
    desc: 'ПІБ, телефон, email, СНІЛС, ДН',
    source: 'gosuslugi',
    mapping: { name: ['full_name','ФИО','name'], phone: ['phone','Телефон','mobile'], email: ['email','Email','почта'], snils: ['snils','СНИЛС'], dob: ['birthday','dob','date_of_birth'] },
  },
  {
    id: 'mts',
    label: 'МТС / Білайн',
    icon: '📱',
    desc: 'Телефон, ПІБ, адреса, ІНН абонента',
    source: 'mts',
    mapping: { phone: ['MSISDN','PHONE','Номер','phone'], name: ['FIO','ФИО','NAME','Имя'], address: ['ADDRESS','Адрес'], inn: ['INN','ИНН'] },
  },
  {
    id: 'fssp',
    label: 'ФССП (судові пристави)',
    icon: '⚖️',
    desc: 'ПІБ, ДН, адреса, борг',
    source: 'fssp',
    mapping: { name: ['name','ФИО','должник'], dob: ['birthdate','dateOfBirth','ДатаРождения'], address: ['address','region','Адрес'], phone: ['phone','телефон'] },
  },
  {
    id: 'vk',
    label: 'VK Users',
    icon: '💙',
    desc: 'VK ID, ім\'я, телефон, email',
    source: 'vk',
    mapping: { vk_id: ['uid','user_id','id','vk_id'], name: ['name','ФИО','first_name'], phone: ['phone','mobile'], email: ['email'] },
  },
  {
    id: 'getcontact',
    label: 'GetContact',
    icon: '📗',
    desc: 'Телефон, імена з адресних книг',
    source: 'getcontact',
    mapping: { phone: ['phone','number'], name: ['name','tag','contact_name'] },
  },
  {
    id: 'custom',
    label: 'Власний формат',
    icon: '⚙️',
    desc: 'Вручну вказати відповідність полів',
    source: 'unknown',
    mapping: null,
  },
]

const DB_FIELDS = ['phone','email','name','dob','inn','snils','passport','address','vk_id']
const DB_FIELD_LABELS: Record<string, string> = {
  phone: 'Телефон', email: 'Email', name: 'ПІБ', dob: 'Дата народження',
  inn: 'ІПН/ІНН', snils: 'СНІЛС', passport: 'Паспорт', address: 'Адреса', vk_id: 'VK ID',
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ }
    else if ((c === ',' || c === ';' || c === '\t') && !inQ) { result.push(cur.trim()); cur = '' }
    else { cur += c }
  }
  result.push(cur.trim())
  return result
}

function autoDetectMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  const HINTS: Record<string, string[]> = {
    phone:    ['телефон','phone','msisdn','mobile','моб','номер','тел'],
    email:    ['email','mail','почта','e-mail'],
    name:     ['имя','фио','name','full_name','ФИО','firstname','lastname','фамилия'],
    dob:      ['дата','birth','рождения','birthday','dob','день_рождения'],
    inn:      ['инн','inn','ипн'],
    snils:    ['снилс','snils'],
    passport: ['паспорт','passport','серия','seria'],
    address:  ['адрес','address','город','регион','region'],
    vk_id:    ['vk_id','uid','vk','вконтакте'],
  }
  for (const h of headers) {
    const hl = h.toLowerCase().trim()
    for (const [field, hints] of Object.entries(HINTS)) {
      if (!map[field] && hints.some(hint => hl.includes(hint))) {
        map[field] = h
        break
      }
    }
  }
  return map
}

// ─── Головна сторінка ────────────────────────────────────────────────────────
export default function LeaksImportPage() {
  const [profile, setProfile] = useState('auto')
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [preview, setPreview] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [source, setSource] = useState('unknown')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ inserted: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Завантаження статистики при відкритті
  useState(() => {
    fetch('/api/leaks')
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {})
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setResult(null); setError(''); setProgress(0)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length === 0) return
      const hdrs = parseCsvLine(lines[0])
      setHeaders(hdrs)
      const prev = lines.slice(1, 6).map(l => parseCsvLine(l))
      setPreview(prev)
      // Авто-маппінг
      const selectedProfile = LEAK_PROFILES.find(p => p.id === profile)
      if (profile === 'auto' || !selectedProfile?.mapping) {
        setMapping(autoDetectMapping(hdrs))
      } else {
        const m: Record<string, string> = {}
        for (const [field, keys] of Object.entries(selectedProfile.mapping as unknown as Record<string, string[]>)) {
          const match = hdrs.find(h => (keys as string[]).some(k => h.toLowerCase().includes(k.toLowerCase())))
          if (match) m[field] = match
        }
        setMapping(m)
      }
      const prof = LEAK_PROFILES.find(p => p.id === profile)
      if (prof?.source) setSource(prof.source)
    }
    reader.readAsText(f, 'utf-8')
  }

  function handleProfileChange(pid: string) {
    setProfile(pid)
    const prof = LEAK_PROFILES.find(p => p.id === pid)
    if (prof?.source) setSource(prof.source)
    if (headers.length > 0) {
      if (pid === 'auto' || !prof?.mapping) {
        setMapping(autoDetectMapping(headers))
      } else {
        const m: Record<string, string> = {}
        for (const [field, keys] of Object.entries((prof.mapping || {}) as unknown as Record<string, string[]>)) {
          const match = headers.find(h => (keys as string[]).some(k => h.toLowerCase().includes(k.toLowerCase())))
          if (match) m[field] = match
        }
        setMapping(m)
      }
    }
  }

  async function startImport() {
    if (!file) return
    setImporting(true); setError(''); setProgress(0); setResult(null)

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(l => l.trim())
      const hdrs = parseCsvLine(lines[0])
      const BATCH = 500
      let totalInserted = 0
      const totalRows = lines.length - 1

      for (let i = 1; i < lines.length; i += BATCH) {
        const batch = lines.slice(i, i + BATCH).map(line => {
          const cols = parseCsvLine(line)
          const rec: Record<string, string> = { source }
          for (const [dbField, csvCol] of Object.entries(mapping)) {
            const idx = hdrs.indexOf(csvCol)
            if (idx >= 0 && cols[idx]) rec[dbField] = cols[idx].trim()
          }
          return rec
        }).filter(r => Object.keys(r).length > 1) // хоч одне поле крім source

        if (batch.length === 0) continue

        const res = await fetch('/api/leaks/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        })
        const d = await res.json()
        totalInserted += d.inserted || 0
        setProgress(Math.round(Math.min(i + BATCH, totalRows) / totalRows * 100))
      }

      setResult({ inserted: totalInserted, total: totalRows })
      // Оновлюємо статистику
      fetch('/api/leaks').then(r => r.json()).then(d => setStats(d)).catch(() => {})
    } catch (e: any) {
      setError(e.message)
    }
    setImporting(false)
  }

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        {/* Шапка */}
        <div className="px-6 py-4 border-b border-gray-800 shrink-0">
          <h1 className="text-lg font-bold">📥 Імпорт витоків</h1>
          <p className="text-gray-500 text-xs mt-0.5">Завантаження CSV-файлів у базу витоків (VPS PostgreSQL)</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl">

          {/* Статистика DB */}
          {stats && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-300 font-semibold text-sm">💧 Поточний стан бази витоків</h3>
                <span className="text-white font-bold text-lg">{(stats.total || 0).toLocaleString()} записів</span>
              </div>
              {stats.by_source?.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {stats.by_source.map((s: any) => (
                    <span key={s.source} className="px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 text-xs">
                      {s.source}: {Number(s.cnt).toLocaleString()}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600 text-xs italic mt-1">База порожня — завантажте перший файл</p>
              )}
            </div>
          )}

          {/* Вибір профілю */}
          <div>
            <h3 className="text-gray-300 font-semibold text-sm mb-3">1. Виберіть формат файлу</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {LEAK_PROFILES.map(p => (
                <button key={p.id} onClick={() => handleProfileChange(p.id)}
                  className={`p-3 rounded-xl border text-left transition ${
                    profile === p.id
                      ? 'bg-blue-900/50 border-blue-600 text-blue-200'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}>
                  <div className="text-xl mb-1">{p.icon}</div>
                  <div className="text-xs font-semibold">{p.label}</div>
                  <div className="text-gray-500 text-xs mt-0.5 line-clamp-2">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Завантаження файлу */}
          <div>
            <h3 className="text-gray-300 font-semibold text-sm mb-3">2. Завантажте CSV-файл</h3>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-700 hover:border-blue-600 rounded-xl p-8 text-center cursor-pointer transition">
              <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFileChange} className="hidden" />
              {file ? (
                <div>
                  <p className="text-white font-medium">📄 {file.name}</p>
                  <p className="text-gray-500 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-400 text-base mb-1">📂 Перетягніть CSV або натисніть</p>
                  <p className="text-gray-600 text-xs">Підтримується .csv, .txt, .tsv (роздільники: кома, крапка з комою, таб)</p>
                </div>
              )}
            </div>
          </div>

          {/* Маппінг полів */}
          {headers.length > 0 && (
            <div>
              <h3 className="text-gray-300 font-semibold text-sm mb-3">3. Відповідність полів</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                {DB_FIELDS.map(field => (
                  <div key={field}>
                    <label className="text-gray-400 text-xs mb-1 block">{DB_FIELD_LABELS[field]}</label>
                    <select
                      value={mapping[field] || ''}
                      onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}
                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:border-blue-500 focus:outline-none">
                      <option value="">— не використовувати —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mb-3">
                <label className="text-gray-400 text-xs mb-1 block">Джерело (source)</label>
                <input type="text" value={source} onChange={e => setSource(e.target.value)}
                  className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs w-64 focus:border-blue-500 focus:outline-none"
                  placeholder="ros_pasport, mts, vk, ..." />
              </div>
            </div>
          )}

          {/* Прев'ю даних */}
          {preview.length > 0 && (
            <div>
              <h3 className="text-gray-300 font-semibold text-sm mb-3">4. Прев'ю (перші 5 рядків)</h3>
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-800">
                      {headers.map((h, i) => (
                        <th key={i} className={`px-3 py-2 text-left font-medium border-r border-gray-700 whitespace-nowrap ${
                          Object.values(mapping).includes(h) ? 'text-green-400 bg-green-950/20' : 'text-gray-500'
                        }`}>
                          {Object.values(mapping).includes(h)
                            ? '✓ ' + (Object.keys(mapping).find(k => mapping[k] === h) || '')
                            : ''} {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-gray-900/40' : 'bg-gray-900/20'}>
                        {row.map((cell, j) => (
                          <td key={j} className={`px-3 py-1.5 border-r border-gray-700/50 truncate max-w-[120px] ${
                            Object.values(mapping).includes(headers[j]) ? 'text-white' : 'text-gray-600'
                          }`}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Кнопка запуску */}
          {file && headers.length > 0 && (
            <div>
              {Object.values(mapping).filter(Boolean).length === 0 && (
                <p className="text-yellow-400 text-xs mb-2">⚠️ Вкажіть відповідність хоча б одного поля</p>
              )}
              <button
                onClick={startImport}
                disabled={importing || Object.values(mapping).filter(Boolean).length === 0}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl font-semibold text-base transition flex items-center gap-2">
                {importing
                  ? <><span className="animate-spin">⟳</span> Імпортуємо... {progress}%</>
                  : '📥 Почати імпорт'}
              </button>

              {/* Прогрес */}
              {importing && (
                <div className="mt-3 bg-gray-800 rounded-full overflow-hidden h-2">
                  <div className="bg-amber-500 h-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Результат */}
          {result && (
            <div className="bg-green-950/50 border border-green-700 rounded-xl p-4">
              <p className="text-green-400 font-bold">✅ Імпорт завершено!</p>
              <p className="text-green-300 text-sm mt-1">
                Додано <strong>{result.inserted.toLocaleString()}</strong> записів з {result.total.toLocaleString()} рядків файлу
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-950/50 border border-red-700 rounded-xl p-4">
              <p className="text-red-400 font-bold">❌ Помилка</p>
              <p className="text-red-300 text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Підказки про формати */}
          <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
            <h4 className="text-gray-300 font-semibold text-sm mb-2">💡 Де брати бази витоків</h4>
            <ul className="text-gray-500 text-xs space-y-1 list-disc list-inside">
              <li>Telegram-канали з OSINT базами (пошук по хешу)</li>
              <li>BreachDirectory, HaveIBeenPwned (API)</li>
              <li>Публічні витоки Держреєстрів (data.gov.ua)</li>
              <li>НАЗК декларації → CSV завантажити на сайті НАЗК</li>
              <li>Відкриті реєстри МВС, ЄДР через OpenData</li>
            </ul>
          </div>

        </div>
      </main>
    </div>
  )
}
