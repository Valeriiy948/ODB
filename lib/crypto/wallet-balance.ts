// lib/crypto/wallet-balance.ts
// Fetch wallet balances for alert enrichment

const TRONGRID = 'https://api.trongrid.io'
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

export interface WalletBalance {
  usdt:          number   // USDT balance
  native:        number   // TRX / ETH / BTC
  native_symbol: string
}

// ─── TRON balance ─────────────────────────────────────────────────────────────
export async function getTronBalance(address: string): Promise<WalletBalance | null> {
  try {
    const apiKey = process.env.TRONGRID_API_KEY || ''
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey) headers['TRON-PRO-API-KEY'] = apiKey

    const res = await fetch(`${TRONGRID}/v1/accounts/${encodeURIComponent(address)}`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const body = await res.json()
    const account = body?.data?.[0]
    if (!account) return null

    // TRX balance (in sun, 1 TRX = 1_000_000 sun)
    const trx = (account.balance || 0) / 1_000_000

    // USDT TRC-20 balance
    let usdt = 0
    const trc20 = account.trc20 || []
    for (const token of trc20) {
      if (token[USDT_CONTRACT] !== undefined) {
        usdt = parseInt(token[USDT_CONTRACT], 10) / 1_000_000
        break
      }
    }

    return { usdt, native: trx, native_symbol: 'TRX' }
  } catch {
    return null
  }
}

// ─── ETH balance ─────────────────────────────────────────────────────────────
export async function getEthBalance(address: string): Promise<WalletBalance | null> {
  const key = process.env.ETHERSCAN_API_KEY || ''
  if (!key) return null
  try {
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=balance` +
      `&address=${address}&tag=latest&apikey=${key}`,
      { signal: AbortSignal.timeout(8_000) },
    )
    const data = await res.json()
    if (data.status !== '1') return null
    const eth = parseInt(data.result, 10) / 1e18
    return { usdt: 0, native: eth, native_symbol: 'ETH' }
  } catch {
    return null
  }
}

// ─── BTC balance ─────────────────────────────────────────────────────────────
export async function getBtcBalance(address: string): Promise<WalletBalance | null> {
  try {
    const res = await fetch(
      `https://blockchain.info/balance?active=${address}`,
      { headers: { 'User-Agent': 'ODB-Monitor/1.0' }, signal: AbortSignal.timeout(8_000) },
    )
    const data = await res.json()
    const satoshi = data?.[address]?.final_balance || 0
    return { usdt: 0, native: satoshi / 1e8, native_symbol: 'BTC' }
  } catch {
    return null
  }
}

// ─── Universal balance fetcher ────────────────────────────────────────────────
export async function getWalletBalance(address: string, chain: string): Promise<WalletBalance | null> {
  switch (chain) {
    case 'tron': return getTronBalance(address)
    case 'eth':  return getEthBalance(address)
    case 'btc':  return getBtcBalance(address)
    default:     return null
  }
}
