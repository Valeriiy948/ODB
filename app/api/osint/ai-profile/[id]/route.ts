// app/api/osint/ai-profile/[id]/route.ts
// Генерує AI-профіль та threat_score для особи через Claude API

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Threat Score ──────────────────────────────────────────────────────────────
function calcThreatScore(person: any, mentions: any[]): number {
  let score = 0

  // Myrotvorets — найвищий пріоритет
  if (person.myrotvorets_url) score += 40

  // Ідентифіковані документи (СНІЛС, ІПН, паспорт)
  if (person.snils) score += 5
  if (person.ipn) score += 5
  if (person.passport) score += 5

  // Telegram витоки
  const leakCount = (person.telegram_raw || [])
    .flatMap((e: any) => e.leaks || []).length
  if (leakCount >= 10) score += 15
  else if (leakCount >= 3) score += 8
  else if (leakCount >= 1) score += 3

  // Web-згадки
  const mentionCount = mentions.length
  if (mentionCount >= 20) score += 10
  else if (mentionCount >= 5) score += 5

  // Вагомі web-джерела
  const hasMyrtoMention = mentions.some(m => (m.url || '').includes('myrotvorets'))
  if (hasMyrtoMention) score += 10

  // Є інциденти/злочини
  if (person.incidents_count > 0) score += 15

  // Військові дані
  if (person.rank || person.unit || person.military_id) score += 5

  return Math.min(100, score)
}

// ─── Збираємо дані для промта ──────────────────────────────────────────────────
function buildPersonContext(person: any, mentions: any[]): string {
  const lines: string[] = []

  if (person.name_rus || person.name_ukr) {
    lines.push(`ПІБ: ${[person.name_rus, person.name_ukr].filter(Boolean).join(' / ')}`)
  }
  if (person.dob) lines.push(`Дата народження: ${person.dob}`)
  if (person.gender) lines.push(`Стать: ${person.gender === 'male' ? 'чоловіча' : 'жіноча'}`)
  if (person.nationality) lines.push(`Громадянство: ${person.nationality}`)

  if (person.rank) lines.push(`Звання: ${person.rank}`)
  if (person.unit) lines.push(`Підрозділ: ${person.unit}`)
  if (person.unit_num) lines.push(`Номер в/ч: ${person.unit_num}`)
  if (person.military_id) lines.push(`Особистий №: ${person.military_id}`)

  if (person.passport) lines.push(`Паспорт: ${person.passport}`)
  if (person.snils) lines.push(`СНІЛС: ${person.snils}`)
  if (person.ipn) lines.push(`ІПН: ${person.ipn}`)
  if (person.phones?.length) lines.push(`Телефони: ${person.phones.join(', ')}`)
  if (person.email) lines.push(`Email: ${person.email}`)

  if (person.addr_reg) lines.push(`Адреса реєстрації: ${person.addr_reg}`)
  if (person.addr_live) lines.push(`Адреса проживання: ${person.addr_live}`)

  if (person.myrotvorets_url) {
    lines.push(`‼️ ВНЕСЕНИЙ ДО БАЗИ МИРОТВОРЕЦЬ: ${person.myrotvorets_url}`)
  }

  // Telegram витоки — підсумок
  const allLeaks = (person.telegram_raw || []).flatMap((e: any) => e.leaks || [])
  if (allLeaks.length > 0) {
    lines.push(`\nZнайдено у ${allLeaks.length} витоках Telegram:`)
    const sources = [...new Set(allLeaks.map((l: any) => l.source_label).filter(Boolean))]
    lines.push(`  Джерела: ${sources.slice(0, 10).join(', ')}`)

    // Унікальні поля з витоків
    const tgFields: Record<string, string> = {}
    for (const l of allLeaks) {
      const f = l.fields || {}
      for (const [k, v] of Object.entries(f)) {
        if (v && typeof v === 'string' && !tgFields[k]) tgFields[k] = v
      }
    }
    if (tgFields.relatives) lines.push(`  Родичі: ${String(tgFields.relatives).slice(0, 300)}`)
    if (tgFields.employer) lines.push(`  Роботодавець: ${tgFields.employer}`)
    if (tgFields.car_info) lines.push(`  Авто: ${tgFields.car_info}`)
  }

  // Web-згадки — топ 5
  if (mentions.length > 0) {
    lines.push(`\nWeb-згадки (${mentions.length}):`)
    for (const m of mentions.slice(0, 5)) {
      lines.push(`  - [${m.source_name}] ${m.title}: ${(m.snippet || '').slice(0, 150)}`)
    }
  }

  if (person.description) lines.push(`\nОпис: ${person.description.slice(0, 500)}`)

  return lines.join('\n')
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

  // Завантажуємо дані особи
  const { data: person, error: personErr } = await supabaseAdmin
    .from('persons').select('*').eq('id', id).single()
  if (personErr || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  // Завантажуємо web-згадки
  const { data: mentions } = await supabaseAdmin
    .from('person_mentions').select('*').eq('person_id', id)
    .eq('source_type', 'web').order('created_at', { ascending: false }).limit(30)

  const allMentions = mentions || []

  // Рахуємо threat score
  const threatScore = calcThreatScore(person, allMentions)

  // Будуємо контекст для AI
  const context = buildPersonContext(person, allMentions)
  const personName = person.name_rus || person.name_ukr || person.name || 'Невідомо'

  try {
    // Генеруємо AI-профіль через Claude API
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Ти аналітик OSINT воєнних злочинів. Ось зібрані дані про особу:\n\n${context}\n\n---\nСклади структурований аналітичний профіль УКРАЇНСЬКОЮ МОВОЮ у форматі Markdown. Включи:
1. **Ідентифікація** — ПІБ, ДН, документи, адреси
2. **Військова роль** — підрозділ, звання, ймовірні функції
3. **Цифровий слід** — телефони, email, соцмережі, витоки
4. **Ризики та індикатори** — Миротворець, кримінальна активність, небезпека
5. **Зв'язки** — родичі, колеги, підрозділ
6. **Висновки аналітика** — ключові факти, рекомендації

Будь об'єктивним. Якщо даних недостатньо — зазнач це.`,
        }],
      }),
    })

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text()
      console.error('Claude API error:', claudeRes.status, errBody)
      // Якщо AI недоступний — зберігаємо threat score і повертаємо без профілю
      await supabaseAdmin.from('persons').update({ threat_score: threatScore })
        .eq('id', id)
      return NextResponse.json({
        success: true,
        threat_score: threatScore,
        ai_profile: null,
        error: `Claude API: ${claudeRes.status} — ${errBody.slice(0, 200)}`,
      })
    }

    const claudeData = await claudeRes.json()
    const aiProfile = claudeData.content?.[0]?.text || ''

    // Зберігаємо у БД
    await supabaseAdmin.from('persons')
      .update({
        ai_profile: aiProfile,
        threat_score: threatScore,
        last_full_osint: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({
      success: true,
      threat_score: threatScore,
      ai_profile: aiProfile,
      tokens_used: claudeData.usage?.input_tokens + claudeData.usage?.output_tokens,
    })
  } catch (err: any) {
    console.error('AI profile error:', err)
    // Навіть якщо AI не вийшов — зберігаємо threat score
    await supabaseAdmin.from('persons').update({ threat_score: threatScore }).eq('id', id)
    return NextResponse.json({ error: err.message, threat_score: threatScore }, { status: 500 })
  }
}
