// app/api/wallet/analyze/route.ts
// POST /api/wallet/analyze — аналіз крипто-гаманця через Etherscan / Tronscan

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// TODO: VPS Python cron job (щодобово) завантажує OFAC SDN CSV,
// парсить його і синхронізує з таблицею ofac_cache в Supabase.
// Vercel тоді звертається до ofac_cache замість зовнішнього сервісу.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY ?? ''
const TRONSCAN_KEY  = process.env.TRONSCAN_API_KEY  ?? ''

// Відомі міксер-адреси (Tornado Cash та похідні)
const MIXER_ADDRESSES = new Set([
  '0x722122df12d4e14e13ac3b6895a86e84145b6967', // Tornado Cash Router
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', // Tornado Cash 0.1 ETH
  '0x9ad122c22b14202b4490edaf288fdb3c7cb3ff5e', // Tornado Cash 1 ETH
  '0x905b63fff465b9ffbf41dea908ceb12478ec7601', // Tornado Cash 10 ETH
  '0xa160cdab225685da1d56aa342ad8841c3b53f291', // Tornado Cash 100 ETH
  '0x94a1b5cdb22c43faab4abeb5c74999895464ddaf', // Tornado Cash USDC
  '0xb541fc07bc7619fd4062a54d96268525cbc6ffef', // Tornado Cash DAI
  '0x12d66f87a04a9e220c9d05126361076772e4824e', // Tornado Cash USDT
  '0x47ce0c6ef4b686a7af6eb5571be7a2d8dbc15a8',  // Tornado Cash WBTC
])

export interface Transaction {
  hash: string
  from: string
  to: string
  value_usd: number | null
  timestamp: string
  block: number
}

interface AnalyzeResponse {
  balance_usd: number | null
  transactions: Transaction[]
  risk_score: number
  risk_labels: string[]
  partial?: boolean
}

// Затримка в мілісекундах
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Fetch з exponential backoff при 429
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 4
): Promise<Response> {
  const delays = [0, 1000, 2000, 4000]

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (delays[attempt] > 0) await sleep(delays[attempt])

    const res = await fetch(url, options)
    if (res.status !== 429) return res

    // Після останньої спроби — кидаємо спеціальну помилку
    if (attempt === maxRetries - 1) {
      throw Object.assign(new Error('RATE_LIMIT'), { retry_after: 60 })
    }
  }
  // TypeScript вимагає повернення — недосяжний код
  throw new Error('RATE_LIMIT')
}

// ─── Аналіз ERC-20 через Etherscan ───────────────────────────────────────────
async function analyzeERC20(address: string): Promise<{
  balance_usd: number | null
  transactions: Transaction[]
  risk_labels: string[]
}> {
  const base = 'https://api.etherscan.io/api'
  const key  = ETHERSCAN_KEY || 'YourApiKeyToken'
  const addr = address.toLowerCase()

  const [balRes, txRes, priceRes] = await Promise.all([
    fetchWithRetry(
      `${base}?module=account&action=balance&address=${addr}&tag=latest&apikey=${key}`
    ).then(r => r.json() as Promise<{ status: string; result: string }>),

    fetchWithRetry(
      `${base}?module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc&apikey=${key}`
    ).then(r => r.json() as Promise<{ status: string; result: EthTx[] | string }>),

    // ETH ціна для конвертації в USD
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
      .then(r => r.json() as Promise<{ ethereum?: { usd?: number } }>)
      .catch(() => ({} as { ethereum?: { usd?: number } })),
  ])

  const ethPriceUsd = priceRes?.ethereum?.usd ?? 0

  const rawBal = balRes?.result
  const balanceEth = (rawBal && /^\d+$/.test(String(rawBal)))
    ? Number(BigInt(rawBal)) / 1e18
    : 0
  const balance_usd = ethPriceUsd > 0 ? Math.round(balanceEth * ethPriceUsd * 100) / 100 : null

  const rawTxs: EthTx[] = Array.isArray(txRes?.result) ? txRes.result : []
  const risk_labels: string[] = []

  // Перевірка на транзакції з міксерами
  const mixerHit = rawTxs.some(
    tx => MIXER_ADDRESSES.has(tx.from?.toLowerCase()) || MIXER_ADDRESSES.has(tx.to?.toLowerCase())
  )
  if (mixerHit) risk_labels.push('mixer')

  // Перевірка на концентрацію транзакцій з одним контрагентом
  const counterpartyCount: Record<string, number> = {}
  rawTxs.forEach(tx => {
    const cp = tx.from?.toLowerCase() === addr ? tx.to?.toLowerCase() : tx.from?.toLowerCase()
    if (cp) counterpartyCount[cp] = (counterpartyCount[cp] ?? 0) + 1
  })
  const maxConcentration = Math.max(0, ...Object.values(counterpartyCount))

  const transactions: Transaction[] = rawTxs.map(tx => ({
    hash:      tx.hash,
    from:      tx.from,
    to:        tx.to,
    value_usd: ethPriceUsd > 0
      ? Math.round((Number(BigInt(tx.value || '0')) / 1e18) * ethPriceUsd * 100) / 100
      : null,
    timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
    block:     parseInt(tx.blockNumber),
  }))

  return { balance_usd, transactions, risk_labels, _maxConcentration: maxConcentration } as {
    balance_usd: number | null
    transactions: Transaction[]
    risk_labels: string[]
    _maxConcentration: number
  }
}

