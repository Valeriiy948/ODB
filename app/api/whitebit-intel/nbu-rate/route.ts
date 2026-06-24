// Серверний проксі для курсу НБУ (обходить CORS)
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res  = await fetch('https://bank.gov.ua/NBUStatWeb/v1/statdirectory/exchange?valcode=usd&json', {
      signal: AbortSignal.timeout(5_000), cache: 'no-store',
    })
    const data = await res.json() as Array<{ rate: number; exchangedate: string }>
    if (!data[0]?.rate) throw new Error('No rate in response')
    return NextResponse.json({ rate: data[0].rate, date: data[0].exchangedate })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
