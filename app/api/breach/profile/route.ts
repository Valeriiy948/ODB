// app/api/breach/profile/route.ts
// AI-аналіз: збирає всі витоки по особі → повертає єдиний структурований профіль
// POST /api/breach/profile  body: { query, sources }

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { query, sources } = await req.json()
    if (!query || !sources) {
      return NextResponse.json({ error: 'query and sources required' }, { status: 400 })
    }

    // Збираємо ВСІ записи з усіх джерел
    const allEntries: any[] = []
    for (const [srcName, srcData] of Object.entries(sources as Record<string, any>)) {
      const entries = srcData?.entries || []
      for (const e of entries) {
        allEntries.push({ _source: srcName, ...e })
      }
    }

    if (allEntries.length === 0) {
      return NextResponse.json({ error: 'no_data', profile: null })
    }

    // Обмежуємо до 300 записів щоб не перевищити ліміт токенів
    const sample = allEntries.slice(0, 300)

    const dataText = JSON.stringify(sample, null, 0)

    const prompt = `Ти — аналітик OSINT. Тобі надано сирі дані витоків з різних баз даних по запиту "${query}".

Твоє завдання:
1. ДЕДУБЛІКАЦІЯ: Згрупуй записи по реальним особам (одна людина може з'являтися в 50 базах)
2. ПОБУДОВА ПРОФІЛЮ: Для кожної унікальної особи створи зведений профіль
3. АНАЛІЗ ЗВ'ЯЗКІВ: Знайди родинні зв'язки (спільні адреси), колег (спільні організації), можливих підозрюваних
4. ВІЙСЬКОВИЙ АНАЛІЗ: Виділи будь-яку військову інформацію (ранги, частини, переміщення)

Сирі дані (${sample.length} записів з ${allEntries.length} загалом):
${dataText}

Поверни відповідь ВИКЛЮЧНО у форматі JSON (без markdown, без коментарів):
{
  "persons": [
    {
      "id": 1,
      "full_name": "Іванов Іван Іванович",
      "aliases": ["Иван Иванов", "Ivan Ivanov"],
      "birth_date": "01.01.1990",
      "gender": "M",
      "phones": ["+79991234567", "+79997654321"],
      "emails": ["ivan@mail.ru"],
      "addresses": ["г. Москва, ул. Тверская 1 кв.2", "г. Курск..."],
      "passports": ["4515 123456"],
      "inn": "123456789012",
      "snils": "123-456-789 00",
      "social": {"vk": "12345", "telegram": "@username"},
      "logins": [{"service": "vk.com", "login": "ivan123", "password": "pass123"}],
      "vehicles": ["Toyota Camry А123БВ77"],
      "military": {"rank": "Рядовой", "unit": "в/ч 12345", "position": "Стрелок"},
      "sources": ["База Почта России 2022", "Alfabank 2023"],
      "source_count": 15,
      "confidence": "high",
      "notes": "Проживає у Москві, зареєстрований у Курській обл."
    }
  ],
  "relationships": [
    {
      "person1_id": 1,
      "person2_id": 2,
      "type": "family",
      "evidence": "спільна адреса реєстрації"
    }
  ],
  "summary": "Знайдено X унікальних осіб. Найбільш релевантний: ...",
  "military_alert": "Є/немає військових даних",
  "total_records_analyzed": ${sample.length}
}`

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'no_anthropic_key' }, { status: 500 })

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5',
        max_tokens: 4096,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!aiRes.ok) {
      const err = await aiRes.json().catch(() => ({}))
      throw new Error(`Anthropic API ${aiRes.status}: ${JSON.stringify(err).slice(0, 200)}`)
    }

    const aiData = await aiRes.json()
    const rawText: string = aiData.content?.[0]?.text || ''

    // Парсимо JSON відповідь
    let profile: any = null
    try {
      // Видаляємо можливі markdown блоки
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      profile = JSON.parse(cleaned)
    } catch (e) {
      // Якщо не вдалось — повертаємо сирий текст
      profile = { raw: rawText, parse_error: true }
    }

    return NextResponse.json({
      success: true,
      query,
      total_records: allEntries.length,
      analyzed: sample.length,
      profile,
    })

  } catch (err: any) {
    console.error('[Profile] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
