// app/api/activity/log/route.ts
// POST /api/activity/log — логує дію користувача (fire-and-forget)
// GET  /api/activity/log — повертає логи (тільки для адміна)

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function detectDevice(ua: string): string {
  if (!ua) return 'unknown'
  const u = ua.toLowerCase()
  if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(u)) return 'mobile'
  if (/ipad|tablet/.test(u)) return 'tablet'
  return 'desktop'
}

function getAdminEmails(): string[] {
  const env = process.env.ADMIN_EMAILS || 'vmak948@gmail.com'
  return env.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      user_id, user_email,
      action, query, query_type,
      result_count = 0, person_id,
      duration_ms,
    } = body

    // Extract IP and User-Agent from headers
    const ip_address =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      'unknown'

    const user_agent = req.headers.get('user-agent') || ''
    const device_type = detectDevice(user_agent)

    // Non-blocking insert
    supabase.from('activity_logs').insert({
      user_id:      user_id      || null,
      user_email:   user_email   || null,
      action:       action       || 'unknown',
      query:        query        || null,
      query_type:   query_type   || null,
      result_count: result_count || 0,
      person_id:    person_id    || null,
      ip_address,
      user_agent,
      device_type,
      duration_ms:  duration_ms  || null,
    }).then() // fire-and-forget, ignore result

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // Auth check via Authorization header
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const adminEmails = getAdminEmails()
  if (!adminEmails.includes((user.email || '').toLowerCase())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Parse filters
  const page     = parseInt(searchParams.get('page') || '1')
  const limit    = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const offset   = (page - 1) * limit
  const email    = searchParams.get('email')
  const action   = searchParams.get('action')
  const dateFrom = searchParams.get('from') // ISO date
  const dateTo   = searchParams.get('to')

  let query = supabase
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (email)    query = query.ilike('user_email', `%${email}%`)
  if (action)   query = query.eq('action', action)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo)   query = query.lte('created_at', dateTo)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Stats for today
  const today = new Date().toISOString().split('T')[0]
  const { data: stats } = await supabase
    .from('activity_logs')
    .select('action, user_email, device_type')
    .gte('created_at', `${today}T00:00:00Z`)

  const todaySearches = (stats || []).filter(s => s.action === 'search').length
  const uniqueUsers   = new Set((stats || []).map(s => s.user_email).filter(Boolean)).size
  const mobileCount   = (stats || []).filter(s => s.device_type === 'mobile').length

  return NextResponse.json({
    logs:    data || [],
    total:   count || 0,
    page,
    limit,
    today_stats: {
      searches:     todaySearches,
      unique_users: uniqueUsers,
      mobile:       mobileCount,
    },
  })
}
