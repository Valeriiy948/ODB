'use client'

import { SaveAllButton } from './shared'
import { openWayback, openGoogleCache } from '../utils/person-utils'
import type { PersonPageState } from '../hooks/usePersonPage'

interface OsintTabProps {
  state: PersonPageState
}

export function OsintTab({ state: s }: OsintTabProps) {
  const person = s.person

  // Derived: active vector results
  const activeVectorData = s.activeVectorData

  return (
    <div>
      {/* Auto-run status */}
      {(s.osintKitLoading || s.leakOsintLoading || s.tgLoading) && (
        <div className="mb-3 px-4 py-2 bg-blue-950/50 border border-blue-800/50 rounded-lg flex items-center gap-3 text-xs text-blue-300">
          <span className="animate-spin inline-block">⟳</span>
          Авто-пошук запущено:
          {s.osintKitLoading  && <span className="bg-orange-900/50 px-2 py-0.5 rounded text-orange-300">OsintKit...</span>}
          {s.leakOsintLoading && <span className="bg-red-900/50 px-2 py-0.5 rounded text-red-300">LeakOsint...</span>}
          {s.tgLoading        && <span className="bg-blue-900/50 px-2 py-0.5 rounded text-blue-300">Telegram...</span>}
        </div>
      )}
      {s.osintError && (
        <div className="bg-red-950 border border-red-700 rounded-xl p-4 text-red-300 mb-3">❌ {s.osintError}</div>
      )}

      {/* Web OSINT results (if ran) */}
      {s.osintData && s.osintData.total > 0 && (
        <div className="mb-4 rounded-xl overflow-hidden" style={{ background: 'var(--odb-surface)', border: '1px solid rgba(124,58,237,0.4)' }}>
          <div className="flex gap-1 p-3 overflow-x-auto flex-wrap" style={{ background: 'var(--odb-surface2)', borderBottom: '1px solid var(--odb-border)' }}>
            {s.osintData?.vectors?.map((v: any) => (
              <button key={v.vector} onClick={() => s.setActiveVector(v.vector)}
                className="px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition"
                style={s.activeVector === v.vector
                  ? { background: 'rgba(124,58,237,0.8)', color: '#fff' }
                  : { background: 'var(--odb-surface3)', color: 'var(--odb-text-dim)' }}>
                {v.label} <span className="opacity-70">({v.count})</span>
              </button>
            ))}
          </div>
          {activeVectorData && (() => {
            const REL_THRESHOLD  = 35
            const personSurname  = (person.name_rus || person.name || '').split(' ')[0]?.toLowerCase() || ''
            const relevantResults = (activeVectorData?.results ?? []).filter((r: any) => {
              const rel = r.relevanceScore ?? 100
              if (rel < REL_THRESHOLD) return false
              if (rel < 60 && personSurname.length >= 4) {
                const text = `${r.title} ${r.snippet}`.toLowerCase()
                if (!text.includes(personSurname)) return false
              }
              return true
            })
            const hiddenCount = activeVectorData.results.length - relevantResults.length
            return (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-gray-600 text-xs">
                    Запит: <span className="text-gray-300 font-mono">{activeVectorData.query}</span>
                  </p>
                  {hiddenCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'var(--odb-surface3)', color: 'var(--odb-text-faint)' }}>
                      🔽 {hiddenCount} нерелевантних приховано
                    </span>
                  )}
                </div>
                {relevantResults.length > 0 ? (
                  <div className="space-y-3">
                    {relevantResults.map((result: any, i: number) => {
                      const isPdf          = result.link.toLowerCase().endsWith('.pdf') || result.title.toLowerCase().includes('[pdf]')
                      const isMyrotvorets  = result.link?.includes('myrotvorets.center')
                      const rel            = result.relevanceScore ?? 100
                      const relColor       = rel >= 70 ? 'bg-green-900 text-green-400' : rel >= 40 ? 'bg-yellow-900 text-yellow-500' : 'bg-gray-800 text-gray-500'
                      return (
                        <div key={i} className="rounded-lg p-4 transition"
                          style={isMyrotvorets
                            ? { background: 'rgba(113,63,18,0.3)', border: '1px solid rgba(161,98,7,0.6)' }
                            : { background: 'var(--odb-surface)', border: '1px solid var(--odb-border)' }}>

                          <div className="flex items-start justify-between gap-2">
                            <a href={result.link} target="_blank" rel="noopener noreferrer"
                              className={`font-medium text-sm leading-snug ${isMyrotvorets ? 'text-yellow-400 hover:text-yellow-300' : 'text-blue-400 hover:text-blue-300'}`}>
                              {isMyrotvorets && '🇺🇦 '}{result.title}
                            </a>
                            {isMyrotvorets && !person.myrotvorets_url && (
                              <button
                                onClick={() => { s.setEnrichUrl(result.link); s.setEnrichOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                                className="shrink-0 px-3 py-1 bg-yellow-700 hover:bg-yellow-600 text-white rounded text-xs font-medium transition">
                                📥 Імпорт
                              </button>
                            )}
                          </div>
                          <p className={`text-xs mt-1 truncate ${isMyrotvorets ? 'text-yellow-800' : 'text-green-700'}`}>{result.link}</p>
                          {result.snippet && <p className="text-gray-400 text-sm mt-2 leading-relaxed line-clamp-3">{result.snippet}</p>}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--odb-surface3)', color: 'var(--odb-text-faint)' }}>{result.source}</span>
                            {result.relevanceScore !== undefined && (
                              <span className={`text-xs px-2 py-0.5 rounded font-mono ${relColor}`}>rel: {result.relevanceScore}</span>
                            )}
                            {isPdf && (
                              <>
                                <button onClick={() => openWayback(result.link)} className="text-xs bg-blue-900 hover:bg-blue-800 text-blue-300 px-2 py-0.5 rounded transition">📦 Wayback</button>
                                <button onClick={() => openGoogleCache(result.link)} className="text-xs bg-green-900 hover:bg-green-800 text-green-300 px-2 py-0.5 rounded transition">🔍 Cache</button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm">Нічого не знайдено по цьому вектору</p>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── OsintKit ── */}
      <div className="mt-4 rounded-xl overflow-hidden" style={{ background: 'var(--odb-surface)', border: '1px solid rgba(194,65,12,0.5)' }}>
        <div className="bg-orange-950/60 border-b border-orange-900 px-5 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-orange-300 font-semibold flex items-center gap-2">
              🗄️ OsintKit — Бази даних РФ/СНД
              {s.osintKitTotal > 0 && <span className="bg-orange-700 text-orange-100 text-xs px-2 py-0.5 rounded-full">{s.osintKitTotal}</span>}
            </h3>
            <p className="text-orange-800 text-xs mt-0.5">731 баз: Альфабанк, ГосУслуги, ГИБДД, РСА, ФНС, МТС, Білайн, Ощадбанк, Сбербанк...</p>
          </div>
          <button onClick={s.runOsintKit} disabled={s.osintKitLoading}
            className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1 whitespace-nowrap">
            {s.osintKitLoading ? <><span className="animate-spin inline-block">⟳</span> Пошук...</> : s.osintKitRan ? '🔄 Оновити' : '🔍 Перевірити'}
          </button>
        </div>
        {s.osintKitError && <div className="px-5 py-3 text-sm text-red-400 bg-red-950/30">❌ {s.osintKitError}</div>}
        {s.osintKitLoading && <div className="px-5 py-8 text-center text-orange-400 text-sm"><span className="animate-spin inline-block mr-2 text-xl">⟳</span>Пошук у 731 базах РФ/СНД...</div>}
        {!s.osintKitLoading && !s.osintKitRan && <div className="px-5 py-6 text-center text-gray-600 text-sm">Натисніть "Перевірити" для пошуку по базах даних РФ/СНД</div>}
        {!s.osintKitLoading && s.osintKitRan && s.osintKitResults.length === 0 && !s.osintKitError && (
          <div className="px-5 py-6 text-center text-gray-600 text-sm">Нічого не знайдено в базах OsintKit</div>
        )}
        {s.osintKitResults.length > 0 && (
          <div className="p-4 space-y-2">
            {s.osintKitResults.map((entry: any, i: number) => (
              <LeakEntry key={i} entry={entry} color="orange" />
            ))}
            <div className="mt-3 pt-3 flex justify-end" style={{ borderTop: '1px solid var(--odb-border)' }}>
              <button onClick={s.saveOsintKit} disabled={s.osintKitSaving || s.osintKitSaved}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-2">
                {s.osintKitSaving ? <><span className="animate-spin inline-block">⟳</span> Зберігаємо...</> : s.osintKitSaved ? '✅ Збережено' : '💾 Зберегти в базу'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── LeakOsint ── */}
      <div className="mt-4 rounded-xl overflow-hidden" style={{ background: 'var(--odb-surface)', border: '1px solid rgba(153,27,27,0.5)' }}>
        <div className="bg-red-950/50 border-b border-red-900/50 px-5 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-red-300 font-semibold flex items-center gap-2">
              🔴 LeakOsint — Бази даних РФ/СНД
              {s.leakOsintTotal > 0 && <span className="bg-red-700 text-red-100 text-xs px-2 py-0.5 rounded-full">{s.leakOsintTotal}</span>}
            </h3>
            <p className="text-red-800 text-xs mt-0.5">800+ баз: ВКонтакте, ГИБДД, МТС, Сбербанк, ФНС, Білайн, Авіаквитки...</p>
          </div>
          <button onClick={s.runLeakOsint} disabled={s.leakOsintLoading}
            className="px-3 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1 whitespace-nowrap">
            {s.leakOsintLoading ? <><span className="animate-spin inline-block">⟳</span> Пошук...</> : s.leakOsintRan ? '🔄 Оновити' : '🔍 Перевірити'}
          </button>
        </div>
        {s.leakOsintError && <div className="px-5 py-3 text-sm text-red-400 bg-red-950/30">❌ {s.leakOsintError}</div>}
        {s.leakOsintLoading && <div className="px-5 py-8 text-center text-red-400 text-sm"><span className="animate-spin inline-block mr-2 text-xl">⟳</span>Пошук у 800+ базах РФ/СНД...</div>}
        {!s.leakOsintLoading && !s.leakOsintRan && <div className="px-5 py-6 text-center text-gray-600 text-sm">Натисніть "Перевірити" для пошуку по LeakOsint</div>}
        {!s.leakOsintLoading && s.leakOsintRan && s.leakOsintResults.length === 0 && !s.leakOsintError && (
          <div className="px-5 py-6 text-center text-gray-600 text-sm">Нічого не знайдено в LeakOsint</div>
        )}
        {s.leakOsintResults.length > 0 && (
          <div className="p-4 space-y-2">
            {s.leakOsintResults.map((entry: any, i: number) => (
              <LeakEntry key={i} entry={entry} color="red" />
            ))}
            <div className="mt-3 pt-3 flex justify-end" style={{ borderTop: '1px solid var(--odb-border)' }}>
              <button onClick={s.saveLeakOsint} disabled={s.leakOsintSaving || s.leakOsintSaved}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-2">
                {s.leakOsintSaving ? <><span className="animate-spin inline-block">⟳</span> Зберігаємо...</> : s.leakOsintSaved ? '✅ Збережено' : '💾 Зберегти в базу'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sherlock Bot ── */}
      <div className="mt-4 bg-gray-800 rounded-xl border border-violet-900/50 overflow-hidden">
        <div className="bg-violet-950/40 border-b border-violet-900/40 px-5 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-violet-300 font-semibold flex items-center gap-2">
              🕵️ Sherlock Bot — Бази РФ/СНД
              {s.sherlockBotData?.matches > 0 && (
                <span className="bg-violet-700 text-violet-100 text-xs px-2 py-0.5 rounded-full">
                  {s.sherlockBotData.matches} збігів
                </span>
              )}
            </h3>
            <p className="text-violet-900 text-xs mt-0.5">
              54-72 збіги · ПІБ + ДН · ~$0.28/запит · 60 запитів залишилось
            </p>
          </div>
          <button
            onClick={s.runSherlockBot}
            disabled={s.sherlockBotLoading}
            className="px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1 whitespace-nowrap"
          >
            {s.sherlockBotLoading
              ? <><span className="animate-spin inline-block">⟳</span> Пошук (~35с)...</>
              : s.sherlockBotData ? '🔄 Оновити' : '🕵️ Перевірити (~$0.28)'}
          </button>
        </div>

        {s.sherlockBotError && (
          <div className="px-5 py-3 text-sm text-red-400 bg-red-950/30">❌ {s.sherlockBotError}</div>
        )}
        {s.sherlockBotLoading && (
          <div className="px-5 py-8 text-center text-violet-400 text-sm">
            <span className="animate-spin inline-block mr-2 text-xl">⟳</span>
            Запит до @SHERLOCK_626jqxevxx_bot... (~35 секунд)
          </div>
        )}
        {!s.sherlockBotLoading && !s.sherlockBotData && !s.sherlockBotError && (
          <div className="px-5 py-6 text-center text-gray-600 text-sm">
            Натисніть для пошуку по базах РФ/СНД через Sherlock Bot
          </div>
        )}
        {!s.sherlockBotLoading && s.sherlockBotData && (
          <div className="p-4 space-y-3">
            {/* Summary */}
            <div className={`px-4 py-3 rounded-lg border ${
              s.sherlockBotData.matches > 0
                ? 'bg-green-950/20 border-green-800'
                : 'bg-gray-900 border-gray-700'
            }`}>
              <p className={`font-bold text-base ${s.sherlockBotData.matches > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                {s.sherlockBotData.matches > 0
                  ? `✅ ${s.sherlockBotData.matches} збігів знайдено`
                  : '❌ Збігів не знайдено'}
              </p>
              <p className="text-gray-500 text-xs mt-0.5">
                Запит: <span className="text-gray-300 font-mono">{s.sherlockBotData.query}</span>
              </p>
            </div>

            {/* Raw results */}
            {s.sherlockBotData.results?.map((r: any, i: number) => (
              <div key={i} className="bg-gray-900/70 rounded-lg border border-gray-700 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-violet-300 text-xs font-medium bg-violet-900/40 px-2 py-0.5 rounded">
                    {r.source_label || r.source}
                  </span>
                  {r.date && <span className="text-gray-600 text-xs">{r.date}</span>}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                      className="ml-auto text-xs text-blue-400 hover:text-blue-300">
                      ↗ Відкрити
                    </a>
                  )}
                </div>
                {r.snippet && (
                  <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap">
                    {r.snippet.slice(0, 1000)}
                    {r.snippet.length > 1000 && <span className="text-gray-600">... (скорочено)</span>}
                  </p>
                )}
              </div>
            ))}

            {/* Links */}
            {s.sherlockBotData.links?.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {s.sherlockBotData.links.map((link: string, i: number) => (
                  <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 bg-violet-900/30 hover:bg-violet-900/50 text-violet-300 border border-violet-800/50 rounded-lg transition">
                    ↗ Посилання {i + 1}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Telegram пошук ── */}
      <div className="mt-4 bg-gray-800 rounded-xl border border-blue-900/50 overflow-hidden">
        <div className="bg-blue-950/40 border-b border-blue-900/40 px-5 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-blue-300 font-semibold">📡 Telegram OSINT пошук</h3>
              <p className="text-blue-900 text-xs mt-0.5">PeopleFindBaseBot (~15s) та 10 ботів паралельно (~40s)</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => s.runTelegramSearch()} disabled={s.tgLoading}
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap">
                {s.tgLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 Швидко'}
              </button>
              <button onClick={() => s.runTelegramFull()} disabled={s.tgFullLoading}
                className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap">
                {s.tgFullLoading
                  ? <><span className="animate-spin">⟳</span> {s.tgFullJobId ? 'Очікую...' : 'Запуск...'}</>
                  : '🤖 Всі боти'}
              </button>
            </div>
          </div>
          {/* Search query display */}
          {s.tgQuery && (
            <p className="text-blue-800 text-xs">Запит: <span className="text-blue-400 font-mono">{s.tgQuery}</span></p>
          )}
        </div>

        {s.tgError && <div className="px-5 py-3 text-sm text-red-400 bg-red-950/30">❌ {s.tgError}</div>}
        {s.tgFullError && <div className="px-5 py-3 text-sm text-red-400 bg-red-950/30">❌ {s.tgFullError}</div>}

        {/* Full-bots loading */}
        {s.tgFullLoading && (
          <div className="px-5 py-6 text-center">
            <span className="animate-spin inline-block text-3xl text-blue-400 mb-3">🤖</span>
            <p className="text-blue-300 text-sm">10 ботів шукають паралельно...</p>
            <p className="text-blue-900 text-xs mt-1">Job ID: {s.tgFullJobId}</p>
            <p className="text-gray-600 text-xs mt-1">Це займе ~40 секунд. Продовжуйте роботу.</p>
          </div>
        )}

        {/* Full-bots results */}
        {s.tgFullResults.length > 0 && (
          <div>
            <div className="px-5 py-2 bg-indigo-950/40 border-b border-indigo-900/50">
              <p className="text-indigo-300 text-xs font-semibold">🤖 Результати від всіх ботів: {s.tgFullResults.length} записів</p>
            </div>
            <div className="p-4 space-y-2">
              {s.tgFullResults.map((r: any, i: number) => (
                <TgResultCard key={i} r={r} />
              ))}
            </div>
            {/* Save button for full results */}
            <SaveAllButton results={s.tgFullResults} allRaw={s.tgFullResults} onSave={s.saveTelegramDataToPerson} />
          </div>
        )}

        {/* Quick search results */}
        {s.tgLoading && (
          <div className="px-5 py-8 text-center text-blue-400 text-sm">
            <span className="animate-spin inline-block mr-2 text-xl">⟳</span>Пошук у Telegram базах...
          </div>
        )}
        {!s.tgLoading && s.tgResults.length === 0 && !s.tgFullResults.length && !s.tgError && !s.tgFullLoading && (
          <div className="px-5 py-6 text-center text-gray-600 text-sm">
            Натисніть "🔍 Швидко" або "🤖 Всі боти" для пошуку в Telegram базах
          </div>
        )}
        {s.tgResults.length > 0 && (
          <div>
            <div className="px-5 py-2 bg-blue-950/30 border-b border-blue-900/30">
              <p className="text-blue-400 text-xs font-semibold">Швидкий пошук: {s.tgResults.length} релевантних записів</p>
            </div>
            <div className="p-4 space-y-2">
              {s.tgResults.map((r: any, i: number) => (
                <TgResultCard
                  key={i}
                  r={r}
                  onEnrich={s.runTelegramEnrich}
                  enrichLoading={s.tgEnrichLoading}
                />
              ))}
            </div>
            <SaveAllButton results={s.tgResults} allRaw={s.tgRawAll} onSave={s.saveTelegramDataToPerson} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function LeakEntry({ entry, color }: { entry: any; color: 'orange' | 'red' }) {
  const cls = color === 'orange' ? 'text-orange-300' : 'text-red-300'
  return (
    <div className="bg-gray-900/70 rounded-lg border border-gray-700 px-4 py-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className={`${cls} text-xs font-medium`}>📂 {entry.database || '—'}</p>
        {entry.as_of && <span className="text-gray-600 text-xs shrink-0">{entry.as_of}</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {entry.name && (
          <div className="col-span-2 flex gap-2">
            <span className="text-gray-500 text-xs w-20 shrink-0">Ім'я</span>
            <span className="text-gray-200 text-xs">{entry.name}</span>
          </div>
        )}
        {entry.phone && (
          <div className="flex gap-2 items-center">
            <span className="text-gray-500 text-xs w-20 shrink-0">Телефон</span>
            <a href={`/breach-intel?q=${encodeURIComponent(entry.phone.replace(/\D/g,''))}`}
              target="_blank" rel="noopener noreferrer" className="text-green-400 text-xs font-mono hover:underline">
              📱 {entry.phone}
            </a>
          </div>
        )}
        {entry.email && (
          <div className="flex gap-2 items-center">
            <span className="text-gray-500 text-xs w-20 shrink-0">Email</span>
            <a href={`/breach-intel?q=${encodeURIComponent(entry.email)}`}
              target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs font-mono hover:underline">
              ✉️ {entry.email}
            </a>
          </div>
        )}
        {entry.dob && (
          <div className="flex gap-2">
            <span className="text-gray-500 text-xs w-20 shrink-0">ДН</span>
            <span className="text-gray-300 text-xs">📅 {entry.dob}</span>
          </div>
        )}
        {entry.address && (
          <div className="col-span-2 flex gap-2">
            <span className="text-gray-500 text-xs w-20 shrink-0">Адреса</span>
            <a href={`/breach-intel?q=${encodeURIComponent(entry.address)}`}
              target="_blank" rel="noopener noreferrer" className="text-gray-300 text-xs hover:text-green-400 hover:underline">
              📍 {entry.address}
            </a>
          </div>
        )}
        {entry.inn      && <div className="flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">ІПН</span><span className="text-yellow-300 text-xs font-mono">{entry.inn}</span></div>}
        {entry.passport && <div className="flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">Паспорт</span><span className="text-green-300 text-xs font-mono">🪪 {entry.passport}</span></div>}
        {entry.vehicle  && <div className="col-span-2 flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">Авто</span><span className="text-gray-300 text-xs">🚗 {entry.vehicle}</span></div>}
        {entry.username && <div className="flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">Логін</span><span className="text-purple-300 text-xs font-mono">{entry.username}</span></div>}
        {entry.extra_phones && <div className="col-span-2 flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">Ще тел.</span><span className="text-green-400 text-xs font-mono">{entry.extra_phones}</span></div>}
      </div>
    </div>
  )
}

function TgResultCard({ r, onEnrich, enrichLoading }: {
  r: any
  onEnrich?: (q: string) => void
  enrichLoading?: Set<string>
}) {
  const f = r.fields || {}
  return (
    <div className="bg-gray-900/70 rounded-lg border border-gray-700 px-4 py-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-blue-300 text-xs font-medium bg-blue-900/40 px-2 py-0.5 rounded">
            {r.source_label || r.source || '—'}
          </span>
          {r._src && <span className="text-gray-500 text-xs">{r._src}</span>}
          {r.date && <span className="text-gray-600 text-xs">{r.date}</span>}
        </div>
        {onEnrich && r.snippet && (
          <button
            onClick={() => onEnrich(r.snippet?.split(' ').slice(0, 4).join(' ') || '')}
            disabled={enrichLoading?.has(r.snippet?.split(' ').slice(0, 4).join(' '))}
            className="shrink-0 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition"
          >
            {enrichLoading?.has(r.snippet?.split(' ').slice(0, 4).join(' ')) ? '⟳' : '+ Доп.'}
          </button>
        )}
      </div>
      {r.snippet && <p className="text-gray-300 text-xs leading-relaxed mb-2">{r.snippet}</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {f.name     && <div className="col-span-2 flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">ПІБ</span><span className="text-gray-200 text-xs">{f.name}</span></div>}
        {f.phone    && <div className="flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">Тел.</span><span className="text-green-400 text-xs font-mono">📱 {f.phone}</span></div>}
        {f.dob      && <div className="flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">ДН</span><span className="text-gray-300 text-xs">{f.dob}</span></div>}
        {f.passport && <div className="flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">Паспорт</span><span className="text-green-300 text-xs font-mono">🪪 {f.passport}</span></div>}
        {f.inn      && <div className="flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">ІПН</span><span className="text-yellow-300 text-xs font-mono">{f.inn}</span></div>}
        {f.address  && <div className="col-span-2 flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">Адреса</span><span className="text-gray-300 text-xs">{f.address}</span></div>}
        {f.rank     && <div className="flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">Звання</span><span className="text-gray-300 text-xs">{f.rank}</span></div>}
        {f.unit     && <div className="flex gap-2"><span className="text-gray-500 text-xs w-20 shrink-0">В/Ч</span><span className="text-gray-300 text-xs">{f.unit}</span></div>}
      </div>
    </div>
  )
}
