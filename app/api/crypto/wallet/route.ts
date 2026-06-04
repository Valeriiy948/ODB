// app/api/crypto/wallet/route.ts
// Wallet Passport: full analysis of a crypto address across all chains
// POST /api/crypto/wallet  body: { address, chain? }

import { NextRequest, NextResponse } from 'next/server'

const ETHERSCAN_KEY  = process.env.ETHERSCAN_API_KEY  || ''
const BSCSCAN_KEY    = process.env.BSCSCAN_API_KEY    || ''
const POLYGONSCAN_KEY= process.env.POLYGONSCAN_API_KEY || ''

// ─── Auto-detect chain from address format ───────────────────────────────────
function detectChain(address: string): string {
  const addr = address.trim()
  if (/^(1|3|bc1)[a-zA-Z0-9]{25,62}$/.test(addr)) return 'btc'
  if (/^T[a-zA-Z0-9]{33}$/.test(addr))             return 'tron'
  if (/^0x[a-fA-F0-9]{40}$/.test(addr))            return 'eth' // also BSC, Polygon
  if (/^(EQ|UQ)[A-Za-z0-9_\-]{46}$/.test(addr))    return 'ton' // TON user-friendly
  if (/^0:[a-fA-F0-9]{64}$/.test(addr))             return 'ton' // TON raw format
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr))  return 'sol'
  return 'unknown'
}

// ─── Blockchair (free multi-chain, no key needed) ─────────────────────────────
async function analyzeBlockchair(address: string, chain: string): Promise<any> {
  const chainSlug: Record<string, string> = {
    eth: 'ethereum', bsc: 'bnb', polygon: 'matic', btc: 'bitcoin',
  }
  const slug = chainSlug[chain] || 'ethereum'
  try {
    const res = await fetch(
      `https://api.blockchair.com/${slug}/dashboards/address/${address}?limit=50`,
      { signal: AbortSignal.timeout(15000), cache: 'no-store' }
    )
    if (!res.ok) return null
    const data = await res.json()
    const addr = data?.data?.[address]?.address
    const txs  = data?.data?.[address]?.transactions || []
    if (!addr) return null

    const symbol: Record<string, string> = { ethereum: 'ETH', bnb: 'BNB', matic: 'MATIC', bitcoin: 'BTC' }

    return {
      chain,
      address,
      explorer_url:  `https://blockchair.com/${slug}/address/${address}`,
      symbol:        symbol[slug] || 'ETH',
      balance_native: parseFloat(((addr.balance || 0) / 1e18).toFixed(6)),
      balance_usd:   addr.balance_usd || null,
      tx_count:      addr.transaction_count || 0,
      tx_received:   addr.incoming_transaction_count || 0,
      tx_sent:       addr.outgoing_transaction_count || 0,
      first_tx:      addr.first_seen_receiving?.slice(0, 10) || null,
      last_tx:       addr.last_seen_receiving?.slice(0, 10)  || null,
      unique_counterparties: 0,
      top_counterparties: [],
      token_balances: {},
      stablecoin_txs: 0,
      recent_txs: txs.slice(0, 15).map((hash: string) => ({ hash, direction: 'unknown' })),
      risk_flags: [
        (addr.transaction_count || 0) > 100 ? 'high_tx_count' : null,
        (addr.balance_usd || 0) > 50000      ? 'large_usd_balance' : null,
      ].filter(Boolean),
      _source: 'blockchair',
    }
  } catch { return null }
}

