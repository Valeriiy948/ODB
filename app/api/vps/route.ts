// app/api/vps/route.ts
// Proxy to VPS orchestrator (:8011).
// Sync:  POST /api/vps?path=/search       — blocks up to 55s, returns results
// Async: POST /api/vps?path=/jobs/start   — returns {job_id} immediately (<1s)
//        GET  /api/vps?path=/jobs/{id}    — poll for status
//        GET  /api/vps?path=/health       — health check

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// VPS_URL — повний HTTPS URL: https://evidencebases.com/odb-api
// Fallback на старий HTTP для зворотньої сумісності під час міграції
const VPS_URL = process.env.VPS_URL
  || `http://${process.env.VPS_HOST || '161.35.86.145'}:8011`
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || ''

async function proxyToVPS(method: string, path: string, body?: string) {
  const url = `${VPS_URL}${path}`
  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_KEY },
    body: method !== 'GET' ? body : undefined,
  })
  const data = await resp.json()
  return NextResponse.json(data, { status: resp.status })
}

export async function POST(request: NextRequest) {
  const path = new URL(request.url).searchParams.get('path') || '/search'
  try {
    const body = await request.text()
    return await proxyToVPS('POST', path, body)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'vps_error' }, { status: 502 })
  }
}

export async function GET(request: NextRequest) {
  const path = new URL(request.url).searchParams.get('path') || '/health'
  try {
    return await proxyToVPS('GET', path)
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'vps_error' }, { status: 502 })
  }
}
