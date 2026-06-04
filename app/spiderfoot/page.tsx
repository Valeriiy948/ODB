'use client'

import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'

const SCAN_PRESETS = [
  {
    id: 'person',
    icon: '👤',
    label: 'Особа',
    desc: 'Повний OSINT: соцмережі, email, телефони, витоки',
    color: 'text-blue-400',
    border: 'border-blue-800/50',
    targets: ['Ім\'я', 'Email', 'Телефон'],
  },
  {
    id: 'domain',
    icon: '🌐',
    label: 'Домен',
    desc: 'DNS, субдомени, SSL, хости, паблік git',
    color: 'text-green-400',
    border: 'border-green-800/50',
    targets: ['Домен'],
  },
  {
    id: 'company',
    icon: '🏢',
    label: 'Компанія',
    desc: 'LinkedIn, DNS, email, github, OSINT пошук',
    color: 'text-purple-400',
    border: 'border-purple-800/50',
    targets: ['Назва компанії', 'Домен', 'Email'],
  },
  {
    id: 'quick',
    icon: '⚡',
    label: 'Швидкий',
    desc: 'DNS, WHOIS, email, HaveIBeenPwned (5–10 хв)',
    color: 'text-yellow-400',
    border: 'border-yellow-800/50',
    targets: ['Будь-що'],
  },
]

const RESULT_ICONS: Record<string, string> = {
  EMAIL_ADDRESS: '✉️',
  PHONE_NUMBER: '📞',
  SOCIAL_MEDIA: '📱',
  IP_ADDRESS: '🖥️',
  DOMAIN_NAME: '🌐',
  COMPROMISED_EMAIL: '🔓',
  USERNAME: '👤',
  BITCOIN_ADDRESS: '₿',
  GEOINFO: '📍',
  WEBSERVER_CONTENT: '📄',
  URL: '🔗',
}