// ─── Ethereum / EVM chains (ETH, BSC, Polygon) ───────────────────────────────
async function analyzeEVM(address: string, chain: string): Promise<any> {
  // Etherscan V2 API (2025): chainid-based routing
  const chainIds: Record<string, string> = { eth: '1', bsc: '56', polygon: '137' }
  const endpoints: Record<string, { api: string; key: string; explorer: string; symbol: string }> = {
    eth:     { api: 'https://api.etherscan.io/v2/api',  key: ETHERSCAN_KEY,   explorer: 'https://etherscan.io/address/',    symbol: 'ETH' },
    bsc:     { api: 'https://api.bscscan.com/v2/api',   key: BSCSCAN_KEY,     explorer: 'https://bscscan.com/address/',     symbol: 'BNB' },
    polygon: { api: 'https://api.polygonscan.com/v2/api',key: POLYGONSCAN_KEY,explorer: 'https://polygonscan.com/address/', symbol: 'MATIC' },
  }
  const cfg     = endpoints[chain] || endpoints.eth
  const chainId = chainIds[chain]  || '1'
  const addr    = address.toLowerCase()
  const apiKey  = cfg.key || 'YourApiKeyToken'
  const baseQ   = `${cfg.api}?chainid=${chainId}&apikey=${apiKey}`

  try {
    // Parallel: balance + tx list + token transfers
    const [balRes, txlistRes, tokensRes] = await Promise.all([
      fetch(`${baseQ}&module=account&action=balance&address=${addr}&tag=latest`).then(r => r.json()).catch(() => null),
      fetch(`${baseQ}&module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`).then(r => r.json()).catch(() => null),
      fetch(`${baseQ}&module=account&action=tokentx&address=${addr}&page=1&offset=50&sort=desc`).then(r => r.json()).catch(() => null),
    ])

    // Safely parse balance (guard against API error messages in result)
    const rawBal = balRes?.result
    const balanceWei = (rawBal && /^\d+$/.test(String(rawBal))) ? BigInt(rawBal) : BigInt(0)
    const balanceNative = Number(balanceWei) / 1e18

    const txs: any[] = txlistRes?.result && Array.isArray(txlistRes.result) ? txlistRes.result : []
    const tokenTxs: any[] = tokensRes?.result && Array.isArray(tokensRes.result) ? tokensRes.result : []

    // Analyze tx patterns
    const sent     = txs.filter(t => t.from?.toLowerCase() === addr)
    const received = txs.filter(t => t.to?.toLowerCase()   === addr)
    const firstTx  = txs.length > 0 ? new Date(parseInt(txs[txs.length - 1].timeStamp) * 1000).toISOString().slice(0, 10) : null
    const lastTx   = txs.length > 0 ? new Date(parseInt(txs[0].timeStamp) * 1000).toISOString().slice(0, 10) : null

    // Unique counterparties
    const counterparties = new Set<string>()
    txs.forEach(t => {
      if (t.from?.toLowerCase() !== addr) counterparties.add(t.from?.toLowerCase())
      if (t.to?.toLowerCase()   !== addr) counterparties.add(t.to?.toLowerCase())
    })

    // Token summary
    const tokenSummary: Record<string, number> = {}
    tokenTxs.forEach(t => {
      const sym = t.tokenSymbol || 'UNKNOWN'
      if (!tokenSummary[sym]) tokenSummary[sym] = 0
      if (t.to?.toLowerCase() === addr) tokenSummary[sym] += parseFloat(t.value) / Math.pow(10, parseInt(t.tokenDecimal || '18'))
    })

    // Risk flags
    const riskFlags: string[] = []
    if (txs.length > 100) riskFlags.push('high_volume')
    if (sent.length > received.length * 3) riskFlags.push('mostly_sending')
    const usdt = tokenTxs.filter(t => ['USDT','USDC','BUSD','DAI'].includes(t.tokenSymbol))
    if (usdt.length > 20) riskFlags.push('heavy_stablecoin_usage')

    return {
      chain,
      address,
      explorer_url: cfg.explorer + address,
      symbol:       cfg.symbol,
      balance_native: parseFloat(balanceNative.toFixed(6)),
      tx_count:     txs.length,
      tx_sent:      sent.length,
      tx_received:  received.length,
      first_tx:     firstTx,
      last_tx:      lastTx,
      unique_counterparties: counterparties.size,
      top_counterparties: [...counterparties].slice(0, 10),
      token_balances: tokenSummary,
      stablecoin_txs: usdt.length,
      recent_txs: txs.slice(0, 20).map(t => ({
        hash:      t.hash,
        date:      new Date(parseInt(t.timeStamp) * 1000).toISOString().slice(0, 10),
        from:      t.from,
        to:        t.to,
        value_eth: parseFloat((parseInt(t.value || '0') / 1e18).toFixed(6)),
        direction: t.from?.toLowerCase() === addr ? 'out' : 'in',
        status:    t.isError === '0' ? 'success' : 'failed',
      })),
      risk_flags: riskFlags,
    }
  } catch (err: any) {
    return { chain, address, error: err.message }
  }
}

