'use client'

// components/CryptoWalletsTab.tsx
// Вкладка крипто-форензики на сторінці особи

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/app/lib/supabase/client'
import type { Transaction } from '@/app/api/wallet/analyze/route'
import dynamic from 'next/dynamic'

const TransactionGraph = dynamic(() => import('@/app/components/TransactionGraph'), { ssr: false })

const supabase = createClient()

type NetworkType = 'ERC-20' | 'TRC-20' | 'BTC' | 'SOL'

interface CryptoWallet {
  id: string
  person_id: string
  wallet_address: string
  network: NetworkType
  balance_usd: number | null
  risk_score: number | null
  ofac_hit: boolean
  risk_labels: string[]
  last_checked_at: string | null
  created_at: string
}

interface AnalyzeResult {
  balance_usd: number | null
  transactions: Transaction[]
  risk_score: number
  risk_labels: string[]
  partial?: boolean
}

// ─── Badge ризику ─────────────────────────────────────────────────────────────
function RiskBadge({ score, ofacHit }: { score: number | null; ofacHit: boolean }) {
  if (ofacHit) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-950 border border-red-500/60 px-2 py-0.5 text-xs font-semibold text-red-400">
        🔴 OFAC / High Risk
      </span>
    )
  }
  if (score === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-800 border border-gray-600/40 px-2 py-0.5 text-xs text-gray-400">
        ⚪ Не перевірено
      </span>
    )
  }
  if (score > 70) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-950 border border-red-500/60 px-2 py-0.5 text-xs font-semibold text-red-400">
        🔴 High Risk ({score})
      </span>
    )
  }
  if (score >= 40) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-950 border border-yellow-500/60 px-2 py-0.5 text-xs font-semibold text-yellow-400">
        🟡 Medium Risk ({score})
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-950 border border-green-500/60 px-2 py-0.5 text-xs font-semibold text-green-400">
      🟢 Low Risk ({score})
    </span>
  )
}

// ─── Колір рамки картки залежно від ризику ────────────────────────────────────
function walletCardClass(wallet: CryptoWallet): string {
  if (wallet.ofac_hit || (wallet.risk_score ?? 0) > 70) {
    return 'odb-card border border-red-500/50 bg-red-950/20'
  }
  if ((wallet.risk_score ?? 0) >= 40) {
    return 'odb-card border border-yellow-500/50 bg-yellow-950/20'
  }
  return 'odb-card border border-green-500/20'
}

// ─── Мережеві чіпи ───────────────────────────────────────────────────────────
const NETWORK_COLORS: Record<NetworkType, string> = {
  'ERC-20': 'bg-blue-950 text-blue-300 border-blue-500/40',
  'TRC-20': 'bg-red-950 text-red-300 border-red-500/40',
  'BTC':    'bg-orange-950 text-orange-300 border-orange-500/40',
  'SOL':    'bg-purple-950 text-purple-300 border-purple-500/40',
}

// ─── Валідація адреси на клієнті ──────────────────────────────────────────────
function validateAddress(address: string, network: NetworkType): string | null {
  if (!address.trim()) return 'Адреса обовʼязкова'
  if (network === 'ERC-20' && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return 'ERC-20: має починатися з 0x і містити 40 hex-символів'
  }
  if (network === 'TRC-20' && !/^T[a-zA-Z0-9]{33}$/.test(address)) {
    return 'TRC-20: має починатися з T і містити 34 символи'
  }
  return null
}

