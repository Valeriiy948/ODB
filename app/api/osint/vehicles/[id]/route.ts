// app/api/osint/vehicles/[id]/route.ts
// Пошук транспортних засобів через ГИБДД (Telegram @avtokod_bot)
// Запит: автономери з person.telegram_raw + прямий пошук по ІПН

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VPS_HOST = process.env.VPS_HOST || '161.35.86.145'
const TG_PORT  = process.env.TELEGRAM_SEARCH_PORT || '8001'

interface Vehicle {
  plate?:        string
  vin?:          string
  make?:         string
  model?:        string
  year?:         number | null
  color?:        string
  owner_name?:   string
  source:        string
  raw_snippet?:  string
}

// ─── Витягуємо відомі номери з telegram_raw ───────────────────────────────────
function extractPlatesFromTgRaw(telegramRaw: any[]): string[] {
  const plates = new Set<string>()
  for (const session of (telegramRaw || [])) {
    for (const leak of (session.leaks || [])) {
      const f = leak.fields || {}
      if (f.car_plate) plates.add(String(f.car_plate).toUpperCase().trim())
      for (const p of (f.car_plates_list || [])) {
        plates.add(String(p).toUpperCase().trim())
      }
    }
  }
  return [...plates].filter(p => /^[А-ЯA-Z]\d{3}[А-ЯA-Z]{2}\d{2,3}$/.test(p))
}

// ─── Запит до VPS Telegram сервісу ───────────────────────────────────────────
async function searchCarVps(query: string, type: 'plate' | 'vin'): Promise<any[]> {
  try {
    const param = type === 'plate' ? 'plate' : 'vin'
    const url = `http://${VPS_HOST}:${TG_PORT}/search/car?${param}=${encodeURIComponent(query)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
    if (!res.ok) return []
    const data = await res.json()
    return data.results || []
  } catch (err) {
    console.warn(`VPS car search error (${query}):`, err)
    return []
  }
}

// ─── Парсимо результати VPS у структуру Vehicle ──────────────────────────────
function parseVehicleResults(rawResults: any[], query: string): Vehicle[] {
  const vehicles: Vehicle[] = []
  for (const r of rawResults) {
    const f = r.fields || {}
    // Тільки якщо є реальні дані про авто
    if (!f.car_info && !f.car_owner && !f.vin && !f.car_plate) continue

    vehicles.push({
      plate:       f.car_plate || query,
      vin:         f.vin || undefined,
      make:        f.car_info ? f.car_info.split(' ')[0] : undefined,
      model:       f.car_info || undefined,
      year:        f.car_year ? parseInt(f.car_year) : null,
      color:       f.car_color || undefined,
      owner_name:  f.car_owner || f.name || undefined,
      source:      r.source_label || r.source || 'telegram',
      raw_snippet: r.snippet?.slice(0, 300),
    })
  }
  return vehicles
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: person, error } = await supabaseAdmin
    .from('persons').select('*').eq('id', id).single()
  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const allVehicles: Vehicle[] = []
  const searchedPlates: string[] = []

  // 1. Витягуємо відомі номери з telegram_raw
  const knownPlates = extractPlatesFromTgRaw(person.telegram_raw || [])

  // 2. Якщо є VPS — шукаємо по кожному номеру
  const vpsAvailable = VPS_HOST && TG_PORT

  if (vpsAvailable) {
    for (const plate of knownPlates.slice(0, 5)) {
      searchedPlates.push(plate)
      const rawResults = await searchCarVps(plate, 'plate')
      const parsed = parseVehicleResults(rawResults, plate)
      allVehicles.push(...parsed)
    }

    // 3. Якщо ІПН є — шукаємо авто через ІНН (деякі боти підтримують)
    if (person.ipn && knownPlates.length === 0) {
      const rawResults = await searchCarVps(person.ipn, 'plate')
      const parsed = parseVehicleResults(rawResults, person.ipn)
      allVehicles.push(...parsed)
    }
  }

  // 4. Також перевіряємо vehicles вже в telegram_raw (без VPS запиту)
  const existingVehicles: Vehicle[] = []
  for (const session of (person.telegram_raw || [])) {
    for (const leak of (session.leaks || [])) {
      const f = leak.fields || {}
      if (f.car_info || f.car_plate) {
        existingVehicles.push({
          plate:      f.car_plate || f.car_plates_list?.[0],
          vin:        f.vin,
          model:      f.car_info,
          year:       f.car_year ? parseInt(f.car_year) : null,
          color:      f.car_color,
          source:     leak.source_label || 'telegram_leak',
        })
      }
    }
  }

  // Дедублікуємо по plate/vin
  const allFound = [...existingVehicles, ...allVehicles]
  const seen = new Set<string>()
  const deduped = allFound.filter(v => {
    const key = (v.plate || '') + '|' + (v.vin || '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Зберігаємо у БД
  if (deduped.length > 0) {
    await supabaseAdmin.from('persons')
      .update({ vehicles: deduped })
      .eq('id', id)
  }

  return NextResponse.json({
    success: true,
    found: deduped.length,
    vehicles: deduped,
    known_plates: knownPlates,
    searched_plates: searchedPlates,
    vps_available: !!vpsAvailable,
    note: !vpsAvailable
      ? 'VPS недоступний — показано дані з telegram_raw'
      : undefined,
  })
}