// ─── Bitcoin (Blockchain.info + Blockchair) ───────────────────────────────────
async function analyzeBTC(address: string): Promise<any> {
  try {
    const [bcRes, chairRes] = await Promise.all([
      fetch(`https://blockchain.info/rawaddr/${address}?limit=50`, {
        headers: { 'User-Agent': 'ODB-Crypto-Intel/1.0' },
        signal: AbortSignal.timeout(15000),
      }).then(r => r.json()).catch(() => null),
      fetch(`https://api.blockchair.com/bitcoin/dashboards/address/${address}?limit=50`, {
        signal: AbortSignal.timeout(15000),
      }).then(r => r.json()).catch(() => null),
    ])

    const data = chairRes?.data?.[address]?.address
    const txs  = bcRes?.txs || []

    const receivedBTC = (bcRes?.total_received  || 0) / 1e8
    const sentBTC     = (bcRes?.total_sent      || 0) / 1e8
    const balanceBTC  = (bcRes?.final_balance   || 0) / 1e8

    const counterparties = new Set<string>()
    txs.forEach((tx: any) => {
      tx.inputs?.forEach((inp: any) => { if (inp.prev_out?.addr && inp.prev_out.addr !== address) counterparties.add(inp.prev_out.addr) })
      tx.out?.forEach((out: any)   => { if (out.addr && out.addr !== address) counterparties.add(out.addr) })
    })

    const riskFlags: string[] = []
    if (receivedBTC > 10) riskFlags.push('large_volume_btc')
    if (txs.length > 200) riskFlags.push('high_tx_count')
    if (bcRes?.n_tx > 500) riskFlags.push('very_active_wallet')

    return {
      chain:             'btc',
      address,
      explorer_url:      `https://www.blockchain.com/explorer/addresses/btc/${address}`,
      symbol:            'BTC',
      balance_native:    parseFloat(balanceBTC.toFixed(8)),
      balance_usd:       data?.balance_usd || null,
      total_received:    parseFloat(receivedBTC.toFixed(8)),
      total_sent:        parseFloat(sentBTC.toFixed(8)),
      tx_count:          bcRes?.n_tx || 0,
      unique_counterparties: counterparties.size,
      top_counterparties: [...counterparties].slice(0, 10),
      first_seen:        data?.first_seen?.slice(0, 10) || null,
      last_seen:         data?.last_seen?.slice(0, 10)  || null,
      recent_txs: txs.slice(0, 15).map((tx: any) => ({
        hash:    tx.hash,
        date:    new Date(tx.time * 1000).toISOString().slice(0, 10),
        value_btc: parseFloat(((tx.out?.reduce((s: number, o: any) => s + (o.addr === address ? o.value : 0), 0) || 0) / 1e8).toFixed(8)),
        inputs:  tx.inputs?.length,
        outputs: tx.out?.length,
      })),
      risk_flags: riskFlags,
    }
  } catch (err: any) {
    return { chain: 'btc', address, error: err.message }
  }
}

// ─── TRON / TRC-20 (popular for USDT scams) ──────────────────────────────────
async function analyzeTRON(address: string): Promise<any> {
  try {
    const [accRes, txRes] = await Promise.all([
      fetch(`https://api.trongrid.io/v1/accounts/${address}`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null),
      fetch(`https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=50&order_by=block_timestamp,desc`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null),
    ])

    const acc   = accRes?.data?.[0]
    const txs   = txRes?.data || []
    const trxBal = acc ? acc.balance / 1e6 : 0

    // TRC-20 tokens
    const trc20: Record<string, number> = {}
    acc?.trc20?.forEach((t: any) => {
      const sym = Object.keys(t)[0]
      trc20[sym] = parseInt(Object.values(t)[0] as string) / 1e6
    })

    const usdtTxs = txs.filter((t: any) => t.token_info?.symbol === 'USDT')
    const riskFlags: string[] = []
    if ((trc20['USDT'] || 0) > 50000)    riskFlags.push('large_usdt_balance')
    if (usdtTxs.length > 30)            riskFlags.push('heavy_usdt_activity')
    if (txs.length > 100)               riskFlags.push('high_tx_count')

    return {
      chain:   'tron',
      address,
      explorer_url: `https://tronscan.org/#/address/${address}`,
      symbol:  'TRX',
      balance_native:  parseFloat(trxBal.toFixed(2)),
      trc20_tokens:    trc20,
      usdt_balance:    trc20['USDT'] || 0,
      total_txs:       txs.length,
      usdt_txs:        usdtTxs.length,
      recent_usdt_txs: usdtTxs.slice(0, 15).map((t: any) => ({
        hash:      t.transaction_id,
        date:      new Date(t.block_timestamp).toISOString().slice(0, 10),
        from:      t.from,
        to:        t.to,
        value_usdt: parseFloat((parseInt(t.value || '0') / 1e6).toFixed(2)),
        direction: t.from === address ? 'out' : 'in',
      })),
      risk_flags: riskFlags,
    }
  } catch (err: any) {
    return { chain: 'tron', address, error: err.message }
  }
}

