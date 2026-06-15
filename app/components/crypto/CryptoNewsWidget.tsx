'use client'

import { useState, useEffect, useCallback } from 'react'
import type { NewsArticle } from '../../api/crypto/news/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m    = Math.floor(diff / 60_000)
  if (m < 1)   return 'щойно'
  if (m < 60)  return `${m}хв тому`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}год тому`
  const d = Math.floor(h / 24)
  return `${d}д тому`
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

const FILTERS: Array<{ tag: string; label: string; color: string }> = [
  { tag: '',          label: 'Всі',       color: '#64748b' },
  { tag: 'sanctions', label: 'Санкції',   color: '#ef4444' },
  { tag: 'russia',    label: 'Росія',     color: '#f97316' },
  { tag: 'ukraine',   label: 'Україна',   color: '#3b82f6' },
  { tag: 'illicit',   label: 'Відмивання',color: '#a855f7' },
  { tag: 'whale',     label: 'Киті 🐋',   color: '#22d3ee' },
  { tag: 'hack',      label: 'Зламано',   color: '#fbbf24' },
  { tag: 'btc',       label: 'BTC',       color: '#f7931a' },
  { tag: 'usdt',      label: 'USDT',      color: '#26a17b' },
]

// ─── Tag badge ────────────────────────────────────────────────────────────────

const TAG_STYLE: Record<string, string> = {
  sanctions: 'bg-red-900/30 text-red-400 border-red-800/40',
  russia:    'bg-orange-900/30 text-orange-400 border-orange-800/40',
  ukraine:   'bg-blue-900/30 text-blue-400 border-blue-800/40',
  illicit:   'bg-purple-900/30 text-purple-400 border-purple-800/40',
  whale:     'bg-cyan-900/30 text-cyan-400 border-cyan-800/40',
  hack:      'bg-yellow-900/30 text-yellow-400 border-yellow-800/40',
  btc:       'bg-orange-900/20 text-orange-300 border-orange-700/30',
  eth:       'bg-blue-900/20 text-blue-300 border-blue-700/30',
  usdt:      'bg-emerald-900/20 text-emerald-400 border-emerald-700/30',
}

function TagBadge({ tag }: { tag: string }) {
  const cls = TAG_STYLE[tag]
  if (!cls) return null
  return (
    <span className={`inline-flex text-xs px-1.5 py-px rounded border font-medium ${cls}`}>
      {tag}
    </span>
  )
}

// ─── Article row ──────────────────────────────────────────────────────────────

function ArticleRow({ article }: { article: NewsArticle }) {
  const [open, setOpen] = useState(false)
  const hasDesc = article.description.length > 20
  const isOsint = article.tags.some(t =>
    ['sanctions', 'russia', 'illicit', 'hack', 'whale'].includes(t)
  )

  return (
    <div
      className={`rounded-lg px-3 py-2.5 transition-all ${
        isOsint
          ? 'bg-red-950/15 border border-red-900/25 hover:border-red-800/40'
          : 'border border-transparent hover:border-gray-700/50'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Source emoji */}
        <span className="text-base shrink-0 mt-0.5 leading-none">{article.emoji}</span>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-200 hover:text-white leading-snug line-clamp-2 transition-colors"
          >
            {article.title}
          </a>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Source */}
            <span
              className="text-xs font-medium px-1.5 py-px rounded"
              style={{ color: article.color, background: article.color + '18' }}
            >
              {article.source}
            </span>
            {/* Time */}
            <span className="text-xs" style={{ color: 'var(--odb-text-faint)' }}>
              {timeAgo(article.pubDate)}
            </span>
            {/* OSINT tags */}
            {article.tags.slice(0, 3).map(t => (
              <TagBadge key={t} tag={t} />
            ))}
            {/* Expand description toggle */}
            {hasDesc && (
              <button
                onClick={() => setOpen(v => !v)}
                className="text-xs ml-auto transition"
                style={{ color: 'var(--odb-text-faint)' }}
              >
                {open ? '▲' : '▼'}
              </button>
            )}
          </div>

          {/* Expandable description */}
          {open && hasDesc && (
            <p className="text-xs mt-1.5 leading-relaxed line-clamp-4"
              style={{ color: 'var(--odb-text-dim)' }}>
              {article.description}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="odb-skeleton rounded-lg h-12" />
      ))}
    </div>
  )
}

// ─── Main widget ──────────────────────────────────────────────────────────────