// ─── Аналіз TRC-20 через Tronscan ────────────────────────────────────────────
async function analyzeTRC20(address: string): Promise<{
  balance_usd: number | null
  transactions: Transaction[]
  risk_labels: string[]
}> {
  const headers: HeadersInit = TRONSCAN_KEY
    ? { 'TRON-PRO-API-KEY': TRONSCAN_KEY }
    : {}

  const [accRes, txRes] = await Promise.all([
    fetchWithRetry(
      `https://apilist.tronscanapi.com/api/accountv2?address=${address}`,
      { headers }
    ).then(r => r.json() as Promise<TronAccount>),

    fetchWithRetry(
      `https://apilist.tronscanapi.com/api/transaction?address=${address}&limit=50&start=0`,
      { headers }
    ).then(r => r.json() as Promise<{ data: TronTx[] }>),
  ])

  // USDT баланс уже в USD (множник 1e6)
  const usdtToken = accRes?.trc20token_balances?.find(t => t.tokenAbbr === 'USDT')
  const balance_usd = usdtToken
    ? Math.round((parseInt(usdtToken.balance) / 1e6) * 100) / 100
    : null

  const rawTxs: TronTx[] = txRes?.data ?? []
  const risk_labels: string[] = []

  const counterpartyCount: Record<string, number> = {}
  rawTxs.forEach(tx => {
    const cp = tx.ownerAddress === address ? tx.toAddress : tx.ownerAddress
    if (cp) counterpartyCount[cp] = (counterpartyCount[cp] ?? 0) + 1
  })
  const maxConcentration = Math.max(0, ...Object.values(counterpartyCount))

  const transactions: Transaction[] = rawTxs.map(tx => ({
    hash:      tx.hash,
    from:      tx.ownerAddress,
    to:        tx.toAddress,
    value_usd: tx.contractData?.amount
      ? Math.round((tx.contractData.amount / 1e6) * 100) / 100
      : null,
    timestamp: new Date(tx.timestamp).toISOString(),
    block:     tx.block,
  }))

  return { balance_usd, transactions, risk_labels, _maxConcentration: maxConcentration } as {
    balance_usd: number | null
    transactions: Transaction[]
    risk_labels: string[]
    _maxConcentration: number
  }
}

// ─── Розрахунок risk_score ────────────────────────────────────────────────────
function calcRiskScore(params: {
  balance_usd: number | null
  maxConcentration: number
  risk_labels: string[]
  ofac_hit?: boolean
}): number {
  let score = 0
  if (params.maxConcentration > 100) score += 30
  if (params.risk_labels.includes('mixer')) score += 25
  if ((params.balance_usd ?? 0) > 500_000) score += 20
  if (params.ofac_hit) score += 25
  return Math.min(score, 100)
}

// ─── Типи Etherscan / Tronscan ────────────────────────────────────────────────
interface EthTx {
  hash: string
  from: string
  to: string
  value: string
  timeStamp: string
  blockNumber: string
}

interface TronAccount {
  trc20token_balances?: Array<{ tokenAbbr: string; balance: string }>
}

interface TronTx {
  hash: string
  ownerAddress: string
  toAddress: string
  timestamp: number
  block: number
  contractData?: { amount?: number }
}

// ─── Головний обробник ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let partial = false

  try {
    const body = await req.json() as {
      wallet_address: string
      network: 'ERC-20' | 'TRC-20'
      person_id: string
    }
    const { wallet_address, network, person_id } = body

    // Валідація формату адреси
    if (network === 'ERC-20' && !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return NextResponse.json({ error: 'Невалідна ERC-20 адреса' }, { status: 400 })
    }
    if (network === 'TRC-20' && !/^T[a-zA-Z0-9]{33}$/.test(wallet_address)) {
      return NextResponse.json({ error: 'Невалідна TRC-20 адреса' }, { status: 400 })
    }
    if (!person_id) {
      return NextResponse.json({ error: 'person_id обовʼязковий' }, { status: 400 })
    }

    // Timeout guard — 50с, після чого повертаємо часткові дані
    const timeoutId = setTimeout(() => { partial = true }, 50_000)

    let result: {
      balance_usd: number | null
      transactions: Transaction[]
      risk_labels: string[]
      _maxConcentration: number
    }

    try {
      if (network === 'ERC-20') {
        result = await analyzeERC20(wallet_address) as typeof result
      } else {
        result = await analyzeTRC20(wallet_address) as typeof result
      }
    } catch (err) {
      clearTimeout(timeoutId)
      const e = err as Error & { retry_after?: number }
      if (e.message === 'RATE_LIMIT') {
        return NextResponse.json({ error: 'RATE_LIMIT', retry_after: e.retry_after ?? 60 }, { status: 429 })
      }
      throw err
    }

    clearTimeout(timeoutId)

    const risk_score = calcRiskScore({
      balance_usd:      result.balance_usd,
      maxConcentration: result._maxConcentration,
      risk_labels:      result.risk_labels,
    })

    // Upsert у crypto_wallets (конфлікт по (person_id, wallet_address))
    await supabase
      .from('crypto_wallets')
      .upsert(
        {
          person_id,
          wallet_address,
          network,
          balance_usd:     result.balance_usd,
          risk_score,
          risk_labels:     result.risk_labels,
          last_checked_at: new Date().toISOString(),
          raw_data:        { transactions_count: result.transactions.length },
        },
        { onConflict: 'person_id,wallet_address' }
      )

    const response: AnalyzeResponse = {
      balance_usd:  result.balance_usd,
      transactions: result.transactions,
      risk_score,
      risk_labels:  result.risk_labels,
      ...(partial ? { partial: true } : {}),
    }

    return NextResponse.json(response)
  } catch (err) {
    const e = err as Error
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
