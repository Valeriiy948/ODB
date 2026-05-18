// app/api/osint/batch/route.ts
// Batch OSINT worker — обробляє чергу osint_queue
//
// POST /api/osint/batch          — додати особу(осіб) в чергу
// GET  /api/osint/batch          — отримати статус черги
// POST /api/osint/batch?run=true — запустити обробку (до 5 задач паралельно)

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// ─── Додати в чергу ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const run = searchParams.get('run') === 'true'

  // ?run=true → запуск воркера
  if (run) {
    return runWorker()
  }

  const body = await request.json().catch(() => ({}))

  const modules  = body.modules  || ['web', 'ai']
  const priority = body.priority || 5

  let persons: { id: string }[] = []

  // Режим 1: явний список person_ids (з персональної сторінки, bulk select)
  if (Array.isArray(body.person_ids) && body.person_ids.length > 0) {
    persons = body.person_ids.slice(0, 500).map((id: string) => ({ id }))

  // Режим 2: Масовий запуск за фільтром
  } else {
    const filter = body.filter || 'no_osint'
    const limit  = Math.min(body.limit || 50, 500)

    let query = supabaseAdmin.from('persons').select('id').limit(limit)

    if (filter === 'myrotvorets') {
      query = query.not('myrotvorets_url', 'is', null)
    } else if (filter === 'no_osint') {
      query = query.is('last_full_osint', null)
    } else if (filter === 'low_score') {
      query = query.lt('threat_score', 30).not('myrotvorets_url', 'is', null)
    } else if (filter === 'high_threat') {
      query = query.gte('threat_score', 75)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    persons = data || []
  }

  if (!persons.length) return NextResponse.json({ queued: 0, message: 'Нема записів для обробки' })

  // Вставляємо в osint_queue (ігноруємо дублікати pending/running)
  const { data: existing } = await supabaseAdmin
    .from('osint_queue')
    .select('person_id')
    .in('status', ['pending', 'running'])

  const existingIds = new Set((existing || []).map((e: any) => e.person_id))
  const toQueue = persons.filter(p => !existingIds.has(p.id))

  if (!toQueue.length) {
    return NextResponse.json({
      queued: 0,
      message: `Всі ${persons.length} вже в черзі або обробляються`,
    })
  }

  const rows = toQueue.map(p => ({
    person_id: p.id,
    status:    'pending',
    priority,
    modules,
  }))

  const { error: insertErr } = await supabaseAdmin.from('osint_queue').insert(rows)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    queued:  toQueue.length,
    skipped: persons.length - toQueue.length,
    modules,
    message: `Додано ${toQueue.length} задач у чергу`,
  })
}

// ─── Статус черги ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const [pending, running, done, errored] = await Promise.all([
    supabaseAdmin.from('osint_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin.from('osint_queue').select('id', { count: 'exact', head: true }).eq('status', 'running'),
    supabaseAdmin.from('osint_queue').select('id', { count: 'exact', head: true }).eq('status', 'done'),
    supabaseAdmin.from('osint_queue').select('id', { count: 'exact', head: true }).eq('status', 'error'),
  ])

  // Останні 10 задач
  const { data: recent } = await supabaseAdmin
    .from('osint_queue')
    .select('id, person_id, status, modules, created_at, finished_at, error_msg')
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    queue: {
      pending: pending.count || 0,
      running: running.count || 0,
      done:    done.count    || 0,
      error:   errored.count || 0,
    },
    recent: recent || [],
  })
}

// ─── Воркер ───────────────────────────────────────────────────────────────────
async function runWorker(): Promise<NextResponse> {
  const BATCH_SIZE = 5  // скільки паралельно

  // Беремо наступні задачі зі статусом pending
  const { data: tasks, error } = await supabaseAdmin
    .from('osint_queue')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!tasks?.length) return NextResponse.json({ processed: 0, message: 'Черга порожня' })

  // Позначаємо як running
  const ids = tasks.map((t: any) => t.id)
  await supabaseAdmin.from('osint_queue')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .in('id', ids)

  // Обробляємо паралельно
  const results = await Promise.allSettled(
    tasks.map((task: any) => processTask(task))
  )

  const processed = results.filter(r => r.status === 'fulfilled').length
  const failed    = results.filter(r => r.status === 'rejected').length

  return NextResponse.json({
    processed,
    failed,
    total: tasks.length,
    message: `Оброблено ${processed}/${tasks.length} задач`,
  })
}

async function processTask(task: any): Promise<void> {
  const modules: string[] = task.modules || ['web', 'ai']
  const results: any = {}

  try {
    // Запускаємо модулі послідовно (rate limiting)
    for (const mod of modules) {
      try {
        let url = ''
        if (mod === 'web') {
          url = `${BASE_URL}/api/osint/search/${task.person_id}`
        } else if (mod === 'ai') {
          url = `${BASE_URL}/api/osint/ai-profile/${task.person_id}`
        } else if (mod === 'vk') {
          url = `${BASE_URL}/api/osint/vk/${task.person_id}`
        } else if (mod === 'edr') {
          url = `${BASE_URL}/api/osint/opendatabot/${task.person_id}`
        } else if (mod === 'vehicles') {
          url = `${BASE_URL}/api/osint/vehicles/${task.person_id}`
        }

        if (!url) continue

        const res = await fetch(url, {
          method: 'POST',
          signal: AbortSignal.timeout(120000),  // 2 хвилини на модуль
        })
        const data = await res.json()
        results[mod] = { success: res.ok, ...data }

        // Невелика пауза між модулями (rate limiting)
        await new Promise(r => setTimeout(r, 1000))

      } catch (modErr: any) {
        results[mod] = { success: false, error: modErr.message }
      }
    }

    // Позначаємо як done
    await supabaseAdmin.from('osint_queue')
      .update({
        status: 'done',
        result: results,
        finished_at: new Date().toISOString(),
      })
      .eq('id', task.id)

  } catch (err: any) {
    // Позначаємо як error
    await supabaseAdmin.from('osint_queue')
      .update({
        status: 'error',
        error_msg: err.message?.slice(0, 500),
        finished_at: new Date().toISOString(),
      })
      .eq('id', task.id)
    throw err
  }
}