// ─── TON blockchain (Telegram-linked wallets) ─────────────────────────────────
async function analyzeTON(address: string): Promise<any> {
  try {
    const [accRes, txRes] = await Promise.all([
      fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(address)}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(12000),
      }).then(r => r.json()).catch(() => null),
      fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(address)}/events?limit=50&subject_only=false`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(12000),
      }).then(r => r.json()).catch(() => null),
    ])

    if (!accRes || accRes.error) return { chain: 'ton', address, error: accRes?.error || 'not_found' }

    const balanceTON = (accRes.balance || 0) / 1e9
    const events = txRes?.events || []

    // Find linked Telegram username via TON DNS
    let telegramUsername: string | null = null
    if (accRes.name) telegramUsername = accRes.name  // some wallets have .ton names

    // Analyze events
    const counterparties = new Set<string>()
    let totalReceivedTON = 0
    let totalSentTON = 0

    events.forEach((ev: any) => {
      const action = ev.actions?.[0]
      if (!action) return
      if (action.type === 'TonTransfer') {
        const t = action.TonTransfer
        if (t?.recipient?.address === address || t?.recipient?.raw_form === address) {
          totalReceivedTON += (t.amount || 0) / 1e9
          if (t.sender?.address) counterparties.add(t.sender.address)
        } else if (t?.sender?.address === address || t?.sender?.raw_form === address) {
          totalSentTON += (t.amount || 0) / 1e9
          if (t.recipient?.address) counterparties.add(t.recipient.address)
        }
      }
    })

    // TON DNS lookup — check if address has a .ton domain (= Telegram username link)
    const dnsRes = await fetch(
      `https://tonapi.io/v2/dns/${encodeURIComponent(address)}`,
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) }
    ).then(r => r.json()).catch(() => null)
    if (dnsRes?.names?.length) telegramUsername = dnsRes.names[0]

    const riskFlags: string[] = []
    if (balanceTON > 10000)         riskFlags.push('large_ton_balance')
    if (events.length > 100)        riskFlags.push('high_tx_count')
    if (totalSentTON > 50000)       riskFlags.push('large_volume_ton')
    if (accRes.status === 'frozen')  riskFlags.push('frozen_account')

    return {
      chain:            'ton',
      address,
      explorer_url:     `https://tonscan.org/address/${address}`,
      symbol:           'TON',
      balance_native:   parseFloat(balanceTON.toFixed(4)),
      status:           accRes.status,          // active | frozen | uninit
      is_wallet:        accRes.is_wallet,
      interfaces:       accRes.interfaces || [], // e.g. ["wallet_v4r2"]
      telegram_username: telegramUsername,       // 🔑 KEY: Telegram linkage
      ton_dns_name:     accRes.name || null,
      total_received_ton: parseFloat(totalReceivedTON.toFixed(4)),
      total_sent_ton:   parseFloat(totalSentTON.toFixed(4)),
      tx_count:         accRes.transactions_count || events.length,
      unique_counterparties: counterparties.size,
      top_counterparties: [...counterparties].slice(0, 10),
      recent_events: events.slice(0, 15).map((ev: any) => {
        const a = ev.actions?.[0]
        const t = a?.TonTransfer
        return {
          event_id:  ev.event_id,
          date:      new Date((ev.timestamp || 0) * 1000).toISOString().slice(0, 10),
          type:      a?.type || 'unknown',
          amount_ton: t ? parseFloat(((t.amount || 0) / 1e9).toFixed(4)) : null,
          from:      t?.sender?.address || null,
          to:        t?.recipient?.address || null,
          comment:   t?.comment || null,
        }
      }),
      risk_flags: riskFlags,
      _source: 'tonapi.io',
    }
  } catch (err: any) {
    return { chain: 'ton', address, error: err.message }
  }
}

