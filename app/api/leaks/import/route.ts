// app/api/leaks/import/route.ts
// Проксі для імпорту витоків на VPS PostgreSQL
// POST /api/leaks/import  — надсилає батч записів до /leaks/import на VPS :8001

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT  = process.env.TELEGRAM_SEARCH_PORT || '8001'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // body: { records: Array<{phone,email,name,...}>, source: string }

    if (!body.records || !Array.isArray(body.records)) {
      return NextResponse.json({ error: 'records array required' }, { status: 400 })
    }

    if (body.records.length === 0) {
      return NextResponse.json({ inserted: 0, skipped: 0 })
    }

    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/leaks/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000), // до 60с для великих батчів
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.error || `VPS error ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
      return NextResponse.json({ error: 'VPS недоступний (таймаут)', vps_offline: true }, { status: 503 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/leaks/import — статус БД витоків (кількість записів)
export async function GET() {
  try {
    const res = await fetch(`http://${VPS_HOST}:${TG_PORT}/leaks/stats`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return NextResponse.json({ error: 'VPS error' }, { status: 502 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'VPS недоступний', total: 0, vps_offline: true }, { status: 503 })
  }
}
