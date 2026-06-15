'use client'

import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import Sidebar from '../../components/Sidebar'
import Icon from '../../components/Icon'

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if ((ch === ',' || ch === ';' || ch === '\t') && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''))
  const rows = lines.slice(1)
    .map(l => parseCSVLine(l).map(v => v.replace(/^"|"$/g, '')))
    .filter(r => r.some(v => v.trim()))
  return { headers, rows }
}

// ─── Field definitions ────────────────────────────────────────────────────────
const DB_FIELDS: { value: string; label: string }[] = [
  { value: '',             label: '— пропустити —' },
  { value: 'name_rus',    label: 'ФІО (рос)' },
  { value: 'name_ukr',    label: 'ПІБ (укр)' },
  { value: 'name_eng',    label: 'Name (eng)' },
  { value: 'dob',         label: 'Дата народження' },
  { value: 'gender',      label: 'Стать' },
  { value: 'birth_place', label: 'Місце народження' },
  { value: 'nationality', label: 'Громадянство' },
  { value: 'region',      label: 'Регіон' },
  { value: 'rank',        label: 'Звання' },
  { value: 'position',    label: 'Посада' },
  { value: 'unit',        label: 'Підрозділ' },
  { value: 'unit_num',    label: 'Номер в/ч' },
  { value: 'military_id', label: 'Військовий ID' },
  { value: 'passport',    label: 'Паспорт' },
  { value: 'ipn',         label: 'ІПН / ИНН' },
  { value: 'snils',       label: 'СНІЛС' },
  { value: 'phones',      label: 'Телефони' },
  { value: 'email',       label: 'Email' },
  { value: 'addr_live',   label: 'Адреса прожив.' },
  { value: 'addr_reg',    label: 'Адреса реєст.' },
  { value: 'status',      label: 'Статус' },
  { value: 'threat_level',label: 'Рівень загрози' },
  { value: 'notes',       label: 'Примітки' },
  { value: 'sources',     label: 'Джерела' },
  { value: 'vk_url',      label: 'VK URL' },
  { value: 'ok_url',      label: 'OK URL' },
]

const FIELD_ALIASES: Record<string, string[]> = {
  name_rus:    ['фио', 'ф.и.о', 'имя', 'полное имя', 'фамилия имя отчество', 'name_rus', 'фамилия', 'прізвище імя по батькові', 'стрелковый взвод', 'садн'],
  name_ukr:    ['піб', 'п.і.б', 'прізвище', 'повне імя', 'name_ukr'],
  name_eng:    ['name', 'full name', 'fullname', 'name_eng'],
  dob:         ['дата рождения', 'д.р.', 'дн', 'дата народження', 'рождение', 'dob', 'birth', 'birthdate', 'дата рожд', 'рік народження'],
  gender:      ['пол', 'стать', 'gender', 'sex'],
  birth_place: ['место рождения', 'місце народження', 'birth_place', 'место рожд', 'область/край/республіка', 'населений пункт', 'область'],
  nationality: ['гражданство', 'громадянство', 'nationality', 'страна', 'країна'],
  region:      ['регион', 'region', 'район'],
  rank:        ['звание', 'звання', 'rank', 'воинское звание', 'військове звання'],
  position:    ['должность', 'посада', 'position', 'должн'],
  unit:        ['часть', 'в/ч', 'подразделение', 'підрозділ', 'unit', 'воинская часть', 'військова частина'],
  unit_num:    ['номер части', 'номер в/ч', 'unit_num', '№ в/ч', 'номер войсковой'],
  military_id: ['военный билет', 'в/б', 'military_id', 'вб', 'военнобилет'],
  passport:    ['паспорт', 'passport', 'документ', 'серия номер'],
  ipn:         ['іпн', 'инн', 'ipn', 'inn', 'идентификационный', 'ідентифікаційний'],
  snils:       ['снилс', 'snils', 'пфр'],
  phones:      ['телефон', 'тел', 'phone', 'phones', 'мобильный', 'мобільний', 'номер', 'моб'],
  email:       ['email', 'почта', 'пошта', 'e-mail', 'мейл'],
  addr_live:   ['адрес', 'адреса', 'адрес проживания', 'addr_live', 'прописка', 'місце проживання'],
  addr_reg:    ['адрес регистрации', 'реєстрація', 'addr_reg', 'регистрация'],
  status:      ['статус', 'status'],
  threat_level:['угроза', 'загроза', 'threat', 'threat_level', 'рівень'],
  notes:       ['примечания', 'нотатки', 'notes', 'описание', 'опис', 'коментар', 'нюанси', 'загибель (район)', 'загибель (населений пункт)'],
  sources:     ['источник', 'джерело', 'sources', 'source', 'посилання на першоджерело', 'посилання тг'],
  vk_url:      ['vk', 'вконтакте', 'vk_url'],
  ok_url:      ['одноклассники', 'ok.ru', 'ok_url'],
}

