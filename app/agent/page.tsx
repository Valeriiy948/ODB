'use client'

import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Sidebar from '../components/Sidebar'

// ─── Types ────────────────────────────────────────────────────────────────────
interface StepEvent {
  step: number
  name: string
  status: 'running' | 'done' | 'skipped' | 'error'
  icon: string
  result?: string
  alert?: string | null
}

interface DoneEvent {
  query: string
  type: string
  person_id: string | null
  elapsed_sec: number
  report: any
  raw_data: {
    breach_hits: number
    registry_hits: number
    has_sanctions: boolean
    has_crypto: boolean
    person_found: boolean
  }
  collected_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ThreatBadge({ level }: { level?: string }) {
  const map: Record<string, string> = {
    critical: 'bg-red-900/60 text-red-300 border-red-700',
    high:     'bg-orange-900/60 text-orange-300 border-orange-700',
    medium:   'bg-yellow-900/60 text-yellow-300 border-yellow-700',
    low:      'bg-green-900/60 text-green-300 border-green-700',
    unknown:  'bg-gray-800 text-gray-400 border-gray-700',
  }
  const label = level || 'unknown'
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider ${map[label] || map.unknown}`}>
      {label}
    </span>
  )
}

function ScoreMeter({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? 'bg-red-500' : score >= 60 ? 'bg-orange-500' : score >= 40 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-gray-400 text-xs">{label}</span>
        <span className="text-white text-xs font-bold">{score}/100</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="text-gray-600 hover:text-gray-400 text-xs transition"
    >
      {copied ? '✓' : '⧉'}
    </button>
  )
}

// ─── Safe string converter (AI може повернути об'єкт замість рядка) ──────────
function safeStr(val: any): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  // Wallet object: {address, status, source}
  if (val.address) return val.address
  // Social profile object: {url, platform}
  if (val.url) return val.url
  if (val.platform && val.username) return `${val.platform}: ${val.username}`
  // Transaction object
  if (val.hash) return val.hash
  if (val.description) return val.description
  if (val.text) return val.text
  return JSON.stringify(val)
}

// ─── Report sections ──────────────────────────────────────────────────────────
function ReportSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-700/30 transition text-left"
      >
        <span className="text-lg">{icon}</span>
        <span className="text-white font-semibold text-sm flex-1">{title}</span>
        <span className="text-gray-500 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-4 border-t border-gray-700/50 pt-3">{children}</div>}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function AgentPage() {
  const searchParams = useSearchParams()
  const [query, setQuery]     = useState(() => searchParams.get('q') || '')
  const [depth, setDepth]     = useState(2)
  const [running, setRunning] = useState(false)
  const [steps, setSteps]     = useState<StepEvent[]>([])
  const [result, setResult]   = useState<DoneEvent | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [startEvent, setStartEvent] = useState<any>(null)
  const abortRef = useRef<AbortController | null>(null)

  // ── Авто-запуск при переході з Network Intel через ?q= ──────────────────
  useEffect(() => {
    const q = searchParams.get('q')
    if (!q) return
    setQuery(q)
    setTimeout(() => {
      document.getElementById('agent-run-btn')?.click()
    }, 300)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const EXAMPLES = [
    { label: '👤 Ім\'я', value: 'Романов Александр Викторович' },
    { label: '📞 Телефон', value: '+380991234567' },
    { label: '₿ BTC', value: '1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF' },
    { label: '🔴 TRON', value: 'TCfRTKRbdJvry5HmJuzv3fJGLP5FyDMuTi' },
    { label: '⟠ ETH', value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
    { label: '🌐 IP', value: '192.168.1.1' },
  ]

  async function runInvestigation() {
    if (!query.trim() || running) return
    setRunning(true)
    setSteps([])
    setResult(null)
    setError(null)
    setStartEvent(null)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch('/api/agent/investigate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: query.trim(), depth }),
        signal:  abort.signal,
      })

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          const lines = part.trim().split('\n')
          let eventName = ''
          let dataStr   = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) eventName = line.slice(7)
            if (line.startsWith('data: '))  dataStr   = line.slice(6)
          }
          if (!dataStr) continue
          try {
            const data = JSON.parse(dataStr)
            if (eventName === 'start')  setStartEvent(data)
            if (eventName === 'step')   setSteps(prev => {
              const existing = prev.findIndex(s => s.step === data.step)
              if (existing >= 0) {
                const next = [...prev]
                next[existing] = data
                return next
              }
              return [...prev, data]
            })
            if (eventName === 'done')   { setResult(data); setRunning(false) }
            if (eventName === 'error')  { setError(data.message); setRunning(false) }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message)
      setRunning(false)
    }
  }

  function stopInvestigation() {
    abortRef.current?.abort()
    setRunning(false)
  }

  const report = result?.report

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">🕵️</span>
            <div>
              <h1 className="text-white text-2xl font-bold">Авто-слідчий агент</h1>
              <p className="text-gray-500 text-sm">Один запит → повне досьє → готовий звіт</p>
            </div>
          </div>
        </div>

        {/* Input panel */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
          <div className="flex gap-3 mb-3">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runInvestigation()}
              placeholder="ПІБ / телефон / email / гаманець / IP / домен / ІПН..."
              className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-600 placeholder-gray-600"
              disabled={running}
            />
            <select
              value={depth}
              onChange={e => setDepth(Number(e.target.value))}
              disabled={running}
              className="bg-gray-800 border border-gray-700 text-gray-300 rounded-xl px-3 py-3 text-sm"
            >
              <option value={1}>⚡ Швидко</option>
              <option value={2}>🔍 Стандарт</option>
              <option value={3}>🕵️ Глибоко</option>
            </select>
            {running ? (
              <button
                onClick={stopInvestigation}
                className="px-6 py-3 bg-red-700 hover:bg-red-600 text-white rounded-xl font-medium transition"
              >
                ⏹ Стоп
              </button>
            ) : (
              <button
                id="agent-run-btn"
                onClick={runInvestigation}
                disabled={!query.trim()}
                className="px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white rounded-xl font-medium transition"
              >
                🚀 Розслідувати
              </button>
            )}
          </div>

          {/* Quick examples */}
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map(ex => (
              <button
                key={ex.value}
                onClick={() => setQuery(ex.value)}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg text-xs transition border border-gray-700"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Steps progress */}
        {(running || steps.length > 0) && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              {running && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
              <h2 className="text-white font-semibold">
                {running ? 'Розслідування...' : '✅ Завершено'}
              </h2>
              {startEvent && (
                <span className="text-gray-500 text-xs ml-auto">
                  {startEvent.type?.toUpperCase()} · глибина {startEvent.depth}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, i) => i + 1).map(stepNum => {
                const step = steps.find(s => s.step === stepNum)
                if (!step && !running) return null
                if (!step) {
                  return (
                    <div key={stepNum} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-800/30 opacity-30">
                      <span className="text-lg">⏳</span>
                      <span className="text-gray-600 text-sm">Крок {stepNum}...</span>
                    </div>
                  )
                }

                const colors = {
                  running: 'border-blue-800/50 bg-blue-950/20',
                  done:    'border-green-800/30 bg-green-950/10',
                  skipped: 'border-gray-700/30 bg-gray-800/20',
                  error:   'border-red-800/50 bg-red-950/20',
                }

                return (
                  <div key={stepNum} className={`flex items-start gap-3 py-2.5 px-3 rounded-lg border ${colors[step.status]}`}>
                    <span className="text-lg shrink-0">{step.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">{step.name}</span>
                        {step.status === 'running' && (
                          <span className="text-blue-400 text-xs animate-pulse">● обробляю...</span>
                        )}
                        {step.status === 'skipped' && (
                          <span className="text-gray-600 text-xs">пропущено</span>
                        )}
                      </div>
                      {step.result && (
                        <p className="text-gray-400 text-xs mt-0.5">{step.result}</p>
                      )}
                      {step.alert && (
                        <p className="text-red-400 text-xs font-bold mt-0.5 animate-pulse">{step.alert}</p>
                      )}
                    </div>
                    {step.status === 'done'    && <span className="text-green-500 shrink-0">✓</span>}
                    {step.status === 'skipped' && <span className="text-gray-600 shrink-0">—</span>}
                    {step.status === 'error'   && <span className="text-red-500 shrink-0">✗</span>}
                  </div>
                )
              })}
            </div>

            {result && (
              <div className="mt-4 pt-4 border-t border-gray-800 flex items-center gap-4 text-sm">
                <span className="text-gray-500">⏱ {result.elapsed_sec}с</span>
                <span className="text-gray-500">
                  🔓 {result.raw_data.breach_hits} витоків
                </span>
                <span className="text-gray-500">
                  🏛️ {result.raw_data.registry_hits} реєстрів
                </span>
                {result.raw_data.has_sanctions && (
                  <span className="text-red-400 font-bold animate-pulse">🚨 САНКЦІЇ</span>
                )}
                {result.raw_data.person_found && (
                  <a href={`/persons/${result.person_id}`} target="_blank" rel="noopener noreferrer"
                    className="ml-auto px-3 py-1 bg-blue-800/50 hover:bg-blue-700/60 text-blue-300 rounded-lg text-xs transition">
                    👤 Відкрити картку →
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4 mb-6 text-red-400">
            ✗ {error}
          </div>
        )}

        {/* ═══ FINAL REPORT ═══ */}
        {report && !report.error && (
          <div className="space-y-4">
            {/* Subject card */}
            <div className={`rounded-2xl border p-5 ${
              report.subject?.threat_level === 'critical' ? 'bg-red-950/20 border-red-800/50' :
              report.subject?.threat_level === 'high'     ? 'bg-orange-950/20 border-orange-800/50' :
              'bg-gray-900 border-gray-800'
            }`}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-white text-xl font-bold">
                      {report.subject?.name || result?.query}
                    </h2>
                    <ThreatBadge level={report.subject?.threat_level} />
                  </div>
                  {report.subject?.dob && (
                    <p className="text-gray-400 text-sm">📅 {report.subject.dob}</p>
                  )}
                  {report.subject?.nationality && (
                    <p className="text-gray-400 text-sm">🌍 {report.subject.nationality}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = `odb-report-${result?.query?.slice(0,20).replace(/\s/g,'_')}-${Date.now()}.json`
                      a.click()
                    }}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs transition"
                  >
                    ↓ JSON
                  </button>
                  {result?.person_id && (
                    <a href={`/persons/${result.person_id}`} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-blue-800/60 hover:bg-blue-700/70 text-blue-300 rounded-lg text-xs transition">
                      👤 Картка
                    </a>
                  )}
                </div>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-3">
                <ScoreMeter score={report.subject?.threat_score || 0} label="Загроза" />
                <ScoreMeter score={report.confidence_score || 0} label="Впевненість аналізу" />
              </div>
            </div>

            {/* Executive Summary */}
            {report.executive_summary && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">ВИСНОВОК АНАЛІТИКА</p>
                <p className="text-gray-200 text-sm leading-relaxed">{report.executive_summary}</p>
              </div>
            )}

            {/* Criminal Indicators */}
            {report.criminal_indicators?.length > 0 && (
              <ReportSection title={`Індикатори ризику (${report.criminal_indicators.length})`} icon="🚨">
                <div className="space-y-2">
                  {report.criminal_indicators.map((ind: any, i: number) => (
                    <div key={i} className={`rounded-lg p-3 border flex items-start gap-3 ${
                      ind.severity === 'critical' ? 'bg-red-950/30 border-red-800/40' :
                      ind.severity === 'high'     ? 'bg-orange-950/30 border-orange-800/40' :
                      'bg-gray-800/50 border-gray-700/50'
                    }`}>
                      <ThreatBadge level={ind.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm">{ind.description}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{ind.type} · {ind.source}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ReportSection>
            )}

            {/* Contact data */}
            {(report.contact_data?.phones?.length > 0 || report.contact_data?.emails?.length > 0 || report.contact_data?.addresses?.length > 0) && (
              <ReportSection title="Контактні дані" icon="📞">
                <div className="grid grid-cols-1 gap-3">
                  {report.contact_data.phones?.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs w-16">Телефон</span>
                      <span className="text-white font-mono text-sm">{safeStr(p)}</span>
                      <CopyBtn text={safeStr(p)} />
                    </div>
                  ))}
                  {report.contact_data.emails?.map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs w-16">Email</span>
                      <span className="text-white font-mono text-sm">{safeStr(e)}</span>
                      <CopyBtn text={safeStr(e)} />
                    </div>
                  ))}
                  {report.contact_data.addresses?.map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs w-16">Адреса</span>
                      <span className="text-white text-sm">{safeStr(a)}</span>
                    </div>
                  ))}
                </div>
              </ReportSection>
            )}

            {/* Documents */}
            {(report.documents?.passport || report.documents?.inn) && (
              <ReportSection title="Документи" icon="📄">
                <div className="grid grid-cols-2 gap-3">
                  {report.documents.passport && (
                    <div>
                      <p className="text-gray-500 text-xs">Паспорт</p>
                      <p className="text-white font-mono text-sm">{report.documents.passport}</p>
                    </div>
                  )}
                  {report.documents.inn && (
                    <div>
                      <p className="text-gray-500 text-xs">ІПН/ІНН</p>
                      <p className="text-white font-mono text-sm">{report.documents.inn}</p>
                    </div>
                  )}
                  {report.documents.snils && (
                    <div>
                      <p className="text-gray-500 text-xs">СНІЛС</p>
                      <p className="text-white font-mono text-sm">{report.documents.snils}</p>
                    </div>
                  )}
                </div>
              </ReportSection>
            )}

            {/* Digital Footprint */}
            {(report.digital_footprint?.social_profiles?.length > 0 || report.digital_footprint?.crypto_wallets?.length > 0) && (
              <ReportSection title="Цифровий слід" icon="🌐">
                {report.digital_footprint.social_profiles?.map((s: any, i: number) => {
                  const url = safeStr(s)
                  return (
                    <div key={i} className="flex items-center gap-2 mb-1">
                      <span className="text-gray-500 text-xs w-20">Соцмережа</span>
                      <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noopener noreferrer"
                        className="text-blue-400 hover:underline text-sm truncate">{url}</a>
                    </div>
                  )
                })}
                {report.digital_footprint.crypto_wallets?.map((w: any, i: number) => {
                  const addr = safeStr(w)
                  return (
                    <div key={i} className="flex items-center gap-2 mb-1">
                      <span className="text-gray-500 text-xs w-20">Гаманець</span>
                      <span className="text-orange-400 font-mono text-xs">{addr}</span>
                      <CopyBtn text={addr} />
                    </div>
                  )
                })}
              </ReportSection>
            )}

            {/* Financial Intel */}
            {report.financial_intel?.known_wallets?.length > 0 && (
              <ReportSection title="Фінансова розвідка" icon="₿">
                <div className="space-y-2">
                  {report.financial_intel.total_crypto_volume_usd && (
                    <p className="text-yellow-400 font-bold">
                      💰 Загальний обсяг: ${Number(report.financial_intel.total_crypto_volume_usd).toLocaleString()}
                    </p>
                  )}
                  {report.financial_intel.suspicious_transactions?.map((tx: any, i: number) => (
                    <div key={i} className="bg-red-950/20 border border-red-800/30 rounded p-2 text-xs">
                      <p className="text-red-400">{safeStr(tx)}</p>
                    </div>
                  ))}
                </div>
              </ReportSection>
            )}

            {/* Connections */}
            {report.connections?.length > 0 && (
              <ReportSection title={`Зв'язки (${report.connections.length})`} icon="🔗">
                <div className="space-y-2">
                  {report.connections.map((c: any, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-white text-sm font-medium">{c.name}</span>
                      <span className="text-gray-500 text-xs">— {c.relation}</span>
                      <span className={`text-xs ml-auto ${c.confidence === 'high' ? 'text-green-400' : c.confidence === 'medium' ? 'text-yellow-400' : 'text-gray-600'}`}>
                        {c.confidence}
                      </span>
                    </div>
                  ))}
                </div>
              </ReportSection>
            )}

            {/* Timeline */}
            {report.timeline?.length > 0 && (
              <ReportSection title="Хронологія подій" icon="📅">
                <div className="relative pl-4 space-y-3">
                  <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-700" />
                  {report.timeline.map((t: any, i: number) => (
                    <div key={i} className="relative">
                      <div className="absolute -left-3 top-1.5 w-2 h-2 rounded-full bg-blue-500" />
                      <p className="text-gray-500 text-xs">{t.date}</p>
                      <p className="text-white text-sm">{t.event}</p>
                      {t.source && <p className="text-gray-600 text-xs">{t.source}</p>}
                    </div>
                  ))}
                </div>
              </ReportSection>
            )}

            {/* Recommendations + Law Enforcement */}
            {(report.recommendations?.length > 0 || report.law_enforcement_notes) && (
              <ReportSection title="Рекомендації та дії" icon="📋">
                {report.law_enforcement_notes && (
                  <div className="bg-blue-950/20 border border-blue-800/30 rounded-lg p-3 mb-3">
                    <p className="text-blue-400 text-xs font-semibold mb-1">ДЛЯ ПРАВООХОРОНЦІВ:</p>
                    <p className="text-gray-300 text-sm">{report.law_enforcement_notes}</p>
                  </div>
                )}
                {report.recommendations?.map((r: any, i: number) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <span className="text-blue-400 shrink-0">→</span>
                    <p className="text-gray-300 text-sm">{safeStr(r)}</p>
                  </div>
                ))}
              </ReportSection>
            )}

            {/* Investigation gaps */}
            {report.investigation_gaps?.length > 0 && (
              <ReportSection title="Прогалини в розслідуванні" icon="⚠️">
                <div className="space-y-1">
                  {report.investigation_gaps.map((g: any, i: number) => (
                    <p key={i} className="text-yellow-600 text-sm flex gap-2">
                      <span>⚠</span><span>{safeStr(g)}</span>
                    </p>
                  ))}
                </div>
              </ReportSection>
            )}

            {/* Sources */}
            {report.sources_summary && (
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 grid grid-cols-4 gap-4 text-center">
                {[
                  { label: 'Всього джерел', value: report.sources_summary.total_sources },
                  { label: 'Витоки', value: report.sources_summary.breach_hits },
                  { label: 'Реєстри', value: report.sources_summary.registry_hits },
                  { label: 'OSINT', value: report.sources_summary.osint_hits },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-white font-bold text-lg">{s.value ?? '—'}</p>
                    <p className="text-gray-500 text-xs">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!running && steps.length === 0 && !result && (
          <div className="text-center py-20">
            <p className="text-6xl mb-4">🕵️</p>
            <p className="text-gray-400 text-lg mb-2">Введіть будь-який ідентифікатор</p>
            <p className="text-gray-600 text-sm max-w-md mx-auto">
              ПІБ, номер телефону, email, крипто-гаманець, IP-адресу або ІПН.
              Агент автоматично запустить усі модулі і скласти повне досьє.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
