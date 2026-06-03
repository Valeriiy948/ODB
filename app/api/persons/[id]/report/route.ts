// app/api/persons/[id]/report/route.ts
// Блок 4: PDF/HTML звіт для суду та прокурора
// Повний аналітичний профіль з інцидентами, доказами, AI аналізом

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function esc(s?: string | null): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatDate(d?: string | null): string {
  if (!d) return '—'
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  return d
}

function field(label: string, value?: string | null, mono = false): string {
  if (!value) return ''
  return `<tr>
    <td class="fl">${esc(label)}</td>
    <td class="fv" style="${mono ? 'font-family:monospace' : ''}">${esc(String(value))}</td>
  </tr>`
}

function section(title: string, content: string): string {
  if (!content.trim()) return ''
  return `<div class="section">
    <h2>${esc(title)}</h2>
    ${content}
  </div>`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Завантажуємо всі дані паралельно
  const [
    { data: person },
    { data: incidentLinks },
    { data: evidence },
    { data: connections },
  ] = await Promise.all([
    supabase.from('persons').select('*').eq('id', id).single(),
    supabase
      .from('incident_persons')
      .select('role, incident:incidents(*)')
      .eq('person_id', id)
      .limit(20),
    supabase
      .from('evidence')
      .select('ev_type, original_name, description, date_captured, location, source, file_url')
      .eq('person_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('connections')
      .select(`rel_type, notes, confidence, person_a:persons!connections_person_a_fkey(id,name_rus,name_ukr,rank,unit), person_b:persons!connections_person_b_fkey(id,name_rus,name_ukr,rank,unit)`)
      .or(`person_a.eq.${id},person_b.eq.${id}`)
      .limit(15),
  ])

  if (!person) return new NextResponse('Not Found', { status: 404 })

  // Нормалізуємо
  const incidents = (incidentLinks || []).map((ip: any) => ({ ...ip.incident, pivot_role: ip.role })).filter(Boolean)
  const evidenceList = evidence || []
  const connectionList = connections || []

  // AI профіль
  let aiProfile: any = null
  if (person.ai_profile) {
    try { aiProfile = JSON.parse(person.ai_profile) } catch {}
  }

  const name = person.name_rus || person.name_ukr || person.name_eng || person.name || '—'
  const now = new Date().toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const reportId = `ODB-${Date.now().toString(36).toUpperCase()}`

  // Threat
  const score = person.threat_score
  const aiLevel = aiProfile?.threat_level || ''
  let threatLabel = 'Невідома', threatColor = '#6b7280', threatBg = '#f3f4f6'
  if (aiLevel === 'критичний' || score >= 75) { threatLabel = 'КРИТИЧНА'; threatColor = '#fff'; threatBg = '#7f1d1d' }
  else if (aiLevel === 'високий' || score >= 50) { threatLabel = 'ВИСОКА'; threatColor = '#fff'; threatBg = '#c41e3a' }
  else if (aiLevel === 'середній' || score >= 25) { threatLabel = 'СЕРЕДНЯ'; threatColor = '#fff'; threatBg = '#d97706' }
  else if (score !== null && score !== undefined) { threatLabel = 'НИЗЬКА'; threatColor = '#fff'; threatBg = '#16a34a' }

  // Phones
  const phones: string[] = Array.isArray(person.phones) ? [...person.phones] : []
  try {
    const raw = typeof person.telegram_raw === 'string' ? JSON.parse(person.telegram_raw) : person.telegram_raw
    for (const r of (Array.isArray(raw) ? raw : [])) {
      const p = r.fields?.phone; if (p && !phones.includes(String(p))) phones.push(String(p))
      const pl = r.fields?.phones_list; if (Array.isArray(pl)) pl.forEach((pp: string) => { if (!phones.includes(pp)) phones.push(pp) })
    }
  } catch {}

  // Витоки
  const allLeaks = (person.telegram_raw || []).flatMap ?
    (typeof person.telegram_raw === 'string' ? [] : (person.telegram_raw || [])).flatMap((e: any) => e.leaks || []) : []
  const leakSources = [...new Set(allLeaks.map((l: any) => l.source_label).filter(Boolean))] as string[]

  // Severity colors
  function sevColor(sev?: string) {
    if (sev === 'critical') return '#7f0000'
    if (sev === 'high')     return '#c41e3a'
    if (sev === 'medium')   return '#d97706'
    return '#16a34a'
  }

  // Evidence групування
  const evGroups: Record<string, any[]> = { photo: [], video: [], document: [], audio: [] }
  for (const e of evidenceList) {
    const t = e.ev_type || 'document'
    if (!(t in evGroups)) evGroups[t] = []
    evGroups[t].push(e)
  }

  // ─── HTML ─────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Аналітичний профіль: ${esc(name)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10.5pt;color:#111;background:#fff;padding:16px}
.page{max-width:860px;margin:0 auto}
.no-print{text-align:right;margin-bottom:14px;display:flex;gap:8px;justify-content:flex-end}
.btn{padding:8px 18px;border:none;border-radius:6px;cursor:pointer;font-size:10pt;font-weight:bold}
.btn-print{background:#1e3a5f;color:#fff}
.btn-back{background:#f3f4f6;color:#374151;border:1px solid #d1d5db;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:10pt}

/* Шапка */
.doc-header{border-bottom:3px solid #c41e3a;padding-bottom:14px;margin-bottom:16px}
.doc-classification{display:inline-block;background:#c41e3a;color:#fff;font-size:8pt;font-weight:bold;letter-spacing:2px;padding:3px 10px;margin-bottom:8px}
.doc-title{font-size:17pt;font-weight:bold;color:#1a1a1a;margin-bottom:2px}
.doc-subtitle{font-size:10pt;color:#666}
.doc-meta{font-size:8pt;color:#999;margin-top:6px}

/* Threat banner */
.threat-banner{padding:12px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-radius:4px}
.threat-left .threat-label{font-size:14pt;font-weight:bold;letter-spacing:1px}
.threat-left .threat-role{font-size:9pt;margin-top:3px;opacity:0.9}
.threat-score{font-size:24pt;font-weight:bold;line-height:1}
.threat-score span{font-size:10pt;opacity:0.8}

/* Секції */
.section{margin-bottom:16px;page-break-inside:avoid}
h2{font-size:10pt;font-weight:bold;color:#c41e3a;border-bottom:1.5px solid #e5e5e5;padding-bottom:4px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.8px}

/* Таблиці */
table{width:100%;border-collapse:collapse;font-size:9.5pt}
.fl{font-weight:bold;color:#555;width:160px;padding:4px 8px;vertical-align:top;white-space:nowrap;border-bottom:1px solid #f0f0f0}
.fv{padding:4px 8px;color:#111;vertical-align:top;border-bottom:1px solid #f0f0f0}
tr:nth-child(even) td{background:#fafafa}

/* Двоколонковий */
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}

/* Incident card */
.incident{border-left:4px solid #c41e3a;padding:8px 10px;margin-bottom:8px;background:#fafafa}
.inc-title{font-weight:bold;font-size:10pt;color:#111;margin-bottom:3px}
.inc-meta{font-size:8.5pt;color:#666;margin-bottom:3px}
.inc-desc{font-size:8.5pt;color:#444;margin-top:4px;line-height:1.5}
.icc-tag{display:inline-block;background:#fff0f0;border:1px solid #fca5a5;color:#991b1b;font-size:8pt;padding:2px 7px;border-radius:3px;font-weight:bold}
.ua-tag{display:inline-block;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;font-size:8pt;padding:2px 7px;border-radius:3px;margin-left:4px}

/* Теги */
.tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
.tag-red{background:#fff0f0;color:#991b1b;border:1px solid #fca5a5;border-radius:3px;padding:2px 8px;font-size:8pt;font-weight:bold}
.tag-gray{background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:3px;padding:2px 8px;font-size:8pt}
.tag-blue{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:3px;padding:2px 8px;font-size:8pt}

/* Bullet list */
.bullet{list-style:none;padding:0}
.bullet li{display:flex;gap:8px;margin-bottom:5px;font-size:9.5pt;line-height:1.5}
.bullet li::before{content:"▸";color:#c41e3a;flex-shrink:0;margin-top:1px}

/* Evidence */
.ev-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.ev-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:8px;text-align:center}
.ev-num{font-size:18pt;font-weight:bold;color:#1a1a1a}
.ev-type{font-size:8pt;color:#666;margin-top:2px}

/* Connections */
.conn-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:9.5pt}
.conn-type{background:#eff6ff;color:#1d4ed8;border-radius:3px;padding:1px 7px;font-size:8pt;white-space:nowrap}

/* AI профіль */
.ai-summary{background:#f0f9ff;border-left:3px solid #3b82f6;padding:10px 14px;font-size:9.5pt;line-height:1.6;color:#1e3a5f;margin-bottom:12px;font-style:italic}
.ai-note{background:#fffbea;border:1px solid #f59e0b;padding:8px 12px;font-size:8.5pt;color:#666;line-height:1.5;margin-top:10px;font-style:italic}

/* Підпис */
.signature{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:30px;padding-top:16px;border-top:1px solid #ccc}
.sig-line{border-bottom:1px solid #333;padding-bottom:3px;margin-bottom:4px;height:30px}
.sig-label{font-size:8pt;color:#888}

/* Footer */
.doc-footer{margin-top:20px;padding-top:8px;border-top:1px solid #e5e7eb;text-align:center;font-size:8pt;color:#aaa}
.myrotvorets-warning{background:#fef3c7;border:1px solid #d97706;color:#92400e;padding:8px 12px;border-radius:4px;font-size:9pt;margin-bottom:12px;font-weight:bold}

@media print{
  .no-print{display:none!important}
  body{padding:0}
  .page{max-width:none}
  @page{margin:15mm;size:A4}
  .section{page-break-inside:avoid}
  .incident{page-break-inside:avoid}
}
</style>
</head>
<body>
<div class="page">

  <div class="no-print">
    <button class="btn btn-print" onclick="window.print()">🖨️ Друкувати / Зберегти PDF</button>
    <a class="btn-back" href="/persons/${esc(id)}">← Назад до досьє</a>
  </div>

  <!-- Шапка -->
  <div class="doc-header">
    <div><span class="doc-classification">ДСК — ДЛЯ СЛУЖБОВОГО КОРИСТУВАННЯ</span></div>
    <div class="doc-title">АНАЛІТИЧНИЙ ПРОФІЛЬ ПІДОЗРЮВАНОГО</div>
    <div class="doc-subtitle">${esc(name)}</div>
    <div class="doc-meta">Звіт: ${esc(reportId)} &nbsp;·&nbsp; Дата: ${esc(now)} &nbsp;·&nbsp; ODB Platform (НПУ)</div>
  </div>

  <!-- Threat Banner -->
  <div class="threat-banner" style="background:${threatBg};color:${threatColor}">
    <div class="threat-left">
      <div class="threat-label">РІВЕНЬ ЗАГРОЗИ: ${esc(threatLabel)}</div>
      ${aiProfile?.role ? `<div class="threat-role">Роль: ${esc(aiProfile.role)}${aiProfile?.military?.rank ? ` · ${esc(aiProfile.military.rank)}` : ''}</div>` : ''}
    </div>
    <div style="text-align:right">
      ${score != null ? `<div class="threat-score">${score}<span>/100</span></div>` : ''}
    </div>
  </div>

  ${person.myrotvorets_url ? `<div class="myrotvorets-warning">‼️ ВНЕСЕНИЙ ДО БАЗИ МИРОТВОРЕЦЬ: <a href="${esc(person.myrotvorets_url)}" target="_blank">${esc(person.myrotvorets_url)}</a></div>` : ''}

  <!-- Резюме AI -->
  ${aiProfile?.summary ? `${section('Резюме аналітика', `<div class="ai-summary">${esc(aiProfile.summary)}</div>`)}` : ''}

  <!-- Ідентифікація -->
  ${section('Ідентифікаційні дані', `
  <div class="two-col">
    <table><tbody>
      ${field('ПІБ', name)}
      ${field('Дата народження', formatDate(person.dob || aiProfile?.identification?.dob))}
      ${field('Стать', person.gender === 'male' ? 'Чоловіча' : person.gender === 'female' ? 'Жіноча' : null)}
      ${field('Громадянство', person.nationality || person.citizenship)}
    </tbody></table>
    <table><tbody>
      ${field('Паспорт РФ', person.passport, true)}
      ${field('СНІЛС', person.snils, true)}
      ${field('ІНН/ІПН', person.ipn || person.inn_ru, true)}
      ${field('Військовий №', person.military_id, true)}
    </tbody></table>
  </div>
  <table style="margin-top:6px"><tbody>
    ${field('Адреса реєстрації', person.addr_reg)}
    ${field('Адреса проживання', person.addr_live)}
  </tbody></table>
  `)}

  <!-- Військові дані -->
  ${(person.rank || person.unit || person.position) ? section('Військові дані', `
  <div class="two-col">
    <table><tbody>
      ${field('Звання', person.rank)}
      ${field('Підрозділ', person.unit)}
      ${field('Номер в/ч', person.unit_num)}
    </tbody></table>
    <table><tbody>
      ${field('Посада', person.position)}
      ${field('Регіон дислокації', person.region)}
      ${field('Статус', person.status)}
    </tbody></table>
  </div>
  ${aiProfile?.military?.role_description ? `<p style="font-size:9pt;color:#555;margin-top:8px">${esc(aiProfile.military.role_description)}</p>` : ''}
  `) : ''}

  <!-- Контакти -->
  ${(phones.length || person.email) ? section('Контактні дані', `
  <table><tbody>
    ${phones.length ? `<tr><td class="fl">Телефони</td><td class="fv">${phones.map(p => `<span style="font-family:monospace;display:block">${esc(p)}</span>`).join('')}</td></tr>` : ''}
    ${field('Email', person.email)}
    ${field('VK', person.vk_url)}
    ${field('Telegram', person.telegram_username)}
    ${leakSources.length ? `<tr><td class="fl">Витоки БД</td><td class="fv"><span style="color:#d97706;font-weight:bold">${allLeaks.length} записів</span> з: ${leakSources.slice(0,6).map(s => `<span style="font-size:8.5pt">${esc(s)}</span>`).join(', ')}</td></tr>` : ''}
  </tbody></table>
  `) : ''}

  <!-- Інциденти -->
  ${incidents.length ? section(`Злочини та інциденти (${incidents.length})`, incidents.slice(0, 12).map((inc: any) => `
  <div class="incident" style="border-left-color:${sevColor(inc.severity)}">
    <div class="inc-title">${esc(inc.title)}</div>
    <div class="inc-meta">
      ${[formatDate(inc.date), inc.location, inc.inc_type].filter(Boolean).map(esc).join(' · ')}
      &nbsp;|&nbsp; <strong>Роль:</strong> ${esc(inc.pivot_role || 'невідомо')}
    </div>
    ${inc.icc_article ? `<div style="margin-top:4px"><span class="icc-tag">МКС: ${esc(inc.icc_article)}</span></div>` : ''}
    ${inc.description ? `<div class="inc-desc">${esc(inc.description.slice(0, 300))}${inc.description.length > 300 ? '...' : ''}</div>` : ''}
  </div>`).join('')) : ''}

  <!-- Застосовні статті -->
  ${(aiProfile?.icc_articles?.length || aiProfile?.ua_criminal_articles?.length) ? section('Застосовні норми права', `
  ${aiProfile.icc_articles?.length ? `
    <p style="font-size:8.5pt;color:#888;margin-bottom:5px">Римський статут МКС:</p>
    <div class="tags">${aiProfile.icc_articles.map((a: string) => `<span class="tag-red">${esc(a)}</span>`).join('')}</div>
  ` : ''}
  ${aiProfile.ua_criminal_articles?.length ? `
    <p style="font-size:8.5pt;color:#888;margin-bottom:5px;margin-top:8px">КК України:</p>
    <div class="tags">${aiProfile.ua_criminal_articles.map((a: string) => `<span class="tag-gray">${esc(a)}</span>`).join('')}</div>
  ` : ''}
  `) : ''}

  <!-- Ключові факти -->
  ${aiProfile?.key_facts?.length ? section('Ключові факти для слідства', `
  <ul class="bullet">${aiProfile.key_facts.map((f: string) => `<li>${esc(f)}</li>`).join('')}</ul>
  `) : ''}

  <!-- Докази -->
  ${evidenceList.length ? section(`Зібрані докази (${evidenceList.length} файлів)`, `
  <div class="ev-grid">
    ${evGroups.photo.length ? `<div class="ev-box"><div class="ev-num">${evGroups.photo.length}</div><div class="ev-type">🖼️ Фото</div></div>` : ''}
    ${evGroups.video.length ? `<div class="ev-box"><div class="ev-num">${evGroups.video.length}</div><div class="ev-type">🎬 Відео</div></div>` : ''}
    ${evGroups.document.length ? `<div class="ev-box"><div class="ev-num">${evGroups.document.length}</div><div class="ev-type">📄 Документи</div></div>` : ''}
    ${evGroups.audio.length ? `<div class="ev-box"><div class="ev-num">${evGroups.audio.length}</div><div class="ev-type">🎵 Аудіо</div></div>` : ''}
  </div>
  ${aiProfile?.evidence_summary ? `<p style="font-size:9pt;color:#555;margin-top:8px">${esc(aiProfile.evidence_summary)}</p>` : ''}
  `) : ''}

  <!-- Зв'язки -->
  ${connectionList.length ? section(`Відомі зв'язки (${connectionList.length})`, connectionList.slice(0,10).map((c: any) => {
    const other = c.person_a?.id === id ? c.person_b : c.person_a
    if (!other) return ''
    const otherName = other.name_rus || other.name_ukr || '—'
    return `<div class="conn-row">
      <span class="conn-type">${esc(c.rel_type || '—')}</span>
      <span style="font-weight:bold">${esc(otherName)}</span>
      ${other.rank ? `<span style="color:#666;font-size:8.5pt">${esc(other.rank)}, ${esc(other.unit || '')}</span>` : ''}
    </div>`
  }).join('')) : ''}

  <!-- Рекомендації -->
  ${aiProfile?.recommendations?.length ? section('Рекомендації для слідчих', `
  <ul class="bullet" style="--dot-color:#1d4ed8">${aiProfile.recommendations.map((r: string) => `<li style="--c:#1d4ed8">${esc(r)}</li>`).join('')}</ul>
  `) : ''}

  <!-- Прогалини -->
  ${aiProfile?.information_gaps?.length ? section('Що необхідно встановити', `
  <ul class="bullet">${aiProfile.information_gaps.map((g: string) => `<li style="color:#666">${esc(g)}</li>`).join('')}</ul>
  `) : ''}

  <!-- Нотатка аналітика -->
  ${aiProfile?.analyst_note ? `${section('Нотатка аналітика', `<div class="ai-note">${esc(aiProfile.analyst_note)}</div>`)}` : ''}

  <!-- Загальний опис -->
  ${person.description ? section('Примітки', `<div style="background:#f9fafb;padding:10px;border:1px solid #e5e7eb;border-radius:3px;font-size:9.5pt;line-height:1.7;white-space:pre-wrap">${esc(person.description)}</div>`) : ''}

  <!-- Теги -->
  ${person.tags?.length ? section('Мітки та категорії', `<div class="tags">${(person.tags as string[]).map(t => `<span class="tag-blue">${esc(t)}</span>`).join('')}</div>`) : ''}

  <!-- Підписи -->
  <div class="signature">
    <div>
      <div class="sig-line"></div>
      <div class="sig-label">Склав: _________________________ (підпис, дата)</div>
    </div>
    <div>
      <div class="sig-line"></div>
      <div class="sig-label">Затвердив: _____________________ (підпис, дата)</div>
    </div>
  </div>

  <!-- Правова основа -->
  <div style="margin-top:14px;font-size:7.5pt;color:#aaa;text-align:center;line-height:1.5">
    Документ складено відповідно до вимог КПК України (ст. 84-86) та рекомендацій МКС щодо документування воєнних злочинів.<br>
    Інформація отримана з відкритих та оперативних джерел. Звіт є аналітичним матеріалом та не є процесуальним документом.
  </div>

  <div class="doc-footer">
    Звіт: ${esc(reportId)} &nbsp;|&nbsp; Сформовано: ${esc(now)} &nbsp;|&nbsp; ODB Platform &nbsp;|&nbsp; Для службового використання
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
