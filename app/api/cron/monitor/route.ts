// app/api/cron/monitor/route.ts
// Autonomous watchlist monitor — scans crypto addresses and sends Telegram alerts
//
// ── Vercel Cron (vercel.json) ──────────────────────────────────────────────────
// Vercel Hobby: max daily cron. For 15-min intervals → use external cron:
//   https://cron-job.org  (free, 1-min intervals)
//   URL:  https://odb-one.vercel.app/api/cron/monitor
//   Auth: Header  →  Authorization: Bearer <CRON_SECRET>
//
// ── Environment Variables Required ────────────────────────────────────────────
//   TELEGRAM_BOT_TOKEN    — from @BotFather
//   TELEGRAM_CHAT_ID      — your group/channel chat ID
//   CRON_SECRET           — any random secret for auth (optional in dev)
//   TRONGRID_API_KEY      — optional, increases TronGrid rate limits
//   ETHERSCAN_API_KEY     — for ETH address monitoring

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import { scanTRC20 }                 from '@/lib/crypto/tron-scanner'
import { getWalletBalance }          from '@/lib/crypto/wallet-balance'
import { sendTelegramMessage, formatWatchlistAlert, formatCronSummary } from '@/lib/telegram'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── Auth: allow Vercel Cron signature OR Bearer token ───────────────────────
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true  // dev: open without secret

  // Vercel Cron sets this header — trust it
  if (req.headers.get('x-vercel-cron-signature')) return true

  // External cron: Authorization: Bearer <CRON_SECRET>
  return req.headers.get('authorization') === `Bearer ${cronSecret}`
}

// ─── ETH: get latest tx hash (basic check — needs ETHERSCAN_API_KEY) ─────────
async function getLatestETHtx(
  address: string,
): Promise<{ hash: string; amount_eth: number } | null> {
  const key = process.env.ETHERSCAN_API_KEY || ''
  if (!key) return null

  try {
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist` +
      `&address=${address}&page=1&offset=3&sort=desc&apikey=${key}`,
      { signal: AbortSignal.timeout(10_000) },
    )
    const data = await res.json()
    const txs  = Array.isArray(data.result) ? data.result : []
    if (!txs.length) return null
    return {
      hash:       txs[0].hash,
      amount_eth: parseInt(txs[0].value, 10) / 1e18,
    }
  } catch { return null }
}

// ─── BTC: get latest tx hash ─────────────────────────────────────────────────
async function getLatestBTCtx(
  address: string,
): Promise<{ hash: string; amount_btc: number } | null> {
  try {
    const res = await fetch(
      `https://blockchain.info/rawaddr/${address}?limit=3`,
      { headers: { 'User-Agent': 'ODB-Monitor/1.0' }, signal: AbortSignal.timeout(10_000) },
    )
    const data = await res.json()
    const txs  = data.txs || []
    if (!txs.length) return null
    return {
      hash:       txs[0].hash,
      amount_btc: Math.abs(txs[0].result) / 1e8,
    }
  } catch { return null }
}

