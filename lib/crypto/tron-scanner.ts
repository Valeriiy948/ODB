// lib/crypto/tron-scanner.ts
// TRC-20 USDT deep scanner for TRON network
//
// API: TronGrid v1 (free tier: 15 req/s; add TRONGRID_API_KEY for higher limits)
// USDT contract: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
// Docs: https://developers.tron.network/reference/get-trc20-transaction-info-by-account-address

const TRONGRID = 'https://api.trongrid.io'

// Known TRC-20 token contracts
export const TRC20_CONTRACTS: Record<string, { symbol: string; decimals: number }> = {
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t': { symbol: 'USDT',   decimals: 6  },
  'TEkxiTehnzSmse5XnXbyeZbzZnM8KPVcJy':  { symbol: 'USDC',   decimals: 6  },
  'TNUC9Qb1rRpN8CkUsyjx3Dsx7QqbFzgNBC':  { symbol: 'WTRX',   decimals: 6  },
  'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt':  { symbol: 'USDJ',   decimals: 18 },
  'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9':  { symbol: 'BTC (Wrapped)', decimals: 8 },
}

export const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

// ─── Output Types ─────────────────────────────────────────────────────────────
export interface TRC20Tx {
  hash:          string
  timestamp_ms:  number      // Unix milliseconds
  timestamp_iso: string      // "2024-03-15T10:30:00.000Z"
  from:          string
  to:            string
  amount_raw:    string      // original value from API (big int string)
  amount:        number      // human-readable (divided by 10^decimals)
  symbol:        string      // 'USDT', 'USDC', etc.
  contract:      string      // token contract address
  direction:     'in' | 'out'
  is_whale_tx:   boolean     // amount >= whaleThreshold
  is_dust:       boolean     // amount < minAmount
  explorer_url:  string      // https://tronscan.org/#/transaction/{hash}
}

export interface ScanOptions {
  address:          string
  minAmount?:       number   // dust filter in USDT, default: 1
  whaleThreshold?:  number   // whale flag in USDT, default: 10_000
  limit?:           number   // max txs to fetch per call (max: 200), default: 50
  onlyUsdt?:        boolean  // filter to USDT contract only, default: true
  stopAtHash?:      string   // stop parsing when this hash is found (dedup for cron)
}

export interface ScanResult {
  address:          string
  txs:              TRC20Tx[]   // all fetched & parsed txs (after dust filter)
  new_txs:          TRC20Tx[]   // txs that appeared after stopAtHash
  whale_alerts:     TRC20Tx[]   // txs with is_whale_tx = true
  total_received:   number      // sum of 'in' amounts
  total_sent:       number      // sum of 'out' amounts
  latest_hash:      string | null
  scanned_at:       string
  api_error?:       string
}

// ─── Internal: Fetch raw TronGrid data ───────────────────────────────────────
async function fetchTronGrid(address: string, limit: number, contractFilter?: string): Promise<any[]> {
  const apiKey = process.env.TRONGRID_API_KEY || ''
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (apiKey) headers['TRON-PRO-API-KEY'] = apiKey

  const params = new URLSearchParams({
    limit:    String(Math.min(limit, 200)),
    order_by: 'block_timestamp,desc',
  })
  if (contractFilter) params.set('contract_address', contractFilter)

  const url = `${TRONGRID}/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?${params}`

  const res = await fetch(url, {
    headers,
    signal:    AbortSignal.timeout(15_000),
    cache:     'no-store',
    next:      { revalidate: 0 },
  })

  if (res.status === 404) return []   // address not found on TRON — not an error
  if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}: ${res.statusText}`)

  const body = await res.json()
  if (!Array.isArray(body?.data)) return []
  return body.data
}

// ─── Internal: Parse one raw tx ──────────────────────────────────────────────
function parseRawTx(
  raw:            any,
  selfAddress:    string,
  whaleThreshold: number,
  minAmount:      number,
): TRC20Tx {
  const contract   = raw.token_info?.address || ''
  const meta       = TRC20_CONTRACTS[contract]
  const decimals   = meta?.decimals ?? parseInt(raw.token_info?.decimals ?? '6', 10)
  const divisor    = Math.pow(10, decimals)
  const amountRaw  = raw.value || '0'
  const amount     = parseInt(amountRaw, 10) / divisor
  const self       = selfAddress.trim()

  // TRON addresses are case-sensitive in base58 but TronGrid may return mixed
  const fromAddr = raw.from || ''
  const toAddr   = raw.to   || ''
  const isSender = fromAddr === self || fromAddr.toLowerCase() === self.toLowerCase()

  return {
    hash:          raw.transaction_id || '',
    timestamp_ms:  raw.block_timestamp || Date.now(),
    timestamp_iso: new Date(raw.block_timestamp || Date.now()).toISOString(),
    from:          fromAddr,
    to:            toAddr,
    amount_raw:    amountRaw,
    amount,
    symbol:        meta?.symbol || raw.token_info?.symbol || 'TRC20',
    contract,
    direction:     isSender ? 'out' : 'in',
    is_whale_tx:   amount >= whaleThreshold,
    is_dust:       amount < minAmount,
    explorer_url:  `https://tronscan.org/#/transaction/${raw.transaction_id || ''}`,
  }
}

// ─── Main Export: scanTRC20 ───────────────────────────────────────────────────
export async function scanTRC20(options: ScanOptions): Promise<ScanResult> {
  const {
    address,
    minAmount       = 1,
    whaleThreshold  = 10_000,
    limit           = 50,
    onlyUsdt        = true,
    stopAtHash,
  } = options

  const result: ScanResult = {
    address,
    txs:             [],
    new_txs:         [],
    whale_alerts:    [],
    total_received:  0,
    total_sent:      0,
    latest_hash:     null,
    scanned_at:      new Date().toISOString(),
  }

  try {
    const raw = await fetchTronGrid(address, limit, onlyUsdt ? USDT_CONTRACT : undefined)
    if (!raw.length) return result

    // Parse + dust filter
    const parsed = raw
      .map(tx => parseRawTx(tx, address, whaleThreshold, minAmount))
      .filter(tx => !tx.is_dust)

    result.txs        = parsed
    result.latest_hash = parsed[0]?.hash ?? null

    // Slice: everything BEFORE stopAtHash is "new"
    if (stopAtHash) {
      const idx     = parsed.findIndex(tx => tx.hash === stopAtHash)
      result.new_txs = idx === -1 ? parsed : parsed.slice(0, idx)
    } else {
      result.new_txs = parsed
    }

    result.whale_alerts    = parsed.filter(tx => tx.is_whale_tx)
    result.total_received  = parsed.filter(tx => tx.direction === 'in').reduce((s, t) => s + t.amount, 0)
    result.total_sent      = parsed.filter(tx => tx.direction === 'out').reduce((s, t) => s + t.amount, 0)

  } catch (err: any) {
    result.api_error = err.message
  }

  return result
}

// ─── Convenience: get only USDT new txs for a single address ─────────────────
export async function getNewUSDTtxs(
  address:     string,
  stopAtHash?: string,
  threshold  = 10_000,
): Promise<TRC20Tx[]> {
  const r = await scanTRC20({ address, stopAtHash, whaleThreshold: threshold })
  return r.new_txs
}
