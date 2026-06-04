// app/api/vps/jobs/route.ts
// Async job management — start a slow VPS search and poll for results.
// POST /api/vps/jobs        { query, type, sources } → { job_id, status: "running" }
// GET  /api/vps/jobs?id=... → { job_id, status, results?, elapsed?, running_for? }

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 10

const VPS_URL = `http://${process.env.VPS_HOST || '161.35.86.145'}:8011`
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || ''

const HEADERS = { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_KEY }

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const resp = await fetch(`${VPS_URL}/jobs/start`, { method: 'POST', headers: HEADERS, body })
    const data = await resp.json()
    return NextResponse.json(data, { status: resp.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'vps_error' }, { status: 502 })
  }
}

export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    const resp = await fetch(`${VPS_URL}/jobs/${id}`, { headers: HEADERS })
    const data = await resp.json()
    return NextResponse.json(data, { status: resp.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'vps_error' }, { status: 502 })
  }
}
