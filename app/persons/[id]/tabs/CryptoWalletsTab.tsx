'use client'

import { useEffect, useState } from 'react'

const CHAINS      = ['eth', 'btc', 'tron', 'bsc', 'polygon']
const CHAIN_ICONS: Record<string, string> = { eth: '⟠', btc: '₿', tron: '🔴', bsc: '🟡', polygon: '🟣' }
const RISK_COLORS: Record<string, string> = {
  low: 'text-green-400', medium: 'text-yellow-400',
  high: 'text-orange-400', critical: 'text-red-400',
}

interface CryptoWalletsTabProps {
  personId:   string
  personName: string
}

export function CryptoWalletsTab({ personId, personName }: CryptoWalletsTabProps) {
  const [wallets,        setWallets]        = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [linkMode,       setLinkMode]       = useState(false)
  const [newAddr,        setNewAddr]        = useState('')
  const [newChain,       setNewChain]       = useState('eth')
  const [newNotes,       setNewNotes]       = useState('')
  const [saving,         setSaving]         = useState(false)
  const [analyzeLoading, setAnalyzeLoading] = useState<string | null>(null)
  const [walletDetails,  setWalletDetails]  = useState<Record<string, any>>({})

  useEffect(() => {
    fetch(`/api/persons/${personId}`)
      .then(r => r.json())
      .then(d => { setWallets(d.crypto_wallets || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [personId])

  async function handleLink() {
    if (!newAddr.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/crypto/link-person', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: newAddr.trim(), chain: newChain, person_id: personId, notes: newNotes }),
      })
      const data = await res.json()
      if (data.success) {
        setWallets(prev => [...prev, { address: newAddr.trim().toLowerCase(), chain: newChain, notes: newNotes, linked_at: new Date().toISOString() }])
        setNewAddr(''); setNewNotes(''); setLinkMode(false)
      }
    } finally { setSaving(false) }
  }

  async function handleUnlink(address: string) {
    if (!confirm(`Відв'язати гаманець ${address.slice(0, 12)}...?`)) return
    await fetch('/api/crypto/link-person', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: address, person_id: personId }),
    })
    setWallets(prev => prev.filter(w => w.address !== address))
  }

  async function handleAnalyze(wallet: any) {
    setAnalyzeLoading(wallet.address)
    try {
      const res = await fetch('/api/crypto/wallet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address, chain: wallet.chain }),
      })
      const data = await res.json()
      if (data.success) {
        setWalletDetails(prev => ({ ...prev, [wallet.address]: data.wallet }))
        await fetch('/api/crypto/link-person', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet_address: wallet.address, chain: wallet.chain, person_id: personId, wallet_data: data.wallet }),
        })
      }
    } finally { setAnalyzeLoading(null) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin text-4xl">₿</div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg" style={{ color: 'var(--odb-text)' }}>₿ Крипто-гаманці</h3>
          <p className="text-gray-500 text-sm">{wallets.length} гаманець(ів) прив'язано до {personName}</p>
        </div>
        <button
          onClick={() => setLinkMode(!linkMode)}
          className="px-4 py-2 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-sm transition font-medium"
        >
          {linkMode ? '✕ Скасувати' : "+ Прив’язати гаманець"}
        </button>
      </div>

      {linkMode && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--odb-surface)', border: '1px solid rgba(194,65,12,0.4)' }}>
          <p className="text-orange-400 text-sm font-medium">Прив'язати новий гаманець</p>
          <div className="flex gap-2">
            <select value={newChain} onChange={e => setNewChain(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm w-32 shrink-0 outline-none"
              style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}>
              {CHAINS.map(c => <option key={c} value={c}>{CHAIN_ICONS[c]} {c.toUpperCase()}</option>)}
            </select>
            <input value={newAddr} onChange={e => setNewAddr(e.target.value)}
              placeholder="Адреса гаманця (0x... / 1... / T...)"
              className="flex-1 rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }} />
          </div>
          <input value={newNotes} onChange={e => setNewNotes(e.target.value)}
            placeholder="Нотатки (необов'язково)"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text-dim)' }} />
          <div className="flex gap-2">
            <button onClick={handleLink} disabled={saving || !newAddr.trim()}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg text-sm transition">
              {saving ? '⏳ Зберігаю...' : "✓ Прив'язати"}
            </button>
            <a href={`/crypto-intel?addr=${encodeURIComponent(newAddr)}&chain=${newChain}`}
              target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">
              🔍 Аналіз
            </a>
          </div>
        </div>
      )}

      {wallets.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-3">₿</p>
          <p className="text-gray-400">Гаманців не прив'язано</p>
          <p className="text-gray-600 text-sm mt-1">
            Натисніть "+ Прив'язати гаманець" або знайдіть гаманець через{' '}
            <a href="/crypto-intel" className="text-orange-400 hover:underline">Крипто-розвідку</a>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {wallets.map((w: any) => {
            const detail    = walletDetails[w.address]
            const riskColor = RISK_COLORS[w.risk_level || detail?.risk_level || 'low']
            return (
              <div key={w.address} className="rounded-xl p-4" style={{ background: 'var(--odb-surface)', border: '1px solid var(--odb-border)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">{CHAIN_ICONS[w.chain] || '🔗'}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs uppercase font-semibold">{w.chain}</span>
                        {(w.risk_level || detail?.risk_level) && (
                          <span className={`text-xs font-medium ${riskColor}`}>
                            ● {(w.risk_level || detail?.risk_level).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-sm truncate" style={{ color: 'var(--odb-text)' }}>{w.address}</p>
                      {w.notes && <p className="text-gray-500 text-xs mt-0.5">{w.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleAnalyze(w)} disabled={analyzeLoading === w.address}
                      className="px-3 py-1.5 bg-blue-800/50 hover:bg-blue-700/60 text-blue-300 rounded-lg text-xs transition">
                      {analyzeLoading === w.address ? '⏳' : '🔍 Аналіз'}
                    </button>
                    <a href={`/crypto-intel?addr=${encodeURIComponent(w.address)}&chain=${w.chain}`}
                      target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition">
                      ↗ Відкрити
                    </a>
                    <button onClick={() => handleUnlink(w.address)}
                      className="px-2 py-1.5 bg-red-950/50 hover:bg-red-900/60 text-red-400 rounded-lg text-xs transition" title="Відв'язати">
                      ✕
                    </button>
                  </div>
                </div>
                {(detail || w.balance != null) && (
                  <div className="mt-3 pt-3 grid grid-cols-4 gap-3" style={{ borderTop: '1px solid var(--odb-border)' }}>
                    {[
                      { label: 'Баланс',      value: detail?.balance_native != null ? `${detail.balance_native} ${detail.symbol || ''}` : (w.balance != null ? `${w.balance}` : null) },
                      { label: 'Транзакцій',  value: detail?.tx_count ?? w.tx_count },
                      { label: 'Ризик',       value: detail?.risk_score != null ? `${detail.risk_score}/100` : (w.risk_score != null ? `${w.risk_score}/100` : null) },
                      { label: 'Остання tx',  value: detail?.last_tx ?? w.last_tx },
                    ].filter(s => s.value != null).map(stat => (
                      <div key={stat.label}>
                        <p className="text-gray-600 text-xs">{stat.label}</p>
                        <p className="text-gray-300 text-sm font-medium">{String(stat.value)}</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-gray-700 text-xs mt-2">
                  Прив'язано: {w.linked_at ? new Date(w.linked_at).toLocaleDateString('uk-UA') : '—'}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <div className="bg-orange-950/20 border border-orange-900/30 rounded-xl p-4 flex items-center gap-3">
        <span className="text-2xl">🕵️</span>
        <div className="flex-1">
          <p className="text-orange-400 text-sm font-medium">Крипто-розвідка</p>
          <p className="text-gray-500 text-xs">Знайдіть гаманці через OSINT Bridge і прив'яжіть до цієї особи</p>
        </div>
        <a href="/crypto-intel" className="px-4 py-2 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-sm transition shrink-0">
          Відкрити →
        </a>
      </div>
    </div>
  )
}