interface Props {
  defaultOpen?: boolean
}

export function CryptoNewsWidget({ defaultOpen = false }: Props) {
  const [open,     setOpen]     = useState(defaultOpen)
  const [tag,      setTag]      = useState('')
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [page,     setPage]     = useState(1)
  const [fetchedAt, setFetchedAt] = useState('')
  const PER_PAGE = 15

  const load = useCallback(async (t: string) => {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/crypto/news?tag=${encodeURIComponent(t)}&limit=60`)
      const data = await res.json()
      setArticles(data.articles || [])
      setTotal(data.total || 0)
      setFetchedAt(data.fetchedAt || '')
      setPage(1)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load when widget first opens
  useEffect(() => {
    if (open && articles.length === 0 && !loading) load(tag)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function changeTag(t: string) {
    setTag(t)
    load(t)
  }

  const visible = articles.slice(0, page * PER_PAGE)
  const hasMore = visible.length < articles.length

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--odb-surface)', border: '1px solid var(--odb-border)' }}>

      {/* Header / toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition select-none"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📰</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--odb-text)' }}>
            Крипто-новини
          </span>
          {total > 0 && !loading && (
            <span className="text-xs px-1.5 py-px rounded-full"
              style={{ background: 'var(--odb-surface3)', color: 'var(--odb-text-faint)' }}>
              {total}
            </span>
          )}
          {loading && (
            <span className="text-xs animate-spin" style={{ color: 'var(--odb-text-faint)' }}>⟳</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {fetchedAt && !loading && (
            <span className="text-xs hidden sm:block" style={{ color: 'var(--odb-text-faint)' }}>
              {timeAgo(fetchedAt)}
            </span>
          )}
          <span className="text-xs" style={{ color: 'var(--odb-text-faint)' }}>
            {open ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {open && (
        <>
          {/* Filter chips */}
          <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-b"
            style={{ borderColor: 'var(--odb-border)' }}>
            {FILTERS.map(f => (
              <button
                key={f.tag}
                onClick={() => changeTag(f.tag)}
                className="text-xs px-2.5 py-1 rounded-lg transition-all font-medium"
                style={
                  tag === f.tag
                    ? { background: f.color + '30', color: f.color, border: `1px solid ${f.color}60` }
                    : { background: 'var(--odb-surface3)', color: 'var(--odb-text-faint)', border: '1px solid var(--odb-border)' }
                }
              >
                {f.label}
              </button>
            ))}
            {/* Refresh */}
            <button
              onClick={() => load(tag)}
              disabled={loading}
              className="ml-auto text-xs px-2.5 py-1 rounded-lg transition disabled:opacity-40"
              style={{ background: 'var(--odb-surface3)', color: 'var(--odb-text-faint)', border: '1px solid var(--odb-border)' }}
              title="Оновити"
            >
              {loading ? <span className="animate-spin inline-block">⟳</span> : '↺ Оновити'}
            </button>
          </div>

          {/* Content */}
          <div className="p-3">
            {error && (
              <p className="text-xs text-red-400 py-2 text-center">⚠ {error}</p>
            )}
            {loading && <Skeleton />}
            {!loading && !error && articles.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--odb-text-faint)' }}>
                {tag ? `Немає новин по фільтру «${tag}»` : 'Немає новин'}
              </p>
            )}
            {!loading && visible.length > 0 && (
              <div className="space-y-0.5">
                {visible.map(a => (
                  <ArticleRow key={a.id} article={a} />
                ))}
              </div>
            )}

            {/* Load more */}
            {hasMore && !loading && (
              <button
                onClick={() => setPage(p => p + 1)}
                className="w-full mt-3 py-2 text-xs rounded-lg transition"
                style={{ background: 'var(--odb-surface3)', color: 'var(--odb-text-faint)', border: '1px solid var(--odb-border)' }}
              >
                Показати ще ({articles.length - visible.length} залишилось)
              </button>
            )}
          </div>

          {/* Footer: source attribution */}
          <div className="px-4 py-2 border-t flex flex-wrap gap-3 text-xs"
            style={{ borderColor: 'var(--odb-border)', color: 'var(--odb-text-faint)' }}>
            <span>Джерела:</span>
            {['CoinTelegraph', 'Decrypt', 'Bitcoin Magazine', 'CryptoPanic'].map(s => (
              <span key={s} style={{ color: 'var(--odb-text-dim)' }}>{s}</span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