// ─── Main GET handler (Vercel Cron uses GET) ──────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt   = Date.now()
  const log: string[] = []
  let alertsSent    = 0
  let addrChecked   = 0
  let errors        = 0

  // 1. Fetch active watchlist entries from Supabase
  const { data: watchlist, error: dbErr } = await supabase
    .from('crypto_watchlist')
    .select('*')
    .eq('status', 'active')
    .eq('alert_new_tx', true)
    .order('last_checked', { ascending: true, nullsFirst: true }) // oldest-checked first

  if (dbErr) {
    return NextResponse.json(
      { error: `DB error: ${dbErr.message}` },
      { status: 500 },
    )
  }

  if (!watchlist?.length) {
    return NextResponse.json({
      success: true,
      message: 'Watchlist is empty or no active entries',
      checked: 0,
    })
  }

  log.push(`▶ Starting monitor: ${watchlist.length} active addresses`)

  // 2. Scan each address — graceful degradation: errors don't stop the loop
  for (const entry of watchlist) {
    addrChecked++
    const {
      id, address, chain = 'tron',
      label, last_tx_hash, risk_level, notes,
    } = entry

    const shortAddr = address.slice(0, 10) + '…'

    try {

      // ── TRON: Full TRC-20 USDT scan ───────────────────────────────────────
      if (chain === 'tron') {
        const scan = await scanTRC20({
          address,
          stopAtHash:    last_tx_hash ?? undefined,
          whaleThreshold: 10_000,
          minAmount:     5,          // ignore transactions < $5 USDT
          limit:         30,
          onlyUsdt:      true,
        })

        // API error — log and continue to next address
        if (scan.api_error) {
          log.push(`  [${shortAddr}] ❌ TronGrid: ${scan.api_error}`)
          errors++
          await sleep(500)
          continue
        }

        // Update last_checked regardless of new txs
        await supabase
          .from('crypto_watchlist')
          .update({ last_checked: new Date().toISOString() })
          .eq('id', id)

        if (!scan.new_txs.length) {
          log.push(`  [${shortAddr}] ✓ No new txs`)
          await sleep(300)
          continue
        }

        log.push(
          `  [${shortAddr}] 🔔 ${scan.new_txs.length} new tx(s)` +
          (scan.whale_alerts.length ? ` | 🐋 ${scan.whale_alerts.length} whale(s)` : '')
        )

        // Fetch wallet balance once per address (for first alert enrichment)
        const balance = await getWalletBalance(address, chain).catch(() => null)

        // Send alert for each new tx (cap at 3 to avoid spam floods)
        const toAlert = scan.new_txs.slice(0, 3)
        for (const tx of toAlert) {
          const { text, keyboard } = formatWatchlistAlert({
            label:           label || shortAddr,
            address,
            chain,
            amount:          tx.amount,
            symbol:          tx.symbol,
            txHash:          tx.hash,
            direction:       tx.direction,
            is_whale:        tx.is_whale_tx,
            risk_level:      risk_level || 'unknown',
            explorer_url:    tx.explorer_url,
            notes:           notes || undefined,
            balance_usdt:    balance?.usdt,
            balance_native:  balance?.native,
            native_symbol:   balance?.native_symbol,
          })

          const sent = await sendTelegramMessage(text, 'HTML', undefined, { inline_keyboard: keyboard })
          if (sent) alertsSent++
          await sleep(200)  // slight delay between messages
        }

        // Update last_tx_hash to the newest tx
        await supabase
          .from('crypto_watchlist')
          .update({
            last_tx_hash: scan.new_txs[0].hash,
            last_checked: new Date().toISOString(),
          })
          .eq('id', id)
      }

      // ── ETH: Basic new-tx check ────────────────────────────────────────────
      else if (chain === 'eth') {
        const result = await getLatestETHtx(address)
        if (!result) {
          log.push(`  [${shortAddr}] ⚠ ETH: no data (API key missing?)`)
          await sleep(300)
          continue
        }
        if (result.hash === last_tx_hash) {
          log.push(`  [${shortAddr}] ✓ ETH no new txs`)
          await supabase
            .from('crypto_watchlist')
            .update({ last_checked: new Date().toISOString() })
            .eq('id', id)
          await sleep(300)
          continue
        }

        log.push(`  [${shortAddr}] 🔔 ETH new tx: ${result.amount_eth.toFixed(4)} ETH`)
        const ethBalance = await getWalletBalance(address, 'eth').catch(() => null)
        const { text: ethText, keyboard: ethKb } = formatWatchlistAlert({
          label:          label || shortAddr,
          address,
          chain,
          amount:         result.amount_eth,
          symbol:         'ETH',
          txHash:         result.hash,
          direction:      'in',
          is_whale:       result.amount_eth * 3000 >= 10_000,
          risk_level:     risk_level || 'unknown',
          explorer_url:   `https://etherscan.io/tx/${result.hash}`,
          notes:          notes || undefined,
          balance_native: ethBalance?.native,
          native_symbol:  'ETH',
        })
        const sent = await sendTelegramMessage(ethText, 'HTML', undefined, { inline_keyboard: ethKb })
        if (sent) alertsSent++
        await supabase
          .from('crypto_watchlist')
          .update({ last_tx_hash: result.hash, last_checked: new Date().toISOString() })
          .eq('id', id)
      }

      // ── BTC: Basic new-tx check ────────────────────────────────────────────
      else if (chain === 'btc') {
        const result = await getLatestBTCtx(address)
        if (!result || result.hash === last_tx_hash) {
          log.push(`  [${shortAddr}] ✓ BTC no new txs`)
          await supabase
            .from('crypto_watchlist')
            .update({ last_checked: new Date().toISOString() })
            .eq('id', id)
          await sleep(300)
          continue
        }

        log.push(`  [${shortAddr}] 🔔 BTC new tx: ${result.amount_btc.toFixed(6)} BTC`)
        const btcBalance = await getWalletBalance(address, 'btc').catch(() => null)
        const { text: btcText, keyboard: btcKb } = formatWatchlistAlert({
          label:          label || shortAddr,
          address,
          chain,
          amount:         result.amount_btc,
          symbol:         'BTC',
          txHash:         result.hash,
          direction:      'in',
          is_whale:       result.amount_btc * 60_000 >= 10_000,
          risk_level:     risk_level || 'unknown',
          explorer_url:   `https://mempool.space/tx/${result.hash}`,
          notes:          notes || undefined,
          balance_native: btcBalance?.native,
          native_symbol:  'BTC',
        })
        const sent = await sendTelegramMessage(btcText, 'HTML', undefined, { inline_keyboard: btcKb })
        if (sent) alertsSent++
        await supabase
          .from('crypto_watchlist')
          .update({ last_tx_hash: result.hash, last_checked: new Date().toISOString() })
          .eq('id', id)
      }

    } catch (err: any) {
      // Graceful degradation: log error, continue to next address
      errors++
      log.push(`  [${shortAddr}] 💥 Unexpected error: ${err.message}`)
    }

    // Rate-limit friendly pause between addresses
    await sleep(400)
  }

  const elapsed = Date.now() - startedAt
  log.push(`▶ Done: ${addrChecked} checked, ${alertsSent} alerts, ${errors} errors — ${elapsed}ms`)

  // Send cron summary to Telegram (only if there were alerts or errors)
  if (alertsSent > 0 || errors > 0) {
    await sendTelegramMessage(
      formatCronSummary({
        checked:    addrChecked,
        alerts:     alertsSent,
        errors,
        elapsed_ms: elapsed,
        ran_at:     new Date().toISOString(),
      })
    )
  }

  return NextResponse.json({
    success:           true,
    addresses_checked: addrChecked,
    alerts_sent:       alertsSent,
    errors,
    elapsed_ms:        elapsed,
    log,
    ran_at:            new Date().toISOString(),
  })
}
