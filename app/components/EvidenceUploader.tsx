'use client'
// components/EvidenceUploader.tsx
// Блок 2: Управління доказами — фото, відео, документи
// Drag & Drop завантаження + галерея

import { useState, useEffect, useRef, useCallback } from 'react'

interface EvidenceItem {
  id: string
  ev_type: 'photo' | 'video' | 'document' | 'audio' | string
  file_url: string
  original_name: string
  file_size: number
  mime_type: string
  description?: string
  source?: string
  date_captured?: string
  location?: string
  created_at: string
}

interface Props {
  personId: string
  incidentId?: string
}

const SOURCE_LABELS: Record<string, string> = {
  manual:       '✋ Вручну',
  telegram:     '💬 Telegram',
  field:        '🏕️ Польова зйомка',
  confiscated:  '🎖️ Трофейний',
}

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(type: string, mime: string): string {
  if (type === 'photo') return '🖼️'
  if (type === 'video') return '🎬'
  if (type === 'audio') return '🎵'
  if (mime === 'application/pdf') return '📄'
  if (mime.includes('word')) return '📝'
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '📊'
  return '📁'
}

// ─── Лайтбокс для фото ───────────────────────────────────────────
function PhotoLightbox({ items, index, onClose }: {
  items: EvidenceItem[]; index: number; onClose: () => void
}) {
  const [current, setCurrent] = useState(index)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setCurrent(i => Math.min(i + 1, items.length - 1))
      if (e.key === 'ArrowLeft')  setCurrent(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [items.length, onClose])

  const item = items[current]
  return (
    <div
      className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <button className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10" onClick={onClose}>✕</button>

      {current > 0 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10 px-3"
          onClick={e => { e.stopPropagation(); setCurrent(i => i - 1) }}
        >‹</button>
      )}
      {current < items.length - 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10 px-3"
          onClick={e => { e.stopPropagation(); setCurrent(i => i + 1) }}
        >›</button>
      )}

      <div className="max-w-5xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
        <img
          src={item.file_url}
          alt={item.original_name}
          className="max-h-[80vh] max-w-full object-contain rounded-lg"
        />
        <div className="mt-3 text-center">
          <p className="text-white text-sm">{item.description || item.original_name}</p>
          {item.date_captured && <p className="text-gray-400 text-xs mt-1">📅 {item.date_captured}</p>}
          {item.location && <p className="text-gray-400 text-xs">📍 {item.location}</p>}
          <p className="text-gray-600 text-xs mt-1">{current + 1} / {items.length}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Відео плеєр ──────────────────────────────────────────────────
