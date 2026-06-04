// app/api/admin/users/route.ts
// GET  — список користувачів (тільки адмін)
// POST — оновити дані користувача (тільки адмін)
// DELETE — видалити користувача (тільки адмін)

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getAdminEmails(): string[] {
  const env = process.env.ADMIN_EMAILS || 'vmak948@gmail.com'
  return env.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
}

async function checkAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return null
  const email = (user.email || '').toLowerCase()
  return getAdminEmails().includes(email) ? email : null
}

export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 403 })

  try {
    // List users via service role admin API
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Get activity stats per user from activity_logs
    const { data: stats } = await supabase
      .from('activity_logs')
      .select('user_email, action, created_at, ip_address, device_type')
      .order('created_at', { ascending: false })

    // Build stats per user
    const userStats: Record<string, {
      total_actions: number
      last_seen: string | null
      last_ip: string | null
      last_device: string | null
      search_count: number
    }> = {}

    for (const log of stats || []) {
      const email = log.user_email?.toLowerCase()
      if (!email) continue
      if (!userStats[email]) {
        userStats[email] = {
          total_actions: 0,
          last_seen: null,
          last_ip: null,
          last_device: null,
          search_count: 0,
        }
      }
      userStats[email].total_actions++
      if (!userStats[email].last_seen || log.created_at > userStats[email].last_seen!) {
        userStats[email].last_seen   = log.created_at
        userStats[email].last_ip     = log.ip_address
        userStats[email].last_device = log.device_type
      }
      if (log.action === 'search') userStats[email].search_count++
    }

    const result = (users || []).map(u => ({
      id:              u.id,
      email:           u.email || '',
      created_at:      u.created_at,
      last_sign_in_at: u.last_sign_in_at || null,
      email_confirmed: !!u.email_confirmed_at,
      phone:           u.phone || null,
      is_admin:        getAdminEmails().includes((u.email || '').toLowerCase()),
      role:            u.role || 'authenticated',
      banned:          u.banned_until ? new Date(u.banned_until) > new Date() : false,
      banned_until:    u.banned_until || null,
      stats:           userStats[(u.email || '').toLowerCase()] || {
        total_actions: 0, last_seen: null, last_ip: null, last_device: null, search_count: 0,
      },
    }))

    return NextResponse.json({ users: result, total: result.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 403 })

  try {
    const { user_id, action, value } = await req.json()
    if (!user_id || !action) {
      return NextResponse.json({ error: 'user_id and action required' }, { status: 400 })
    }

    if (action === 'ban') {
      const until = value || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await supabase.auth.admin.updateUserById(user_id, {
        ban_duration: '87600h', // 10 years effectively permanent
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, action: 'banned', until })
    }

    if (action === 'unban') {
      const { error } = await supabase.auth.admin.updateUserById(user_id, {
        ban_duration: 'none',
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, action: 'unbanned' })
    }

    if (action === 'reset_password') {
      const { data: user } = await supabase.auth.admin.getUserById(user_id)
      if (!user.user?.email) return NextResponse.json({ error: 'no email' }, { status: 400 })
      const { error } = await supabase.auth.resetPasswordForEmail(user.user.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, action: 'password_reset_sent', email: user.user.email })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await checkAdmin(req)
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 403 })

  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    // Don't allow deleting yourself
    const token = req.headers.get('authorization')?.replace('Bearer ', '')!
    const { data: { user: me } } = await supabase.auth.getUser(token)
    if (me?.id === user_id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    const { error } = await supabase.auth.admin.deleteUser(user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, deleted: user_id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
