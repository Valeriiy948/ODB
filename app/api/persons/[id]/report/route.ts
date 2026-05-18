// app/api/persons/[id]/report/route.ts
// Генерує HTML-досьє для друку / збереження як PDF

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function esc(s?: string | null): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDob(dob?: string): string {
  if (!dob) return '—'
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  return dob
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: person, error } = await supabase
    .from('persons').select('*').eq('id', id).single()

  if (error || !person) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const name   = esc(person.name_rus || person.name_ukr || person.name_eng || person.name || '—')
  const nameAlt = [person.name_ukr, person.name_eng].filter(Boolean)
    .filter(n => n !== (person.name_rus || person.name_ukr || person.name_eng || person.name))
    .map(esc).join(' / ')

  const now = new Date().toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  // Threat
  const score = person.threat_score
  let threatLabel = 'Невідома', threatColor = '#6b7280'
  if (score != null) {
    if (score >= 75) { threatLabel = `Критична (${score}%)`; threatColor = '#dc2626' }
    else if (score >= 50) { threatLabel = `Висока (${score}%)`; threatColor = '#ea580c' }
    else if (score >= 25) { threatLabel = `Середня (${score}%)`; threatColor = '#ca8a04' }
    else { threatLabel = `Низька (${score}%)`; threatColor = '#6b7280' }
  } else if (person.threat_level) {
    const map: Record<string, [string, string]> = {
      critical: ['Критична', '#dc2626'],
      high:     ['Висока',   '#ea580c'],
      medium:   ['Середня',  '#ca8a04'],
    }
    if (map[person.threat_level]) [threatLabel, threatColor] = map[person.threat_level]
  }

  // Phones
  const phones: string[] = []
  if (person.phones) {
    if (Array.isArray(person.phones)) phones.push(...person.phones)
    else phones.push(String(person.phones))
  }
  if (person.telegram_raw) {
    try {
      const raw = typeof person.telegram_raw === 'string'
        ? JSON.parse(person.telegram_raw) : person.telegram_raw
      for (const r of (Array.isArray(raw) ? raw : [])) {
        const p = r.fields?.phone
        if (p && !phones.includes(String(p))) phones.push(String(p))
        const pl = r.fields?.phones_list
        if (Array.isArray(pl)) pl.forEach((pp: string) => { if (!phones.includes(pp)) phones.push(pp) })
      }
    } catch {}
  }

  // Socials
  const socials: [string, string][] = []
  if (person.vk_url)        socials.push(['VK', person.vk_url])
  if (person.ok_url)        socials.push(['OK.ru', person.ok_url])
  if (person.fb_url)        socials.push(['Facebook', person.fb_url])
  if (person.instagram_url) socials.push(['Instagram', person.instagram_url])
  if (person.telegram_url)  socials.push(['Telegram', person.telegram_url])

  // EDR
  const edr = person.edr_data || null

  // Vehicles
  const vehicles: any[] = Array.isArray(person.vehicles) ? person.vehicles : []

  function row(label: string, value: string | null | undefined): string {
    if (!value) return ''
    return `<tr><td>${esc(label)}</td><td>${esc(String(value))}</td></tr>`
  }

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Досьє: ${name}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 11pt; color: #111; background: #fff; padding: 20px; }
.page { max-width: 820px; margin: 0 auto; }
h2 { font-size: 13pt; font-weight: bold; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 4px; margin: 20px 0 10px; }
.header { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid #1e3a5f; }
.photo { width: 100px; height: 120px; object-fit: cover; border: 2px solid #ccc; flex-shrink: 0; }
.photo-ph { width: 100px; height: 120px; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 40pt; border: 2px solid #ccc; flex-shrink: 0; color: #9ca3af; }
.header-info { flex: 1; }
.big-name { font-size: 18pt; font-weight: bold; color: #1e3a5f; }
.alt-names { color: #6b7280; font-size: 10pt; margin-top: 2px; }
.badge { display: inline-block; padding: 3px 12px; border-radius: 4px; font-weight: bold; font-size: 10pt; color: #fff; margin-top: 8px; }
.badge-myr { background: #fef3c7; border: 1px solid #d97706; color: #92400e; padding: 3px 10px; border-radius: 4px; font-size: 9pt; display: inline-block; margin-top: 6px; }
.badge-ver { background: #d1fae5; border: 1px solid #059669; color: #065f46; padding: 3px 10px; border-radius: 4px; font-size: 9pt; display: inline-block; margin-left: 8px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
td { padding: 5px 8px; vertical-align: top; border-bottom: 1px solid #f3f4f6; }
td:first-child { font-weight: bold; color: #374151; width: 190px; white-space: nowrap; font-size: 10pt; }
tr:nth-child(even) td { background: #f9fafb; }
.ai-profile { background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 14px; font-size: 10pt; line-height: 1.7; white-space: pre-wrap; font-family: Arial, sans-serif; }
.foot { color: #9ca3af; font-size: 9pt; text-align: center; margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
.tag { display: inline-block; padding: 2px 8px; background: #dbeafe; color: #1e40af; border-radius: 3px; font-size: 9pt; margin: 2px; }
.print-btn { padding: 8px 20px; background: #1e3a5f; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 11pt; }
.back-btn { margin-left: 10px; padding: 8px 16px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; text-decoration: none; font-size: 11pt; }
@media print { .no-print { display: none !important; } @page { margin: 15mm; size: A4; } }
</style>
</head>
<body>
<div class="page">
  <div class="no-print" style="text-align:right;margin-bottom:14px">
    <button class="print-btn" onclick="window.print()">🖨️ Друкувати / Зберегти PDF</button>
    <a class="back-btn" href="/persons/${esc(id)}">← Назад</a>
  </div>

  <div class="header">
    ${person.photo_url
      ? `<img src="${esc(person.photo_url)}" alt="" class="photo">`
      : `<div class="photo-ph">👤</div>`
    }
    <div class="header-info">
      <div style="color:#6b7280;font-size:9pt;margin-bottom:4px">🛡️ ODB PLATFORM — ОПЕРАТИВНА БАЗА ДАНИХ</div>
      <div class="big-name">${name}</div>
      ${nameAlt ? `<div class="alt-names">${nameAlt}</div>` : ''}
      <div style="margin-top:8px">
        <span class="badge" style="background:${threatColor}">⚠️ ${esc(threatLabel)}</span>
        ${person.verified ? `<span class="badge-ver">✓ Верифіковано</span>` : ''}
      </div>
      ${person.myrotvorets_url
        ? `<div style="margin-top:6px"><a href="${esc(person.myrotvorets_url)}" class="badge-myr" target="_blank">⚠️ Myrotvorets</a></div>`
        : ''}
      <div style="color:#9ca3af;font-size:9pt;margin-top:8px">ID: ${esc(id)} | Звіт: ${esc(now)}</div>
    </div>
  </div>

  <h2>Особисті відомості</h2>
  <table><tbody>
    ${row('Дата народження', formatDob(person.dob))}
    ${person.gender ? row('Стать', person.gender === 'male' ? 'Чоловіча' : person.gender === 'female' ? 'Жіноча' : person.gender) : ''}
    ${row('Громадянство', person.citizenship)}
    ${row('Паспорт / документ', person.passport)}
    ${row('ІПН / ИНН', person.ipn)}
    ${row('СНІЛС', person.snils)}
    ${row('Email', person.email)}
    ${phones.length > 0 ? `<tr><td>Телефони</td><td>${phones.map(p => `<span style="font-family:monospace;display:block">${esc(p)}</span>`).join('')}</td></tr>` : ''}
    ${row('Адреса (прожив.)', person.addr_live)}
    ${row('Адреса (реєстр.)', person.addr_reg)}
    ${row('Регіон', person.region)}
  </tbody></table>

  ${(person.rank || person.unit || person.unit_num || person.military_id || person.status) ? `
  <h2>Військові відомості</h2>
  <table><tbody>
    ${row('Звання', person.rank)}
    ${row('Підрозділ', person.unit)}
    ${row('Номер в/ч', person.unit_num)}
    ${row('Особистий №', person.military_id)}
    ${row('Статус', person.status)}
  </tbody></table>` : ''}

  ${socials.length > 0 ? `
  <h2>Соціальні мережі</h2>
  <table><tbody>
    ${socials.map(([label, url]) =>
      `<tr><td>${esc(label)}</td><td><a href="${esc(url)}" style="color:#1d4ed8;font-size:9pt;word-break:break-all" target="_blank">${esc(url)}</a></td></tr>`
    ).join('')}
  </tbody></table>` : ''}

  ${vehicles.length > 0 ? `
  <h2>Транспортні засоби</h2>
  <table><tbody>
    ${vehicles.map((v: any, i: number) => `<tr>
      <td>${esc(v.plate || v.vin || `Авто ${i + 1}`)}</td>
      <td>${esc([v.brand, v.model, v.year, v.color].filter(Boolean).join(' '))}</td>
    </tr>`).join('')}
  </tbody></table>` : ''}

  ${edr ? `
  <h2>Дані реєстрів (ЄДР / OpenDataBot)</h2>
  <table><tbody>
    ${row('Назва юр. особи', edr.name)}
    ${row('ЄДРПОУ', edr.code)}
    ${row('Статус', edr.status)}
    ${row('Адреса', edr.address)}
    ${row('Керівник', edr.director)}
    ${edr.founders && Array.isArray(edr.founders) && edr.founders.length > 0
      ? row('Засновники', edr.founders.join(', ')) : ''}
  </tbody></table>` : ''}

  ${person.ai_profile ? `
  <h2>🤖 AI-аналіз</h2>
  <div class="ai-profile">${esc(person.ai_profile)}</div>` : ''}

  ${person.description ? `
  <h2>Примітки</h2>
  <div style="background:#f9fafb;padding:12px;border:1px solid #e5e7eb;border-radius:4px;font-size:10pt;line-height:1.7;white-space:pre-wrap">${esc(person.description)}</div>` : ''}

  ${person.tags && Array.isArray(person.tags) && person.tags.length > 0 ? `
  <h2>Теги / Мітки</h2>
  <div>${(person.tags as string[]).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}

  <div class="foot">
    Звіт сформовано: ${esc(now)} | ODB Platform | Для службового використання
  </div>
</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
