// app/api/osint/ai-profile/[id]/route.ts
// AI-профіль особи через Claude — 6-step investigator reasoning chain (Architecture L2)

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  INVESTIGATOR_SYSTEM_PROMPT,
  buildInvestigatorPrompt,
} from '../../../../../lib/prompts/investigator-profile'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Threat Score ──────────────────────────────────────────────
function calcThreatScore(person: any, incidents: any[], evidence: any[]): number {
  let score = 0

  if (person.myrotvorets_url)                score += 35
  if (person.rank || person.unit)            score += 10
  if (person.military_id)                    score += 5
  if (person.snils || person.ipn)            score += 5
  if (person.passport)                       score += 5

  const leakCount = (person.telegram_raw || []).flatMap((e: any) => e.leaks || []).length
  if (leakCount >= 10) score += 15
  else if (leakCount >= 3) score += 8
  else if (leakCount >= 1) score += 3

  // Інциденти
  if (incidents.length >= 5)       score += 20
  else if (incidents.length >= 2)  score += 12
  else if (incidents.length >= 1)  score += 6

  // Докази
  if (evidence.length >= 10)  score += 8
  else if (evidence.length >= 3) score += 4

  // Тяжкість злочинів
  const hasCritical = incidents.some((i: any) => i.severity === 'critical')
  const hasHigh     = incidents.some((i: any) => i.severity === 'high')
  if (hasCritical) score += 15
  else if (hasHigh) score += 8

  return Math.min(100, score)
}

