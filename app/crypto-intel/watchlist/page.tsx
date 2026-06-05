'use client'

import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import Link from 'next/link'

const CHAIN_COLOR: Record<string, string> = {
  btc:     'text-orange-400', eth:  'text-blue-400',
  tron:    'text-red-400',    ton:  'text-cyan-400',
  bsc:     'text-yellow-400', polygon: 'text-purple-400',
}
const RISK_COLOR: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  high:     'text-orange-400 bg-orange-500/10 border-orange-500/30',
  medium:   'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  low:      'text-green-400 bg-green-500/10 border-green-500/30',
  unknown:  'text-gray-400 bg-gray-500/10 border-gray-600/30',
}

export default function WatchlistPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/crypto/watchlist').catch(() => null)
    if (!res?.ok) {
      const d = await res?.json().catch(() => ({}))
      if (d?.error === 'table_not_found') {
        setError('sql_needed')
      } else {
        setError(d?.error || 'Помилка завантаження')
      }
      setLoading(false)
      return
    }
    const d = await res.json()
    setEntries(d.entries || [])
    setLoading(false)
  }

  async function remove(address: string) {
    setRemoving(address)
    await fetch(`/api/crypto/watchlist?address=${encodeURIComponent(address)}`, { method: 'DELETE' })
    setEntries(prev => prev.filter(e => e.address !== address))
    setRemoving(null)
  }

  const SQL = `CREATE TABLE IF NOT EXISTS crypto_watchlist (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  address     text NOT NULL,
  chain       text NOT NULL DEFAULT 'eth',
  label       text,
  notes       text,
  person_id   uuid REFERENCES persons(id) ON DELETE SET NULL,
  risk_level  text DEFAULT 'unknown',
  drop_score  int  DEFAULT 0,
  added_at    timestamptz DEFAULT now(),
  last_checked timestamptz,
  last_tx_hash text,
  last_balance text,
  alert_new_tx boolean DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_address ON crypto_watchlist(lower(address));`

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Link href="/crypto-intel" className="text-gray-600 hover:text-gray-400 text-sm">← Крипто-розвідка</Link>
              </div>
              <h1 className="text-2xl font-bold text-white">👁️ Список спостереження</h1>
              <p className="text-gray-500 text-sm mt-1">Моніторинг підозрілих гаманців</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-white">{entries.length}</div>
              <div className="text-xs text-gray-500">адрес відстежується</div>
            </div>
          </div>

          {/* SQL setup notice */}
          {error === 'sql_needed' && (
            <div className="bg-yellow-950/30 border border-yellow-600/40 rounded-xl p-5 mb-6">
              <div className="font-semibold text-yellow-300 mb-2">⚙️ Потрібно створити таблицю в Supabase</div>
              <p className="text-sm text-gray-400 mb-3">
                Відкрий Supabase Dashboard → SQL Editor → вставте і виконайте:
              </p>
              <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                {SQL}
              </pre>
              <button onClick={load}
                className="mt-3 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-semibold rounded-lg transition">
                Перевірити ще раз
              </button>
            </div>
          )}

          {error && error !== 'sql_needed' && (
            <div className="bg-red-950/20 border border-red-700/40 rounded-xl p-4 mb-6 text-red-300 text-sm">{error}</div>
          )}

          {loading && (
            <div className="text-center py-20 text-gray-600">
              <div className="animate-spin text-3xl mb-2">⏳</div>
              Завантаження...
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="text-center py-20 text-gray-600">
              <div className="text-5xl mb-3">👁️</div>
              <div className="text-lg text-gray-500 mb-1">Список порожній</div>
              <p className="text-sm">Натисни <span className="text-orange-400">«👁 Стежити»</span> на будь-якому гаманці щоб додати</p>
            </div>
          )}

          {/* Entries list */}
          {entries.length > 0 && (
            <div className="space-y-3">
              {entries.map((e: any) => (
                <div key={e.id}
                  className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-4 flex items-center gap-4 hover:border-gray-600/60 transition">

                  {/* Chain badge */}
                  <div className={`text-xl font-black w-10 text-center ${CHAIN_COLOR[e.chain] || 'text-gray-400'}`}>
                    {e.chain === 'btc' ? '₿' : e.chain === 'ton' ? '💎' : e.chain === 'tron' ? '⚡' : 'Ξ'}
                  </div>

                  {/* Address + label */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-sm text-white truncate">
                        {e.address.slice(0, 18)}…{e.address.slice(-8)}
                      </span>
                      {e.label && (
                        <span className="px-2 py-0.5 bg-orange-500/20 border border-orange-500/30 rounded text-xs text-orange-300">
                          {e.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{e.chain.toUpperCase()}</span>
                      <span>Додано: {new Date(e.added_at).toLocaleDateString('uk')}</span>
                      {e.persons && (
                        <Link href={`/persons/${e.persons.id}`}
                          className="text-blue-400 hover:underline">
                          👤 {e.persons.name || e.persons.name_rus}
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Risk badge */}
                  {e.risk_level && e.risk_level !== 'unknown' && (
                    <span className={`text-xs px-2.5 py-1 rounded-lg border font-bold uppercase ${RISK_COLOR[e.risk_level] || RISK_COLOR.unknown}`}>
                      {e.risk_level}
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    <Link
                      href={`/crypto-intel?address=${encodeURIComponent(e.address)}&chain=${e.chain}`}
                      className="px-3 py-1.5 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/40 rounded-lg text-orange-300 text-xs transition">
                      🔍 Аналіз
                    </Link>
                    <button
                      onClick={() => remove(e.address)}
                      disabled={removing === e.address}
                      className="px-3 py-1.5 bg-gray-700/40 hover:bg-red-900/30 border border-gray-600/40 hover:border-red-700/50 rounded-lg text-gray-400 hover:text-red-400 text-xs transition">
                      {removing === e.address ? '⏳' : '✕'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
