// lib/telegram.ts
// Telegram notification utility for ODB OSINT Platform alerts

const TG_API = 'https://api.telegram.org'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TelegramConfig {
  token:   string
  chat_id: string
}

export interface InlineKeyboardButton {
  text:          string
  url?:          string
  callback_data?: string
}

export type InlineKeyboard = InlineKeyboardButton[][]

export interface WatchlistAlertParams {
  label:        string
  address:      string
  chain:        string
  amount:       number
  symbol:       string
  txHash:       string
  direction:    'in' | 'out'
  is_whale:     boolean
  risk_level?:  string
  explorer_url: string
  notes?:       string
  // Optional balance info
  balance_usdt?: number
  balance_native?: number
  native_symbol?: string
}

// ─── Core: send a message ─────────────────────────────────────────────────────
export async function sendTelegramMessage(
  text:          string,
  parseMode:     'HTML' | 'MarkdownV2' = 'HTML',
  config?:       Partial<TelegramConfig>,
  replyMarkup?:  { inline_keyboard: InlineKeyboard },
): Promise<boolean> {
  const token   = config?.token   || process.env.TELEGRAM_BOT_TOKEN   || ''
  const chat_id = config?.chat_id || process.env.TELEGRAM_CHAT_ID     || ''

  if (!token || !chat_id) {
    console.warn('[ODB/Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured')
    return false
  }

  try {
    const body: Record<string, any> = {
      chat_id,
      text,
      parse_mode:               parseMode,
      disable_web_page_preview: true,
    }
    if (replyMarkup) body.reply_markup = replyMarkup

    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(10_000),
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

// ─── Core: answer callback query (for inline button presses) ──────────────────
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?:           string,
  showAlert?:      boolean,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN || ''
  if (!token) return
  await fetch(`${TG_API}/bot${token}/answerCallbackQuery`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert }),
    signal:  AbortSignal.timeout(5_000),
  }).catch(() => {})
}

// ─── Core: edit message text ──────────────────────────────────────────────────
export async function editTelegramMessage(
  chatId:    string | number,
  messageId: number,
  text:      string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN || ''
  if (!token) return
  await fetch(`${TG_API}/bot${token}/editMessageText`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      chat_id:    chatId,
      message_id: messageId,
      text,
      parse_mode:               'HTML',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {})
}

// ─── Formatter: Watchlist Alert (HTML) ───────────────────────────────────────
export function formatWatchlistAlert(p: WatchlistAlertParams): {
  text:     string
  keyboard: InlineKeyboard
} {
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

  const amountFmt = p.amount.toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
  const shortAddr = p.address.length > 20
    ? p.address.slice(0, 10) + '…' + p.address.slice(-8)
    : p.address
  const shortHash = p.txHash.length > 20
    ? p.txHash.slice(0, 14) + '…' + p.txHash.slice(-8)
    : p.txHash

  const timestamp = new Date().toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
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

  // Balance line (if available)
  if (p.balance_usdt !== undefined) {
    const balFmt = p.balance_usdt.toLocaleString('en-US', { maximumFractionDigits: 2 })
    lines.push(`💰 <b>Баланс гаманця:</b> $${balFmt} USDT`)
  }

  if (p.notes) {
    lines.push(``)
    lines.push(`📋 <b>Нотатки:</b> ${htmlEscape(p.notes)}`)
  }

  lines.push(``)
  lines.push(`<i>ODB Platform · ${timestamp} (Kyiv)</i>`)

  // ── Inline keyboard ──────────────────────────────────────────────────────────
  const explorerLabel = p.chain === 'tron' ? '🔍 TronScan'
                      : p.chain === 'eth'  ? '🔍 Etherscan'
                      : p.chain === 'btc'  ? '🔍 Mempool'
                      : '🔍 Explorer'

  const addressExplorerUrl = p.chain === 'tron'
    ? `https://tronscan.org/#/address/${p.address}`
    : p.chain === 'eth'
    ? `https://etherscan.io/address/${p.address}`
    : p.chain === 'btc'
    ? `https://mempool.space/address/${p.address}`
    : p.explorer_url

  const odbSearchUrl = `${process.env.APP_URL || 'https://odb-one.vercel.app'}/crypto-intel?address=${encodeURIComponent(p.address)}`

  const keyboard: InlineKeyboard = [
    [
      { text: explorerLabel,   url: p.explorer_url },
      { text: '📊 Адреса',     url: addressExplorerUrl },
    ],
    [
      { text: '🔎 ODB Розслідування', url: odbSearchUrl },
    ],
  ]

  return { text: lines.join('\n'), keyboard }
}

// ─── Formatter: System notification ──────────────────────────────────────────
export function formatCronSummary(params: {
  checked:    number
  alerts:     number
  errors:     number
  elapsed_ms: number
  ran_at:     string
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

// ─── Helper ───────────────────────────────────────────────────────────────────
function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
