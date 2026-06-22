'use client'

import { useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Sidebar from '../components/Sidebar'
import Icon from '../components/Icon'
import type { FaceResult } from '../api/face-search/route'

type State = 'idle' | 'loading' | 'done' | 'error'

function FaceSearchContent() {
  const searchParams = useSearchParams()
  const initialUrl = searchParams.get('url') || ''

  const [photoUrl, setPhotoUrl]   = useState(initialUrl)
  const [preview,  setPreview]    = useState(initialUrl)
  const [state,    setState]      = useState<State>(initialUrl ? 'idle' : 'idle')
  const [results,  setResults]    = useState<FaceResult[]>([])
  const [error,    setError]      = useState('')
  const [dragOver, setDragOver]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ─── Upload file ────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { setError('Лише зображення (JPG, PNG, WEBP)'); return }
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)
    runSearch(file)
  }, [])

  // ─── Run search ─────────────────────────────────────────────────────────
  async function runSearch(input: File | string) {
    setState('loading')
    setError('')
    setResults([])

    try {
      let res: Response
      if (typeof input === 'string') {
        // URL mode
        res = await fetch('/api/face-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: input }),
        })
      } else {
        // File upload mode
        const form = new FormData()
        form.append('image', input)
        res = await fetch('/api/face-search', { method: 'POST', body: form })
      }

      const data = await res.json() as { results?: FaceResult[]; error?: string }
      if (!res.ok || data.error) {
        setError(data.error || `HTTP ${res.status}`)
        setState('error')
        return
      }
      setResults(data.results || [])
      setState('done')
    } catch (e) {
      setError(`Помилка з'єднання: ${String(e)}`)
      setState('error')
    }
  }

  function handleUrlSearch() {
    if (!photoUrl.trim()) return
    setPreview(photoUrl)
    runSearch(photoUrl)
  }

  function getDomain(url: string) {
    try { return new URL(url).hostname.replace('www.', '') } catch { return url }
  }

  function scoreColor(score: number) {
    if (score >= 80) return '#22c55e'
    if (score >= 60) return '#f59e0b'
    return '#94a3b8'
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)', color: 'var(--odb-text)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{ background: 'var(--odb-surface)', borderBottom: '1px solid var(--odb-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #db2777 0%, #9d174d 100%)', boxShadow: '0 0 16px rgba(219,39,119,0.3)' }}>
              <span className="text-xl">👁️</span>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Пошук за обличчям</h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--odb-text-dim)' }}>
                FaceCheck.ID · $0.30 за пошук
              </p>
            </div>
          </div>
          {state === 'done' && (
            <span className="text-xs px-3 py-1 rounded-full font-medium"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
              {results.length} збігів знайдено
            </span>
          )}
        </header>

        <div className="flex-1 p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">

          {/* Input area */}
          <div className="rounded-2xl border p-5"
            style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>

            <div className="flex gap-4 flex-col md:flex-row">

              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setDragOver(false)
                  const file = e.dataTransfer.files[0]
                  if (file) handleFile(file)
                }}
                className="relative flex-shrink-0 w-36 h-36 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden"
                style={{
                  borderColor: dragOver ? 'var(--odb-accent-hi)' : 'var(--odb-border)',
                  background: dragOver ? 'var(--odb-accent-glow)' : 'var(--odb-surface-2)',
                }}>
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <span className="text-3xl mb-1">📷</span>
                    <span className="text-xs text-center px-2" style={{ color: 'var(--odb-text-faint)' }}>
                      Натисни або перетягни фото
                    </span>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>

              {/* URL input + controls */}
              <div className="flex-1 flex flex-col gap-3">
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: 'var(--odb-text-dim)' }}>
                    або вставте URL фото
                  </label>
                  <input
                    value={photoUrl}
                    onChange={e => setPhotoUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleUrlSearch() }}
                    placeholder="https://example.com/photo.jpg"
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{
                      background: 'var(--odb-surface-2)',
                      borderColor: 'var(--odb-border-soft)',
                      color: 'var(--odb-text)',
                    }}
                  />
                </div>

                <button
                  onClick={handleUrlSearch}
                  disabled={!photoUrl.trim() || state === 'loading'}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-40 disabled:scale-100 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #db2777 0%, #9d174d 100%)', color: '#fff' }}>
                  {state === 'loading' ? (
                    <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Пошук…</>
                  ) : (
                    <><Icon name="search" size={16} /> Знайти за обличчям</>
                  )}
                </button>

                <div className="text-xs space-y-1" style={{ color: 'var(--odb-text-faint)' }}>
                  <p>▸ Пошук займає ~15-30 секунд</p>
                  <p>▸ Тестовий режим: безкоштовно, але результати порожні</p>
                  <p>▸ Продакшн: потрібен FACECHECK_API_TOKEN в Vercel</p>
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {state === 'error' && (
            <div className="rounded-xl p-4 border" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }}>
              <p className="text-sm font-medium" style={{ color: '#ef4444' }}>Помилка</p>
              <p className="text-xs mt-1" style={{ color: 'var(--odb-text-dim)' }}>{error}</p>
              {error.toLowerCase().includes('credits') && (
                <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'var(--odb-surface-2)', color: 'var(--odb-text-dim)' }}>
                  <p className="font-semibold mb-1" style={{ color: '#f59e0b' }}>💳 Потрібно поповнити баланс</p>
                  <p>API підключено і працює — кредити закінчились.</p>
                  <p className="mt-1">Зайди на <strong>facecheck.id → Account → Buy Credits</strong></p>
                  <p className="mt-1">$10 = ~33 пошуки · $30 = ~100 пошуків · $0.30 за пошук</p>
                </div>
              )}
              {error.includes('FACECHECK_API_TOKEN') && (
                <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'var(--odb-surface-2)', color: 'var(--odb-text-dim)' }}>
                  <p className="font-semibold mb-1" style={{ color: 'var(--odb-text)' }}>Як налаштувати:</p>
                  <p>1. Зареєструйтесь на <strong>facecheck.id</strong> і купіть кредити</p>
                  <p>2. Скопіюйте API токен</p>
                  <p>3. В Vercel → Settings → Environment Variables → додати <code>FACECHECK_API_TOKEN</code></p>
                  <p>4. Зробіть новий деплой</p>
                </div>
              )}
            </div>
          )}

          {/* Loading hint */}
          {state === 'loading' && (
            <div className="rounded-xl p-5 border flex items-center gap-4"
              style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>
              <div className="w-8 h-8 rounded-full border-2 animate-spin shrink-0"
                style={{ borderColor: 'rgba(219,39,119,0.3)', borderTopColor: '#db2777' }} />
              <div>
                <p className="text-sm font-medium">Аналізуємо обличчя…</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--odb-text-dim)' }}>
                  FaceCheck сканує мільярди фото у відкритому інтернеті. Це займає 15-30 секунд.
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {state === 'done' && results.length === 0 && (
            <div className="rounded-xl p-8 border text-center"
              style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>
              <span className="text-4xl">🔍</span>
              <p className="text-sm mt-3" style={{ color: 'var(--odb-text-dim)' }}>
                Збігів не знайдено. Можливо, ви в тестовому режимі (demo) — результати не повертаються.
              </p>
            </div>
          )}

          {state === 'done' && results.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-3 tracking-wider uppercase" style={{ color: 'var(--odb-text-faint)' }}>
                Знайдені збіги — {results.length}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {results.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg block"
                    style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}>

                    {/* Thumbnail */}
                    <div className="h-40 bg-black flex items-center justify-center overflow-hidden">
                      {r.base64 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`data:image/jpeg;base64,${r.base64}`}
                          alt="match"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-4xl">👤</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono truncate" style={{ color: 'var(--odb-text-dim)' }}>
                          {getDomain(r.url)}
                        </span>
                        <span className="text-xs font-bold shrink-0 ml-2"
                          style={{ color: scoreColor(r.score) }}>
                          {r.score}%
                        </span>
                      </div>
                      <p className="text-xs truncate" style={{ color: 'var(--odb-text-faint)' }}>
                        {r.url}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default function FaceSearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)' }}>
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--odb-accent-hi)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    }>
      <FaceSearchContent />
    </Suspense>
  )
}
