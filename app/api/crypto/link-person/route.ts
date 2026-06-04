// app/api/crypto/link-person/route.ts
// Link a crypto wallet to a person in the DB (or create new person record)
// POST /api/crypto/link-person
// Body: { wallet_address, chain, person_id?, wallet_data? }
//
// GET /api/crypto/link-person?wallet=0x...
// Returns person linked to this wallet (if any)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── GET: find person by wallet address ──────────────────────────────────────
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')?.trim().toLowerCase()
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 })

  try {
    // Use Supabase JSONB @> (contains) to find wallet by address
    // crypto_wallets @> '[{"address":"0x..."}]'
    const containsQuery = JSON.stringify([{ address: wallet }])

    const { data, error } = await supabase
      .from('persons')
      .select('id, name, name_ukr, name_rus, dob, threat_level, threat_score, photo_url, crypto_wallets')
      .filter('crypto_wallets', 'cs', containsQuery)

    if (error) {
      // Fallback: scan all persons with non-empty wallets
      const { data: allData } = await supabase
        .from('persons')
        .select('id, name, name_ukr, name_rus, dob, threat_level, threat_score, photo_url, crypto_wallets')
        .not('crypto_wallets', 'eq', '[]')
        .not('crypto_wallets', 'is', null)

      const matched = (allData || []).filter((p: any) =>
        (p.crypto_wallets || []).some((w: any) =>
          (w.address || '').toLowerCase() === wallet
        )
      )
      if (!matched.length) return NextResponse.json({ found: false, person: null })
      return NextResponse.json({ found: true, person: matched[0] })
    }

    if (!data?.length) return NextResponse.json({ found: false, person: null })
    return NextResponse.json({ found: true, person: data[0] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── POST: link wallet to person ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { wallet_address, chain = 'eth', person_id, wallet_data, notes } = await req.json()

    if (!wallet_address?.trim()) {
      return NextResponse.json({ error: 'wallet_address required' }, { status: 400 })
    }
    if (!person_id) {
      return NextResponse.json({ error: 'person_id required' }, { status: 400 })
    }

    const addr = wallet_address.trim().toLowerCase()

    // 1. Get current person
    const { data: person, error: fetchErr } = await supabase
      .from('persons')
      .select('id, name, crypto_wallets')
      .eq('id', person_id)
      .single()

    if (fetchErr || !person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }

    // 2. Build wallet entry
    const newWallet = {
      address:    addr,
      chain:      chain.toLowerCase(),
      linked_at:  new Date().toISOString(),
      notes:      notes || null,
      // Optional cached wallet data (balance, risk, etc.)
      balance:    wallet_data?.balance_native ?? null,
      risk_score: wallet_data?.risk_score ?? null,
      risk_level: wallet_data?.risk_level ?? null,
      tx_count:   wallet_data?.tx_count ?? null,
      last_tx:    wallet_data?.last_tx ?? null,
      flags:      wallet_data?.risk_flags ?? [],
    }

    // 3. Merge with existing wallets (no duplicates by address)
    const existing: any[] = person.crypto_wallets || []
    const alreadyLinked = existing.some(
      (w: any) => (w.address || '').toLowerCase() === addr
    )

    if (alreadyLinked) {
      // Update existing entry (refresh balance/risk data)
      const updated = existing.map((w: any) =>
        (w.address || '').toLowerCase() === addr
          ? { ...w, ...newWallet, linked_at: w.linked_at } // keep original link date
          : w
      )
      await supabase.from('persons').update({ crypto_wallets: updated }).eq('id', person_id)
      return NextResponse.json({
        success:   true,
        action:    'updated',
        person_id,
        wallet:    addr,
        message:   'Wallet data refreshed for existing link',
      })
    }

    // 4. Add new wallet
    const merged = [...existing, newWallet]
    const { error: updateErr } = await supabase
      .from('persons')
      .update({ crypto_wallets: merged })
      .eq('id', person_id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({
      success:         true,
      action:          'linked',
      person_id,
      person_name:     person.name,
      wallet:          addr,
      chain,
      total_wallets:   merged.length,
      message:         `Wallet linked to ${person.name}`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── DELETE: unlink wallet from person ───────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { wallet_address, person_id } = await req.json()
    if (!wallet_address || !person_id) {
      return NextResponse.json({ error: 'wallet_address and person_id required' }, { status: 400 })
    }

    const addr = wallet_address.trim().toLowerCase()

    const { data: person } = await supabase
      .from('persons')
      .select('id, crypto_wallets')
      .eq('id', person_id)
      .single()

    if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

    const filtered = (person.crypto_wallets || []).filter(
      (w: any) => (w.address || '').toLowerCase() !== addr
    )

    await supabase.from('persons').update({ crypto_wallets: filtered }).eq('id', person_id)

    return NextResponse.json({ success: true, action: 'unlinked', wallet: addr, person_id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
