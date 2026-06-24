'use client'
// app/crime-reports/new/page.tsx — Масове завантаження довідок з авто-парсингом

import { useState, useCallback, useId } from 'react'
import { useRouter } from 'next/navigation'

const ACCEPT = '.pdf,.docx,.xlsx'

interface FileEntry {
  uid:      string
  file:     File
  status:   'parsing' | 'ready' | 'uploading' | 'done' | 'duplicate' | 'error'
  title:    string
  erdr:     string
  location: string
  date:     string
  preview:  string
  autoFill: boolean
  result?:  { id: string; risk_score: number; entities: { names: string[]; phones: string[]; crypto: unknown[]; vehicles: string[] } }
  error?:   string
}

let _uid = 0
function uid() { return String(++_uid) }

async function quickParse(file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/crime-reports/quick-parse', { method: 'POST', body: form })
  if (!res.ok) return null
  return res.json() as Promise<{ erdr: string|null; date: string|null; location: string|null; title: string|null; preview: string }>
}

export default function NewCrimeReportPage() {
  const router  = useRouter()
  const [queue, setQueue]     = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)
  const [running,  setRunning]  = useState(false)

  function update(uid: string, patch: Partial<FileEntry>) {
    setQueue(q => q.map(e => e.uid === uid ? { ...e, ...patch } : e))
  }

  async function addFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    const entries: FileEntry[] = arr.map(f => ({
      uid:      uid(),
      file:     f,
      status:   'parsing',
      title:    f.name.replace(/\.[^.]+$/, ''),
      erdr:     '',
      location: '',
      date:     '',
      preview:  '',
      autoFill: false,
    }))
    setQueue(q => [...q, ...entries])

    // Паралельно парсимо всі файли
    await Promise.all(entries.map(async entry => {
      try {
        const data = await quickParse(entry.file)
        const nameFromFile = entry.file.name.replace(/\.[^.]+$/, '')
        const patch: Partial<FileEntry> = { status: 'ready' }
        if (data) {
          patch.title    = data.title    || nameFromFile
          patch.erdr     = data.erdr     || ''
          patch.location = data.location || ''
          patch.date     = data.date     || ''
          patch.preview  = data.preview  || ''
          patch.autoFill = !!(data.title || data.erdr || data.location || data.date)
        }
        update(entry.uid, patch)
      } catch {
        update(entry.uid, { status: 'ready' })
      }
    }))
  }

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function uploadAll() {
    const pending = queue.filter(e => e.status === 'ready')
    if (!pending.length) return
    setRunning(true)

    for (const entry of pending) {
      update(entry.uid, { status: 'uploading' })
      try {
        const form = new FormData()
        form.append('file',  entry.file)
        form.append('title', entry.title || entry.file.name)
        if (entry.erdr)     form.append('erdr_number',   entry.erdr)
        if (entry.location) form.append('location',      entry.location)
        if (entry.date)     form.append('incident_date', entry.date)

        const res  = await fetch('/api/crime-reports', { method: 'POST', body: form })
        const json = await res.json()

        if (res.status === 409) {
          update(entry.uid, { status: 'duplicate', error: `ЄРДР ${entry.erdr} вже існує` })
        } else if (!res.ok) {
          update(entry.uid, { status: 'error', error: json.error ?? 'Помилка завантаження' })
        } else {
          update(entry.uid, { status: 'done', result: json })
        }
      } catch (err) {
        update(entry.uid, { status: 'error', error: String(err) })
      }
    }
    setRunning(false)
  }

  function removeEntry(u: string) {
    setQueue(q => q.filter(e => e.uid !== u))
  }

  const doneCount      = queue.filter(e => e.status === 'done').length
  const pendingCount   = queue.filter(e => e.status === 'ready').length
  const parsingCount   = queue.filter(e => e.status === 'parsing').length

  return (
    <div className="flex-1 p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/crime-reports')}
                className="p-2 rounded-lg hover:bg-white/5 transition"
                style={{ color:'var(--odb-text-faint)' }}>←</button>
        <div>
          <h1 className="text-xl font-bold text-white">Завантажити довідки</h1>
          <p className="text-xs mt-0.5" style={{ color:'var(--odb-text-faint)' }}>
            PDF / DOCX / XLSX · можна кілька файлів одразу
          </p>
        </div>
        {queue.length > 0 && (
          <div className="ml-auto flex items-center gap-3">
            {parsingCount > 0 && (
              <span className="text-xs" style={{ color:'var(--odb-text-faint)' }}>
                Читаємо {parsingCount} файл(ів)...
              </span>
            )}
            {pendingCount > 0 && (
              <button onClick={uploadAll} disabled={running || parsingCount > 0}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-black disabled:opacity-50"
                      style={{ background:'linear-gradient(135deg, var(--odb-accent-hi), var(--odb-accent-lo))' }}>
                {running ? 'Завантажуємо...' : `Завантажити ${pendingCount} файл${pendingCount > 1 ? 'и' : ''}`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById('file-input')?.click()}
        className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 cursor-pointer transition-all"
        style={{
          borderColor: dragging ? 'var(--odb-accent-hi)' : 'var(--odb-border-soft)',
          background:  dragging ? 'var(--odb-accent-glow)' : 'var(--odb-surface)',
          minHeight: queue.length ? '100px' : '180px',
        }}
      >
        <input id="file-input" type="file" accept={ACCEPT} multiple className="hidden"
               onChange={e => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = '' } }} />
        <div className="text-2xl">{dragging ? '📂' : queue.length ? '➕' : '⬆️'}</div>
        <div className="text-center">
          <p className="text-white text-sm font-medium">
            {queue.length ? 'Додати ще файли' : 'Перетягніть файли або клікніть'}
          </p>
          <p className="text-xs mt-0.5" style={{ color:'var(--odb-text-faint)' }}>
            PDF, DOCX, XLSX · декілька файлів одночасно
          </p>
        </div>
      </div>

      {/* File queue */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {/* Summary */}
          {doneCount > 0 && (
            <div className="text-xs px-3 py-2 rounded-lg"
                 style={{ background:'rgba(34,197,94,0.1)', color:'#22c55e' }}>
              ✓ {doneCount} з {queue.length} успішно завантажено
            </div>
          )}

          {queue.map(entry => (
            <FileCard key={entry.uid} entry={entry}
                      onChange={(patch) => update(entry.uid, patch)}
                      onRemove={() => removeEntry(entry.uid)}
                      onOpenReport={() => router.push(`/crime-reports/${entry.result!.id}`)} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {queue.length === 0 && (
        <div className="text-center py-6 text-sm" style={{ color:'var(--odb-text-faint)' }}>
          Після вибору файлів система автоматично заповнить ЄРДР, дату та місце події
        </div>
      )}
    </div>
  )
}

// ── FileCard ──────────────────────────────────────────────────────────────────

interface FileCardProps {
  entry:        FileEntry
  onChange:     (p: Partial<FileEntry>) => void
  onRemove:     () => void
  onOpenReport: () => void
}

const STATUS_ICON: Record<string, string> = {
  parsing:    '⏳',
  ready:      '📄',
  uploading:  '⬆️',
  done:       '✅',
  duplicate:  '⚠️',
  error:      '❌',
}

const FILE_ICON: Record<string, string> = {
  pdf: '📕', docx: '📘', xlsx: '📗',
}

function FileCard({ entry, onChange, onRemove, onOpenReport }: FileCardProps) {
  const ext  = entry.file.name.split('.').pop()?.toLowerCase() ?? ''
  const icon = FILE_ICON[ext] ?? '📄'
  const done = entry.status === 'done'
  const busy = entry.status === 'parsing' || entry.status === 'uploading'

  return (
    <div className="rounded-2xl border p-4 space-y-3 transition-all"
         style={{
           background: 'var(--odb-surface)',
           borderColor: done ? 'rgba(34,197,94,0.3)'
             : entry.status === 'error' || entry.status === 'duplicate' ? 'rgba(239,68,68,0.3)'
             : 'var(--odb-border-soft)',
         }}>

      {/* Top row: icon + name + status + remove */}
      <div className="flex items-start gap-3">
        <span className="text-xl mt-0.5 shrink-0">{STATUS_ICON[entry.status]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">{icon}</span>
            <span className="text-sm font-medium text-white truncate">{entry.file.name}</span>
            <span className="text-xs shrink-0" style={{ color:'var(--odb-text-faint)' }}>
              {(entry.file.size / 1024).toFixed(0)} KB
            </span>
            {entry.autoFill && entry.status === 'ready' && (
              <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
                    style={{ background:'rgba(34,197,94,0.15)', color:'#22c55e' }}>
                авто
              </span>
            )}
          </div>

          {/* Error/duplicate message */}
          {(entry.status === 'error' || entry.status === 'duplicate') && entry.error && (
            <p className="text-xs mt-1" style={{ color:'#ef4444' }}>{entry.error}</p>
          )}

          {/* Uploading spinner */}
          {entry.status === 'uploading' && (
            <p className="text-xs mt-1" style={{ color:'var(--odb-accent-hi)' }}>
              Завантаження та NER-аналіз...
            </p>
          )}

          {/* Parsing spinner */}
          {entry.status === 'parsing' && (
            <p className="text-xs mt-1" style={{ color:'var(--odb-text-faint)' }}>
              Читаємо документ...
            </p>
          )}

          {/* Done result */}
          {done && entry.result && (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs" style={{ color:'var(--odb-text-faint)' }}>
                Ризик: <span style={{ color: entry.result.risk_score >= 50 ? '#ef4444' : '#22c55e' }}>
                  {entry.result.risk_score}/100
                </span>
              </span>
              <span className="text-xs" style={{ color:'var(--odb-text-faint)' }}>
                Сутностей: {
                  entry.result.entities.names.length +
                  entry.result.entities.phones.length +
                  entry.result.entities.crypto.length +
                  entry.result.entities.vehicles.length
                }
              </span>
              <button onClick={onOpenReport}
                      className="text-xs underline"
                      style={{ color:'var(--odb-accent-hi)' }}>
                Відкрити →
              </button>
            </div>
          )}
        </div>

        {!busy && !done && (
          <button onClick={onRemove} className="shrink-0 text-xs p-1 rounded hover:bg-white/10"
                  style={{ color:'var(--odb-text-faint)' }}>✕</button>
        )}
      </div>

      {/* Editable metadata (only when ready) */}
      {entry.status === 'ready' && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="col-span-2">
            <input value={entry.title}
                   onChange={e => onChange({ title: e.target.value })}
                   placeholder="Назва довідки"
                   className="w-full px-2.5 py-1.5 rounded-lg text-sm text-white border outline-none"
                   style={{ background:'var(--odb-surface-2)', borderColor:'var(--odb-border-soft)' }} />
          </div>
          <input value={entry.erdr}
                 onChange={e => onChange({ erdr: e.target.value })}
                 placeholder="ЄРДР"
                 className="px-2.5 py-1.5 rounded-lg text-xs text-white border outline-none font-mono"
                 style={{ background:'var(--odb-surface-2)', borderColor: entry.erdr ? 'rgba(34,197,94,0.4)' : 'var(--odb-border-soft)' }} />
          <input type="date" value={entry.date}
                 onChange={e => onChange({ date: e.target.value })}
                 className="px-2.5 py-1.5 rounded-lg text-xs text-white border outline-none"
                 style={{ background:'var(--odb-surface-2)', borderColor: entry.date ? 'rgba(34,197,94,0.4)' : 'var(--odb-border-soft)' }} />
          <input value={entry.location}
                 onChange={e => onChange({ location: e.target.value })}
                 placeholder="Місце події"
                 className="col-span-2 px-2.5 py-1.5 rounded-lg text-xs text-white border outline-none"
                 style={{ background:'var(--odb-surface-2)', borderColor: entry.location ? 'rgba(34,197,94,0.4)' : 'var(--odb-border-soft)' }} />
        </div>
      )}

      {/* Preview */}
      {entry.preview && entry.status === 'ready' && (
        <p className="text-xs font-mono leading-relaxed px-2 border-l-2 truncate"
           style={{ color:'var(--odb-text-faint)', borderColor:'var(--odb-accent-hi)' }}>
          {entry.preview.slice(0, 120)}…
        </p>
      )}
    </div>
  )
}
