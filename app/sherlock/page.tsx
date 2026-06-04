'use client'

import { useState, useRef } from 'react'
import Sidebar from '../components/Sidebar'

type Mode = 'quick' | 'full'
type Tool = 'sherlock' | 'chimera' | 'both'

interface FoundItem {
  site: string
  url:  string
  ids?: Record<string, string>
}

function SocialGrid({ found, label }: { found: FoundItem[]; label: string }) {
  const PRIORITY = ['VK','OK','Instagram','Twitter','X','Facebook','Telegram','TikTok',
    'YouTube','LinkedIn','GitHub','GitLab','Discord','Reddit','Twitch','Pinterest',
    'Tumblr','Medium','Steam','Spotify','SoundCloud','Snapchat']

  const sorted = [...found].sort((a, b) => {
    const ai = PRIORITY.indexOf(a.site)
    const bi = PRIORITY.indexOf(b.site)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  if (!found.length) return (
    <div className="text-gray-500 text-sm py-4 text-center">Профілів не знайдено</div>
  )

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        {label}: <span className="text-white font-bold">{found.length}</span> знайдено
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
        {sorted.map((f, i) => (
          <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700
                       border border-gray-700 rounded-lg px-3 py-2 transition group">
            <span className="text-blue-400 group-hover:text-blue-300 shrink-0">↗</span>
            <div className="min-w-0">
              <div className="font-semibold text-white text-xs truncate">{f.site}</div>
              <div className="text-gray-500 text-xs truncate">
                {f.url.replace(/^https?:\/\//, '').slice(0, 35)}
              </div>
            </div>
            {f.ids && Object.keys(f.ids).length > 0 && (
              <span className="ml-auto text-xs bg-purple-900/40 text-purple-300 px-1.5 py-0.5 rounded shrink-0">
                +дані
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}

export default function SherlockPage() {
  const [username,    setUsername]    = useState('')
  const [mode,        setMode]        = useState<Mode>('quick')
  const [tool,        setTool]        = useState<Tool>('both')
  const [loading,     setLoading]     = useState(false)
  const [sherlockRes, setSherlockRes] = useState<any>(null)
  const [chimeraRes,  setChimeraRes]  = useState<any>(null)
  const [error,       setError]       = useState('')
  const abortRef = useRef<AbortController | null>(null)

  async function run() {
    const q = username.trim().replace(/^@/, '')
    if (!q) return

    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setLoading(true); setError(''); setSherlockRes(null); setChimeraRes(null)

    const promises: Promise<void>[] = []

    if (tool === 'sherlock' || tool === 'both') {
      promises.push(
        fetch('/api/osint/sherlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: q, mode, timeout: mode === 'quick' ? 5 : 20 }),
          signal: abortRef.current.signal,
        }).then(r => r.json()).then(setSherlockRes).catch(e => {
          if (e.name !== 'AbortError') setSherlockRes({ error: e.message, found: [], total: 0 })
        })
      )
    }

    if (tool === 'chimera' || tool === 'both') {
      promises.push(
        fetch('/api/osint/chimera', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: q, timeout: 30 }),
          signal: abortRef.current.signal,
        }).then(r => r.json()).then(setChimeraRes).catch(e => {
          if (e.name !== 'AbortError') setChimeraRes({ error: e.message, found: [], total: 0 })
        })
      )
    }

    await Promise.allSettled(promises)
    setLoading(false)
  }

  const totalFound = (sherlockRes?.total || 0) + (chimeraRes?.total || 0)

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-bold text-white">🔍 Sherlock & Химера</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Sherlock 400+ соцмереж · Maigret/Chimera 3000+ сайтів · Username hunter
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 border border-yellow-800 rounded">
              Sherlock v0.16
            </span>
            <span className="px-2 py-1 bg-purple-900/30 text-purple-400 border border-purple-800 rounded">
              Maigret v0.6.1
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl">

            {/* Search input */}
            <div className="mb-5">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                  <input
                    autoFocus
                    value={username}
                    onChange={e => setUsername(e.target.value.replace(/^@/, ''))}
                    onKeyDown={e => e.key === 'Enter' && run()}
                    placeholder="username"
                    className="w-full pl-8 pr-4 py-3 bg-gray-800 border-2 border-gray-600 rounded-xl text-white
                               font-mono text-base focus:border-yellow-500 focus:outline-none placeholder-gray-600"
                  />
                </div>
                <button onClick={run} disabled={!username.trim() || loading}
                  className="px-6 py-3 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40
                             rounded-xl font-bold text-sm transition shrink-0">
                  {loading ? <span className="animate-spin inline-block">⟳</span> : '🔍 Шукати'}
                </button>
                {loading && (
                  <button onClick={() => { abortRef.current?.abort(); setLoading(false) }}
                    className="px-4 py-3 bg-red-800 hover:bg-red-700 rounded-xl text-sm transition shrink-0">
                    ✕
                  </button>
                )}
              </div>

              {/* Options */}
              <div className="flex flex-wrap gap-3 mt-3">
                {/* Tool selector */}
                <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 border border-gray-700">
                  {([['both', '🔍+🧬 Обидва'], ['sherlock', '🔍 Sherlock'], ['chimera', '🧬 Химера']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setTool(v)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                        tool === v ? 'bg-blue-700 text-white' : 'text-gray-400 hover:text-white'
                      }`}>
                      {l}
                    </button>
                  ))}
                </div>

                {/* Mode selector (Sherlock only) */}
                {(tool === 'sherlock' || tool === 'both') && (
                  <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 border border-gray-700">
                    <span className="text-xs text-gray-500 px-2">Sherlock:</span>
                    {([['quick', '⚡ Quick (30 сайтів, ~8с)'], ['full', '🌐 Full (400+ сайтів, ~2хв)']] as const).map(([v, l]) => (
                      <button key={v} onClick={() => setMode(v)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          mode === v ? 'bg-yellow-700 text-white' : 'text-gray-400 hover:text-white'
                        }`}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Examples */}
              <div className="flex flex-wrap gap-2 mt-3">
                {['ivanov_ivan', 'test123', 'vmak0001', 'putinvladimir', 'shoigu'].map(ex => (
                  <button key={ex} onClick={() => { setUsername(ex); }}
                    className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400
                               hover:text-white rounded-lg border border-gray-700 transition font-mono">
                    @{ex}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl p-3 mb-4 text-sm">
                ⚠️ {error}
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center">
                <div className="text-2xl mb-2 animate-spin">⟳</div>
                <p className="text-gray-400 text-sm">
                  {tool === 'both' ? 'Запущено Sherlock та Химера...' :
                   tool === 'sherlock' ? 'Sherlock сканує 400+ соцмереж...' :
                   'Maigret/Chimera досліджує 3000+ сайтів...'}
                </p>
                <p className="text-gray-600 text-xs mt-1">
                  {mode === 'full' ? 'Full mode може тривати до 2 хвилин' : 'Quick mode ~8-15 секунд'}
                </p>
              </div>
            )}

            {/* Results */}
            {!loading && (sherlockRes || chimeraRes) && (
              <>
                {/* Summary */}
                <div className={`mb-5 px-4 py-3 rounded-xl border ${
                  totalFound > 0 ? 'bg-green-950/20 border-green-800' : 'bg-gray-800 border-gray-700'
                }`}>
                  <span className={`font-bold text-lg ${totalFound > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                    {totalFound > 0 ? `✅ ${totalFound} профілів знайдено` : '❌ Нічого не знайдено'}
                  </span>
                  <span className="text-gray-500 text-sm ml-2">для @{username.replace(/^@/, '')}</span>
                </div>

                {/* Sherlock results */}
                {sherlockRes && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="font-bold text-yellow-400">🔍 Sherlock</h2>
                      <span className="text-xs text-gray-500">{mode === 'quick' ? '30 ключових сайтів' : '400+ сайтів'}</span>
                      {sherlockRes.error ? (
                        <span className="text-xs text-red-400">⚠ {sherlockRes.error}</span>
                      ) : (
                        <span className="text-xs bg-yellow-900/40 text-yellow-300 px-2 py-0.5 rounded">
                          {sherlockRes.total} знайдено
                        </span>
                      )}
                    </div>
                    <SocialGrid found={sherlockRes.found || []} label="Sherlock" />
                  </div>
                )}

                {/* Chimera results */}
                {chimeraRes && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="font-bold text-purple-400">🧬 Химера (Maigret)</h2>
                      <span className="text-xs text-gray-500">3000+ сайтів, RU/CIS фокус</span>
                      {chimeraRes.error ? (
                        <span className="text-xs text-red-400">⚠ {chimeraRes.error}</span>
                      ) : (
                        <span className="text-xs bg-purple-900/40 text-purple-300 px-2 py-0.5 rounded">
                          {chimeraRes.total} знайдено
                        </span>
                      )}
                    </div>
                    <SocialGrid found={chimeraRes.found || []} label="Chimera" />
                  </div>
                )}
              </>
            )}

            {/* Intro */}
            {!loading && !sherlockRes && !chimeraRes && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-900 border border-yellow-900/40 rounded-xl p-4">
                    <div className="text-2xl mb-2">🔍</div>
                    <div className="font-bold text-yellow-400 mb-1">Sherlock</div>
                    <p className="text-xs text-gray-500">400+ соцмереж</p>
                    <div className="mt-3 space-y-1 text-xs text-gray-600">
                      <p>⚡ Quick: 30 ключових, ~8с</p>
                      <p>🌐 Full: всі 400+, ~2хв</p>
                      <p>GitHub, VK, Instagram, Telegram і т.д.</p>
                    </div>
                  </div>
                  <div className="bg-gray-900 border border-purple-900/40 rounded-xl p-4">
                    <div className="text-2xl mb-2">🧬</div>
                    <div className="font-bold text-purple-400 mb-1">Химера (Maigret)</div>
                    <p className="text-xs text-gray-500">3000+ сайтів</p>
                    <div className="mt-3 space-y-1 text-xs text-gray-600">
                      <p>🇷🇺 RU/CIS платформи: VK, OK, Mail.ru</p>
                      <p>📊 Витягує додаткові дані з профілів</p>
                      <p>⏱ ~2-5 хвилин (глибокий аналіз)</p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-4 text-xs text-gray-400">
                  <p className="font-semibold text-amber-400 mb-1">💡 Порада:</p>
                  <p>Для швидкого пошуку — Quick mode Sherlock (8с). Для глибокого OSINT — запустіть обидва інструменти або Full mode Sherlock + Chimera разом.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