// ─── Контекст для AI ──────────────────────────────────────────
function buildContext(person: any, incidents: any[], evidence: any[], connections: any[]): string {
  const sections: string[] = []

  // 1. Особисті дані
  const personal: string[] = []
  const name = person.name_rus || person.name_ukr || person.name || 'Невідомо'
  personal.push(`ПІБ: ${name}`)
  if (person.dob)         personal.push(`Дата народження: ${person.dob}`)
  if (person.gender)      personal.push(`Стать: ${person.gender === 'male' ? 'чоловіча' : 'жіноча'}`)
  if (person.nationality) personal.push(`Громадянство: ${person.nationality}`)
  if (person.addr_reg)    personal.push(`Адреса реєстрації: ${person.addr_reg}`)
  if (person.addr_live)   personal.push(`Адреса проживання: ${person.addr_live}`)
  if (personal.length > 1) sections.push('=== ОСОБИСТІ ДАНІ ===\n' + personal.join('\n'))

  // 2. Документи
  const docs: string[] = []
  if (person.passport)    docs.push(`Паспорт: ${person.passport}`)
  if (person.snils)       docs.push(`СНІЛС: ${person.snils}`)
  if (person.ipn)         docs.push(`ІПН/ІНН: ${person.ipn}`)
  if (person.inn_ru)      docs.push(`ІНН РФ: ${person.inn_ru}`)
  if (person.military_id) docs.push(`Військовий номер: ${person.military_id}`)
  if (docs.length > 0)    sections.push('=== ДОКУМЕНТИ ===\n' + docs.join('\n'))

  // 3. Військові дані
  const mil: string[] = []
  if (person.rank)       mil.push(`Звання: ${person.rank}`)
  if (person.unit)       mil.push(`Підрозділ: ${person.unit}`)
  if (person.unit_num)   mil.push(`Номер в/ч: ${person.unit_num}`)
  if (person.position)   mil.push(`Посада: ${person.position}`)
  if (person.region)     mil.push(`Регіон дислокації: ${person.region}`)
  if (mil.length > 0)    sections.push('=== ВІЙСЬКОВІ ДАНІ ===\n' + mil.join('\n'))

  // 4. Контакти і цифровий слід
  const digital: string[] = []
  if (person.phones?.length)       digital.push(`Телефони: ${person.phones.join(', ')}`)
  if (person.email)                digital.push(`Email: ${person.email}`)
  if (person.vk_url)               digital.push(`VK: ${person.vk_url}`)
  if (person.telegram_username)    digital.push(`Telegram: ${person.telegram_username}`)
  const socialProfiles = (person.social_profiles || [])
  for (const sp of socialProfiles.slice(0, 5)) {
    digital.push(`${sp.platform}: ${sp.profile_url}`)
  }
  if (digital.length > 0) sections.push('=== ЦИФРОВИЙ СЛІД ===\n' + digital.join('\n'))

  // 5. Бази даних витоків
  const allLeaks = (person.telegram_raw || []).flatMap((e: any) => e.leaks || [])
  if (allLeaks.length > 0) {
    const leakSection: string[] = [`Знайдено у ${allLeaks.length} витоках:`]
    const sources = [...new Set(allLeaks.map((l: any) => l.source_label).filter(Boolean))]
    leakSection.push(`Джерела: ${sources.slice(0, 8).join(', ')}`)

    const tgFields: Record<string, string> = {}
    for (const l of allLeaks) {
      for (const [k, v] of Object.entries(l.fields || {})) {
        if (v && typeof v === 'string' && !tgFields[k]) tgFields[k] = v
      }
    }
    if (tgFields.employer)   leakSection.push(`Роботодавець: ${tgFields.employer}`)
    if (tgFields.car_info)   leakSection.push(`Авто: ${tgFields.car_info}`)
    if (tgFields.relatives)  leakSection.push(`Родичі: ${String(tgFields.relatives).slice(0, 300)}`)
    sections.push('=== ВИТОКИ БАЗ ДАНИХ ===\n' + leakSection.join('\n'))
  }

  // 6. Миротворець
  if (person.myrotvorets_url) {
    sections.push(`=== МИРОТВОРЕЦЬ ===\n‼️ ВНЕСЕНИЙ ДО БАЗИ МИРОТВОРЕЦЬ\nURL: ${person.myrotvorets_url}`)
  }

  // 7. Інциденти / воєнні злочини
  if (incidents.length > 0) {
    const incSection: string[] = [`Причетний до ${incidents.length} інцидентів/злочинів:`]
    for (const inc of incidents.slice(0, 10)) {
      const role = inc.incident_persons?.[0]?.role || inc.pivot_role || 'невідома роль'
      incSection.push(`\n[${inc.severity?.toUpperCase() || '?'}] ${inc.title}`)
      if (inc.date)     incSection.push(`  Дата: ${inc.date}`)
      if (inc.location) incSection.push(`  Місце: ${inc.location}`)
      if (inc.inc_type) incSection.push(`  Тип: ${inc.inc_type}`)
      if (inc.icc_article) incSection.push(`  Стаття МКС: ${inc.icc_article}`)
      incSection.push(`  Роль: ${role}`)
      if (inc.description) incSection.push(`  Опис: ${inc.description.slice(0, 200)}`)
    }
    sections.push('=== ІНЦИДЕНТИ ТА ЗЛОЧИНИ ===\n' + incSection.join('\n'))
  }

  // 8. Докази
  if (evidence.length > 0) {
    const evTypes = { photo: 0, video: 0, document: 0, audio: 0 }
    for (const e of evidence) {
      if (e.ev_type in evTypes) (evTypes as any)[e.ev_type]++
    }
    const evSummary = Object.entries(evTypes)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    sections.push(`=== ДОКАЗИ ===\nЗбережено ${evidence.length} файлів: ${evSummary}`)
  }

  // 9. Зв'язки
  if (connections.length > 0) {
    const connSection: string[] = [`Відомих зв'язків: ${connections.length}`]
    for (const c of connections.slice(0, 8)) {
      const other = c.person_a_id === person.id ? c.person_b : c.person_a
      if (other) {
        connSection.push(`  ${c.rel_type}: ${other.name_rus || other.name_ukr || other.name}`)
      }
    }
    sections.push("=== ЗВ'ЯЗКИ ===\n" + connSection.join('\n'))
  }

  if (person.description) sections.push(`=== ОПИС ===\n${person.description.slice(0, 800)}`)

  return sections.join('\n\n')
}

