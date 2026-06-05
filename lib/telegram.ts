// lib/telegram.ts
// Telegram notification utility for ODB OSINT Platform alerts
//
// Setup:
//   1. Create a bot: https://t.me/BotFather → /newbot → get TOKEN
//   2. Add bot to your group/channel → get CHAT_ID via:
//      https://api.telegram.org/bot<TOKEN>/getUpdates  (send any message first)
//   3. Set env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

const TG_API = 'https://api.telegram.org'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TelegramConfig {
  token:   string
  chat_id: string
}

export interface WatchlistAlertParams {
  label:        string      // address label from watchlist
  address:      string      // full crypto address
  chain:        string      // 'tron' | 'eth' | 'btc'
  amount:       number      // tx amount in USD/token
  symbol:       string      // 'USDT' | 'ETH' | 'BTC'
  txHash:       string      // transaction hash
  direction:    'in' | 'out'
  is_whale:     boolean
  risk_level?:  string
  explorer_url: string      // link to block explorer
  notes?:       string      // optional notes from watchlist
}

// ─── Core: send a message ─────────────────────────────────────────────────────
export async function sendTelegramMessage(
  text:      string,
  parseMode: 'HTML' | 'MarkdownV2' = 'HTML',
  config?:   Partial<TelegramConfig>,
): Promise<boolean> {
  const token   = config?.token   || process.env.TELEGRAM_BOT_TOKEN   || ''
  const chat_id = config?.chat_id || process.env.TELEGRAM_CHAT_ID     || ''

  if (!token || !chat_id) {
    console.warn('[ODB/Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured')
    return false
  }

  try {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        chat_id,
        text,
        parse_mode:               parseMode,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    const data = await res.json()
    if (!data.ok) {
      console.error('[ODB/Telegram] API error:', data.description, '| code:', data.error_code)
      return false
    }
    return true

  } catch (err: any) {
    console.error('[ODB/Telegram] Send failed:', err.message)
    return false
  }
}

// ─── Formatter: Watchlist Alert (HTML) ───────────────────────────────────────
export function formatWatchlistAlert(p: WatchlistAlertParams): string {
  const dirLabel   = p.direction === 'in'  ? '📥 Надходження' : '📤 Відправлення'
  const riskEmoji  = p.risk_level === 'critical' ? '🔴'
                   : p.risk_level === 'high'     ? '🟠'
                   : p.risk_level === 'medium'   ? '🟡'
                   : '⚪'
  const whaleTag   = p.is_whale ? '\n🐋 <b>WHALE ALERT</b> — транзакція &gt; $10,000' : ''
  const chainLabel = p.chain === 'tron' ? 'TRON'
                   : p.chain === 'eth'  ? 'Ethereum'
                   : p.chain === 'btc'  ? 'Bitcoin'
                   : p.chain.toUpperCase()

  const amountFmt  = p.amount.toLocaleString('en-US', {
    minimumFractionDigits:  2,
    maximumFractionDigits:  2,
  })
  const shortAddr  = p.address.length > 20
    ? p.address.slice(0, 10) + '…' + p.address.slice(-8)
    : p.address
  const shortHash  = p.txHash.length > 20
    ? p.txHash.slice(0, 14) + '…' + p.txHash.slice(-8)
    : p.txHash

  const timestamp  = new Date().toLocaleString('uk-UA', {
    timeZone:    'Europe/Kyiv',
    hour12:      false,
    year:        'numeric',
    month:       '2-digit',
    day:         '2-digit',
    hour:        '2-digit',
    minute:      '2-digit',
  })

  const lines = [
    `🚨 <b>ODB OSINT Alert: Активність цілі</b> 🚨`,
    ``,
    `<b>Об'єкт:</b> ${htmlEscape(p.label || 'Без назви')}`,
    `<b>Адреса:</b> <code>${htmlEscape(shortAddr)}</code>`,
    `<b>Мережа:</b> ${chainLabel} (${p.symbol})`,
    ``,
    `${dirLabel}${whaleTag}`,
    `💸 <b>Сума:</b> $${amountFmt} ${p.symbol}`,
    ``,
    `🔗 <b>Транзакція:</b> <a href="${p.explorer_url}">${htmlEscape(shortHash)}</a>`,
    `${riskEmoji} <b>Ризик:</b> ${htmlEscape(p.risk_level || 'unknown')}`,
  ]

  if (p.notes) {
    lines.push(``)
    lines.push(`📋 <b>Нотатки:</b> ${htmlEscape(p.notes)}`)
  }

  lines.push(``)
  lines.push(`<i>ODB Platform · ${timestamp} (Kyiv)</i>`)

  return lines.join('\n')
}

// ─── Formatter: System notification ──────────────────────────────────────────
export function formatCronSummary(params: {
  checked:     number
  alerts:      number
  errors:      number
  elapsed_ms:  number
  ran_at:      string
}): string {
  const statusEmoji = params.errors > 0 ? '⚠️' : '✅'
  return [
    `${statusEmoji} <b>ODB Monitor — звіт запуску</b>`,
    ``,
    `🔍 Перевірено адрес: <b>${params.checked}</b>`,
    `🔔 Надіслано сповіщень: <b>${params.alerts}</b>`,
    `❌ Помилок: <b>${params.errors}</b>`,
    `⏱ Час: ${(params.elapsed_ms / 1000).toFixed(1)}s`,
    ``,
    `<i>${params.ran_at}</i>`,
  ].join('\n')
}

// ─── Helper: escape HTML special chars ───────────────────────────────────────
function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
