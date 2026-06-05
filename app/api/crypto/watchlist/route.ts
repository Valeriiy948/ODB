// app/api/crypto/watchlist/route.ts
// Crypto watchlist — persistent monitoring of suspicious addresses
//
// SQL (run once in Supabase dashboard):
// -------------------------------------------------------------------
// CREATE TABLE IF NOT EXISTS crypto_watchlist (
//   id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   address     text NOT NULL,
//   chain       text NOT NULL DEFAULT 'eth',
//   label       text,
//   notes       text,
//   person_id   uuid REFERENCES persons(id) ON DELETE SET NULL,
//   risk_level  text DEFAULT 'unknown',
//   drop_score  int  DEFAULT 0,
//   added_at    timestamptz DEFAULT now(),
//   last_checked timestamptz,
//   last_tx_hash text,
//   last_balance text,
//   alert_new_tx boolean DEFAULT true
// );
// CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_address
//   ON crypto_watchlist(lower(address));
// -------------------------------------------------------------------
//
// GET    /api/crypto/watchlist           → list all watched addresses
// POST   /api/crypto/watchlist           → add address to watchlist
// DELETE /api/crypto/watchlist?address=  → remove from watchlist
// PATCH  /api/crypto/watchlist           → update label/notes/person_id

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── GET — list all watched addresses ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const address = searchParams.get('address')

    if (address) {
      // Single address lookup
      const { data, error } = await supabase
        .from('crypto_watchlist')
        .select('*, persons(id, name, name_rus)')
        .ilike('address', address.trim())
        .maybeSingle()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ watching: !!data, entry: data })
    }

    // Full list
    const { data, error } = await supabase
      .from('crypto_watchlist')
      .select('*, persons(id, name, name_rus)')
      .order('added_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ entries: data || [], total: data?.length || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── POST — add to watchlist ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { address, chain = 'eth', label, notes, person_id, risk_level, drop_score } = body

    if (!address?.trim()) return NextResponse.json({ error: 'address required' }, { status: 400 })

    const { data, error } = await supabase
      .from('crypto_watchlist')
      .upsert({
        address:    address.trim().toLowerCase(),
        chain,
        label:      label || null,
        notes:      notes || null,
        person_id:  person_id || null,
        risk_level: risk_level || 'unknown',
        drop_score: drop_score || 0,
      }, { onConflict: 'address' })
      .select()
      .single()

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') {
        return NextResponse.json({
          error:  'table_not_found',
          hint:   'Run the SQL from the route file comments in Supabase dashboard to create the crypto_watchlist table',
          sql:    `CREATE TABLE IF NOT EXISTS crypto_watchlist (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, address text NOT NULL, chain text NOT NULL DEFAULT 'eth', label text, notes text, person_id uuid REFERENCES persons(id) ON DELETE SET NULL, risk_level text DEFAULT 'unknown', drop_score int DEFAULT 0, added_at timestamptz DEFAULT now(), last_checked timestamptz, last_tx_hash text, last_balance text, alert_new_tx boolean DEFAULT true); CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_address ON crypto_watchlist(lower(address));`
        }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, entry: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── DELETE — remove from watchlist ───────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const address = searchParams.get('address')
    if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

    const { error } = await supabase
      .from('crypto_watchlist')
      .delete()
      .ilike('address', address.trim())

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── PATCH — update label / notes / person_id ─────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const { address, ...updates } = await req.json()
    if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

    const allowed = ['label', 'notes', 'person_id', 'risk_level', 'drop_score',
                     'last_checked', 'last_tx_hash', 'last_balance', 'alert_new_tx']
    const patch = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))

    const { data, error } = await supabase
      .from('crypto_watchlist')
      .update(patch)
      .ilike('address', address.trim())
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, entry: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
