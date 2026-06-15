'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../components/Sidebar'
import Icon from '../components/Icon'

// ─── Типи ────────────────────────────────────────────────────────────────────
interface Declaration {
  id: string
  full_name: string
  last_name: string
  first_name: string
  position: string
  organization: string
  declaration_year: number
  declaration_type: string
  post_category: string
  region: string
  city: string
  url: string
  assets?: {
    real_estate: any[]
    vehicles: any[]
    income: any[]
    cash: any[]
    bank_accounts: any[]
    total_income_uah: number
  }
}

function fmtMoney(n: number): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} млн ₴`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)} тис ₴`
  return `${n} ₴`
}

function AssetsBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (!count) return null
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${color}`}>
      {label}: {count}
    </span>
  )
}

function DeclarationCard({ decl, expanded, onToggle }: {
  decl: Declaration
  expanded: boolean
  onToggle: () => void
}) {
  const assets = decl.assets
  const hasAssets = assets && (
    assets.real_estate.length > 0 ||
    assets.vehicles.length > 0 ||
    assets.income.length > 0
  )

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-800/50 transition"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 border border-blue-700/50 text-blue-300 font-medium">
                {decl.declaration_year}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                {decl.declaration_type}
              </span>
              {decl.post_category && (
                <span className="text-xs text-gray-500">{decl.post_category}</span>
              )}
            </div>
            <p className="text-white font-semibold truncate">{decl.full_name}</p>
            <p className="text-gray-400 text-sm truncate">{decl.position}</p>
            <p className="text-gray-500 text-xs truncate">{decl.organization}</p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {assets?.total_income_uah ? (
              <span className="text-green-400 text-sm font-semibold">
                {fmtMoney(assets.total_income_uah)}
              </span>
            ) : null}
            <a
              href={decl.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-blue-400 hover:text-blue-300 text-xs transition"
            >
              Відкрити ↗
            </a>
            <span className="text-gray-600 text-xs">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Asset badges */}
        {hasAssets && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <AssetsBadge label="🏠 Нерухомість" count={assets!.real_estate.length} color="text-orange-300 border-orange-700/50 bg-orange-900/20" />
            <AssetsBadge label="🚗 Авто" count={assets!.vehicles.length} color="text-cyan-300 border-cyan-700/50 bg-cyan-900/20" />
            <AssetsBadge label="💰 Доходи" count={assets!.income.length} color="text-green-300 border-green-700/50 bg-green-900/20" />
            <AssetsBadge label="🏦 Рахунки" count={assets!.bank_accounts.length} color="text-purple-300 border-purple-700/50 bg-purple-900/20" />
          </div>
        )}
      </div>

      {/* Expanded assets */}
      {expanded && assets && (
        <div className="border-t border-gray-700 p-4 space-y-4">

          {/* Нерухомість */}
          {assets.real_estate.length > 0 && (
            <div>
              <p className="text-orange-400 text-xs font-semibold mb-2">🏠 НЕРУХОМІСТЬ</p>
              <div className="space-y-1.5">
                {assets.real_estate.map((r, i) => (
                  <div key={i} className="bg-gray-800/50 rounded-lg px-3 py-2 text-xs">
                    <span className="text-gray-200">{r.type}</span>
                    {r.area && <span className="text-gray-400 ml-2">{r.area}</span>}
                    {r.city && <span className="text-gray-500 ml-2">📍 {r.city}</span>}
                    {r.cost && <span className="text-green-400 ml-2">{fmtMoney(r.cost)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Авто */}
          {assets.vehicles.length > 0 && (
            <div>
              <p className="text-cyan-400 text-xs font-semibold mb-2">🚗 ТРАНСПОРТНІ ЗАСОБИ</p>
              <div className="space-y-1.5">
                {assets.vehicles.map((v, i) => (
                  <div key={i} className="bg-gray-800/50 rounded-lg px-3 py-2 text-xs">
                    <span className="text-gray-200">{v.brand} {v.model}</span>
                    {v.year && <span className="text-gray-400 ml-2">{v.year} р.</span>}
                    {v.type && <span className="text-gray-500 ml-2">({v.type})</span>}
                    {v.cost && <span className="text-green-400 ml-2">{fmtMoney(v.cost)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Доходи */}
          {assets.income.length > 0 && (
            <div>
              <p className="text-green-400 text-xs font-semibold mb-2">
                💰 ДОХОДИ
                {assets.total_income_uah > 0 && (
                  <span className="text-green-300 ml-2 font-bold">{fmtMoney(assets.total_income_uah)}</span>
                )}
              </p>
              <div className="space-y-1.5">
                {assets.income.slice(0, 8).map((inc, i) => (
                  <div key={i} className="bg-gray-800/50 rounded-lg px-3 py-2 text-xs flex justify-between">
                    <span className="text-gray-300 truncate flex-1 mr-2">{inc.source}</span>
                    <span className="text-green-400 flex-shrink-0">
                      {inc.amount?.toLocaleString('uk-UA')} {inc.currency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Готівка */}
          {assets.cash.length > 0 && (
            <div>
              <p className="text-yellow-400 text-xs font-semibold mb-2">💵 ГОТІВКА</p>
              <div className="flex flex-wrap gap-2">
                {assets.cash.map((c, i) => (
                  <span key={i} className="bg-yellow-900/20 border border-yellow-700/40 text-yellow-300 text-xs px-3 py-1 rounded-lg">
                    {c.amount?.toLocaleString('uk-UA')} {c.currency}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Рахунки */}
          {assets.bank_accounts.length > 0 && (
            <div>
              <p className="text-purple-400 text-xs font-semibold mb-2">🏦 БАНКІВСЬКІ РАХУНКИ</p>
              <div className="space-y-1">
                {assets.bank_accounts.slice(0, 5).map((acc, i) => (
                  <div key={i} className="bg-gray-800/50 rounded-lg px-3 py-1.5 text-xs flex justify-between">
                    <span className="text-gray-300">{acc.bank || 'Банк'} — {acc.type}</span>
                    {acc.amount > 0 && (
                      <span className="text-purple-300">{acc.amount?.toLocaleString('uk-UA')} {acc.currency}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ГОЛОВНА СТОРІНКА ────────────────────────────────────────────────────────
export default function NAZKSearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingFull, setLoadingFull] = useState(false)
  const [results, setResults] = useState<Declaration[]>([])
  const [latest, setLatest] = useState<Declaration | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  async function runSearch() {
    if (query.trim().length < 3) { setError('Введіть мінімум 3 символи'); return }
    setLoading(true); setError(''); setResults([]); setLatest(null); setTotal(null); setNote(''); setSearched(false)

    try {
      // Пошук через НАЗК API напряму (server-side через Next.js)
      const res = await fetch('/api/nazk/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResults(data.declarations || [])
      setLatest(data.latest || null)
      setTotal(data.total ?? null)
      setNote(data.note || '')
      setSearched(true)
      if (data.latest?.id) setExpandedId(data.latest.id)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function loadFullDeclaration(declId: string) {
    setLoadingFull(true)
    try {
      const res = await fetch('/api/nazk/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: declId }),
      })
      const data = await res.json()
      if (data.declaration) {
        setResults(prev => prev.map(d => d.id === declId ? { ...d, assets: data.declaration.assets } : d))
        setExpandedId(declId)
      }
    } catch { /* skip */ }
    finally { setLoadingFull(false) }
  }

  return (
    <div className="flex h-screen text-white overflow-hidden" style={{ background: 'var(--odb-bg)' }}>
      <Sidebar />
      <div className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 odb-glass border-b px-6 py-4" style={{ borderColor: 'var(--odb-border-soft)' }}>
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--odb-accent-hi), var(--odb-accent-lo))', boxShadow: 'var(--odb-shadow-accent)' }}>
                <Icon name="file" size={20} />
              </span>
              <div>
                <h1 className="text-xl font-bold">НАЗК Декларації</h1>
                <p className="text-[var(--odb-text-faint)] text-xs mt-0.5">
                  Єдиний державний реєстр декларацій · Майно · Доходи · Авто · Нерухомість
                </p>
              </div>
            </div>
            <button onClick={() => router.push('/persons')} className="text-gray-500 hover:text-gray-300 text-sm transition">
              ← Особи
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

          {/* Пошукова форма */}
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
            <label className="text-gray-400 text-xs mb-2 block">🔍 ПІБ особи (мінімум 3 символи)</label>
            <div className="flex gap-3">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runSearch()}
                placeholder="Іванов Іван Іванович"
                className="flex-1 bg-gray-800 border border-gray-600 focus:border-blue-500 rounded-xl px-4 py-3 text-white placeholder-gray-600 outline-none transition text-sm"
              />
              <button
                onClick={runSearch}
                disabled={loading || query.trim().length < 3}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-sm font-semibold transition flex items-center gap-2 flex-shrink-0"
              >
                {loading ? <><span className="animate-spin">⟳</span> Шукаю...</> : '🏛️ Шукати'}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-gray-600 text-xs">Приклади:</span>
              {['Зеленський', 'Порошенко', 'Кличко', 'Арахамія'].map(name => (
                <button
                  key={name}
                  onClick={() => { setQuery(name); }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Помилка */}
          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-sm space-y-2">
              <p className="text-red-300">❌ {error}</p>
              {(error.includes('403') || error.includes('блок') || error.includes('502')) && (
                <div className="mt-2 pt-2 border-t border-red-900/50">
                  <p className="text-gray-400 text-xs mb-2">
                    НАЗК тимчасово блокує запити з нашого сервера. Пошукайте напряму:
                  </p>
                  <a
                    href={`https://public.nazk.gov.ua/documents?q=${encodeURIComponent(query)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/50 rounded-lg text-xs transition"
                  >
                    🔗 Відкрити пошук на public.nazk.gov.ua →
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Примітка */}
          {note && searched && (
            <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4 text-gray-400 text-sm">
              ℹ️ {note}
            </div>
          )}

          {/* Результати */}
          {searched && !note && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-400 text-sm">
                  Знайдено в реєстрі: <span className="text-white font-semibold">{total?.toLocaleString('uk-UA')}</span> декларацій
                  {results.length > 0 && <span className="text-gray-600 ml-2">· показано {results.length}</span>}
                </p>
                {latest?.assets?.total_income_uah ? (
                  <div className="text-right">
                    <p className="text-gray-500 text-xs">Останній рік дохід</p>
                    <p className="text-green-400 font-bold">{fmtMoney(latest.assets.total_income_uah)}</p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                {/* Найновіша з активами — перша */}
                {latest && (
                  <div>
                    <p className="text-blue-400 text-xs font-medium mb-2">⭐ Остання декларація (з деталями майна)</p>
                    <DeclarationCard
                      decl={latest}
                      expanded={expandedId === latest.id}
                      onToggle={() => setExpandedId(expandedId === latest.id ? null : latest.id)}
                    />
                  </div>
                )}

                {/* Решта */}
                {results.filter(d => d.id !== latest?.id).length > 0 && (
                  <div>
                    <p className="text-gray-500 text-xs font-medium mb-2 mt-4">Попередні декларації</p>
                    {results.filter(d => d.id !== latest?.id).map(decl => (
                      <div key={decl.id} className="mb-2">
                        <DeclarationCard
                          decl={decl}
                          expanded={expandedId === decl.id}
                          onToggle={async () => {
                            if (expandedId === decl.id) { setExpandedId(null); return }
                            if (!decl.assets) await loadFullDeclaration(decl.id)
                            else setExpandedId(decl.id)
                          }}
                        />
                      </div>
                    ))}
                    {loadingFull && (
                      <div className="text-center py-2 text-gray-500 text-sm">
                        <span className="animate-spin inline-block mr-1">⟳</span> Завантажую деталі...
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Info box */}
          {!searched && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: '🏠', title: 'Нерухомість', desc: 'Квартири, будинки, земельні ділянки' },
                { icon: '🚗', title: 'Транспорт', desc: 'Авто, мотоцикли, водний транспорт' },
                { icon: '💰', title: 'Доходи', desc: 'Зарплата, підприємництво, оренда' },
              ].map(item => (
                <div key={item.title} className="bg-gray-900/50 border border-gray-700/50 rounded-xl p-4 text-center">
                  <p className="text-3xl mb-2">{item.icon}</p>
                  <p className="text-white text-sm font-medium">{item.title}</p>
                  <p className="text-gray-500 text-xs mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
