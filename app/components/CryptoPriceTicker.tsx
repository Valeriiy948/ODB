'use client'
// app/components/CryptoPriceTicker.tsx
// Живий віджет цін крипти — CoinGecko free API (без ключа, CORS-дружній).
// Оновлюється кожні 60с. Показує ціну + 24h зміну з кольором.

import { useEffect, useState } from 'react'

interface Coin {
  id: string
  symbol: string
  name: string
  color: string
}

const COINS: Coin[] = [
  { id: 'bitcoin',          symbol: '₿',    name: 'BTC',  color: '#f7931a' },
  { id: 'ethereum',         symbol: 'Ξ',    name: 'ETH',  color: '#627eea' },
  { id: 'the-open-network', symbol: '💎',   name: 'TON',  color: '#0098ea' },
  { id: 'tron',             symbol: 'TRX',  name: 'TRON', color: '#eb0029' },
  { id: 'binancecoin',      symbol: 'BNB',  name: 'BNB',  color: '#f3ba2f' },
  { id: 'tether',           symbol: '₮',    name: 'USDT', color: '#26a17b' },
]

interface PriceData {
  usd: number
  usd_24h_change: number
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (p >= 1)    return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return p.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

export default function CryptoPriceTicker() {
  const [prices, setPrices] = useState<Record<string, PriceData> | null>(null)
  const [error, setError]   = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const ids = COINS.map(c => c.id).join(',')
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
          { signal: AbortSignal.timeout(8000) }
        )
        if (!res.ok) throw new Error('rate')
        const data = await res.json()
        if (alive) { setPrices(data); setError(false); setUpdatedAt(new Date()) }
      } catch {
        if (alive) setError(true)
      }
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  return (
    <div className="rounded-2xl p-3 mb-5 odb-animate-up"
         style={{ background: 'var(--odb-surface)', border: '1px solid var(--odb-border-soft)' }}>
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs uppercase tracking-wider text-[var(--odb-text-faint)] flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--odb-ok)] odb-animate-pulse inline-block" />
          Курси крипти · наживо
        </span>
        {updatedAt && (
          <span className="text-[10px] text-[var(--odb-text-faint)]">
            оновлено {updatedAt.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {error && !prices ? (
        <p className="text-[var(--odb-text-faint)] text-xs px-1 py-2">
          CoinGecko тимчасово недоступний (ліміт запитів). Оновлення за хвилину…
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {COINS.map(coin => {
            const p = prices?.[coin.id]
            const change = p?.usd_24h_change ?? 0
            const up = change >= 0
            return (
              <div key={coin.id}
                className="rounded-xl px-3 py-2.5 transition-all hover:-translate-y-0.5"
                style={{ background: 'var(--odb-surface-2)', border: '1px solid var(--odb-border-soft)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm font-bold" style={{ color: coin.color }}>{coin.symbol}</span>
                  <span className="text-xs font-semibold text-[var(--odb-text-dim)]">{coin.name}</span>
                </div>
                {p ? (
                  <>
                    <div className="text-white font-mono text-sm font-semibold">${fmtPrice(p.usd)}</div>
                    <div className="text-xs font-mono font-medium"
                         style={{ color: up ? 'var(--odb-ok)' : 'var(--odb-danger)' }}>
                      {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                    </div>
                  </>
                ) : (
                  <div className="odb-skeleton h-8 w-full mt-1" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
