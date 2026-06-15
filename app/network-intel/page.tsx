'use client'

import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import Icon from '../components/Icon'

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function Badge({ label, color = 'gray' }: { label: string; color?: string }) {
  const c: Record<string, string> = {
    red:    'bg-red-900/50 text-red-300 border-red-800',
    orange: 'bg-orange-900/50 text-orange-300 border-orange-800',
    yellow: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
    green:  'bg-green-900/50 text-green-300 border-green-800',
    blue:   'bg-blue-900/50 text-blue-300 border-blue-800',
    purple: 'bg-purple-900/50 text-purple-300 border-purple-800',
    gray:   'bg-gray-800 text-gray-400 border-gray-700',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-mono ${c[color] || c.gray}`}>
      {label}
    </span>
  )
}

function InfoRow({ label, value, mono = true }: {
  label: string; value?: string | null | number; mono?: boolean
}) {
  if (!value && value !== 0) return null
  return (
    <div className="flex gap-3 py-1 border-b border-gray-800/50 text-sm">
      <span className="text-gray-500 w-32 shrink-0 text-xs">{label}</span>
      <span className={`text-gray-200 break-all text-xs ${mono ? 'font-mono' : ''}`}>{String(value)}</span>
    </div>
  )
}

function Card({ title, children, badge, className = '' }: {
  title: string; children: React.ReactNode; badge?: React.ReactNode; className?: string
}) {
  return (
    <div className={`bg-gray-900 rounded-xl border border-gray-700 p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  )
}

// ─── Priority color ───────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-400 bg-red-950/40 border-red-800',
  HIGH:     'text-orange-400 bg-orange-950/30 border-orange-800',
  MEDIUM:   'text-yellow-400 bg-yellow-950/30 border-yellow-800',
  LOW:      'text-green-400 bg-green-950/30 border-green-800',
}

