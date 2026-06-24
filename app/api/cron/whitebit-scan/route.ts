// app/api/cron/whitebit-scan/route.ts
// Зовнішній тригер для автономного сканування (cron-job.org кожні 2 хв)
// Вже в PUBLIC_PATHS (/api/cron/) — валідує CRON_SECRET самостійно
//
// cron-job.org налаштування:
//   URL:      https://odb-one.vercel.app/api/cron/whitebit-scan
//   Method:   GET
//   Interval: Every 2 minutes
//   Header:   Authorization: Bearer <CRON_SECRET>

import { NextRequest, NextResponse } from 'next/server'
import { GET as runScan }            from '@/app/api/whitebit-intel/scan/route'

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runScan()
}
