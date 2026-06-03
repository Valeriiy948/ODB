'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../components/Sidebar'

// ─── Платформи ──────────────────────────────────────────────────────────────────
const PLATFORMS = [
  { key: 'vk',         icon: '💙', label: 'VK',          color: 'blue',   description: 'Пошук по імені / рік народження' },
  { key: 'instagram',  icon: '📸', label: 'Instagram',   color: 'pink',   description: 'Username або варіанти з імені' },
  { key: 'tiktok',     icon: '🎵', label: 'TikTok',      color: 'black',  description: 'Username або транслітерація' },
  { key: 'facebook',   icon: '👥', label: 'Facebook',    color: 'blue',   description: 'Публічний пошук по імені' },
  { key: 'telegram',   icon: '✈️', label: 'Telegram',    color: 'cyan',   description: 'Username / номер телефону' },
  { key: 'getcontact', icon: '📞', label: 'GetContact',  color: 'green',  description: 'Як номер збережено у контактах' },
  { key: 'username',   icon: '🌐', label: '17 платформ', color: 'purple', description: 'GitHub, Reddit, Steam, LinkedIn...' },
]

const PLATFORM_COLORS: Record<string, string> = {
  blue:   'bg-blue-900/30 border-blue-700/50 text-blue-300',
  pink:   'bg-pink-900/30 border-pink-700/50 text-pink-300',
  black:  'bg-gray-800/60 border-gray-600/50 text-gray-200',
  cyan:   'bg-cyan-900/30 border-cyan-700/50 text-cyan-300',
  green:  'bg-green-900/30 border-green-700/50 text-green-300',
  purple: 'bg-purple-900/30 border-purple-700/50 text-purple-300',
}

interface SocialProfile {
  platform: string
  username?: string
  full_name?: string
  url: string
  followers?: number
  following?: number
  posts?: number
  likes?: number
  bio?: string
  is_private?: boolean
  is_verified?: boolean
  profile_pic?: string
  found_at?: string
  _score?: number
  names?: string[]   // getcontact
  phone?: string     // getcontact
}

