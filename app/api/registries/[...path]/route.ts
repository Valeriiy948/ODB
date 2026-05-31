// app/api/registries/[...path]/route.ts  — proxy to VPS :8006
import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const PORT     = process.env.REGISTRIES_PORT || '8006'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const endpoint = path.join('/')
  const body = await request.json().catch(() => ({}))

  try {
    const res = await fetch(`http://${VPS_HOST}:${PORT}/registry/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) return NextResponse.json({ error: `VPS ${res.status}` }, { status: 502 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const endpoint = path.join('/')
  try {
    const res = await fetch(`http://${VPS_HOST}:${PORT}/registry/${endpoint}`, {
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