// ─── Головний компонент ───────────────────────────────────────────────────────
export default function CryptoWalletsTab({ personId }: { personId: string }) {
  const [wallets, setWallets]       = useState<CryptoWallet[]>([])
  const [loading, setLoading]       = useState(true)
  const [analyzing, setAnalyzing]   = useState<Set<string>>(new Set())
  const [showForm, setShowForm]     = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [addForm, setAddForm]       = useState<{ address: string; network: NetworkType }>({
    address: '',
    network: 'ERC-20',
  })

  // Транзакції останнього проаналізованого гаманця для графу
  const [graphTxs, setGraphTxs] = useState<Transaction[]>([])

  // ─── Завантаження гаманців з Supabase ──────────────────────────────────────
  const fetchWallets = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('crypto_wallets')
        .select('*')
        .eq('person_id', personId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setWallets((data as CryptoWallet[]) ?? [])
    } catch {
      // Помилки завантаження — відображаємо порожній список
    } finally {
      setLoading(false)
    }
  }, [personId])

  useEffect(() => { fetchWallets() }, [fetchWallets])

  // ─── Додавання гаманця ─────────────────────────────────────────────────────
  async function handleAddWallet() {
    const err = validateAddress(addForm.address, addForm.network)
    if (err) { setFormError(err); return }
    setFormError(null)

    try {
      const { error } = await supabase.from('crypto_wallets').insert({
        person_id:      personId,
        wallet_address: addForm.address.trim(),
        network:        addForm.network,
      })
      if (error) throw error
      setAddForm({ address: '', network: 'ERC-20' })
      setShowForm(false)
      await fetchWallets()
    } catch (e) {
      setFormError((e as Error).message)
    }
  }

  // ─── Аналіз гаманця ────────────────────────────────────────────────────────
  async function handleAnalyze(wallet: CryptoWallet) {
    if (!['ERC-20', 'TRC-20'].includes(wallet.network)) return
    setAnalyzing(prev => new Set(prev).add(wallet.wallet_address))

    try {
      const res = await fetch('/api/wallet/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: wallet.wallet_address,
          network:        wallet.network,
          person_id:      personId,
        }),
      })
      const data = await res.json() as AnalyzeResult
      if (data.transactions) setGraphTxs(data.transactions)
      await fetchWallets()
    } catch {
      // Помилка аналізу — гаманець залишається без змін
    } finally {
      setAnalyzing(prev => { const s = new Set(prev); s.delete(wallet.wallet_address); return s })
    }
  }

  // ─── Перевірка санкцій ─────────────────────────────────────────────────────
  async function handleSanctions(wallet: CryptoWallet) {
    setAnalyzing(prev => new Set(prev).add(`sanctions-${wallet.wallet_address}`))

    try {
      await fetch('/api/wallet/sanctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: wallet.wallet_address,
          person_id:      personId,
        }),
      })
      await fetchWallets()
    } catch {
      // Помилка перевірки санкцій
    } finally {
      setAnalyzing(prev => {
        const s = new Set(prev)
        s.delete(`sanctions-${wallet.wallet_address}`)
        return s
      })
    }
  }

  // ─── Видалення гаманця ─────────────────────────────────────────────────────
  async function handleDelete(walletId: string) {
    try {
      await supabase.from('crypto_wallets').delete().eq('id', walletId)
      await fetchWallets()
    } catch {
      // Помилка видалення
    }
  }

  // ─── Скелетон завантаження ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="odb-skeleton h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {/* ── Заголовок ── */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--odb-text)' }}>
          ₿ Крипто-Форензика
        </h3>
        <button
          onClick={() => { setShowForm(s => !s); setFormError(null) }}
          className="odb-btn-accent text-sm px-3 py-1.5"
        >
          + Додати гаманець
        </button>
      </div>

      {/* ── Форма додавання ── */}
      {showForm && (
        <div className="odb-card border border-[var(--odb-border)] space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Адреса гаманця"
              value={addForm.address}
              onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-mono
                         bg-[var(--odb-surface-3)] border border-[var(--odb-border)]
                         text-[var(--odb-text)] placeholder-[var(--odb-text-faint)]
                         focus:outline-none focus:border-[var(--odb-accent)]"
            />
            <select
              value={addForm.network}
              onChange={e => setAddForm(f => ({ ...f, network: e.target.value as NetworkType }))}
              className="rounded-lg px-3 py-2 text-sm
                         bg-[var(--odb-surface-3)] border border-[var(--odb-border)]
                         text-[var(--odb-text)] focus:outline-none focus:border-[var(--odb-accent)]"
            >
              <option value="ERC-20">ERC-20</option>
              <option value="TRC-20">TRC-20</option>
              <option value="BTC">BTC</option>
              <option value="SOL">SOL</option>
            </select>
          </div>
          {formError && (
            <p className="text-xs text-red-400">{formError}</p>
          )}
          <div className="flex gap-2">
            <button onClick={handleAddWallet} className="odb-btn-accent text-sm px-4 py-1.5">
              Зберегти
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(null) }}
              className="text-sm px-4 py-1.5 rounded-lg border border-[var(--odb-border)]
                         text-[var(--odb-text-dim)] hover:text-[var(--odb-text)]
                         hover:bg-[var(--odb-surface-3)] transition-colors"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      {/* ── Список гаманців ── */}
      {wallets.length === 0 ? (
        <div className="odb-card text-center py-12" style={{ color: 'var(--odb-text-faint)' }}>
          Гаманців не додано. Натисніть «+ Додати гаманець».
        </div>
      ) : (
        <div className="space-y-3">
          {wallets.map(wallet => {
            const isAnalyzing   = analyzing.has(wallet.wallet_address)
            const isSanctions   = analyzing.has(`sanctions-${wallet.wallet_address}`)
            const canAnalyze    = ['ERC-20', 'TRC-20'].includes(wallet.network)
            const shortAddr     = `${wallet.wallet_address.slice(0, 8)}...${wallet.wallet_address.slice(-6)}`
            const networkColor  = NETWORK_COLORS[wallet.network]
            const checkedDate   = wallet.last_checked_at
              ? new Date(wallet.last_checked_at).toLocaleDateString('uk-UA')
              : null

            return (
              <div key={wallet.id} className={walletCardClass(wallet)}>
                {/* Рядок 1: адреса + badge */}
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span
                    className="font-mono text-sm truncate flex-1"
                    style={{ color: 'var(--odb-text)' }}
                    title={wallet.wallet_address}
                  >
                    {shortAddr}
                  </span>
                  <RiskBadge score={wallet.risk_score} ofacHit={wallet.ofac_hit} />
                </div>

                {/* Рядок 2: мережа + баланс + дата */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${networkColor}`}>
                    {wallet.network}
                  </span>
                  {wallet.balance_usd !== null && (
                    <span className="text-xs" style={{ color: 'var(--odb-text-dim)' }}>
                      ${wallet.balance_usd.toLocaleString('uk-UA', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  {checkedDate && (
                    <span className="text-xs" style={{ color: 'var(--odb-text-faint)' }}>
                      перевірено {checkedDate}
                    </span>
                  )}
                </div>

                {/* Рядок 3: risk_labels */}
                {wallet.risk_labels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {wallet.risk_labels.map(label => (
                      <span
                        key={label}
                        className="rounded-full bg-red-950/60 border border-red-500/30 px-2 py-0.5 text-xs text-red-300"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Кнопки дій */}
                <div className="flex gap-2 flex-wrap">
                  {canAnalyze && (
                    <button
                      onClick={() => handleAnalyze(wallet)}
                      disabled={isAnalyzing}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                                 bg-[var(--odb-surface-3)] border border-[var(--odb-border)]
                                 text-[var(--odb-text-dim)] hover:text-[var(--odb-text)]
                                 hover:bg-[var(--odb-accent)]/10 transition-colors
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAnalyzing ? (
                        <>
                          <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                          Аналізую...
                        </>
                      ) : '🔍 Аналізувати'}
                    </button>
                  )}

                  <button
                    onClick={() => handleSanctions(wallet)}
                    disabled={isSanctions}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                               bg-[var(--odb-surface-3)] border border-[var(--odb-border)]
                               text-[var(--odb-text-dim)] hover:text-[var(--odb-text)]
                               hover:bg-yellow-500/10 transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSanctions ? (
                      <>
                        <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        Перевіряю...
                      </>
                    ) : '⚖️ Санкції'}
                  </button>

                  <button
                    onClick={() => handleDelete(wallet.id)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                               bg-[var(--odb-surface-3)] border border-[var(--odb-border)]
                               text-[var(--odb-text-faint)] hover:text-red-400
                               hover:bg-red-500/10 transition-colors ml-auto"
                  >
                    🗑 Видалити
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Граф транзакцій ── */}
      {wallets.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--odb-text-dim)' }}>
            Граф транзакцій
          </h4>
          <TransactionGraph wallets={wallets} transactions={graphTxs} />
        </div>
      )}
    </div>
  )
}