function PlatformBadge({ platform }: { platform: string }) {
  const p = PLATFORMS.find(x => x.key === platform.toLowerCase())
  if (!p) return <span className="text-gray-500 text-xs px-1.5 py-0.5 rounded bg-gray-700">{platform}</span>
  const colors = PLATFORM_COLORS[p.color] || PLATFORM_COLORS.blue
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colors}`}>
      {p.icon} {p.label}
    </span>
  )
}

function ProfileCard({ profile, onOpen }: { profile: SocialProfile; onOpen: (url: string) => void }) {
  const p = PLATFORMS.find(x => x.key === profile.platform?.toLowerCase())

  // GetContact — особлива картка
  if (profile.platform === 'getcontact' || profile.platform === 'numbuster') {
    return (
      <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <PlatformBadge platform={profile.platform} />
          <span className="text-gray-400 text-xs">{profile.phone}</span>
        </div>
        <p className="text-gray-300 text-sm font-medium">Збережено як:</p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {(profile.names || []).map((name, i) => (
            <span key={i} className="bg-green-800/50 text-green-200 text-xs px-2 py-1 rounded-lg">{name}</span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 hover:border-gray-500 transition cursor-pointer group"
      onClick={() => onOpen(profile.url)}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {profile.profile_pic ? (
          <img
            src={profile.profile_pic}
            alt=""
            className="w-12 h-12 rounded-full object-cover flex-shrink-0 border border-gray-600"
            onError={e => { (e.target as any).style.display = 'none' }}
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 text-xl">
            {p?.icon || '👤'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <PlatformBadge platform={profile.platform} />
            {profile.is_verified && <span className="text-blue-400 text-xs">✓ Верифіковано</span>}
            {profile.is_private && <span className="text-yellow-500 text-xs">🔒 Закритий</span>}
          </div>
          <p className="text-white font-semibold mt-1 truncate">
            {profile.full_name || profile.username || profile.url}
          </p>
          {profile.username && profile.full_name && (
            <p className="text-gray-500 text-xs">@{profile.username}</p>
          )}
        </div>
        <a
          href={profile.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-gray-500 hover:text-blue-400 transition text-sm flex-shrink-0"
        >
          ↗
        </a>
      </div>

      {/* Stats */}
      {(profile.followers !== undefined || profile.posts !== undefined) && (
        <div className="flex gap-4 mt-3 pt-3 border-t border-gray-700/50">
          {profile.followers !== undefined && (
            <div className="text-center">
              <p className="text-white text-sm font-semibold">{fmtNum(profile.followers)}</p>
              <p className="text-gray-500 text-xs">підп.</p>
            </div>
          )}
          {profile.following !== undefined && (
            <div className="text-center">
              <p className="text-white text-sm font-semibold">{fmtNum(profile.following)}</p>
              <p className="text-gray-500 text-xs">підписок</p>
            </div>
          )}
          {profile.posts !== undefined && (
            <div className="text-center">
              <p className="text-white text-sm font-semibold">{fmtNum(profile.posts)}</p>
              <p className="text-gray-500 text-xs">публ.</p>
            </div>
          )}
          {profile.likes !== undefined && (
            <div className="text-center">
              <p className="text-white text-sm font-semibold">{fmtNum(profile.likes)}</p>
              <p className="text-gray-500 text-xs">лайків</p>
            </div>
          )}
        </div>
      )}

      {/* Bio */}
      {profile.bio && (
        <p className="text-gray-400 text-xs mt-2 line-clamp-2 italic">"{profile.bio}"</p>
      )}

      {/* URL */}
      <p className="text-gray-600 text-xs mt-2 truncate group-hover:text-blue-500 transition">{profile.url}</p>
    </div>
  )
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── ГОЛОВНА СТОРІНКА ────────────────────────────────────────────────────────────
export default function SocialSearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState({ name: '', username: '', phone: '' })
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(PLATFORMS.map(p => p.key))
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SocialProfile[]>([])
  const [usernameHits, setUsernameHits] = useState<any[]>([])
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')

  function togglePlatform(key: string) {
    setSelectedPlatforms(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  async function runSearch() {
    if (!query.name && !query.username && !query.phone) {
      setError('Введіть ім\'я, username або телефон')
      return
    }
    setLoading(true); setError(''); setResults([]); setUsernameHits([]); setSearched(false)

    const allProfiles: SocialProfile[] = []
    const promises: Promise<void>[] = []

    // Хелпер — всі запити через Next.js проксі (уникаємо CORS)
    const vpsCall = async (endpoint: string, payload: any) => {
      const r = await fetch('/api/social/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, ...payload }),
      })
      return r.json()
    }

    // Instagram
    if (selectedPlatforms.includes('instagram') && (query.username || query.name)) {
      const username = query.username || nameToUsername(query.name)
      promises.push(
        vpsCall('instagram', { username })
          .then(d => { if (d.found) allProfiles.push({ ...d, platform: 'instagram' }) })
          .catch(() => {})
      )
    }

    // TikTok
    if (selectedPlatforms.includes('tiktok') && (query.username || query.name)) {
      const username = query.username || nameToUsername(query.name)
      promises.push(
        vpsCall('tiktok', { username })
          .then(d => { if (d.found) allProfiles.push({ ...d, platform: 'tiktok' }) })
          .catch(() => {})
      )
    }

    // GetContact
    if (selectedPlatforms.includes('getcontact') && query.phone) {
      promises.push(
        vpsCall('getcontact', { phone: query.phone })
          .then(d => { if (d.found) allProfiles.push({ ...d, platform: d.platform || 'getcontact' }) })
          .catch(() => {})
      )
    }

    // Username everywhere (17 платформ)
    if (selectedPlatforms.includes('username') && (query.username || query.name)) {
      const username = query.username || nameToUsername(query.name)
      promises.push(
        vpsCall('username', { username })
          .then(d => { setUsernameHits(d.found || []) })
          .catch(() => {})
      )
    }

    await Promise.allSettled(promises)

    setResults(allProfiles)
    setLoading(false)
    setSearched(true)
  }

  const filteredResults = activeFilter === 'all'
    ? results
    : results.filter(r => r.platform === activeFilter)

  const platformCounts = results.reduce((acc, r) => {
    acc[r.platform] = (acc[r.platform] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                🌐 Соцмережі OSINT
              </h1>
              <p className="text-gray-500 text-xs mt-0.5">
                Instagram · TikTok · VK · Telegram · GetContact · 17 платформ одночасно
              </p>
            </div>
            <button onClick={() => router.push('/persons')} className="text-gray-500 hover:text-gray-300 text-sm transition">
              ← Особи
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

          {/* Форма пошуку */}
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">👤 Ім'я / ПІБ</label>
                <input
                  value={query.name}
                  onChange={e => setQuery(q => ({ ...q, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && runSearch()}
                  placeholder="Іванов Іван Іванович"
                  className="w-full bg-gray-800 border border-gray-600 focus:border-blue-500 rounded-lg px-3 py-2 text-sm outline-none transition text-white placeholder-gray-600"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">@ Username</label>
                <input
                  value={query.username}
                  onChange={e => setQuery(q => ({ ...q, username: e.target.value.replace(/^@/, '') }))}
                  onKeyDown={e => e.key === 'Enter' && runSearch()}
                  placeholder="ivan_ivanov"
                  className="w-full bg-gray-800 border border-gray-600 focus:border-blue-500 rounded-lg px-3 py-2 text-sm outline-none transition text-white placeholder-gray-600"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">📞 Телефон</label>
                <input
                  value={query.phone}
                  onChange={e => setQuery(q => ({ ...q, phone: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && runSearch()}
                  placeholder="+79147441444"
                  className="w-full bg-gray-800 border border-gray-600 focus:border-blue-500 rounded-lg px-3 py-2 text-sm outline-none transition text-white placeholder-gray-600"
                />
              </div>
            </div>

            {/* Вибір платформ */}
            <div className="mb-5">
              <p className="text-gray-500 text-xs mb-2">Платформи:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedPlatforms(
                    selectedPlatforms.length === PLATFORMS.length ? [] : PLATFORMS.map(p => p.key)
                  )}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-400 hover:border-gray-400 transition"
                >
                  {selectedPlatforms.length === PLATFORMS.length ? '☑ Всі' : '☐ Всі'}
                </button>
                {PLATFORMS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => togglePlatform(p.key)}
                    title={p.description}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                      selectedPlatforms.includes(p.key)
                        ? 'bg-blue-700 border-blue-600 text-white'
                        : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={runSearch}
                disabled={loading}
                className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-sm font-semibold transition flex items-center gap-2"
              >
                {loading
                  ? <><span className="animate-spin">⟳</span> Шукаю у {selectedPlatforms.length} платформах...</>
                  : <><span>🌐</span> Шукати у соцмережах</>
                }
              </button>
            </div>
          </div>

          {/* Помилка */}
          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-300 text-sm">❌ {error}</div>
          )}

          {/* Результати */}
          {searched && (
            <div>
              {/* Підсумок */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <p className="text-gray-400 text-sm">
                    Знайдено: <span className="text-white font-semibold">{results.length}</span> профілів
                    {usernameHits.length > 0 && (
                      <span className="ml-2 text-purple-400">+ {usernameHits.length} акаунтів по username</span>
                    )}
                  </p>
                </div>
                {results.length > 0 && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setActiveFilter('all')}
                      className={`text-xs px-3 py-1 rounded-lg transition ${activeFilter === 'all' ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                      Всі ({results.length})
                    </button>
                    {Object.entries(platformCounts).map(([platform, count]) => (
                      <button
                        key={platform}
                        onClick={() => setActiveFilter(platform)}
                        className={`text-xs px-3 py-1 rounded-lg transition ${activeFilter === platform ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                      >
                        {PLATFORMS.find(p => p.key === platform)?.icon} {count}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Профілі */}
              {filteredResults.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
                  {filteredResults.map((profile, i) => (
                    <ProfileCard
                      key={i}
                      profile={profile}
                      onOpen={url => window.open(url, '_blank')}
                    />
                  ))}
                </div>
              ) : results.length === 0 && (
                <div className="bg-gray-900 rounded-xl border border-gray-700 p-8 text-center mb-6">
                  <p className="text-4xl mb-3">🌐</p>
                  <p className="text-gray-400">Профілів у соцмережах не знайдено</p>
                  <p className="text-gray-600 text-sm mt-1">Спробуйте інший username або ПІБ</p>
                </div>
              )}

              {/* Username Hits */}
              {usernameHits.length > 0 && (
                <div>
                  <p className="text-gray-400 text-sm font-medium mb-3 flex items-center gap-2">
                    <span>🌐</span> Username знайдено на {usernameHits.length} платформах
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {usernameHits.map((hit, i) => (
                      <a
                        key={i}
                        href={hit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-purple-900/20 border border-purple-700/40 rounded-lg hover:border-purple-500 transition text-sm"
                      >
                        <span className="text-purple-400">✓</span>
                        <span className="text-gray-200 truncate">{hit.platform}</span>
                        <span className="text-gray-600 ml-auto">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Утиліта транслітерації ──────────────────────────────────────────────────────
const TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',
  и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',
  с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
  і:'i',ї:'yi',є:'ye',ґ:'g',
}
function translit(s: string): string {
  return s.toLowerCase().split('').map(c => TRANSLIT[c] ?? c).join('').replace(/[^a-z0-9_.]/g, '')
}
function nameToUsername(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return translit(name)
  return `${translit(parts[1])}${translit(parts[0])}`
}
