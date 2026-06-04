// app/api/activity/setup/route.ts
// POST /api/activity/setup — створює таблиці activity_logs та platform_settings
// Запускати один раз від адміна

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  const results: Record<string, string> = {}

  // 1. activity_logs
  try {
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS activity_logs (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          user_id UUID,
          user_email TEXT,
          action TEXT NOT NULL,
          query TEXT,
          query_type TEXT,
          result_count INTEGER DEFAULT 0,
          person_id UUID,
          ip_address TEXT,
          user_agent TEXT,
          device_type TEXT,
          country TEXT,
          duration_ms INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_logs_user_email ON activity_logs(user_email);
        CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
      `
    })
    results.activity_logs = 'created'
  } catch (e: any) {
    results.activity_logs = e.message
  }

  // 2. platform_settings
  try {
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS platform_settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          description TEXT,
          is_secret BOOLEAN DEFAULT false,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    })
    results.platform_settings = 'created'
  } catch (e: any) {
    results.platform_settings = e.message
  }

  return NextResponse.json({ results })
}
