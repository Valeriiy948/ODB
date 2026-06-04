// app/api/osint/search/[id]/route.ts

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { runOsintSearch } from '../../../../lib/osint/orchestrator'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Отримати дані особи
  const { data: person, error } = await supabaseAdmin
    .from('persons')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  try {
    // Запустити OSINT пошук
    const osintResult = await runOsintSearch(person)

    // Зберегти результати в person_mentions — тільки з relevanceScore >= 80 (100% збіг)
    const HIGH_RELEVANCE_THRESHOLD = 80
    const mentionsToInsert: any[] = []
    for (const vector of osintResult.vectors) {
      for (const result of vector.results) {
        const score = result.relevanceScore ?? 50
        if (score < HIGH_RELEVANCE_THRESHOLD) continue  // пропускаємо низькорелевантні
        mentionsToInsert.push({
          person_id: id,
          source_type: 'web',
          source_name: result.source,
          url: result.link,
          title: result.title,
          snippet: result.snippet,
          mention_date: new Date().toISOString().split('T')[0],
          relevance: vector.vector,
          relevance_score: score,
        })
      }
    }

    if (mentionsToInsert.length > 0) {
      // Спочатку видаляємо старі веб-результати для цієї особи
      await supabaseAdmin
        .from('person_mentions')
        .delete()
        .eq('person_id', id)
        .eq('source_type', 'web')

      // Вставляємо нові
      await supabaseAdmin
        .from('person_mentions')
        .insert(mentionsToInsert)
    }

    // Оновлюємо osint_connections в persons
    const summaryLines = osintResult.vectors.map(
      v => `${v.label}: ${v.results.length} рез.`
    )
    const summary = `OSINT ${new Date().toLocaleDateString('uk-UA')} — знайдено ${osintResult.total}: ${summaryLines.join(', ')}`

    await supabaseAdmin
      .from('persons')
      .update({ osint_connections: summary })
      .eq('id', id)

    // Якщо 0 результатів — повертаємо зрозуміле повідомлення
    if (osintResult.total === 0) {
      const hasSerper = !!process.env.SERPER_API_KEY
      const hasBrave = !!process.env.BRAVE_SEARCH_API_KEY
      if (!hasSerper && !hasBrave) {
        return NextResponse.json({
          error: 'Немає ключів пошукових API. Додайте SERPER_API_KEY або BRAVE_SEARCH_API_KEY у .env.local',
        }, { status: 503 })
      }
    }

    return NextResponse.json({
      success: true,
      total: osintResult.total,
      vectorCount: osintResult.vectors.length,
      searchedAt: osintResult.searchedAt,
      vectors: osintResult.vectors.map(v => ({
        vector: v.vector,
        label: v.label,
        query: v.query,
        count: v.results.length,
        results: v.results,
      })),
    })
  } catch (err: any) {
    console.error('OSINT search error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
