// app/api/persons/[id]/route.ts

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/persons/[id] — отримати одну особу
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('persons')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

// DELETE /api/persons/[id] — видалити особу
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { error } = await supabaseAdmin.from('persons').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// PATCH /api/persons/[id] — оновити поля особи (фото, нотатки тощо)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()

    // Дозволяємо оновлювати лише безпечні поля
    const allowedFields = [
      'photo_url', 'notes', 'analyst_notes', 'sources',
      'threat_level', 'status', 'priority', 'tags',
      'icc_relevant', 'verified', 'osint_connections',
      'name_ukr', 'name_rus', 'name_eng',
      'addr_live', 'addr_reg', 'email', 'phones',
      'myrotvorets_url', 'vk_url', 'ok_url', 'fb_url', 'instagram_url',
      'passport', 'military_id', 'snils', 'ipn', 'rank', 'unit', 'unit_num',
      'dob', 'description', 'gender', 'nationality', 'region', 'birth_place',
      // Telegram витоки — масив сесій
      'telegram_raw',
      // AI та аналітика
      'ai_profile', 'threat_score', 'last_full_osint',
      // Розширені OSINT поля
      'social_profiles', 'vehicles', 'person_photos', 'business_connections',
    ]

    const updateData: Record<string, any> = {}
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('persons')
      .update(updateData)
      .eq('id', id)
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
