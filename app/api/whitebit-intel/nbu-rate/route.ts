import { NextResponse }  from 'next/server'
import { fetchUAHRate } from '@/lib/uah-rate'

export async function GET() {
  const result = await fetchUAHRate()
  if (!result) return NextResponse.json({ error: 'All rate sources failed' }, { status: 502 })
  return NextResponse.json({ rate: result.rate, source: result.source })
}