function VideoPlayer({ item }: { item: EvidenceItem }) {
  const ytMatch = item.file_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  if (ytMatch) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${ytMatch[1]}`}
        className="w-full aspect-video rounded-lg"
        allowFullScreen
      />
    )
  }
  return (
    <video
      src={item.file_url}
      controls
      className="w-full max-h-64 rounded-lg bg-black"
      preload="metadata"
    />
  )
}

// ─── Drag & Drop зона ────────────────────────────────────────────
function DropZone({ onFiles, uploading }: {
  onFiles: (files: File[]) => void
  uploading: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) onFiles(files)
  }, [onFiles])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files)
    if (files.length > 0) onFiles(files)
  }, [onFiles])

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
        ${dragging ? 'border-blue-400 bg-blue-900/20' : 'border-gray-600 hover:border-gray-500'}
        ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.html,.htm,.csv,.json,.zip,.rar,.7z"
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files || [])
          if (files.length > 0) onFiles(files)
          e.target.value = ''
        }}
      />
      {uploading ? (
        <div>
          <div className="text-3xl mb-2 animate-pulse">⏳</div>
          <p className="text-gray-400 text-sm">Завантаження...</p>
        </div>
      ) : (
        <div>
          <div className="text-3xl mb-2">📎</div>
          <p className="text-white text-sm font-medium">Перетягни файли або натисни</p>
          <p className="text-gray-500 text-xs mt-1">Фото · Відео · PDF · Word · Excel · HTML · до 100 MB</p>
          <p className="text-gray-600 text-xs mt-1">Ctrl+V для вставки зі скріншоту</p>
        </div>
      )}
    </div>
  )
}

// ─── Головний компонент ───────────────────────────────────────────
export default function EvidenceUploader({ personId, incidentId }: Props) {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<{ items: EvidenceItem[]; index: number } | null>(null)
  const [activeTab, setActiveTab] = useState<'photos' | 'videos' | 'documents' | 'all'>('all')

  // Поля для метаданих завантаження
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadSource, setUploadSource] = useState('manual')
  const [uploadDate, setUploadDate] = useState('')
  const [uploadLocation, setUploadLocation] = useState('')
  const [showMeta, setShowMeta] = useState(false)

  const photos    = evidence.filter(e => e.ev_type === 'photo')
  const videos    = evidence.filter(e => e.ev_type === 'video')
  const documents = evidence.filter(e => e.ev_type === 'document' || e.ev_type === 'audio')

  // Завантажуємо список доказів
  useEffect(() => {
    loadEvidence()
  }, [personId])

  async function loadEvidence() {
    setLoading(true)
    try {
      const id = personId
      const res = await fetch(`/api/evidence/${id}?type=person`)
      const data = await res.json()
      if (data.evidence) setEvidence(data.evidence)
    } catch {
      // silently fail — таблиця може ще не існувати
    } finally {
      setLoading(false)
    }
  }

  // Завантаження файлів
  async function uploadFiles(files: File[]) {
    setUploading(true)
    setError('')
    let successCount = 0

    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('person_id', personId)
        if (incidentId) formData.append('incident_id', incidentId)
        if (uploadDescription) formData.append('description', uploadDescription)
        formData.append('source', uploadSource)
        if (uploadDate) formData.append('date_captured', uploadDate)
        if (uploadLocation) formData.append('location', uploadLocation)

        const res = await fetch('/api/evidence/upload', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()

        if (data.error) {
          setError(data.error)
          break
        }
        if (data.evidence) {
          setEvidence(prev => [data.evidence, ...prev])
          successCount++
          // Автоматично перемикаємо на відповідну вкладку
          const t = data.evidence.ev_type
          if (t === 'photo') setActiveTab('photos')
          else if (t === 'video') setActiveTab('videos')
          else setActiveTab('documents')
        }
      } catch (e: any) {
        setError(e.message)
      }
    }

    setUploading(false)
    if (successCount > 0) {
      setUploadDescription('')
    }
  }

  // Видалення доказу
  async function deleteEvidence(id: string) {
    if (!confirm('Видалити файл? Дію не можна скасувати.')) return
    try {
      await fetch(`/api/evidence/${id}`, { method: 'DELETE' })
      setEvidence(prev => prev.filter(e => e.id !== id))
    } catch (e: any) {
      setError(e.message)
    }
  }

  const tabCounts = {
    photos: photos.length,
    videos: videos.length,
    documents: documents.length,
    all: evidence.length,
  }

  return (
    <div className="space-y-6">
      {/* Лайтбокс */}
      {lightbox && (
        <PhotoLightbox
          items={lightbox.items}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Зона завантаження */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-green-400 font-semibold text-sm">➕ Додати докази</h3>
          <button
            onClick={() => setShowMeta(p => !p)}
            className="text-gray-500 hover:text-gray-300 text-xs"
          >
            {showMeta ? '▲ Приховати метадані' : '▼ Метадані (опція)'}
          </button>
        </div>

        {showMeta && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <input
              type="text"
              placeholder="Опис / підпис"
              value={uploadDescription}
              onChange={e => setUploadDescription(e.target.value)}
              className="col-span-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-green-500 focus:outline-none"
            />
            <select
              value={uploadSource}
              onChange={e => setUploadSource(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none"
            >
              {Object.entries(SOURCE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <input
              type="date"
              value={uploadDate}
              onChange={e => setUploadDate(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none"
            />
            <input
              type="text"
              placeholder="📍 Місце (населений пункт)"
              value={uploadLocation}
              onChange={e => setUploadLocation(e.target.value)}
              className="col-span-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-green-500 focus:outline-none"
            />
          </div>
        )}

        <DropZone onFiles={uploadFiles} uploading={uploading} />

        {error && (
          <div className="mt-3 p-3 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Вкладки */}
      <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1">
        {(['photos', 'videos', 'documents', 'all'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition ${
              activeTab === tab
                ? 'bg-gray-700 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'photos'    && `🖼️ Фото (${tabCounts.photos})`}
            {tab === 'videos'    && `🎬 Відео (${tabCounts.videos})`}
            {tab === 'documents' && `📁 Документи (${tabCounts.documents})`}
            {tab === 'all'       && `📋 Всі (${tabCounts.all})`}
          </button>
        ))}
      </div>

      {/* Контент вкладок */}
      {loading ? (
        <div className="text-center py-12 text-gray-600">
          <div className="text-3xl mb-2 animate-pulse">⏳</div>
          <p className="text-sm">Завантаження...</p>
        </div>
      ) : (
        <>
          {/* ФОТО */}
          {(activeTab === 'photos' || activeTab === 'all') && photos.length > 0 && (
            <div>
              {activeTab === 'all' && <h4 className="text-gray-400 text-xs uppercase mb-3">🖼️ Фото ({photos.length})</h4>}
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {photos.map((item, idx) => (
                  <div
                    key={item.id}
                    className="relative group aspect-square rounded-lg overflow-hidden bg-gray-900 cursor-pointer"
                    onClick={() => setLightbox({ items: photos, index: idx })}
                  >
                    <img
                      src={item.file_url}
                      alt={item.original_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all">
                      <button
                        onClick={e => { e.stopPropagation(); deleteEvidence(item.id) }}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-600 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                      >✕</button>
                    </div>
                    {item.description && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                        <p className="text-white text-xs truncate">{item.description}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'photos' && photos.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <p className="text-5xl mb-3">🖼️</p>
              <p>Фото ще не додано</p>
              <p className="text-sm mt-1">Перетягни зображення або встав (Ctrl+V)</p>
            </div>
          )}

          {/* ВІДЕО */}
          {(activeTab === 'videos' || activeTab === 'all') && videos.length > 0 && (
            <div>
              {activeTab === 'all' && <h4 className="text-gray-400 text-xs uppercase mb-3 mt-4">🎬 Відео ({videos.length})</h4>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {videos.map(item => (
                  <div key={item.id} className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
                    <VideoPlayer item={item} />
                    <div className="p-3 flex items-start justify-between">
                      <div>
                        <p className="text-gray-300 text-sm">{item.description || item.original_name}</p>
                        <div className="flex gap-2 mt-1">
                          {item.date_captured && <span className="text-gray-500 text-xs">📅 {item.date_captured}</span>}
                          {item.location && <span className="text-gray-500 text-xs">📍 {item.location}</span>}
                          {item.source && <span className="text-gray-600 text-xs">{SOURCE_LABELS[item.source] || item.source}</span>}
                        </div>
                      </div>
                      <button onClick={() => deleteEvidence(item.id)} className="text-gray-600 hover:text-red-400 text-xs ml-2">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'videos' && videos.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <p className="text-5xl mb-3">🎬</p>
              <p>Відео ще не додано</p>
            </div>
          )}

          {/* ДОКУМЕНТИ */}
          {(activeTab === 'documents' || activeTab === 'all') && documents.length > 0 && (
            <div>
              {activeTab === 'all' && <h4 className="text-gray-400 text-xs uppercase mb-3 mt-4">📁 Документи ({documents.length})</h4>}
              <div className="space-y-2">
                {documents.map(item => (
                  <div key={item.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center gap-4">
                    <span className="text-2xl flex-shrink-0">{fileIcon(item.ev_type, item.mime_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {item.description || item.original_name}
                      </p>
                      <div className="flex gap-3 mt-1 flex-wrap">
                        <span className="text-gray-500 text-xs">{item.mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                        {item.file_size && <span className="text-gray-500 text-xs">{formatSize(item.file_size)}</span>}
                        {item.date_captured && <span className="text-gray-500 text-xs">📅 {item.date_captured}</span>}
                        {item.location && <span className="text-gray-500 text-xs">📍 {item.location}</span>}
                        {item.source && <span className="text-gray-600 text-xs">{SOURCE_LABELS[item.source] || item.source}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <a
                        href={
                          // HTML/текстові файли — через проксі (Supabase блокує рендеринг)
                          item.mime_type === 'text/html' || item.mime_type === 'text/htm'
                            ? `/api/evidence/view/${item.id}`
                            : item.file_url
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-blue-300 rounded-lg text-xs transition"
                      >Відкрити →</a>
                      <a
                        href={item.file_url}
                        download={item.original_name}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition"
                        title="Завантажити файл"
                      >⬇</a>
                      <button
                        onClick={() => deleteEvidence(item.id)}
                        className="px-2 py-1.5 bg-red-950 hover:bg-red-900 text-red-400 rounded-lg text-xs transition"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'documents' && documents.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <p className="text-5xl mb-3">📁</p>
              <p>Документи ще не додано</p>
              <p className="text-sm mt-1">PDF, Word, Excel, фото документів</p>
            </div>
          )}

          {/* ALL — порожньо */}
          {activeTab === 'all' && evidence.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <p className="text-5xl mb-3">🗂️</p>
              <p>Доказів ще не додано</p>
              <p className="text-sm mt-1">Перетягни файли вгору або натисни на зону завантаження</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