// ─── AI CTI Result card ───────────────────────────────────────────────────────
function CtiResultCard({
  cti,
  onExecute,
  onAlternative,
}: {
  cti: any
  onExecute: (query: string) => void
  onAlternative: (query: string) => void
}) {
  const pColor = PRIORITY_COLOR[cti.priority] || PRIORITY_COLOR.MEDIUM

  return (
    <div className="xl:col-span-2 space-y-3">

      {/* Main result */}
      <div className="bg-gray-900 rounded-xl border border-purple-800/60 p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🤖</span>
          <div>
            <p className="text-white font-bold text-sm">AI CTI Аналіз</p>
            <p className="text-gray-500 text-xs">Claude · Cyber Threat Intelligence Analyst</p>
          </div>
          <div className="ml-auto">
            <span className={`text-xs px-2.5 py-1 rounded-lg border font-bold ${pColor}`}>
              {cti.priority}
            </span>
          </div>
        </div>

        {/* Target type */}
        <div className="mb-4">
          <p className="text-gray-500 text-xs mb-1 uppercase tracking-wider">Тип цілі</p>
          <p className="text-orange-300 font-semibold text-sm">{cti.target_type}</p>
        </div>

        {/* Analytical note */}
        <div className="mb-4 p-3 bg-blue-950/20 border border-blue-800/30 rounded-lg">
          <p className="text-gray-400 text-xs mb-1 uppercase tracking-wider">📋 Аналітична записка</p>
          <p className="text-gray-200 text-sm leading-relaxed">{cti.analytical_note}</p>
        </div>

        {/* Generated Shodan query */}
        <div className="mb-4">
          <p className="text-gray-500 text-xs mb-2 uppercase tracking-wider">🔍 Згенерований Shodan запит</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-green-300 text-sm font-mono break-all">
              {cti.search_query}
            </code>
            <button
              onClick={() => onExecute(cti.search_query)}
              className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition"
            >
              ▶ Виконати
            </button>
          </div>
        </div>

        {/* CVE list */}
        {cti.potential_cve?.length > 0 && (
          <div className="mb-4">
            <p className="text-red-400 text-xs mb-2 uppercase tracking-wider font-semibold">
              ⚠️ Потенційні вразливості ({cti.potential_cve.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {cti.potential_cve.map((cve: string, i: number) => {
                const cveId = cve.match(/CVE-\d{4}-\d+/)?.[0]
                return cveId ? (
                  <a
                    key={i}
                    href={`https://nvd.nist.gov/vuln/detail/${cveId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={cve}
                  >
                    <Badge label={cve.length > 40 ? cveId : cve} color="red" />
                  </a>
                ) : (
                  <Badge key={i} label={cve.slice(0, 50)} color="orange" />
                )
              })}
            </div>
          </div>
        )}

        {/* Alternative queries */}
        {cti.alternative_queries?.length > 0 && (
          <div>
            <p className="text-gray-500 text-xs mb-2 uppercase tracking-wider">Альтернативні запити</p>
            <div className="space-y-1.5">
              {cti.alternative_queries.map((q: string, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-800/60 border border-gray-700/60 rounded px-2.5 py-1.5 text-gray-300 text-xs font-mono">
                    {q}
                  </code>
                  <button
                    onClick={() => onAlternative(q)}
                    className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 hover:bg-blue-900/30 rounded transition whitespace-nowrap"
                  >
                    Виконати →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── GreyNoise result card ────────────────────────────────────────────────────
function GreyNoiseCard({ data }: { data: any }) {
  if (!data) return null
  const cls   = data.classification
  const color = data.noise && cls === 'malicious' ? 'red'
    : data.noise ? 'orange'
    : data.riot  ? 'green'
    : 'gray'

  return (
    <Card
      title="🌫️ GreyNoise"
      badge={<span className="text-xs text-green-400 bg-green-900/20 border border-green-800/40 px-2 py-0.5 rounded">FREE</span>}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {data.noise ? (
            <Badge label="⚠️ Internet Scanner" color={color} />
          ) : data.riot ? (
            <Badge label="✓ Known Safe Service" color="green" />
          ) : (
            <Badge label="Не відомий сканер" color="gray" />
          )}
          {cls && cls !== 'unknown' && <Badge label={cls} color={color} />}
        </div>
        {data.name && <InfoRow label="Назва" value={data.name} mono={false} />}
        {data.last_seen && <InfoRow label="Остання активність" value={data.last_seen?.slice(0, 10)} />}
        {data.link && (
          <a href={data.link} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 block mt-1">
            Деталі на GreyNoise →
          </a>
        )}
        {data.noise && !data.riot && (
          <div className="mt-2 p-2 bg-orange-950/30 border border-orange-800/40 rounded text-xs text-orange-300">
            {cls === 'malicious'
              ? '⚠️ IP відомий своїми зловмисними сканами/атаками'
              : 'Цей IP активно сканує інтернет'}
          </div>
        )}
        {data.riot && (
          <div className="mt-2 p-2 bg-green-950/30 border border-green-800/40 rounded text-xs text-green-300">
            ✓ Відомий безпечний сервіс (Google, Cloudflare, AWS і т.д.)
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── AbuseIPDB card ───────────────────────────────────────────────────────────
function AbuseIPDBCard({ data }: { data: any }) {
  if (!data) return null
  if (data.error === 'no_key') {
    return (
      <Card title="🚨 AbuseIPDB">
        <p className="text-xs text-gray-500 mb-2">Безкоштовний ключ — 1000 перевірок/день.</p>
        <a href="https://www.abuseipdb.com/register" target="_blank" rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300">
          Зареєструватись безкоштовно →
        </a>
        <div className="mt-2 bg-gray-800 rounded px-2 py-1.5">
          <code className="text-xs text-green-300">ABUSEIPDB_API_KEY=ваш_ключ</code>
        </div>
      </Card>
    )
  }
  if (data.error) return null

  const score  = data.abuse_score || 0
  const danger = score >= 80 ? 'red' : score >= 40 ? 'orange' : score >= 10 ? 'yellow' : 'green'

  return (
    <Card title="🚨 AbuseIPDB">
      <div className="flex items-center gap-3 mb-3">
        <div className={`text-3xl font-bold ${
          danger === 'red' ? 'text-red-400' : danger === 'orange' ? 'text-orange-400' :
          danger === 'yellow' ? 'text-yellow-400' : 'text-green-400'
        }`}>{score}%</div>
        <div>
          <div className="text-xs text-gray-400">Confidence of abuse</div>
          <Badge label={
            score >= 80 ? '⛔ НЕБЕЗПЕЧНИЙ' : score >= 40 ? '⚠️ Підозрілий' :
            score >= 10 ? '⚡ Низький ризик' : '✓ Чистий'
          } color={danger} />
        </div>
      </div>
      <InfoRow label="Репортів"          value={data.total_reports} />
      <InfoRow label="Унікальних юзерів" value={data.distinct_users} />
      <InfoRow label="Країна"            value={data.country} />
      <InfoRow label="ISP"               value={data.isp} mono={false} />
      <InfoRow label="Домен"             value={data.domain} />
      <InfoRow label="Тип"               value={data.usage_type} mono={false} />
      {data.is_tor && <div className="mt-2 text-xs text-red-400 font-semibold">🧅 TOR вихідний вузол</div>}
      {data.last_reported_at && (
        <div className="text-xs text-gray-500 mt-2">Останній репорт: {data.last_reported_at?.slice(0, 10)}</div>
      )}
    </Card>
  )
}

// ─── Shodan no-key card ───────────────────────────────────────────────────────
function ShodanNoKeyCard() {
  return (
    <Card title="🔌 Shodan">
      <p className="text-xs text-gray-400 mb-2">Відкриті порти, ОС, сервіси, вразливості CVE.</p>
      <p className="text-xs text-gray-500 mb-3">Безкоштовний план: account.shodan.io</p>
      <a href="https://account.shodan.io" target="_blank" rel="noopener noreferrer"
        className="text-xs text-blue-400 hover:text-blue-300">Отримати ключ →</a>
      <div className="mt-2 bg-gray-800 rounded px-2 py-1.5">
        <code className="text-xs text-green-300">SHODAN_API_KEY=ваш_ключ</code>
      </div>
    </Card>
  )
}

// ─── IP Overview (єдина зведена панель) ──────────────────────────────────────
function IpOverviewCard({ result, onQuery }: { result: any; onQuery: (q: string) => void }) {
  const geo   = result.geo
  const whois = result.whois_ip
  const abuse = result.abuseipdb
  const gn    = result.greynoise
  const rdns  = result.rdns  ?? []
  const ports = (result.shodan?.ports ?? result.censys?.ports ?? []).slice(0, 20)
  const vulns = result.shodan?.vulns ?? []
  const ssl   = result.ssl_certs ?? []

  const abuseScore = !abuse || abuse.error ? null : (abuse.abuse_score ?? 0)
  const scoreDanger = abuseScore === null ? 'gray'
    : abuseScore >= 80 ? 'red' : abuseScore >= 40 ? 'orange'
    : abuseScore >= 10 ? 'yellow' : 'green'

  // ── Device type inference ─────────────────────────────────────────────────
  const allPorts   = new Set([...(result.shodan?.ports ?? []), ...(result.censys?.ports ?? [])])
  const services   = [...(result.shodan?.services ?? []), ...(result.censys?.services ?? [])]
  const os         = result.shodan?.os || null
  const products   = services.map((s: any) => (s.product || s.service || '').toLowerCase()).filter(Boolean)

  function inferDevice(): { icon: string; label: string; detail: string } {
    if (os?.toLowerCase().includes('cisco'))         return { icon: '🔀', label: 'Cisco Router/Switch', detail: os }
    if (os?.toLowerCase().includes('mikrotik'))      return { icon: '🔀', label: 'MikroTik Router',     detail: os }
    if (products.some(p => p.includes('mikrotik')))  return { icon: '🔀', label: 'MikroTik Router',     detail: 'MikroTik RouterOS' }
    if (allPorts.has(554) || allPorts.has(8554) || products.some(p => p.includes('rtsp') || p.includes('dahua') || p.includes('hikvision')))
      return { icon: '📷', label: 'IP Камера', detail: products.find(p => p.includes('hikvision') || p.includes('dahua')) || 'RTSP stream' }
    if (allPorts.has(161) || products.some(p => p.includes('snmp')))
      return { icon: '🔀', label: 'Network Device (SNMP)', detail: os || 'SNMP enabled' }
    if (allPorts.has(102) || allPorts.has(502) || allPorts.has(20000))
      return { icon: '⚙️', label: 'Industrial / SCADA', detail: 'ICS/PLC device' }
    if (allPorts.has(5900) || allPorts.has(3389))
      return { icon: '🖥️', label: 'Desktop / Workstation', detail: allPorts.has(3389) ? 'RDP відкритий' : 'VNC відкритий' }
    if (products.some(p => p.includes('nginx') || p.includes('apache') || p.includes('iis') || p.includes('caddy')))
      return { icon: '🌐', label: 'Веб-сервер', detail: products.find(p => p.includes('nginx') || p.includes('apache') || p.includes('iis')) || 'HTTP server' }
    if (allPorts.has(25) || allPorts.has(465) || allPorts.has(587) || products.some(p => p.includes('postfix') || p.includes('exim')))
      return { icon: '📧', label: 'Mail Server', detail: products.find(p => p.includes('postfix') || p.includes('exim') || p.includes('sendmail')) || 'SMTP' }
    if (products.some(p => p.includes('mysql') || p.includes('postgres') || p.includes('mongodb') || p.includes('redis') || p.includes('elastic')))
      return { icon: '🗄️', label: 'Database Server', detail: products.find(p => ['mysql','postgres','mongodb','redis','elastic'].some(d => p.includes(d))) || 'DB' }
    if (os?.toLowerCase().includes('windows'))       return { icon: '🖥️', label: 'Windows Server', detail: os }
    if (os?.toLowerCase().includes('linux'))         return { icon: '🐧', label: 'Linux Server', detail: os }
    if (allPorts.has(22) || allPorts.has(80) || allPorts.has(443))
      return { icon: '🖥️', label: 'Сервер', detail: os || (allPorts.has(443) ? 'HTTPS' : 'SSH') }
    if (geo?.proxy)                                  return { icon: '🔒', label: 'VPN / Proxy', detail: 'Proxy / Hosting' }
    return { icon: '🖥️', label: 'Host', detail: os || 'Невідомо' }
  }

  const device = inferDevice()

  const allEmails: string[] = []
  if (whois?.abuse_email) allEmails.push(whois.abuse_email)
  if (whois?.tech_email && whois.tech_email !== whois.abuse_email) allEmails.push(whois.tech_email)
  for (const c of (whois?.all_contacts ?? [])) {
    for (const e of (c.emails ?? [])) {
      if (!allEmails.includes(e)) allEmails.push(e)
    }
  }

  const now = new Date()

  return (
    <div className="xl:col-span-2 bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800 bg-gray-800/30">
        <div className="w-10 h-10 rounded-xl bg-orange-900/30 border border-orange-800/50 flex items-center justify-center text-xl shrink-0">
          {device.icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-bold font-mono text-base">{result.query}</span>
            <span className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 rounded font-medium text-gray-300">
              {device.label}
            </span>
            {device.detail && device.detail !== device.label && (
              <span className="text-xs text-gray-500 font-mono">{device.detail}</span>
            )}
          </div>
          <div className="text-gray-400 text-xs truncate mt-0.5">
            {[geo?.country, geo?.city, geo?.org].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end shrink-0">
          {gn?.noise && (
            <Badge
              label={gn.classification === 'malicious' ? '⛔ Malicious' : '⚠️ Scanner'}
              color={gn.classification === 'malicious' ? 'red' : 'orange'}
            />
          )}
          {gn?.riot && <Badge label="✓ Known Safe" color="green" />}
          {abuseScore !== null && (
            <Badge
              label={`Abuse ${abuseScore}%`}
              color={scoreDanger === 'gray' ? 'gray' : scoreDanger as any}
            />
          )}
          {abuse?.is_tor  && <Badge label="🧅 TOR" color="red" />}
          {geo?.proxy     && <Badge label="⚡ VPN/Proxy" color="orange" />}
          {vulns.length > 0 && <Badge label={`${vulns.length} CVE`} color="red" />}
        </div>
      </div>

      {/* ── Data grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-gray-800">

        {/* Локація */}
        <div className="px-4 py-4">
          <p className="text-gray-600 text-xs font-semibold uppercase tracking-wider mb-3">📍 Локація</p>
          <div className="space-y-1.5 text-xs">
            {geo?.country && <div className="text-gray-100 font-medium">{geo.country}</div>}
            {geo?.city    && <div className="text-gray-400">{geo.city}{geo.region ? `, ${geo.region}` : ''}</div>}
            {geo?.asn     && <div className="font-mono text-gray-500">{geo.asn}</div>}
            {geo?.timezone && <div className="text-gray-600">{geo.timezone}</div>}
            {!geo && <div className="text-gray-600">—</div>}
            {os && (
              <div className="mt-2 pt-2 border-t border-gray-800">
                <span className="text-gray-600 text-xs">ОС: </span>
                <span className="text-cyan-400 font-mono text-xs">{os}</span>
              </div>
            )}
            {!os && products.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-800">
                <span className="text-gray-600 text-xs">ПЗ: </span>
                <span className="text-cyan-400 font-mono text-xs">{products.slice(0,2).join(', ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Власник RDAP */}
        <div className="px-4 py-4">
          <p className="text-gray-600 text-xs font-semibold uppercase tracking-wider mb-3">🏢 Власник (RDAP)</p>
          <div className="space-y-1.5 text-xs">
            {whois?.network && <div className="text-gray-100 font-mono">{whois.network}</div>}
            {whois?.range   && <div className="text-gray-500 font-mono">{whois.range}</div>}
            {whois?.abuse_org && <div className="text-gray-400">{whois.abuse_org}</div>}
            {whois?.source  && (
              <div className="text-gray-600 text-xs mt-1">
                <span className="px-1.5 py-0.5 bg-gray-800 rounded font-mono">{whois.source}</span>
              </div>
            )}
            {!whois && <div className="text-gray-600">—</div>}
          </div>
        </div>

        {/* Контакти */}
        <div className="px-4 py-4">
          <p className="text-gray-600 text-xs font-semibold uppercase tracking-wider mb-3">✉ Контакти</p>
          <div className="space-y-1.5 text-xs">
            {allEmails.length > 0 ? allEmails.map((e) => (
              <a key={e} href={`mailto:${e}`}
                className="text-blue-400 hover:text-blue-300 font-mono block truncate"
                title={e}
              >
                {e}
              </a>
            )) : (
              <div className="text-gray-600">Не знайдено</div>
            )}
            {whois?.abuse_phone && (
              <div className="text-gray-400 font-mono mt-1">{whois.abuse_phone}</div>
            )}
          </div>
        </div>

        {/* Reverse DNS + репутація */}
        <div className="px-4 py-4">
          <p className="text-gray-600 text-xs font-semibold uppercase tracking-wider mb-3">🔀 Reverse DNS</p>
          <div className="space-y-1.5 text-xs">
            {rdns.length > 0 ? rdns.map((h: string) => (
              <button key={h} onClick={() => onQuery(h)}
                className="text-gray-200 font-mono hover:text-blue-300 block text-left truncate w-full"
                title={h}
              >
                {h}
              </button>
            )) : (
              <div className="text-gray-600">Не знайдено</div>
            )}
            {result.shodan?.hostnames?.filter((h: string) => !rdns.includes(h)).slice(0, 2).map((h: string) => (
              <button key={h} onClick={() => onQuery(h)}
                className="text-gray-500 font-mono hover:text-blue-300 block text-left truncate w-full"
              >
                {h}
              </button>
            ))}
          </div>
          {/* AbuseIPDB mini-score */}
          {abuseScore !== null && (
            <div className="mt-4 pt-3 border-t border-gray-800">
              <p className="text-gray-600 text-xs uppercase tracking-wider mb-1">🚨 AbuseIPDB</p>
              <div className="flex items-end gap-1.5">
                <span className={`text-2xl font-bold leading-none ${
                  scoreDanger === 'red' ? 'text-red-400' : scoreDanger === 'orange' ? 'text-orange-400' :
                  scoreDanger === 'yellow' ? 'text-yellow-400' : 'text-green-400'
                }`}>{abuseScore}</span>
                <span className="text-gray-500 text-xs mb-0.5">% · {abuse.total_reports || 0} репортів</span>
              </div>
            </div>
          )}
          {abuse?.error === 'no_key' && (
            <div className="mt-4 pt-3 border-t border-gray-800">
              <p className="text-gray-600 text-xs uppercase tracking-wider mb-1">🚨 AbuseIPDB</p>
              <a href="https://www.abuseipdb.com/register" target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300">Додати ключ →</a>
            </div>
          )}
        </div>
      </div>

      {/* ── Ports row ── */}
      {ports.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-800 bg-gray-800/20">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-gray-500 text-xs shrink-0">🔌 Відкриті порти:</span>
            <div className="flex flex-wrap gap-1">
              {ports.map((p: number) => (
                <Badge key={p} label={String(p)} color={p < 1024 ? 'orange' : 'gray'} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CVE row ── */}
      {vulns.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-800 bg-red-950/10">
          <p className="text-red-400 text-xs font-semibold mb-2">⚠️ CVE вразливості — знайдено публічні експлойти:</p>
          <div className="flex flex-wrap gap-2">
            {vulns.map((v: string) => (
              <div key={v} className="flex items-center gap-1">
                <a href={`https://nvd.nist.gov/vuln/detail/${v}`} target="_blank" rel="noopener noreferrer">
                  <Badge label={v} color="red" />
                </a>
                <a href={`https://www.exploit-db.com/search?cve=${v}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs px-1.5 py-0.5 bg-orange-900/40 hover:bg-orange-800/60 text-orange-300 border border-orange-800/40 rounded transition">
                  💥
                </a>
                <a href={`https://github.com/search?q=${v}&type=repositories`} target="_blank" rel="noopener noreferrer"
                  className="text-xs px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded transition">
                  GH
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SSL certs row ── */}
      {ssl.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-gray-500 text-xs font-semibold mb-2">🔒 SSL Сертифікати (crt.sh) — домени на цьому IP:</p>
          <div className="flex flex-wrap gap-2">
            {ssl.map((cert: any, i: number) => {
              const expired = cert.not_after && new Date(cert.not_after) < now
              return (
                <div key={i}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono ${
                    expired
                      ? 'bg-gray-800/50 border-gray-700 text-gray-500'
                      : 'bg-green-950/30 border-green-800/40 text-green-300'
                  }`}
                >
                  <span>{expired ? '🔓' : '🔒'}</span>
                  <button onClick={() => onQuery(cert.cn)} className="hover:underline">
                    {cert.cn}
                  </button>
                  {cert.not_after && (
                    <span className={`text-xs ${expired ? 'text-gray-600' : 'text-gray-500'}`}>
                      · {expired ? 'exp.' : ''}{cert.not_after}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── AUTO-PIVOT ── */}
      {(allEmails.length > 0 || rdns.length > 0 || ssl.length > 0 || geo?.org) && (
        <div className="px-5 py-4 border-t-2 border-blue-900/50 bg-blue-950/10">
          <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
            <span>🔗</span>
            <span>Авто-Піводинг — продовжити розслідування</span>
          </p>
          <div className="space-y-2">

            {/* Emails → Витоки + OSINT */}
            {allEmails.map(email => (
              <div key={email} className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-gray-300 min-w-0 truncate max-w-[220px]" title={email}>
                  ✉ {email}
                </span>
                <a href={`/breach-intel?q=${encodeURIComponent(email)}`}
                  className="text-xs px-2.5 py-1 bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 rounded-lg transition whitespace-nowrap">
                  🔓 Витоки
                </a>
                <a href={`/agent?q=${encodeURIComponent(email)}`}
                  className="text-xs px-2.5 py-1 bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 border border-purple-800/50 rounded-lg transition whitespace-nowrap">
                  🕵️ OSINT
                </a>
              </div>
            ))}

            {/* Домени (PTR + SSL) → Аналіз домену + Витоки */}
            {[...new Set([
              ...rdns,
              ...ssl.map((c: any) => c.cn).filter(Boolean),
            ])].slice(0, 5).map((domain: string) => (
              <div key={domain} className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-gray-300 min-w-0 truncate max-w-[220px]" title={domain}>
                  🌐 {domain}
                </span>
                <button
                  onClick={() => onQuery(domain)}
                  className="text-xs px-2.5 py-1 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/50 rounded-lg transition whitespace-nowrap">
                  🌐 Аналіз домену
                </button>
                <a href={`/breach-intel?q=${encodeURIComponent(domain)}`}
                  className="text-xs px-2.5 py-1 bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 rounded-lg transition whitespace-nowrap">
                  🔓 Витоки
                </a>
              </div>
            ))}

            {/* Організація → Авто-слідчий */}
            {(whois?.abuse_org || geo?.org) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-gray-300 min-w-0 truncate max-w-[220px]"
                  title={whois?.abuse_org || geo?.org}>
                  🏢 {whois?.abuse_org || geo?.org}
                </span>
                <a href={`/agent?q=${encodeURIComponent(whois?.abuse_org || geo?.org)}`}
                  className="text-xs px-2.5 py-1 bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 border border-purple-800/50 rounded-lg transition whitespace-nowrap">
                  🕵️ Авто-слідчий
                </a>
                <a href={`/breach-intel?q=${encodeURIComponent(whois?.abuse_org || geo?.org)}`}
                  className="text-xs px-2.5 py-1 bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 rounded-lg transition whitespace-nowrap">
                  🔓 Витоки
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── WHOIS IP Owner card ──────────────────────────────────────────────────────
function WhoisIpCard({ data }: { data: any }) {
  if (!data) return null
  return (
    <Card
      title="🏢 Власник IP / WHOIS"
      badge={<span className="text-xs text-green-400 bg-green-900/20 border border-green-800/40 px-2 py-0.5 rounded">FREE</span>}
    >
      <InfoRow label="Мережа"   value={data.network} />
      <InfoRow label="Handle"   value={data.handle} />
      <InfoRow label="Діапазон" value={data.range} />
      <InfoRow label="Країна"   value={data.country} />
      {data.abuse_email && (
        <div className="flex gap-3 py-1 border-b border-gray-800/50 text-sm">
          <span className="text-gray-500 w-32 shrink-0 text-xs">Abuse email</span>
          <a
            href={`mailto:${data.abuse_email}`}
            className="text-blue-400 hover:text-blue-300 font-mono text-xs break-all"
          >
            {data.abuse_email}
          </a>
        </div>
      )}
      {data.abuse_phone && <InfoRow label="Abuse тел." value={data.abuse_phone} />}
      {data.abuse_org   && <InfoRow label="Abuse org"  value={data.abuse_org} mono={false} />}
      {data.tech_email  && (
        <div className="flex gap-3 py-1 border-b border-gray-800/50 text-sm">
          <span className="text-gray-500 w-32 shrink-0 text-xs">Tech email</span>
          <a
            href={`mailto:${data.tech_email}`}
            className="text-blue-400 hover:text-blue-300 font-mono text-xs break-all"
          >
            {data.tech_email}
          </a>
        </div>
      )}
      {data.tech_name && <InfoRow label="Tech contact" value={data.tech_name} mono={false} />}
      {data.address   && <InfoRow label="Адреса"       value={data.address} mono={false} />}
      {data.all_contacts?.length > 0 && (
        <div className="mt-3 pt-2 border-t border-gray-800">
          <p className="text-gray-500 text-xs mb-2 uppercase tracking-wider">Всі контакти</p>
          <div className="space-y-2">
            {data.all_contacts.map((c: any, i: number) => (
              <div key={i} className="bg-gray-800/40 rounded-lg px-2 py-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-gray-300 text-xs font-medium">{c.name || c.handle}</span>
                  {c.roles.map((r: string) => (
                    <Badge key={r} label={r} color={r === 'abuse' ? 'red' : r === 'technical' ? 'blue' : 'gray'} />
                  ))}
                </div>
                {c.emails?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.emails.map((e: string) => (
                      <a key={e} href={`mailto:${e}`}
                        className="font-mono text-xs text-blue-400 hover:text-blue-300">
                        ✉ {e}
                      </a>
                    ))}
                  </div>
                )}
                {c.phones?.length > 0 && (
                  <div className="text-xs text-gray-400 mt-0.5 font-mono">{c.phones.join(' · ')}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 text-xs text-gray-600">Джерело: {data.source}</div>
    </Card>
  )
}

// ─── Reverse DNS card ─────────────────────────────────────────────────────────
function ReverseDnsCard({ data, onQuery }: { data: string[]; onQuery: (q: string) => void }) {
  if (!data?.length) return null
  return (
    <Card
      title="🔀 Reverse DNS (PTR)"
      badge={<span className="text-xs text-green-400 bg-green-900/20 border border-green-800/40 px-2 py-0.5 rounded">FREE</span>}
    >
      <div className="space-y-1">
        {data.map((host, i) => (
          <div key={i} className="flex items-center justify-between py-0.5">
            <span className="font-mono text-xs text-gray-200">{host}</span>
            <button
              onClick={() => onQuery(host)}
              className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 hover:bg-blue-900/20 rounded transition"
            >
              аналіз →
            </button>
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-xs mt-2">Хостнейми, прив'язані до цього IP (PTR записи DNS)</p>
    </Card>
  )
}

// ─── SSL Certificates card ────────────────────────────────────────────────────
function SslCertsCard({ data, onQuery }: { data: any[]; onQuery: (q: string) => void }) {
  if (!data?.length) return null
  const now = new Date()
  return (
    <Card title="🔒 SSL Сертифікати (crt.sh)" className="xl:col-span-2">
      <p className="text-gray-500 text-xs mb-3">
        Домени, що використовували цей IP в SSL сертифікатах
      </p>
      <div className="space-y-2">
        {data.map((cert, i) => {
          const expired = cert.not_after && new Date(cert.not_after) < now
          return (
            <div key={i} className="bg-gray-800/40 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-mono text-xs text-green-300">{cert.cn}</span>
                {expired
                  ? <Badge label="Expired" color="red" />
                  : <Badge label="Valid" color="green" />}
                {cert.not_after && (
                  <span className="text-gray-600 text-xs">до {cert.not_after}</span>
                )}
                <button
                  onClick={() => onQuery(cert.cn)}
                  className="ml-auto text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 hover:bg-blue-900/20 rounded transition"
                >
                  аналіз домену →
                </button>
              </div>
              {cert.names?.length > 1 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {cert.names.slice(0, 8).map((n: string) => (
                    <span key={n} className="font-mono text-xs text-gray-500 bg-gray-700/40 px-1.5 py-0.5 rounded">
                      {n}
                    </span>
                  ))}
                  {cert.names.length > 8 && (
                    <span className="text-xs text-gray-600">+{cert.names.length - 8}</span>
                  )}
                </div>
              )}
              {cert.issuer && (
                <div className="text-xs text-gray-600 mt-0.5 truncate">Видавець: {cert.issuer}</div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NetworkIntelPage() {
  const [query,      setQuery]      = useState('')
  const [mode,       setMode]       = useState<'search' | 'ai'>('search')
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<any>(null)
  const [ctiResult,  setCtiResult]  = useState<any>(null)
  const [error,      setError]      = useState('')

  // ── Execute Shodan/IP/domain search ──────────────────────────────────────
  async function runSearch(q?: string) {
    const sq = (q ?? query).trim()
    if (!sq) return
    if (q) setQuery(q)
    setLoading(true); setError(''); setResult(null)
    try {
      const res  = await fetch('/api/shodan/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: sq }),
      })
      const data = await res.json()
      if (data.error && !data.shodan && !data.geo) setError(data.error)
      else setResult(data)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  // ── AI CTI Analysis ───────────────────────────────────────────────────────
  async function runAiAnalysis() {
    if (!query.trim()) return
    setLoading(true); setError(''); setCtiResult(null); setResult(null)
    try {
      const res  = await fetch('/api/network/ai-analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: query.trim() }),
      })
      const data = await res.json()
      if (!data.success) setError(data.error || 'Помилка AI аналізу')
      else setCtiResult(data)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  // ── Auto-search: якщо введений IP — запускаємо без натискання кнопки ────────
  useEffect(() => {
    if (mode !== 'search') return
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(query.trim())) return
    const timer = setTimeout(() => { runSearch() }, 600)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode])

  const isIp     = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(query)
  const isDomain = /^[a-z0-9][a-z0-9\-\.]+\.[a-z]{2,}$/i.test(query) && !isIp

  const examples = [
    { label: 'IP адреса', value: '5.255.255.88',        desc: 'Аналіз конкретного IP (Yandex RU)' },
    { label: 'Домен',     value: 'mil.ru',              desc: 'DNS, WHOIS, хости' },
    { label: 'Org Shodan',value: 'org:Rostelecom',      desc: 'Всі хости організації' },
    { label: 'Порт',      value: 'port:22 country:RU',  desc: 'SSH в Росії' },
  ]

  const aiExamples = [
    'Знайти вразливі сервери Міноборони РФ з відкритим RDP/SSH',
    'Критична інфраструктура РФ — SCADA/ICS системи без захисту',
    'Відкриті бази даних на серверах Ростелекому',
    'Військові домени mil.ru з незахищеними портами',
    'VPN сервери ФСБ та спецслужб РФ',
    'Урядові сервери РФ з застарілими версіями Apache/IIS',
  ]

  return (
    <div className="flex min-h-screen text-white" style={{ background: 'var(--odb-bg)' }}>
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--odb-border-soft)' }}>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--odb-accent-hi), var(--odb-accent-lo))', boxShadow: 'var(--odb-shadow-accent)' }}>
              <Icon name="network" size={20} />
            </span>
            <div>
              <h1 className="text-lg font-bold text-white">Мережева розвідка</h1>
              <p className="text-[var(--odb-text-faint)] text-xs mt-0.5">
                GreyNoise · AbuseIPDB · Geo · DNS · WHOIS · Reverse DNS · SSL · CVE · Shodan · AI CTI
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs flex-wrap justify-end">
            <span className="px-2 py-1 bg-green-900/30 text-green-400 border border-green-800 rounded">GreyNoise free</span>
            <span className="px-2 py-1 bg-green-900/30 text-green-400 border border-green-800 rounded">Geo free</span>
            <span className="px-2 py-1 bg-green-900/30 text-green-400 border border-green-800 rounded">DNS/WHOIS free</span>
            <span className="px-2 py-1 bg-green-900/30 text-green-400 border border-green-800 rounded">RDAP/SSL free</span>
            <span className="px-2 py-1 bg-purple-900/30 text-purple-400 border border-purple-800 rounded">AI CTI</span>
            <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 border border-yellow-800 rounded">AbuseIPDB key</span>
            <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 border border-yellow-800 rounded">Shodan key</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Search Box ── */}
          <div className="max-w-3xl mb-6">

            {/* Mode toggle */}
            <div className="flex gap-1 mb-3 p-1 bg-gray-800/60 rounded-xl w-fit">
              <button
                onClick={() => { setMode('search'); setCtiResult(null); setResult(null); setError('') }}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                  mode === 'search'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                🔍 Пошук
              </button>
              <button
                onClick={() => { setMode('ai'); setResult(null); setCtiResult(null); setError('') }}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                  mode === 'ai'
                    ? 'bg-purple-700 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🤖</span>
                <span>AI CTI Аналіз</span>
                <span className="text-xs opacity-70">Claude</span>
              </button>
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      mode === 'ai' ? runAiAnalysis() : runSearch()
                    }
                  }}
                  placeholder={mode === 'ai'
                    ? 'Описуйте ціль природною мовою: "Знайти вразливі сервери МО РФ..."'
                    : 'IP адреса, домен або Shodan query...'
                  }
                  className={`w-full px-4 py-3 bg-gray-800 border rounded-xl text-white
                    focus:outline-none placeholder-gray-500 font-${mode === 'ai' ? 'sans' : 'mono'}
                    ${mode === 'ai'
                      ? 'border-purple-700 focus:border-purple-500'
                      : 'border-gray-600 focus:border-blue-500'
                    }`}
                />
                {query && mode === 'search' && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                      isIp     ? 'bg-orange-900/50 text-orange-300' :
                      isDomain ? 'bg-blue-900/50 text-blue-300'     :
                                 'bg-purple-900/50 text-purple-300'
                    }`}>
                      {isIp ? '🖥️ IP' : isDomain ? '🌐 DOMAIN' : '🔍 QUERY'}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => mode === 'ai' ? runAiAnalysis() : runSearch()}
                disabled={!query.trim() || loading}
                className={`px-5 py-3 disabled:opacity-50 rounded-xl font-semibold text-sm transition whitespace-nowrap ${
                  mode === 'ai'
                    ? 'bg-purple-600 hover:bg-purple-500'
                    : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {loading
                  ? '⟳ Аналізую...'
                  : mode === 'ai' ? '🤖 Аналіз' : '🔍 Аналіз'
                }
              </button>
            </div>

            {/* Example queries */}
            <div className="flex flex-wrap gap-2 mt-3">
              {(mode === 'search' ? examples : aiExamples.map((v, i) => ({ label: `Приклад ${i+1}`, value: v, desc: v }))).map((ex: any) => (
                <button key={ex.value} onClick={() => setQuery(ex.value)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition
                    ${mode === 'ai'
                      ? 'bg-purple-900/20 hover:bg-purple-900/40 text-purple-300 hover:text-purple-200 border-purple-800/40'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border-gray-700'
                    }`}
                  title={ex.desc}
                >
                  {mode === 'search'
                    ? <>{ex.label}: <span className="font-mono text-gray-300">{ex.value}</span></>
                    : ex.value.slice(0, 50) + (ex.value.length > 50 ? '...' : '')
                  }
                </button>
              ))}
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="max-w-3xl bg-red-950 border border-red-800 text-red-300 rounded-xl p-4 mb-6 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* ── AI CTI Results ── */}
          {ctiResult && (
            <div className="max-w-6xl grid grid-cols-1 xl:grid-cols-2 gap-4">
              <CtiResultCard
                cti={ctiResult}
                onExecute={q => { setMode('search'); runSearch(q) }}
                onAlternative={q => { setMode('search'); runSearch(q) }}
              />
            </div>
          )}

          {/* ── IP loading skeleton ── */}
          {loading && isIp && (
            <div className="max-w-6xl">
              <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden animate-pulse">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800 bg-gray-800/30">
                  <div className="w-10 h-10 rounded-xl bg-gray-700 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-700 rounded w-32" />
                    <div className="h-3 bg-gray-800 rounded w-48" />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-5 bg-gray-700 rounded w-20" />
                    <div className="h-5 bg-gray-700 rounded w-16" />
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-gray-800 px-0">
                  {[0,1,2,3].map(i => (
                    <div key={i} className="px-4 py-4 space-y-2">
                      <div className="h-3 bg-gray-700 rounded w-20 mb-3" />
                      <div className="h-3 bg-gray-800 rounded w-28" />
                      <div className="h-3 bg-gray-800 rounded w-20" />
                      <div className="h-3 bg-gray-800 rounded w-24" />
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 border-t border-gray-800 bg-gray-800/20">
                  <div className="flex gap-2">
                    {[0,1,2,3,4].map(i => <div key={i} className="h-5 bg-gray-700 rounded w-10" />)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Shodan/IP/Domain Results ── */}
          {result && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-6xl">

              {/* ── IP Results ── */}
              {result.type === 'ip' && (
                <>
                  {/* Єдина зведена панель — всі дані в одному місці */}
                  <IpOverviewCard
                    result={result}
                    onQuery={q => { setQuery(q); runSearch(q) }}
                  />

                  {/* Shodan — детальні сервіси (якщо є ключ) */}
                  {result.shodan && !result.shodan.error && result.shodan.services?.length > 0 && (
                    <Card title="🔌 Shodan — сервіси">
                      <InfoRow label="ОС"  value={result.shodan.os} mono={false} />
                      <InfoRow label="ISP" value={result.shodan.isp} mono={false} />
                      <div className="mt-2 space-y-1">
                        {result.shodan.services.map((s: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-gray-800/50 rounded px-2 py-1.5">
                            <Badge label={`${s.port}/${s.transport}`} color="orange" />
                            {s.product && <span className="text-gray-200">{s.product}</span>}
                            {s.version && <span className="text-gray-500">{s.version}</span>}
                            {s.http_title && <span className="text-gray-500 truncate max-w-[200px]">{s.http_title}</span>}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                  {result.shodan?.error === 'no_key' && <ShodanNoKeyCard />}
                  {result.shodan?.error && result.shodan.error !== 'no_key' && (
                    <Card title="🔌 Shodan">
                      {result.shodan.error.includes('403') ? (
                        <div>
                          <p className="text-yellow-500 text-xs mb-2">⚠️ Shodan потребує платного плану ($49/рік)</p>
                          <a href={`https://www.shodan.io/host/${result.query}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300">
                            Переглянути на Shodan.io →
                          </a>
                        </div>
                      ) : <p className="text-gray-500 text-xs">⚠️ {result.shodan.error}</p>}
                    </Card>
                  )}

                  {/* Censys — детальні сервіси */}
                  {result.censys && !result.censys.error && result.censys.services?.length > 0 && (
                    <Card title="🔍 Censys — сервіси" badge={<Badge label="FREE" color="green" />}>
                      <InfoRow label="BGP Prefix"  value={result.censys.bgp} />
                      <InfoRow label="Перевірено"  value={result.censys.last_seen} />
                      <div className="mt-2 space-y-1">
                        {result.censys.services.map((s: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-gray-800/50 rounded px-2 py-1.5 flex-wrap">
                            <Badge label={`${s.port}/${s.protocol}`} color="orange" />
                            <Badge label={s.service} color="blue" />
                            {s.product && <span className="text-gray-200">{s.product}</span>}
                            {s.version && <span className="text-gray-500">{s.version}</span>}
                            {s.tls_subject && <span className="text-green-600 truncate max-w-[150px]">🔒 {s.tls_subject}</span>}
                          </div>
                        ))}
                      </div>
                      {result.censys.labels?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {result.censys.labels.map((l: string) => <Badge key={l} label={l} color="purple" />)}
                        </div>
                      )}
                    </Card>
                  )}
                  {result.censys?.needs_upgrade && (
                    <Card title="🔍 Censys">
                      <p className="text-yellow-500 text-xs mb-2">⚠️ Censys Free Plan не включає API</p>
                      <a href={`https://platform.censys.io/hosts/${result.query}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300">
                        Переглянути {result.query} на Censys.io →
                      </a>
                    </Card>
                  )}

                  {/* CVE — детальні описи вразливостей */}
                  {result.cve?.length > 0 && (
                    <div className="xl:col-span-2 bg-gray-900 rounded-xl border border-red-900 p-4">
                      <h3 className="text-sm font-semibold text-red-400 mb-3">
                        🛡️ CVE — Детальні вразливості ({result.cve.length})
                      </h3>
                      <div className="space-y-2">
                        {result.cve.map((cve: any) => (
                          <div key={cve.id} className="p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <a href={`https://nvd.nist.gov/vuln/detail/${cve.id}`} target="_blank" rel="noopener noreferrer"
                                className="text-red-400 font-mono text-xs hover:text-red-300 font-semibold">{cve.id}</a>
                              <Badge label={cve.severity} color={cve.score >= 9 ? 'red' : cve.score >= 7 ? 'orange' : 'yellow'} />
                              {cve.score && <span className="text-xs text-gray-500">Score: {cve.score}</span>}
                              <div className="ml-auto flex gap-1.5">
                                <a href={`https://www.exploit-db.com/search?cve=${cve.id}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="text-xs px-2 py-0.5 bg-orange-900/40 hover:bg-orange-900/60 text-orange-300 border border-orange-800/50 rounded transition">
                                  💥 Exploit-DB
                                </a>
                                <a href={`https://github.com/search?q=${cve.id}&type=repositories`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="text-xs px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded transition">
                                  GitHub PoC
                                </a>
                              </div>
                            </div>
                            <p className="text-gray-400 text-xs leading-relaxed">{cve.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Domain Results */}
              {result.type === 'domain' && (
                <>
                  {result.whois && (
                    <Card title="📋 WHOIS">
                      <InfoRow label="Домен"      value={result.whois.domain} />
                      <InfoRow label="Реєстратор" value={result.whois.registrar} mono={false} />
                      <InfoRow label="Реєстрація" value={result.whois.registered} />
                      <InfoRow label="Закінчення" value={result.whois.expires} />
                      <InfoRow label="Реєстрант"  value={result.whois.registrant_org} mono={false} />
                      <InfoRow label="Країна"     value={result.whois.registrant_country} />
                      {result.whois.nameservers?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-gray-500 text-xs mb-1">Nameservers</p>
                          {result.whois.nameservers.map((ns: string) => (
                            <div key={ns} className="font-mono text-xs text-gray-300">{ns}</div>
                          ))}
                        </div>
                      )}
                      {result.whois.status?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {result.whois.status.map((s: string) => <Badge key={s} label={s.split(' ')[0]} color="gray" />)}
                        </div>
                      )}
                    </Card>
                  )}

                  {result.dns && (
                    <Card title="🔀 DNS записи">
                      {Object.entries(result.dns).map(([type, records]: [string, any]) =>
                        records?.length > 0 ? (
                          <div key={type} className="mb-3">
                            <p className="text-gray-500 text-xs mb-1 font-mono">{type}</p>
                            <div className="flex flex-wrap gap-1">
                              {records.map((r: string) => (
                                <button key={r} onClick={() => { if (/^\d{1,3}\.\d{1,3}/.test(r)) setQuery(r) }}>
                                  <Badge label={r} color={type === 'A' ? 'orange' : 'blue'} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null
                      )}
                    </Card>
                  )}

                  {result.ip_geos?.filter(Boolean).length > 0 && (
                    <Card title="🌍 IP геолокація (A records)">
                      {result.ip_geos.filter(Boolean).map((geo: any) => (
                        <div key={geo.ip} className="mb-3 pb-3 border-b border-gray-800 last:border-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-orange-300">{geo.ip}</span>
                            <button onClick={() => setQuery(geo.ip)} className="text-xs text-blue-400 hover:text-blue-300">аналіз →</button>
                          </div>
                          <InfoRow label="Країна"    value={`${geo.country} (${geo.country_code})`} />
                          <InfoRow label="Провайдер" value={geo.org} mono={false} />
                          {geo.proxy && <div className="text-xs text-red-400 font-semibold mt-1">⚠️ PROXY/VPN</div>}
                        </div>
                      ))}
                    </Card>
                  )}

                  {result.ip_greynoise?.filter(Boolean).length > 0 &&
                    result.ip_greynoise.some((g: any) => g?.noise || g?.riot) && (
                    <Card title="🌫️ GreyNoise (A records)"
                      badge={<span className="text-xs text-green-400 bg-green-900/20 border border-green-800/40 px-2 py-0.5 rounded">FREE</span>}
                    >
                      {result.ip_greynoise.filter(Boolean).map((gn: any) => (
                        <div key={gn.ip} className="mb-2 pb-2 border-b border-gray-800 last:border-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-orange-300">{gn.ip}</span>
                            {gn.noise ? <Badge label="Scanner" color="orange" /> :
                             gn.riot  ? <Badge label="Safe"    color="green"  /> :
                                        <Badge label="Clean"   color="gray"   />}
                            {gn.name && <span className="text-xs text-gray-400">{gn.name}</span>}
                          </div>
                        </div>
                      ))}
                    </Card>
                  )}

                  {result.shodan_hosts && !result.shodan_hosts.error && (result.shodan_hosts.matches || []).length > 0 && (
                    <div className="xl:col-span-2 bg-gray-900 rounded-xl border border-gray-700 p-4">
                      <h3 className="text-sm font-semibold text-blue-400 mb-3">
                        🔌 Shodan хости ({result.shodan_hosts.total})
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b border-gray-800">
                              <th className="text-left py-1 pr-3">IP</th>
                              <th className="text-left py-1 pr-3">Порт</th>
                              <th className="text-left py-1 pr-3">Організація</th>
                              <th className="text-left py-1 pr-3">Країна</th>
                              <th className="text-left py-1 pr-3">Продукт</th>
                              <th className="text-left py-1">HTTP Title</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(result.shodan_hosts.matches || []).map((m: any, i: number) => (
                              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td className="py-1 pr-3 font-mono text-orange-300">
                                  <button onClick={() => setQuery(m.ip)} className="hover:underline">{m.ip}</button>
                                </td>
                                <td className="py-1 pr-3 font-mono">{m.port}</td>
                                <td className="py-1 pr-3 text-gray-300 max-w-[120px] truncate">{m.org || '—'}</td>
                                <td className="py-1 pr-3">{m.country || '—'}</td>
                                <td className="py-1 pr-3 text-gray-400">{m.product || '—'}</td>
                                <td className="py-1 text-gray-400 max-w-[150px] truncate">{m.http_title || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Shodan Query Results */}
              {result.type === 'search' && (
                <div className="xl:col-span-2 bg-gray-900 rounded-xl border border-gray-700 p-4">
                  <h3 className="text-sm font-semibold text-blue-400 mb-3">
                    🔌 Shodan результати ({result.shodan?.total || 0} хостів)
                  </h3>
                  {result.shodan?.error === 'no_key' ? (
                    <div>
                      <p className="text-yellow-400 text-sm mb-2">Потрібен SHODAN_API_KEY</p>
                      <a href="https://account.shodan.io" target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300">
                        Отримати на account.shodan.io →
                      </a>
                    </div>
                  ) : result.shodan?.free_tier_limit ? (
                    <div className="p-4 bg-yellow-950/30 border border-yellow-800/40 rounded-lg">
                      <p className="text-yellow-400 text-sm font-semibold mb-2">⚠️ Shodan Free Tier — пошукові запити недоступні</p>
                      <p className="text-gray-400 text-xs mb-3">
                        Запити типу <code className="text-orange-300">org:</code>, <code className="text-orange-300">port:</code>, <code className="text-orange-300">country:</code> потребують платного плану Shodan ($49/рік).
                      </p>
                      <p className="text-green-400 text-xs mb-3">
                        ✅ <strong>Безкоштовно доступно:</strong> Введіть конкретну IP-адресу (наприклад: <button onClick={() => setQuery('5.255.255.88')} className="text-orange-300 hover:underline font-mono">5.255.255.88</button> — Yandex RU) — отримаєте повний аналіз: Shodan, GreyNoise, AbuseIPDB, Geo, DNS.
                      </p>
                      <a href="https://account.shodan.io/billing" target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300">
                        Оновити план Shodan ($49/рік) →
                      </a>
                    </div>
                  ) : result.shodan?.error ? (
                    <p className="text-red-400 text-sm">{result.shodan.error}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500 border-b border-gray-800">
                            <th className="text-left py-1 pr-3">IP</th>
                            <th className="text-left py-1 pr-3">Порт</th>
                            <th className="text-left py-1 pr-3">Організація</th>
                            <th className="text-left py-1 pr-3">Країна</th>
                            <th className="text-left py-1 pr-3">Продукт</th>
                            <th className="text-left py-1">HTTP Title</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(result.shodan?.matches || []).map((m: any, i: number) => (
                            <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                              <td className="py-1 pr-3 font-mono text-orange-300">
                                <button onClick={() => setQuery(m.ip)} className="hover:underline">{m.ip}</button>
                              </td>
                              <td className="py-1 pr-3 font-mono">{m.port}</td>
                              <td className="py-1 pr-3 text-gray-300 max-w-[120px] truncate">{m.org || '—'}</td>
                              <td className="py-1 pr-3">{m.country || '—'}</td>
                              <td className="py-1 pr-3 text-gray-400">{m.product || '—'}</td>
                              <td className="py-1 text-gray-400 max-w-[150px] truncate">{m.http_title || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Intro / Empty state ── */}
          {!result && !loading && !error && !ctiResult && (
            <div className="max-w-4xl">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { icon: '🌫️', title: 'GreyNoise',  sub: 'FREE',      desc: 'Сканери, атаки, відомі сервіси',        color: 'border-green-800/40' },
                  { icon: '🌍', title: 'IP Geo',      sub: 'FREE',      desc: 'Країна, провайдер, ASN',                color: 'border-green-800/40' },
                  { icon: '🏢', title: 'WHOIS IP',    sub: 'FREE',      desc: 'Власник IP, abuse email, RIPE/ARIN',    color: 'border-green-800/40' },
                  { icon: '🔀', title: 'DNS / PTR',   sub: 'FREE',      desc: 'Записи DNS + Reverse DNS (PTR)',        color: 'border-green-800/40' },
                  { icon: '🔒', title: 'SSL / crt.sh',sub: 'FREE',      desc: 'Домени в сертифікатах для цього IP',    color: 'border-green-800/40' },
                  { icon: '🤖', title: 'AI CTI',      sub: 'Claude',    desc: 'Природна мова → Shodan запит + CVE',   color: 'border-purple-800/40' },
                  { icon: '🚨', title: 'AbuseIPDB',   sub: 'Free key',  desc: '1000 перевірок/день, репорти атак',    color: 'border-yellow-800/40' },
                  { icon: '🔌', title: 'Shodan',      sub: 'Paid key',  desc: 'Відкриті порти, ОС, вразливості CVE',  color: 'border-yellow-800/40' },
                  { icon: '🛡️', title: 'CVE / NVD',  sub: 'FREE',      desc: 'Автоматичний пошук вразливостей',      color: 'border-green-800/40' },
                  { icon: '🔍', title: 'Пошук',       sub: '',          desc: 'IP · Домен · Shodan фільтри',          color: 'border-gray-700' },
                ].map(c => (
                  <div key={c.title} className={`bg-gray-900 border ${c.color} rounded-xl p-4`}>
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-2xl">{c.icon}</span>
                      {c.sub && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                          c.sub === 'FREE'     ? 'bg-green-900/40 text-green-400 border border-green-800/50'    :
                          c.sub === 'Claude'   ? 'bg-purple-900/40 text-purple-400 border border-purple-800/50' :
                          c.sub === 'Free key' ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800/40' :
                                                 'bg-gray-800 text-gray-500 border border-gray-700'
                        }`}>
                          {c.sub}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-sm text-white mb-1">{c.title}</div>
                    <div className="text-xs text-gray-500">{c.desc}</div>
                  </div>
                ))}
              </div>

              {/* AI CTI examples */}
              <div className="bg-purple-950/20 border border-purple-800/40 rounded-xl p-4 mb-4">
                <p className="font-semibold text-purple-300 mb-3 flex items-center gap-2">
                  <span>🤖</span> AI CTI — приклади запитів природною мовою:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {aiExamples.map(ex => (
                    <button key={ex}
                      onClick={() => { setMode('ai'); setQuery(ex) }}
                      className="text-left text-xs px-3 py-2 bg-purple-900/20 hover:bg-purple-900/40 text-purple-200 hover:text-white border border-purple-800/30 rounded-lg transition">
                      ▶ {ex}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shodan examples */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <p className="font-semibold text-gray-400 mb-2">🔍 Shodan запити (технічний режим):</p>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  {[
                    ['org:Rostelecom',               'Всі хости Ростелекому'],
                    ['country:RU port:22',            'SSH сервери в РФ'],
                    ['ssl.cert.subject.cn:mil.ru',    'Військові сертифікати'],
                    ['http.title:"MikroTik" country:RU', 'Роутери MikroTik (RU)'],
                    ['vuln:CVE-2021-44228',            'Log4Shell вразливі хости'],
                    ['product:elasticsearch port:9200 country:RU', 'Відкриті ES РФ'],
                  ].map(([q, d]) => (
                    <div key={q} className="flex gap-2 items-center">
                      <button onClick={() => { setMode('search'); setQuery(q) }}
                        className="text-blue-400 hover:text-blue-300 hover:underline shrink-0">{q}</button>
                      <span className="text-gray-600 truncate">— {d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
