// app/api/spiderfoot/scan/route.ts
// SpiderFoot OSINT framework — bridge до VPS :8007
// POST /api/spiderfoot/scan  body: { target, scan_type: 'quick'|'full', modules?: [] }
// GET  /api/spiderfoot/scan?scan_id=xxx  — статус сканування

import { NextRequest, NextResponse } from 'next/server'

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
// SpiderFoot proxied via nginx on port 80 (DO Cloud Firewall blocks :8007 directly)
const SF_BASE  = `http://${VPS_HOST}/spiderfoot`

// Типові набори модулів для різних цілей
const MODULE_PRESETS: Record<string, string[]> = {
  quick: [
    'sfp_dnsresolve', 'sfp_whois', 'sfp_email', 'sfp_phone',
    'sfp_pgp', 'sfp_hunter', 'sfp_haveibeenpwned',
    'sfp_fullcontact', 'sfp_linkedin', 'sfp_twitter',
  ],
  person: [
    'sfp_fullcontact', 'sfp_hunter', 'sfp_haveibeenpwned',
    'sfp_pgp', 'sfp_twitter', 'sfp_linkedin', 'sfp_instagram',
    'sfp_tiktok', 'sfp_telegram', 'sfp_reddit',
    'sfp_dnsresolve', 'sfp_whois', 'sfp_shodan',
  ],
  domain: [
    'sfp_dnsresolve', 'sfp_whois', 'sfp_ssl', 'sfp_shodan',
    'sfp_spiderfoot', 'sfp_sublist3r', 'sfp_certspotter',
    'sfp_securitytrails', 'sfp_dnsdumpster',
    'sfp_pastebin', 'sfp_github',
  ],
  company: [
    'sfp_fullcontact', 'sfp_linkedin', 'sfp_twitter',
    'sfp_hunter', 'sfp_shodan', 'sfp_dnsresolve',
    'sfp_whois', 'sfp_pastebin', 'sfp_github',
    'sfp_google', 'sfp_bing',
  ],
  full: [], // empty = all modules
}

// ─── Create scan ──────────────────────────────────────────────────────────────
async function createScan(target: string, scanType: string, customModules?: string[]): Promise<any> {
  const modules = customModules?.length
    ? customModules
    : MODULE_PRESETS[scanType] || MODULE_PRESETS.quick

  const body = new URLSearchParams({
    scanname: `ODB-${Date.now()}`,
    scantarget: target,
    typetarget: detectTargetType(target),
    modulelist: modules.join(','),
    usecase: scanType === 'full' ? 'all' : 'investigate',
  })

  const res = await fetch(`${SF_BASE}/startscan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) throw new Error(`SpiderFoot HTTP ${res.status}`)
  // SpiderFoot returns redirect or JSON with scan ID
  const text = await res.text()
  // Extract scan_id from response or header
  const location = res.headers.get('location') || ''
  const scanIdMatch = location.match(/scanid=([^&]+)/) || text.match(/"id"\s*:\s*"([^"]+)"/)
  return { scan_id: scanIdMatch?.[1] || `sf_${Date.now()}`, target, scan_type: scanType }
}

// ─── Get scan status/results ──────────────────────────────────────────────────
async function getScanStatus(scanId: string): Promise<any> {
  const res = await fetch(`${SF_BASE}/scaneventresults?id=${scanId}&eventType=ALL`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`SpiderFoot status HTTP ${res.status}`)
  const data = await res.json()

  // Group results by type
  const grouped: Record<string, any[]> = {}
  for (const item of (data || [])) {
    const type = item[4] || 'OTHER'
    if (!grouped[type]) grouped[type] = []
    grouped[type].push({
      data:   item[1],
      source: item[2],
      module: item[3],
      risk:   item[6],
    })
  }

  return {
    scan_id:  scanId,
    total:    data?.length || 0,
    results:  grouped,
    // Key finds
    emails:   grouped['EMAIL_ADDRESS']?.map((e: any) => e.data) || [],
    phones:   grouped['PHONE_NUMBER']?.map((p: any) => p.data) || [],
    accounts: grouped['SOCIAL_MEDIA']?.map((s: any) => s.data) || [],
    ips:      grouped['IP_ADDRESS']?.map((i: any) => i.data) || [],
    domains:  grouped['DOMAIN_NAME']?.map((d: any) => d.data) || [],
    breaches: grouped['COMPROMISED_EMAIL']?.map((b: any) => b.data) || [],
  }
}

function detectTargetType(target: string): string {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target)) return 'IP_ADDRESS'
  if (/^[a-z0-9][a-z0-9\-]*\.[a-z]{2,}/i.test(target)) return 'INTERNET_NAME'
  if (/@/.test(target)) return 'EMAILADDR'
  if (/^\+?\d{10,12}$/.test(target.replace(/[\s\-\(\)]/g, ''))) return 'PHONE_NUMBER'
  return 'HUMAN_NAME'
}

// ─── Check if SpiderFoot is available ─────────────────────────────────────────
async function checkSF(): Promise<boolean> {
  try {
    const res = await fetch(`${SF_BASE}/ping`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch { return false }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { target, scan_type = 'quick', modules } = await req.json()
    if (!target) return NextResponse.json({ error: 'target required' }, { status: 400 })

    const available = await checkSF()
    if (!available) {
      return NextResponse.json({
        error: 'SpiderFoot не встановлено на VPS',
        install_guide: {
          step1: 'pip3 install spiderfoot',
          step2: 'spiderfoot -l 0.0.0.0:8007 -s',
          step3: 'Або через systemd: /etc/systemd/system/odb-spiderfoot.service',
        },
      }, { status: 503 })
    }

    const scan = await createScan(target, scan_type, modules)
    return NextResponse.json({ success: true, ...scan, status: 'started' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const scanId = searchParams.get('scan_id')

  if (!scanId) {
    const available = await checkSF()
    return NextResponse.json({
      available,
      vps: `${VPS_HOST}/spiderfoot`,
      presets: Object.keys(MODULE_PRESETS),
    })
  }

  try {
    const results = await getScanStatus(scanId)
    return NextResponse.json({ success: true, ...results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