export default function SpiderFootPage() {
  const [available, setAvailable]     = useState<boolean | null>(null)
  const [target, setTarget]           = useState('')
  const [preset, setPreset]           = useState('quick')
  const [scanning, setScanning]       = useState(false)
  const [scanId, setScanId]           = useState('')
  const [results, setResults]         = useState<any>(null)
  const [polling, setPolling]         = useState(false)
  const [error, setError]             = useState('')
  const [installGuide, setInstallGuide] = useState<any>(null)

  // Check availability
  useEffect(() => {
    fetch('/api/spiderfoot/scan')
      .then(r => r.json())
      .then(d => setAvailable(d.available))
      .catch(() => setAvailable(false))
  }, [])

  async function startScan() {
    if (!target.trim()) return
    setScanning(true); setError(''); setResults(null); setScanId('')

    try {
      const res = await fetch('/api/spiderfoot/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: target.trim(), scan_type: preset }),
      })
      const data = await res.json()

      if (data.error && data.install_guide) {
        setInstallGuide(data.install_guide)
        return
      }
      if (data.error) { setError(data.error); return }

      setScanId(data.scan_id)
      // Poll for results
      pollResults(data.scan_id)
    } catch (e: any) { setError(e.message) }
    finally { setScanning(false) }
  }

  async function pollResults(id: string) {
    setPolling(true)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 10000)) // poll every 10s
      try {
        const res = await fetch(`/api/spiderfoot/scan?scan_id=${id}`)
        const data = await res.json()
        if (data.total > 0) {
          setResults(data)
        }
        // Check if scan completed (SpiderFoot doesn't always signal done)
        if (data.total > 10) break
      } catch { break }
    }
    setPolling(false)
  }

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-bold text-white">🕷️ SpiderFoot OSINT</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Автоматичний OSINT по 200+ джерелах одночасно
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
              available === null ? 'border-gray-700 text-gray-500' :
              available ? 'bg-green-900/30 border-green-700 text-green-400' :
              'bg-red-900/30 border-red-800 text-red-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                available === null ? 'bg-gray-500' :
                available ? 'bg-green-400 animate-pulse' : 'bg-red-400'
              }`} />
              {available === null ? 'Перевірка...' : available ? 'SpiderFoot активний' : 'Не встановлено'}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* Install Guide */}
          {(installGuide || available === false) && (
            <div className="max-w-2xl mb-6 bg-yellow-950/30 border border-yellow-800 rounded-xl p-5">
              <h3 className="text-yellow-400 font-semibold mb-3">📦 Встановлення SpiderFoot на VPS</h3>
              <div className="space-y-2 font-mono text-sm">
                <div className="bg-gray-900 rounded p-3">
                  <p className="text-gray-400 text-xs mb-1"># На VPS (ssh vps)</p>
                  <p className="text-green-300">pip3 install spiderfoot</p>
                </div>
                <div className="bg-gray-900 rounded p-3">
                  <p className="text-gray-400 text-xs mb-1"># Запуск сервера</p>
                  <p className="text-green-300">spiderfoot -l 0.0.0.0:8007 -s &</p>
                </div>
                <div className="bg-gray-900 rounded p-3">
                  <p className="text-gray-400 text-xs mb-1"># Або через systemd (постійно)</p>
                  <p className="text-green-300">systemctl enable --now odb-spiderfoot</p>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                <p>Після встановлення додайте в .env.local: <code className="bg-gray-800 px-1 rounded">SPIDERFOOT_PORT=8007</code></p>
              </div>
            </div>
          )}

          {/* Scan form */}
          {available !== false && (
            <>
              {/* Presets */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 max-w-3xl">
                {SCAN_PRESETS.map(p => (
                  <button key={p.id} onClick={() => setPreset(p.id)}
                    className={`p-3 rounded-xl border text-left transition ${
                      preset === p.id
                        ? `bg-gray-800 ${p.border} ${p.color}`
                        : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-700'
                    }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span>{p.icon}</span>
                      <span className="font-semibold text-sm">{p.label}</span>
                    </div>
                    <p className="text-xs opacity-70">{p.desc}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.targets.map(t => (
                        <span key={t} className="text-xs bg-gray-800 px-1.5 py-0.5 rounded text-gray-500">{t}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>

              {/* Target input */}
              <div className="max-w-xl flex gap-2 mb-6">
                <input
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && startScan()}
                  placeholder={
                    preset === 'person' ? 'Іванов Іван Іванович або email@example.com...' :
                    preset === 'domain' ? 'example.com або mil.ru...' :
                    preset === 'company' ? 'Газпром або gazprom.ru...' :
                    'Email, IP, домен, ім\'я...'
                  }
                  className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white focus:border-blue-500 focus:outline-none placeholder-gray-500"
                />
                <button onClick={startScan} disabled={!target.trim() || scanning || !available}
                  className="px-5 py-3 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-xl font-semibold text-sm transition whitespace-nowrap">
                  {scanning ? '⟳ Запуск...' : '🕷️ Сканувати'}
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="max-w-xl bg-red-950 border border-red-800 text-red-300 rounded-xl p-3 mb-4 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Scan in progress */}
          {(scanning || polling) && scanId && (
            <div className="max-w-xl mb-4 p-4 bg-purple-950/30 border border-purple-800 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="animate-spin text-xl">🕷️</span>
                <div>
                  <p className="text-purple-300 font-semibold text-sm">SpiderFoot сканує...</p>
                  <p className="text-gray-500 text-xs">ID: {scanId}</p>
                </div>
              </div>
              <p className="text-gray-500 text-xs mt-2">
                Сканування може тривати 5–30 хвилин залежно від кількості модулів.
                Результати оновлюються автоматично.
              </p>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-white">Знайдено: {results.total} результатів</h2>
              </div>

              {/* Key findings */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { key: 'emails',   label: 'Email адреси',   icon: '✉️', color: 'text-blue-400' },
                  { key: 'phones',   label: 'Телефони',       icon: '📞', color: 'text-green-400' },
                  { key: 'accounts', label: 'Соцмережі',      icon: '📱', color: 'text-purple-400' },
                  { key: 'ips',      label: 'IP адреси',      icon: '🖥️', color: 'text-orange-400' },
                  { key: 'domains',  label: 'Домени',         icon: '🌐', color: 'text-teal-400' },
                  { key: 'breaches', label: 'Витоки',         icon: '🔓', color: 'text-red-400' },
                ].map(({ key, label, icon, color }) => {
                  const items: string[] = results[key] || []
                  if (items.length === 0) return null
                  return (
                    <div key={key} className="bg-gray-900 border border-gray-700 rounded-xl p-3">
                      <p className={`text-xs font-semibold ${color} mb-2`}>{icon} {label} ({items.length})</p>
                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        {items.map((item, i) => (
                          <div key={i} className="text-xs font-mono text-gray-300 truncate">{item}</div>
                        ))}
                      </div>
                    </div>
                  )
                }).filter(Boolean)}
              </div>

              {/* All results by type */}
              {Object.entries(results.results || {}).map(([type, items]: [string, any]) => (
                Array.isArray(items) && items.length > 0 ? (
                  <div key={type} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">
                      {RESULT_ICONS[type] || '📌'} {type.replace(/_/g, ' ')} ({items.length})
                    </h4>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {items.slice(0, 30).map((item: any, i: number) => (
                        <div key={i} className="text-xs font-mono text-gray-400 flex gap-2">
                          <span className="text-gray-200 truncate">{item.data}</span>
                          {item.module && <span className="text-gray-600 shrink-0">[{item.module}]</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              ))}
            </div>
          )}

          {/* Info */}
          {!results && !scanning && !polling && available !== false && (
            <div className="max-w-3xl bg-gray-900/50 border border-gray-800 rounded-xl p-5">
              <h3 className="text-gray-300 font-semibold mb-3">🕷️ SpiderFoot — що це?</h3>
              <div className="grid grid-cols-3 gap-4 text-xs text-gray-500">
                <div>
                  <p className="font-semibold text-gray-400 mb-1">200+ модулів</p>
                  <p>HaveIBeenPwned, Shodan, Hunter.io, LinkedIn, Telegram, GitHub, VirusTotal і ін.</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-400 mb-1">Автоматично</p>
                  <p>Вводиш email — отримуєш пов'язані телефони, соцмережі, витоки, IP, домени</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-400 mb-1">На VPS</p>
                  <p>Запускається на нашому VPS :8007. Результати зберігаються і можна переглядати</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
