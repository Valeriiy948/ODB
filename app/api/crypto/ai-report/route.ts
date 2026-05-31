// app/api/crypto/ai-report/route.ts
// AI forensic report: Claude analyzes all crypto intel → structured investigation summary
// POST /api/crypto/ai-report  body: { address, wallet, trace, cluster, osint_bridge }

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { address, wallet, trace, cluster, osint_bridge } = await req.json()
    if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'no_anthropic_key' }, { status: 500 })

    const prompt = `Ти — криpto-форензик аналітик світового рівня, спеціаліст з блокчейн-розслідувань.
Тобі надані всі зібрані дані по криптовалютному гаманцю.

Адреса гаманця: ${address}

=== ДАНІ ГАМАНЦЯ ===
${JSON.stringify(wallet || {}, null, 0).slice(0, 3000)}

=== ВІДСТЕЖЕННЯ ТРАНЗАКЦІЙ ===
${JSON.stringify(trace || {}, null, 0).slice(0, 2000)}

=== КЛАСТЕРИЗАЦІЯ (пов'язані гаманці) ===
${JSON.stringify(cluster || {}, null, 0).slice(0, 2000)}

=== OSINT ДАНІ (реальні особи) ===
${JSON.stringify(osint_bridge || {}, null, 0).slice(0, 3000)}

Твоє завдання — провести повне криміналістичне розслідування та написати ОФІЦІЙНИЙ ЗВІТ.

Поверни ТІЛЬКИ JSON (без markdown):
{
  "executive_summary": "Коротке резюме (3-5 речень) для керівника розслідування",
  "verdict": "scammer|suspicious|unknown|legitimate",
  "confidence": "high|medium|low",
  "risk_score": 0-100,

  "subject": {
    "wallet": "${address}",
    "chain": "...",
    "estimated_identity": "якщо знайдено — ПІБ або username, інакше null",
    "known_emails": [],
    "known_phones": [],
    "linked_wallets": [],
    "total_volume_usd_approx": null
  },

  "timeline": [
    {
      "date": "YYYY-MM-DD",
      "event": "Опис події",
      "significance": "high|medium|low"
    }
  ],

  "money_flow": {
    "sources": ["звідки надходили кошти (біржі, інші адреси)"],
    "destinations": ["куди йшли кошти"],
    "pattern": "Опис схеми руху коштів",
    "total_volume_estimate": "приблизна сума у USD якщо можливо"
  },

  "fraud_indicators": [
    {
      "indicator": "Назва індикатора",
      "evidence": "Докази",
      "severity": "critical|high|medium|low"
    }
  ],

  "de_anonymization": {
    "status": "identified|partial|unknown",
    "found_via": ["breach_db", "web_osint", "blockchain_analysis"],
    "identity_chain": "Як ми прийшли до особи (покроково)",
    "verification_needed": ["Що потрібно додатково перевірити"]
  },

  "recommendations": [
    "Конкретні кроки для продовження розслідування"
  ],

  "law_enforcement_notes": "Що потрібно для звернення до правоохоронців / Інтерпол",

  "sources_used": ["blockchain_data", "breach_databases", "web_osint", "shodan"]
}`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-5',  // Sonnet for complex forensic analysis
        max_tokens: 4096,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(90000),
    })

    if (!aiRes.ok) {
      const err = await aiRes.json().catch(() => ({}))
      throw new Error(`Anthropic ${aiRes.status}: ${JSON.stringify(err).slice(0, 200)}`)
    }

    const aiData = await aiRes.json()
    const rawText: string = aiData.content?.[0]?.text || ''

    let report: any = null
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      report = JSON.parse(cleaned)
    } catch {
      report = { raw: rawText, parse_error: true }
    }

    return NextResponse.json({
      success: true,
      address,
      report,
      model_used: 'claude-sonnet-4-5',
      generated_at: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
