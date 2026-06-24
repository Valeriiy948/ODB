'use client'
// app/crime-reports/new/page.tsx — Завантаження нової довідки

import { useState, useCallback } from 'react'
import { useRouter }             from 'next/navigation'

const ACCEPT = '.pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

interface UploadResult {
  id:             string
  entities:       { names: string[]; phones: string[]; ipn: string[]; crypto: unknown[]; vehicles: string[] }
  risk_score:     number
  watchlist_hits: number
  has_summary:    boolean
  text_length:    number
}

export default function NewCrimeReportPage() {
  const router = useRouter()
  const [file,         setFile]         = useState<File | null>(null)
  const [title,        setTitle]        = useState('')
  const [erdr,         setErdr]         = useState('')
  const [location,     setLocation]     = useState('')
  const [incidentDate, setIncidentDate] = useState('')
  const [tags,         setTags]         = useState('')
  const [dragging,     setDragging]     = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [step,         setStep]         = useState<'idle' | 'uploading' | 'parsing' | 'ner' | 'done' | 'error'>('idle')
  const [result,       setResult]       = useState<UploadResult | null>(null)
  const [error,        setError]        = useState('')

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }, [])

  function pickFile(f: File) {
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file && !title) { setError('Потрібно вказати назву або завантажити файл'); return }
    setUploading(true)
    setError('')
    setStep('uploading')

    const form = new FormData()
    if (file)        form.append('file',          file)
    form.append('title',         title || file?.name || 'Без назви')
    if (erdr)        form.append('erdr_number',   erdr)
    if (location)    form.append('location',      location)
    if (incidentDate) form.append('incident_date', incidentDate)
    if (tags)        form.append('tags',          tags)

    setStep('parsing')
    const res = await fetch('/api/crime-reports', { method: 'POST', body: form })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Помилка завантаження')
      setStep('error')
      setUploading(false)
      return
    }

    setResult(json as UploadResult)
    setStep('done')
    setUploading(false)
  }

  const stepLabel: Record<typeof step, string> = {
    idle:      '',
    uploading: 'Завантаження файлу...',
    parsing:   'Витягування тексту + AI-аналіз...',
    ner:       'Пошук сутностей (NER)...',
    done:      'Готово!',
    error:     'Помилка',
  }

  if (step === 'done' && result) {
    return (
      <div className="flex-1 p-6 max-w-2xl mx-auto">
        <div className="rounded-2xl border p-8 text-center space-y-4"
             style={{ background: 'var(--odb-surface)', borderColor: 'rgba(34,197,94,0.3)' }}>
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-bold text-white">Довідку збережено та проаналізовано</h2>
          <div className="grid grid-cols-2 gap-3 text-sm mt-4">
            <StatBox label="Символів тексту" value={result.text_length.toLocaleString()} />
            <StatBox label="Ризик-score"      value={`${result.risk_score}/100`} color={result.risk_score >= 50 ? '#ef4444' : '#22c55e'} />
            <StatBox label="Знайдено сутностей"
                     value={String(result.entities.names.length + result.entities.phones.length + result.entities.crypto.length + result.entities.vehicles.length)} />
            <StatBox label="Watchlist збігів" value={String(result.watchlist_hits)}
                     color={result.watchlist_hits > 0 ? '#a855f7' : undefined} />
          </div>
          {result.entities.crypto.length > 0 && (
            <div className="text-sm px-4 py-2 rounded-lg"
                 style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
              Виявлено {result.entities.crypto.length} крипто-гаманець(ів)
            </div>
          )}
          {result.watchlist_hits > 0 && (
            <div className="text-sm px-4 py-2 rounded-lg"
                 style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              🚨 Watchlist спрацював! Telegram-сповіщення надіслано.
            </div>
          )}
          <div className="flex gap-3 justify-center mt-4">
            <button
              onClick={() => router.push(`/crime-reports/${result.id}`)}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-black"
              style={{ background: 'linear-gradient(135deg, var(--odb-accent-hi), var(--odb-accent-lo))' }}
            >
              Відкрити довідку
            </button>
            <button
              onClick={() => router.push('/crime-reports')}
              className="px-5 py-2 rounded-xl text-sm font-medium text-white border"
              style={{ borderColor: 'var(--odb-border-soft)', background: 'var(--odb-surface-2)' }}
            >
              До реєстру
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/crime-reports')}
          className="p-2 rounded-lg hover:bg-white/5 transition"
          style={{ color: 'var(--odb-text-faint)' }}
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Нова довідка</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--odb-text-faint)' }}>
            PDF / DOCX / XLSX · автоматичний аналіз та NER
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Drag-and-drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById('file-input')?.click()}
          className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-all"
          style={{
            borderColor: dragging ? 'var(--odb-accent-hi)' : 'var(--odb-border-soft)',
            background:  dragging ? 'var(--odb-accent-glow)' : 'var(--odb-surface)',
          }}
        >
          <input id="file-input" type="file" accept={ACCEPT} className="hidden"
                 onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f) }} />
          <div className="text-3xl">{file ? '📄' : '⬆️'}</div>
          {file ? (
            <div className="text-center">
              <p className="text-white font-medium">{file.name}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--odb-text-faint)' }}>
                {(file.size / 1024).toFixed(0)} KB · клікніть щоб замінити
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-white">Перетягніть файл або клікніть</p>
              <p className="text-xs mt-1" style={{ color: 'var(--odb-text-faint)' }}>PDF, DOCX, XLSX · до 50 МБ</p>
            </div>
          )}
        </div>

        {/* Metadata form */}
        <div className="rounded-2xl border p-5 space-y-4"
             style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>

          <Field label="Назва довідки *">
            <input value={title} onChange={e => setTitle(e.target.value)}
                   placeholder="Опишіть документ коротко"
                   required
                   className="w-full px-3 py-2 rounded-lg text-sm text-white border outline-none"
                   style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)' }} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Номер ЄРДР">
              <input value={erdr} onChange={e => setErdr(e.target.value)}
                     placeholder="20240000000000"
                     className="w-full px-3 py-2 rounded-lg text-sm text-white border outline-none font-mono"
                     style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)' }} />
            </Field>
            <Field label="Дата події">
              <input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)}
                     className="w-full px-3 py-2 rounded-lg text-sm text-white border outline-none"
                     style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)' }} />
            </Field>
          </div>

          <Field label="Місце події">
            <input value={location} onChange={e => setLocation(e.target.value)}
                   placeholder="Місто, вулиця, район..."
                   className="w-full px-3 py-2 rounded-lg text-sm text-white border outline-none"
                   style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)' }} />
          </Field>

          <Field label="Теги (через кому)">
            <input value={tags} onChange={e => setTags(e.target.value)}
                   placeholder="шахрайство, крипто, ДТП..."
                   className="w-full px-3 py-2 rounded-lg text-sm text-white border outline-none"
                   style={{ background: 'var(--odb-surface-2)', borderColor: 'var(--odb-border-soft)' }} />
          </Field>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm"
               style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </div>
        )}

        {uploading && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
               style={{ background: 'var(--odb-accent-glow)' }}>
            <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm" style={{ color: 'var(--odb-accent-hi)' }}>
              {stepLabel[step]}
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={uploading}
          className="w-full py-3 rounded-xl font-semibold text-sm text-black transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--odb-accent-hi), var(--odb-accent-lo))' }}
        >
          {uploading ? 'Аналізуємо...' : 'Завантажити та проаналізувати'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: 'var(--odb-text-faint)' }}>{label}</label>
      {children}
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg p-3 text-left" style={{ background: 'var(--odb-surface-2)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--odb-text-faint)' }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: color ?? 'white' }}>{value}</div>
    </div>
  )
}