// ─── Визначаємо роль автоматично ──────────────────────────────
function detectRole(person: any, incidents: any[]): string {
  const ranks = ['генерал', 'полковник', 'майор', 'капітан', 'лейтенант', 'підполковник']
  const rankLower = (person.rank || '').toLowerCase()
  const isOfficer = ranks.some(r => rankLower.includes(r))

  const roles = incidents.flatMap((i: any) =>
    (i.incident_persons || []).map((ip: any) => ip.role || '')
  )
  const isCommander = roles.some(r => ['командир', 'організатор'].includes(r)) || isOfficer
  const isExecutor  = roles.some(r => r === 'виконавець')

  if (isCommander) return 'командир'
  if (isExecutor)  return 'виконавець'
  if (person.rank) return 'військовий'
  return 'цивільний/невідомо'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY не налаштовано у .env.local' },
      { status: 503 }
    )
  }

  // Завантажуємо всі дані паралельно
  const [
    { data: person },
    { data: incidents },
    { data: evidence },
    { data: connections },
  ] = await Promise.all([
    supabaseAdmin.from('persons').select('*').eq('id', id).single(),
    supabaseAdmin
      .from('incident_persons')
      .select('role, incident:incidents(*)')
      .eq('person_id', id)
      .limit(15),
    supabaseAdmin.from('evidence').select('ev_type, description').eq('person_id', id),
    supabaseAdmin
      .from('connections')
      .select(`*, person_a:persons!connections_person_a_fkey(id,name_rus,name_ukr,name), person_b:persons!connections_person_b_fkey(id,name_rus,name_ukr,name)`)
      .or(`person_a.eq.${id},person_b.eq.${id}`)
      .limit(10),
  ])

  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  // Нормалізуємо інциденти
  const incidentList = (incidents || []).map((ip: any) => ({
    ...ip.incident,
    pivot_role: ip.role,
  })).filter(Boolean)

  // Рахуємо threat score
  const threatScore = calcThreatScore(person, incidentList, evidence || [])
  const detectedRole = detectRole(person, incidentList)

  // Будуємо контекст
  const context = buildContext(person, incidentList, evidence || [], connections || [])
  const personName = person.name_rus || person.name_ukr || person.name || 'Невідомо'

  const prompt = buildInvestigatorPrompt(context, personName, threatScore)

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6144,
        system: [
          {
            type: 'text',
            text: INVESTIGATOR_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text()
      await supabaseAdmin.from('persons').update({ threat_score: threatScore }).eq('id', id)
      return NextResponse.json({
        success: true,
        threat_score: threatScore,
        detected_role: detectedRole,
        ai_profile: null,
        error: `Claude API: ${claudeRes.status}`,
      })
    }

    const claudeData = await claudeRes.json()
    let rawText = claudeData.content?.[0]?.text || ''

    // Стрипаємо markdown-обгортку якщо Claude вернув ```json ... ```
    rawText = rawText.trim()
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    }

    // Парсимо JSON
    let structured: any = null
    try {
      // Витягуємо JSON з тексту (якщо є зайвий текст навколо)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        structured = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Якщо JSON обрізаний (max_tokens) — намагаємося відремонтувати
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*/)
        if (jsonMatch) {
          let truncated = jsonMatch[0]
          // Закриваємо незакінчені рядки та фігурні дужки
          if (!truncated.trimEnd().endsWith('"')) {
            const lastQuoteIdx = truncated.lastIndexOf('"')
            const lastCommaIdx = truncated.lastIndexOf(',')
            const cutAt = Math.max(lastQuoteIdx, lastCommaIdx)
            if (cutAt > 0) truncated = truncated.slice(0, cutAt)
          }
          // Рахуємо незакриті фігурні дужки та масиви
          let depth = 0
          for (const ch of truncated) {
            if (ch === '{' || ch === '[') depth++
            else if (ch === '}' || ch === ']') depth--
          }
          // Закриваємо
          truncated = truncated.trimEnd().replace(/,\s*$/, '')
          for (let i = 0; i < depth; i++) {
            truncated += truncated.includes('[') && !truncated.includes(']') ? ']' : '}'
          }
          structured = JSON.parse(truncated)
        }
      } catch {
        // Не вдалося відремонтувати — зберігаємо raw текст
      }
    }

    // Формуємо ai_profile — або структурований JSON, або raw текст
    const aiProfileToSave = structured
      ? JSON.stringify(structured)
      : rawText

    // Визначаємо threat_level з AI або за threat_score
    const aiThreatLevel = structured?.threat_level || (
      threatScore >= 75 ? 'критичний' :
      threatScore >= 50 ? 'високий' :
      threatScore >= 25 ? 'середній' : 'низький'
    )

    // Зберігаємо у БД
    await supabaseAdmin.from('persons')
      .update({
        ai_profile: aiProfileToSave,
        threat_score: threatScore,
        last_full_osint: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({
      success: true,
      threat_score: threatScore,
      threat_level: aiThreatLevel,
      detected_role: detectedRole,
      ai_profile: aiProfileToSave,
      structured,
      // L2 fields — available when AI returned full reasoning chain
      prosecution_viability: structured?.prosecution_viability ?? null,
      confidence_score:      structured?.confidence_score      ?? null,
      reasoning_chain:       structured?.reasoning_chain       ?? null,
      tokens_used: (claudeData.usage?.input_tokens || 0) + (claudeData.usage?.output_tokens || 0),
      cache_read_tokens: claudeData.usage?.cache_read_input_tokens ?? 0,
    })

  } catch (err: any) {
    await supabaseAdmin.from('persons').update({ threat_score: threatScore }).eq('id', id)
    return NextResponse.json({ error: err.message, threat_score: threatScore }, { status: 500 })
  }
}
