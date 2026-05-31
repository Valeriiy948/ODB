'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../components/Sidebar'

function CompanyCard({ company, onPersonClick }: { company: any; onPersonClick?: (name: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const statusColor = company.status?.toLowerCase().includes('зарееstr') ||
    company.status?.toLowerCase().includes('active') ? 'text-green-400' : 'text-gray-400'

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base">{company.type === 'fop' ? '👤' : '🏢'}</span>
              <h3 className="font-semibold text-white text-sm">{company.name || '—'}</h3>
              {company.edrpou && (
                <span className="text-xs font-mono text-gray-400 bg-gray-900 px-2 py-0.5 rounded">
                  ЄДРПОУ: {company.edrpou}
                </span>
              )}
              {company.inn && (
                <span className="text-xs font-mono text-gray-400 bg-gray-900 px-2 py-0.5 rounded">
                  ІПН: {company.inn}
                </span>
              )}
            </div>
            {company.status && (
              <span className={`text-xs ${statusColor} mt-1 block`}>{company.status}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {company.source && (
              <span className="text-xs text-gray-500 border border-gray-700 px-2 py-0.5 rounded">
                {company.source}
              </span>
            )}
            {company.url && (
              <a href={company.url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300">↗</a>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {company.address && (
            <div><span className="text-gray-500">Адреса: </span><span className="text-gray-300">{company.address}</span></div>
          )}
          {company.director && (
            <div>
              <span className="text-gray-500">Директор: </span>
              <button onClick={() => onPersonClick?.(company.director)}
                className="text-blue-400 hover:text-blue-300 hover:underline">
                {company.director}
              </button>
            </div>
          )}
          {company.founded && (
            <div><span className="text-gray-500">Реєстрація: </span><span className="text-gray-300">{company.founded}</span></div>
          )}
          {company.kved && (
            <div><span className="text-gray-500">КВЕД: </span><span className="text-gray-300">{company.kved}</span></div>
          )}
          {company.capital && (
            <div><span className="text-gray-500">Капітал: </span><span className="text-gray-300">{company.capital}</span></div>
          )}
          {company.activity && (
            <div className="col-span-2"><span className="text-gray-500">Діяльність: </span><span className="text-gray-300">{company.activity}</span></div>
          )}
        </div>

        {/* YouControl extended data */}
        {company.founders?.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-1">Засновники:</p>
            <div className="flex flex-wrap gap-2">
              {company.founders.map((f: any, i: number) => (
                <button key={i} onClick={() => onPersonClick?.(f.name)}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-blue-300 px-2 py-1 rounded border border-gray-600 transition">
                  {f.name}{f.share ? ` (${f.share}%)` : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Risk indicators */}
        <div className="mt-3 flex flex-wrap gap-2">
          {company.tax_debts > 0 && (
            <span className="text-xs bg-red-950 text-red-300 border border-red-800 px-2 py-0.5 rounded">
              ⚠️ Борги: {company.tax_debts.toLocaleString()} грн
            </span>
          )}
          {company.court_cases > 0 && (
            <span className="text-xs bg-orange-950 text-orange-300 border border-orange-800 px-2 py-0.5 rounded">
              ⚖️ Суд. справи: {company.court_cases}
            </span>
          )}
          {company.sanctions && (
            <span className="text-xs bg-red-950 text-red-300 border border-red-800 px-2 py-0.5 rounded">
              🚫 САНКЦІЇ
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CompanySearchPage() {
  const router = useRouter()
  const [query, setQuery]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [result, setResult]             = useState<any>(null)
  const [error, setError]               = useState('')
  const [sourceStatus, setSourceStatus] = useState<Record<string, any>>({})

  const isCode = /^\d{8}$/.test(query.trim())
  const isInn  = /^\d{10}$/.test(query.trim())

  async function search(q?: string) {
    const sq = (q || query).trim()
    if (!sq) return
    setLoading(true); setError(''); setResult(null); setSourceStatus({})

    try {
      const res = await fetch('/api/company/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sq }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data)
      setSourceStatus(data.sources || {})
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  function searchPerson(name: string) {
    router.push(`/fragment-search?q=${encodeURIComponent(name)}`)
  }

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-bold text-white">🏢 Бізнес-розвідка</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              ЄДРПОУ · ФОП · YouControl · Opendatabot — перевірка контрагентів
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-1 bg-green-900/30 text-green-400 border border-green-800 rounded">ЄДР free</span>
            <span className="px-2 py-1 bg-green-900/30 text-green-400 border border-green-800 rounded">ФОП free</span>
            <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 border border-yellow-800 rounded">YouControl key</span>
            <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 border border-yellow-800 rounded">Opendatabot key</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Search */}
          <div className="max-w-2xl mb-6">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && search()}
                  placeholder="Назва компанії, ЄДРПОУ (8 цифр), ПІБ директора..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white focus:border-blue-500 focus:outline-none placeholder-gray-500"
                />
                {query && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                      {isCode ? '🏢 ЄДРПОУ' : isInn ? '👤 ІПН ФОП' : '🔍 Назва'}
                    </span>
                  </div>
                )}
              </div>
              <button onClick={() => search()} disabled={!query.trim() || loading}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-semibold text-sm transition">
                {loading ? '⟳ Шукаю...' : '🔍 Перевірити'}
              </button>
            </div>

            {/* Quick searches */}
            <div className="flex flex-wrap gap-2 mt-3">
              {['Газпром', 'Роснефть', '14223150', 'Сбербанк'].map(ex => (
                <button key={ex} onClick={() => { setQuery(ex); search(ex) }}
                  className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg border border-gray-700 transition">
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="max-w-2xl bg-red-950 border border-red-800 text-red-300 rounded-xl p-4 mb-4 text-sm">⚠️ {error}</div>
          )}

          {/* Source status badges */}
          {Object.keys(sourceStatus).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(sourceStatus).map(([src, info]: [string, any]) => (
                <div key={src} className={`text-xs px-3 py-1 rounded-full border ${
                  info.ok ? 'bg-green-900/30 text-green-400 border-green-800'
                          : 'bg-gray-800 text-gray-500 border-gray-700'
                }`}>
                  {info.ok ? '✓' : '✗'} {src}: {info.count} результатів
                  {info.error && <span className="ml-1 text-xs opacity-60">({info.error})</span>}
                </div>
              ))}
            </div>
          )}

          {result && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-base font-bold text-white">
                  Знайдено: {result.total} записів
                </h2>
                {result.related_persons?.length > 0 && (
                  <span className="text-xs bg-red-900/40 text-red-300 border border-red-800 px-2 py-0.5 rounded">
                    ⚠️ {result.related_persons.length} пов'язаних у ODB
                  </span>
                )}
              </div>

              {/* Related persons warning */}
              {result.related_persons?.length > 0 && (
                <div className="mb-4 p-3 bg-red-950/30 border border-red-900/50 rounded-xl">
                  <p className="text-red-400 text-sm font-semibold mb-2">
                    🚨 Директор/засновник знайдений у базі ODB:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.related_persons.map((p: any) => (
                      <button key={p.id} onClick={() => router.push(`/persons/${p.id}`)}
                        className="text-xs bg-red-900/40 hover:bg-red-900/60 text-red-200 px-3 py-1.5 rounded border border-red-800 transition">
                        {p.name_rus || p.name_ukr}
                        {p.rank && <span className="ml-1 text-red-400">{p.rank}</span>}
                        {p.threat_score >= 80 && <span className="ml-1">🔴 {p.threat_score}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-6xl">
                {result.companies
                  .filter((c: any) => c.type !== 'fallback')
                  .map((company: any, i: number) => (
                    <CompanyCard key={i} company={company} onPersonClick={searchPerson} />
                  ))}
              </div>

              {/* Fallback посилання */}
              {result.companies.some((c: any) => c.type === 'fallback') && (
                <div className="mt-4 flex gap-3 flex-wrap">
                  {result.companies
                    .filter((c: any) => c.type === 'fallback')
                    .map((c: any, i: number) => (
                      <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-blue-400 hover:text-blue-300 rounded-lg text-sm border border-gray-700 transition">
                        {c.name} →
                      </a>
                    ))}
                </div>
              )}

              {result.companies.length === 0 && (
                <div className="text-gray-500 text-sm mt-4">
                  Нічого не знайдено. Спробуйте інший запит або перевірте ЄДРПОУ напряму.
                  <div className="mt-2 flex gap-2">
                    <a href={`https://youcontrol.com.ua/search/?q=${encodeURIComponent(result.query)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300">
                      Відкрити YouControl →
                    </a>
                    <a href={`https://opendatabot.ua/search?q=${encodeURIComponent(result.query)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 ml-3">
                      Відкрити Opendatabot →
                    </a>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Intro */}
          {!result && !loading && !error && (
            <div className="max-w-4xl">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { icon: '📋', title: 'ЄДРПОУ ЮО', desc: 'Юридичні особи — назва, ЄДРПОУ, директор, адреса' },
                  { icon: '👤', title: 'ФОП', desc: 'Фізичні особи-підприємці за ПІБ або ІПН' },
                  { icon: '🔗', title: 'Зв\'язки', desc: 'Директор → перевірка в базі ODB осіб' },
                  { icon: '⚖️', title: 'Due Diligence', desc: 'Борги, суди, санкції через YouControl' },
                ].map(c => (
                  <div key={c.title} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="text-2xl mb-2">{c.icon}</div>
                    <div className="font-semibold text-sm text-white mb-1">{c.title}</div>
                    <div className="text-xs text-gray-500">{c.desc}</div>
                  </div>
                ))}
              </div>
              <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 text-sm">
                <p className="text-amber-400 font-semibold mb-1">💡 Для повного Due Diligence:</p>
                <div className="text-gray-400 text-xs space-y-1">
                  <p>• <strong>Безкоштовно:</strong> ЄДР та ФОП через data.gov.ua (назва, статус, директор)</p>
                  <p>• <strong>YouControl API</strong> (~$50/міс): борги, суди, санкції, бенефіціари</p>
                  <p>• <strong>Opendatabot API</strong> (~$30/міс): ЄДРПОУ, ФОП, держзакупівлі</p>
                  <p>• Директор знайдений в ODB автоматично підсвічується як загроза</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
