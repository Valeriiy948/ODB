// app/api/leaks/route.ts
// Пошук у локальній БД витоків на VPS
// POST /api/leaks  — пошук за phone/email/inn/snils/passport/name
// GET  /api/leaks  — статистика БД витоків

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT  = process.env.TELEGRAM_SEARCH_PORT || '8001'

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  ros_pasport:  { label: 'РосПаспорт',  color: 'red' },
  gosuslugi:    { label: 'Гослуслуги',  color: 'red' },
  mts:          { label: 'МТС',         color: 'orange' },
  beeline:      { label: 'Билайн',      color: 'orange' },
  fssp:         { label: 'ФССП',        color: 'yellow' },
  military:     { label: 'Військові',   color: 'red' },
  spektr:       { label: 'Спектр',      color: 'purple' },
  getcontact:   { label: 'GetContact',  color: 'blue' },
  black_sprut:  { label: 'BlackSprut',  color: 'gray' },
  vk:           { label: 'VK',          color: 'blue' },
  unknown:      { label: 'Невідомо',    color: 'gray' },
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/leaks/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.error || 'VPS error', results: [] },
        { status: res.status }
      )
    }

    const data = await res.json()

    // Збагачуємо результати мітками джерел
    const results = (data.results || []).map((r: any) => ({
      ...r,
      source_label: SOURCE_LABELS[r.source]?.label || r.source,
      source_color: SOURCE_LABELS[r.source]?.color || 'gray',
    }))

    return NextResponse.json({
      results,
      total: results.length,
      searched: body,
    })
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
      return NextResponse.json(
        { error: 'VPS недоступний', results: [], vps_offline: true },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 })
  }
}

export async function GET() {
  try {
    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/leaks/stats`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return NextResponse.json({ error: 'VPS error' }, { status: 502 })
    const data = await res.json()
    return NextResponse.json({
      ...data,
      source_labels: SOURCE_LABELS,
    })
  } catch {
    return NextResponse.json({ error: 'VPS недоступний', total: 0, vps_offline: true }, { status: 503 })
  }
}