// ─── Chainalysis Public Sanctions API (free, no key) ─────────────────────────
// Covers: OFAC SDN, EU, UN, HM Treasury + top crypto-specific watchlists
async function checkChainalysisSanctions(address: string): Promise<any> {
  try {
    const res = await fetch(
      `https://public.chainalysis.com/api/v1/address/${address}`,
      {
        headers: {
          'Accept':     'application/json',
          'User-Agent': 'ODB-Crypto-Intel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return { sanctioned: false, error: `HTTP ${res.status}` }
    const data = await res.json()

    // data.identifications = array of sanction matches
    const ids: any[] = data.identifications || []
    const sanctioned  = ids.length > 0

    return {
      sanctioned,
      identifications: ids.map((id: any) => ({
        category:       id.category,       // "sanctions"
        name:           id.name,           // e.g. "OFAC SDN"
        description:    id.description,
        url:            id.url,
      })),
      // Quick flags
      ofac_sanctioned: ids.some(id => id.name?.toLowerCase().includes('ofac')),
      eu_sanctioned:   ids.some(id => id.name?.toLowerCase().includes('eu')),
      un_sanctioned:   ids.some(id => id.name?.toLowerCase().includes('un')),
      _source: 'chainalysis_public',
    }
  } catch (err: any) {
    return { sanctioned: false, error: err.message }
  }
}

// ─── Known scam DB check ──────────────────────────────────────────────────────
async function checkScamDB(address: string): Promise<any> {
  try {
    // CryptoScamDB
    const res = await fetch(`https://cryptoscamdb.org/api/v1/addresses`, {
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)

    // ChainAbuse — real-time scam reports
    const abuseRes = await fetch(`https://www.chainabuse.com/api/reports?address=${address}`, {
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)

    // TODO: bitcoinabuse.com archive, etherscamdb

    return {
      chainabuse_reports: abuseRes?.ok ? (await abuseRes.json().catch(() => null)) : null,
      is_known_scam: false, // будемо заповнювати зі своєї БД
    }
  } catch {
    return { is_known_scam: false }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { address, chain: forceChain } = await req.json()
    if (!address?.trim()) return NextResponse.json({ error: 'address required' }, { status: 400 })

    const addr  = address.trim()
    const chain = forceChain || detectChain(addr)

    let walletData: any = null

    if (chain === 'btc') {
      walletData = await analyzeBTC(addr)
    } else if (chain === 'tron') {
      walletData = await analyzeTRON(addr)
    } else if (chain === 'ton') {
      walletData = await analyzeTON(addr)
    } else if (['eth', 'bsc', 'polygon'].includes(chain)) {
      // Try Etherscan V2 first (needs API key), fallback to Blockchair (free)
      const evmData = await analyzeEVM(addr, chain)
      if (evmData?.tx_count === 0 && !ETHERSCAN_KEY) {
        walletData = (await analyzeBlockchair(addr, chain)) || evmData
      } else {
        walletData = evmData
      }
    } else {
      // Try ETH format as fallback — try Blockchair first (free)
      walletData = (await analyzeBlockchair(addr, 'eth')) || await analyzeEVM(addr, 'eth')
    }

    // Run sanctions + scam checks in parallel
    const [scamCheck, sanctionsCheck] = await Promise.all([
      checkScamDB(addr),
      checkChainalysisSanctions(addr),
    ])

    // Calculate risk score (0-100)
    let riskScore = 0
    const flags = walletData?.risk_flags || []
    if (flags.includes('large_volume_btc'))      riskScore += 20
    if (flags.includes('large_usdt_balance'))    riskScore += 25
    if (flags.includes('heavy_usdt_activity'))   riskScore += 30
    if (flags.includes('high_tx_count'))         riskScore += 15
    if (flags.includes('heavy_stablecoin_usage'))riskScore += 20
    if (flags.includes('mostly_sending'))        riskScore += 10
    if (flags.includes('large_ton_balance'))     riskScore += 20
    if (flags.includes('large_volume_ton'))      riskScore += 15
    if (flags.includes('frozen_account'))        riskScore += 30
    if (scamCheck.is_known_scam)                 riskScore += 50
    if ((scamCheck.chainabuse_reports?.total || 0) > 0) riskScore += 40
    // Sanctions = automatic critical
    if (sanctionsCheck.sanctioned)               riskScore += 80
    if (sanctionsCheck.ofac_sanctioned)          riskScore += 20  // extra weight for OFAC

    return NextResponse.json({
      success:     true,
      address:     addr,
      chain,
      detected_chain: detectChain(addr),
      wallet:      walletData,
      scam_check:  scamCheck,
      sanctions:   sanctionsCheck,
      risk_score:  Math.min(riskScore, 100),
      risk_level:  riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'high' : riskScore >= 20 ? 'medium' : 'low',
      // Telegram linkage (TON-specific)
      telegram_link: chain === 'ton' ? (walletData?.telegram_username || null) : null,
      analyzed_at: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