function autoMap(header: string): string {
  const h = header.toLowerCase().trim()
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some(a => h.includes(a) || a.includes(h))) return field
  }
  if (DB_FIELDS.find(f => f.value === h)) return h
  return ''
}

// ─── Types ────────────────────────────────────────────────────────────────────
type EnrichStatus = 'pending' | 'running' | 'done' | 'error'
interface EnrichResult {
  id: string
  name: string
  status: EnrichStatus
  found?: { phones: number; emails: number; addresses: number; sanctions: number }
  error?: string
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepChip({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs transition ${active ? 'text-white' : done ? 'text-[var(--odb-ok)]' : 'text-gray-600'}`}>
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        done   ? 'bg-[var(--odb-ok)] text-gray-950' :
        active ? 'bg-[var(--odb-accent)] text-white' :
                 'bg-gray-700 text-gray-500'
      }`}>
        {done ? <Icon name="check" size={10} strokeWidth={2.5} /> : n}
      </span>
      <span className="hidden sm:block">{label}</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep]       = useState<1 | 2 | 3>(1)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows]       = useState<string[][]>([])
  const [mapping, setMapping] = useState<string[]>([])
  const [mode, setMode]       = useState<'upsert' | 'insert'>('upsert')
  const [autoEnrich, setAutoEnrich] = useState(true)
  const [importing, setImporting] = useState(false)
  const [result, setResult]   = useState<any>(null)
  const [error, setError]     = useState('')
  const [dragOver, setDragOver] = useState(false)

  const [enriching, setEnriching]       = useState(false)
  const [enrichResults, setEnrichResults] = useState<EnrichResult[]>([])
  const [enrichDone, setEnrichDone]     = useState(0)
  const [enrichStats, setEnrichStats]   = useState({ phones: 0, emails: 0, addresses: 0, sanctions: 0 })
  const enrichCancelRef = useRef(false)

  const processRows = useCallback((h: string[], r: string[][]) => {
    if (h.length === 0) { setError('Не вдалося розпізнати файл'); return }
    setHeaders(h)
    setRows(r)
    setMapping(h.map(autoMap))
    setError('')
    setStep(2)
  }, [])

  function handleFile(file: File) {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() || ''

    if (['xlsx', 'xls'].includes(ext)) {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const wb   = XLSX.read(data, { type: 'array', cellDates: true })
          const ws   = wb.Sheets[wb.SheetNames[0]]
          const raw  = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, dateNF: 'YYYY-MM-DD' })
          if (!raw || raw.length < 2) { setError('Порожній або невалідний XLSX файл'); return }
          const h = (raw[0] as any[]).map(c => String(c || '').trim())
          const r = (raw.slice(1) as any[][])
            .map(row => h.map((_, i) => String(row[i] || '').trim()))
            .filter(row => row.some(v => v))
          processRows(h, r)
        } catch (err: any) {
          setError(`Помилка читання XLSX: ${err.message}`)
        }
      }
      reader.readAsArrayBuffer(file)
      return
    }

    if (['csv', 'txt', 'tsv'].includes(ext)) {
      const reader = new FileReader()
      reader.onload = e => {
        const text = e.target?.result as string
        const { headers: h, rows: r } = parseCSV(text)
        processRows(h, r)
      }
      reader.readAsText(file, 'UTF-8')
      return
    }

    setError('Підтримуються: XLSX, XLS, CSV, TSV, TXT')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function buildPersons(): Record<string, any>[] {
    return rows.map(row => {
      const person: Record<string, any> = {}
      row.forEach((val, i) => {
        const field = mapping[i]
        if (field && val.trim()) {
          if (field === 'phones' && person.phones) {
            person.phones = `${person.phones},${val.trim()}`
          } else {
            person[field] = val.trim()
          }
        }
      })
      return person
    }).filter(p => Object.keys(p).length > 0)
  }

  async function doImport() {
    setImporting(true)
    setError('')
    setResult(null)
    try {
      const persons = buildPersons()
      const res = await fetch('/api/persons/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persons, mode }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Помилка імпорту'); return }
      setResult(data)
      setStep(3)
      if (autoEnrich && data.persons?.length > 0) startEnrichment(data.persons)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  async function startEnrichment(persons: { id: string; name: string }[]) {
    setEnriching(true)
    enrichCancelRef.current = false
    setEnrichDone(0)
    setEnrichStats({ phones: 0, emails: 0, addresses: 0, sanctions: 0 })
    setEnrichResults(persons.map(p => ({ id: p.id, name: p.name, status: 'pending' })))

    let phones = 0, emails = 0, addresses = 0, sanctions = 0

    for (let i = 0; i < persons.length; i++) {
      if (enrichCancelRef.current) break
      const p = persons[i]
      setEnrichResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'running' } : r))

      try {
        const res = await fetch('/api/persons/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person_id: p.id, auto_patch: true }),
        })
        const data = await res.json()
        if (data.success) {
          phones    += data.found?.phones    || 0
          emails    += data.found?.emails    || 0
          addresses += data.found?.addresses || 0
          sanctions += data.found?.sanctions || 0
          setEnrichResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'done', found: data.found } : r))
        } else {
          setEnrichResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: data.error || 'Помилка' } : r))
        }
      } catch {
        setEnrichResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: 'Мережева помилка' } : r))
      }

      setEnrichDone(i + 1)
      setEnrichStats({ phones, emails, addresses, sanctions })
      if (i < persons.length - 1) await new Promise(r => setTimeout(r, 300))
    }

    setEnriching(false)
  }

  function reset() {
    setStep(1); setHeaders([]); setRows([]); setMapping([])
    setResult(null); setError('')
    setEnrichResults([]); setEnrichDone(0); setEnriching(false)
  }

  const previewRows = rows.slice(0, 8)
  const mappedCount = mapping.filter(Boolean).length
  const persons     = step >= 2 ? buildPersons() : []
  const enrichTotal = enrichResults.length
  const enrichPct   = enrichTotal > 0 ? Math.round((enrichDone / enrichTotal) * 100) : 0

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
              <Icon name="download" size={17} className="text-[var(--odb-accent)]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Масовий імпорт</h1>
              <p className="text-gray-500 text-xs">Завантаження осіб з CSV / XLSX</p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <StepChip n={1} label="Файл"     active={step === 1} done={step > 1} />
              <div className="w-6 h-px bg-gray-700" />
              <StepChip n={2} label="Маппінг"  active={step === 2} done={step > 2} />
              <div className="w-6 h-px bg-gray-700" />
              <StepChip n={3} label="Результат" active={step === 3} done={false} />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-5">

            {error && (
              <div className="bg-red-950/50 border border-red-700/60 rounded-xl p-4 text-red-300 text-sm flex items-start gap-2.5">
                <Icon name="alert" size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* ── STEP 1: Upload ── */}
            {step === 1 && (
              <div className="space-y-4 odb-animate-up">
                <div
                  className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
                    dragOver
                      ? 'border-[var(--odb-accent)] bg-blue-950/20'
                      : 'border-gray-700 hover:border-gray-600 hover:bg-gray-900/50'
                  }`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <Icon name="upload" size={40} className="mx-auto text-gray-600 mb-4" />
                  <p className="text-white font-semibold text-lg mb-1">Перетягніть файл сюди</p>
                  <p className="text-gray-500 text-sm">або клікніть щоб вибрати</p>
                  <p className="text-gray-600 text-xs mt-2">
                    <span className="text-[var(--odb-ok)] font-medium">XLSX, XLS</span>
                    {' · '}CSV, TSV, TXT{' · '}UTF-8
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.tsv,.txt,.xlsx,.xls"
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="odb-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="file" size={14} className="text-[var(--odb-ok)]" />
                      <p className="text-gray-300 text-sm font-semibold">Excel (XLSX / XLS)</p>
                    </div>
                    <p className="text-gray-500 text-xs mb-2">Перший рядок — заголовки колонок.</p>
                    <div className="flex flex-wrap gap-1">
                      {['ФИО', 'Дата рождения', 'Звание', 'Подразделение', 'Регион'].map(h => (
                        <span key={h} className="text-xs bg-gray-700 text-[var(--odb-ok)] px-2 py-0.5 rounded">{h}</span>
                      ))}
                    </div>
                  </div>
                  <div className="odb-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="clipboard" size={14} className="text-[var(--odb-info)]" />
                      <p className="text-gray-300 text-sm font-semibold">CSV / TSV / TXT</p>
                    </div>
                    <p className="text-gray-500 text-xs mb-2">Роздільник: кома, крапка з комою або таб.</p>
                    <pre className="text-xs text-[var(--odb-ok)] bg-gray-900 rounded-lg p-2 overflow-x-auto border border-gray-700/50">{
`ФИО;Дата рождения;Звание
Иванов Иван;01.01.1990;Майор`
                    }</pre>
                  </div>
                </div>

                <div className="bg-blue-950/30 border border-blue-700/40 rounded-xl p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoEnrich}
                      onChange={e => setAutoEnrich(e.target.checked)}
                      className="mt-1 accent-blue-500 w-4 h-4 shrink-0"
                    />
                    <div>
                      <p className="text-blue-300 font-semibold text-sm flex items-center gap-1.5">
                        <Icon name="spark" size={14} />
                        Авто-збагачення після імпорту
                      </p>
                      <p className="text-gray-400 text-xs mt-1">
                        Кожна особа перевіряється по витоках (LeakOsint, OsintKit),
                        санкційних списках (OFAC/EU/РНБО/ООН) та Telegram.
                      </p>
                      <p className="text-gray-600 text-xs mt-0.5">~1–3 сек на особу</p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* ── STEP 2: Mapping + Preview ── */}
            {step === 2 && (
              <div className="space-y-5 odb-animate-up">
                <div className="grid grid-cols-3 gap-3 odb-stagger">
                  {[
                    { label: 'Рядків у файлі',      value: rows.length,                           color: 'text-[var(--odb-accent)]' },
                    { label: 'Колонок розпізнано',   value: `${mappedCount} / ${headers.length}`, color: 'text-[var(--odb-ok)]' },
                    { label: 'Записів до імпорту',   value: persons.length,                        color: 'text-[var(--odb-warn)]' },
                  ].map(s => (
                    <div key={s.label} className="odb-card p-4 text-center">
                      <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-gray-500 text-xs mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Column mapping */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Icon name="arrow-right" size={14} className="text-[var(--odb-accent)]" />
                      Маппінг колонок
                    </h3>
                    <span className="text-xs text-gray-500">CSV/Excel → поле у базі</span>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {headers.map((header, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-400 truncate mb-0.5" title={header}>
                            <span className="text-gray-600 mr-1">{i + 1}.</span>
                            {header}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            напр: {rows[0]?.[i] || '—'}
                          </div>
                        </div>
                        <Icon name="arrow-right" size={12} className="text-gray-600 shrink-0" />
                        <select
                          value={mapping[i] || ''}
                          onChange={e => {
                            const m = [...mapping]; m[i] = e.target.value; setMapping(m)
                          }}
                          className={`text-xs px-2 py-1.5 rounded-lg border bg-gray-900 focus:outline-none shrink-0 w-36 transition ${
                            mapping[i]
                              ? 'border-[var(--odb-accent)] text-white'
                              : 'border-gray-700 text-gray-500'
                          }`}
                        >
                          {DB_FIELDS.map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preview table */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
                    <Icon name="file" size={14} className="text-gray-400" />
                    <h3 className="font-semibold text-sm">
                      Попередній перегляд ({previewRows.length} рядків)
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700">
                          {headers.map((h, i) => (
                            <th key={i} className="px-3 py-2 text-left text-gray-400 font-medium whitespace-nowrap">
                              {h}
                              {mapping[i] && (
                                <div className="text-[var(--odb-accent)] font-normal">→ {mapping[i]}</div>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, ri) => (
                          <tr key={ri} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-2 text-gray-300 whitespace-nowrap max-w-xs truncate" title={cell}>
                                {cell || <span className="text-gray-700">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rows.length > 8 && (
                    <div className="px-4 py-2 text-xs text-gray-600 border-t border-gray-700/50">
                      ...та ще {rows.length - 8} рядків
                    </div>
                  )}
                </div>

                {/* Options */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 space-y-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm text-gray-400 font-medium">Режим:</span>
                    <div className="flex gap-4">
                      {[
                        { v: 'upsert', label: 'Оновлювати дублікати', desc: 'Якщо ім\'я+ДН вже є — оновити' },
                        { v: 'insert', label: 'Тільки нові',          desc: 'Пропустити якщо вже існує' },
                      ].map(o => (
                        <label key={o.v} className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="mode"
                            value={o.v}
                            checked={mode === o.v}
                            onChange={() => setMode(o.v as any)}
                            className="mt-0.5 accent-blue-500"
                          />
                          <div>
                            <div className="text-sm text-white">{o.label}</div>
                            <div className="text-xs text-gray-500">{o.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer border-t border-gray-700 pt-4">
                    <input
                      type="checkbox"
                      checked={autoEnrich}
                      onChange={e => setAutoEnrich(e.target.checked)}
                      className="accent-blue-500 w-4 h-4"
                    />
                    <span className="text-sm text-blue-300 font-medium flex items-center gap-1.5">
                      <Icon name="spark" size={14} />
                      Авто-збагачення
                    </span>
                    <span className="text-xs text-gray-500">— витоки та санкції для кожної особи</span>
                  </label>

                  <div className="flex gap-3 justify-end pt-2">
                    <button
                      onClick={reset}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition flex items-center gap-1.5"
                    >
                      <Icon name="chevron-right" size={13} className="rotate-180" />
                      Назад
                    </button>
                    <button
                      onClick={doImport}
                      disabled={importing || persons.length === 0}
                      className="odb-btn-accent px-6 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                      {importing ? (
                        <><Icon name="refresh" size={14} className="animate-spin" />Імпортується...</>
                      ) : (
                        <><Icon name="download" size={14} />Імпортувати {persons.length.toLocaleString()} записів</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3: Result + Enrichment ── */}
            {step === 3 && result && (
              <div className="space-y-4 odb-animate-up">
                {/* Import summary */}
                <div className={`rounded-2xl p-5 border flex items-center gap-4 ${
                  result.errors?.length > 0
                    ? 'bg-yellow-950/30 border-yellow-700/50'
                    : 'bg-green-950/30 border-green-700/50'
                }`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    result.errors?.length > 0 ? 'bg-yellow-900/50' : 'bg-green-900/50'
                  }`}>
                    <Icon
                      name={result.errors?.length > 0 ? 'alert' : 'check'}
                      size={24}
                      className={result.errors?.length > 0 ? 'text-yellow-400' : 'text-[var(--odb-ok)]'}
                    />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      {result.errors?.length > 0 ? 'Імпорт завершено з помилками' : 'Імпорт успішний!'}
                    </h2>
                    <p className="text-gray-400 text-sm">Оброблено {result.total} записів</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 odb-stagger">
                  <div className="odb-card p-4 text-center">
                    <div className="text-3xl font-bold text-[var(--odb-ok)]">{result.imported}</div>
                    <div className="text-gray-500 text-xs mt-1">Імпортовано</div>
                  </div>
                  <div className="odb-card p-4 text-center">
                    <div className="text-3xl font-bold text-[var(--odb-warn)]">{result.skipped}</div>
                    <div className="text-gray-500 text-xs mt-1">Пропущено</div>
                  </div>
                  <div className="odb-card p-4 text-center">
                    <div className="text-3xl font-bold text-gray-400">{result.errors?.length || 0}</div>
                    <div className="text-gray-500 text-xs mt-1">Помилок</div>
                  </div>
                </div>

                {result.errors?.length > 0 && (
                  <div className="bg-gray-800 rounded-xl border border-yellow-700/40 p-4">
                    <h3 className="text-yellow-400 text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Icon name="alert" size={14} />
                      Помилки
                    </h3>
                    {result.errors.map((e: string, i: number) => (
                      <p key={i} className="text-xs text-gray-400 font-mono">{e}</p>
                    ))}
                  </div>
                )}

                {/* Enrichment Panel */}
                {enrichTotal > 0 && (
                  <div className="bg-gray-800 rounded-2xl border border-blue-700/40 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon name="spark" size={18} className={enriching ? 'text-[var(--odb-accent)]' : 'text-[var(--odb-ok)]'} />
                        <div>
                          <h3 className="font-semibold text-sm text-white">
                            {enriching
                              ? `Збагачення: ${enrichDone} / ${enrichTotal}`
                              : `Збагачення завершено — ${enrichDone} осіб`}
                          </h3>
                          <p className="text-xs text-gray-500">Витоки · Санкції (OFAC / EU / РНБО)</p>
                        </div>
                      </div>
                      {enriching && (
                        <button
                          onClick={() => { enrichCancelRef.current = true }}
                          className="text-xs text-[var(--odb-danger)] hover:text-red-300 px-3 py-1 border border-red-700/50 rounded-lg transition"
                        >
                          Зупинити
                        </button>
                      )}
                    </div>

                    <div className="px-5 py-3 border-b border-gray-700">
                      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>{enrichDone} з {enrichTotal}</span>
                        <span>{enrichPct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--odb-accent)] rounded-full transition-all duration-300"
                          style={{ width: `${enrichPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 divide-x divide-gray-700 border-b border-gray-700">
                      {[
                        { icon: 'phone'    as const, label: 'Телефони',  value: enrichStats.phones,    color: 'text-[var(--odb-accent)]' },
                        { icon: 'file'     as const, label: 'Emails',    value: enrichStats.emails,    color: 'text-purple-400' },
                        { icon: 'building' as const, label: 'Адреси',    value: enrichStats.addresses, color: 'text-[var(--odb-ok)]' },
                        { icon: 'alert'    as const, label: 'Санкції',   value: enrichStats.sanctions, color: 'text-[var(--odb-danger)]' },
                      ].map(s => (
                        <div key={s.label} className="p-3 text-center">
                          <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                          <div className="text-xs text-gray-500 flex items-center justify-center gap-1 mt-0.5">
                            <Icon name={s.icon} size={11} />
                            {s.label}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="max-h-64 overflow-y-auto">
                      {enrichResults.slice(0, 200).map((r) => (
                        <div key={r.id} className={`flex items-center gap-3 px-4 py-2 border-b border-gray-700/40 text-xs ${
                          r.status === 'running' ? 'bg-blue-950/20' : ''
                        }`}>
                          <span className="w-4 shrink-0 flex items-center justify-center">
                            {r.status === 'pending' ? <span className="w-1.5 h-1.5 rounded-full bg-gray-600" /> :
                             r.status === 'running' ? <Icon name="refresh" size={12} className="text-[var(--odb-accent)] animate-spin" /> :
                             r.status === 'done'    ? <Icon name="check"   size={12} className="text-[var(--odb-ok)]" /> :
                                                      <Icon name="close"   size={12} className="text-[var(--odb-danger)]" />}
                          </span>
                          <span className="flex-1 text-gray-300 truncate">{r.name || `ID: ${r.id}`}</span>
                          {r.status === 'done' && r.found && (
                            <div className="flex gap-2 shrink-0 text-xs">
                              {(r.found.phones    || 0) > 0 && <span className="text-[var(--odb-accent)]">📱{r.found.phones}</span>}
                              {(r.found.emails    || 0) > 0 && <span className="text-purple-400">✉{r.found.emails}</span>}
                              {(r.found.addresses || 0) > 0 && <span className="text-[var(--odb-ok)]">🏠{r.found.addresses}</span>}
                              {(r.found.sanctions || 0) > 0 && <span className="text-[var(--odb-danger)]">⚠{r.found.sanctions}</span>}
                              {Object.values(r.found).every(v => v === 0) && <span className="text-gray-600">нічого</span>}
                            </div>
                          )}
                          {r.status === 'error' && <span className="text-[var(--odb-danger)] shrink-0">{r.error}</span>}
                        </div>
                      ))}
                      {enrichResults.length > 200 && (
                        <p className="text-center text-xs text-gray-600 py-2">
                          ...та ще {enrichResults.length - 200} осіб
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {!autoEnrich && result.persons?.length > 0 && enrichTotal === 0 && (
                  <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white font-medium flex items-center gap-1.5">
                        <Icon name="spark" size={14} className="text-[var(--odb-accent)]" />
                        Перевірити по базах
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Витоки, санкції, Telegram для {result.imported} осіб
                      </p>
                    </div>
                    <button
                      onClick={() => startEnrichment(result.persons)}
                      className="odb-btn-accent px-4 py-2 text-sm font-medium"
                    >
                      Запустити збагачення
                    </button>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={reset}
                    className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition flex items-center gap-1.5"
                  >
                    <Icon name="download" size={14} />
                    Імпортувати ще
                  </button>
                  <a
                    href="/persons"
                    className="odb-btn-accent px-5 py-2.5 text-sm font-medium flex items-center gap-1.5"
                  >
                    <Icon name="users" size={14} />
                    Переглянути реєстр
                    <Icon name="arrow-right" size={13} />
                  </a>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  )
}
