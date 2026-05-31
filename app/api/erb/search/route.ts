// app/api/erb/search/route.ts — Єдиний реєстр боржників
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const last_name  = (body.last_name  || body.query || '').trim()
    const first_name = (body.first_name || '').trim()
    const org_name   = (body.org_name   || '').trim()

    if (!last_name && !org_name) {
      return NextResponse.json({ error: 'Вкажіть прізвище або назву організації' }, { status: 400 })
    }

    const debtor_type = org_name ? 'LEGAL' : 'PHYSICAL'
    const payload: any = { debtorType: debtor_type }
    if (last_name)  payload.lastName  = last_name
    if (first_name) payload.firstName = first_name
    if (org_name)   payload.orgName   = org_name

    // Fallback URL for browser
    const qs = new URLSearchParams()
    if (last_name)  qs.set('lastName', last_name)
    if (first_name) qs.set('firstName', first_name)
    if (org_name)   qs.set('orgName', org_name)
    const fallback_url = `https://erb.minjust.gov.ua/#searchName?${qs.toString()}`

    try {
      const res = await fetch('https://erb.minjust.gov.ua/api/v1/debtors/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://erb.minjust.gov.ua/',
          'Origin': 'https://erb.minjust.gov.ua',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
          'sec-ch-ua': '"Chromium";v="124"',
          'sec-fetch-site': 'same-origin',
          'sec-fetch-mode': 'cors',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      })

      const txt = await res.text()

      // If HTML returned = bot protection
      if (txt.includes('<!doctype') || txt.includes('<html')) {
        return NextResponse.json({
          success: false,
          debtors: [], found: 0,
          message: 'Сайт ЄРДБ потребує відкриття у браузері (захист від ботів)',
          fallback_url,
          source: 'ЄРДБ',
        })
      }

      const data = JSON.parse(txt)
      const debtors = Array.isArray(data) ? data : (data.data || data.debtors || [])
      return NextResponse.json({ success: true, found: debtors.length, debtors, source: 'ЄРДБ' })

    } catch {
      return NextResponse.json({
        success: false, debtors: [], found: 0,
        message: 'ЄРДБ тимчасово недоступний. Перевірте вручну:',
        fallback_url,
        source: 'ЄРДБ',
      })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message, debtors: [] }, { status: 500 })
  }
}
