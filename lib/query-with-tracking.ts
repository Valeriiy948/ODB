// lib/query-with-tracking.ts
// Thin wrapper around any async fetcher that:
//   1. Checks the Circuit Breaker before calling
//   2. Times the call
//   3. Records success/failure back to the CB
//   4. Optionally writes to Supabase source_health (fire-and-forget)

import { canQuery, recordSuccess, recordFailure, CBState, getSourceState } from './circuit-breaker'

export interface TrackResult<T> {
  data:       T | null
  ok:         boolean
  latencyMs:  number
  source:     string
  cbState:    CBState
  skipped:    boolean   // true when CB was OPEN and call was skipped
}

/**
 * Execute `fetcher` only if the circuit breaker for `source` is not OPEN.
 * Records outcome and returns a typed result.
 *
 * Usage:
 *   const { data } = await queryWithTracking('leakosint', () => fetch(...).then(r => r.json()))
 */
export async function queryWithTracking<T>(
  source:    string,
  fetcher:   () => Promise<T>,
  timeoutMs  = 8_000,
): Promise<TrackResult<T>> {
  const cbOpen = !canQuery(source)

  if (cbOpen) {
    return {
      data: null, ok: false,
      latencyMs: 0, source,
      cbState: getSourceState(source).state,
      skipped: true,
    }
  }

  const t0 = Date.now()
  try {
    const data      = await withTimeout(fetcher(), timeoutMs)
    const latencyMs = Date.now() - t0
    recordSuccess(source, latencyMs)

    // Async write to Supabase — don't block the response
    void persistHealth(source, true, latencyMs)

    return { data, ok: true, latencyMs, source, cbState: 'closed', skipped: false }
  } catch (err) {
    const latencyMs = Date.now() - t0
    recordFailure(source)
    void persistHealth(source, false, latencyMs)

    return {
      data: null, ok: false,
      latencyMs, source,
      cbState: getSourceState(source).state,
      skipped: false,
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    ),
  ])
}

/** Fire-and-forget: write health snapshot to Supabase source_health table. */
async function persistHealth(source: string, ok: boolean, latencyMs: number): Promise<void> {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
                      ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) return

    const now   = new Date().toISOString()
    const state = getSourceState(source)

    await fetch(`${SUPABASE_URL}/rest/v1/source_health`, {
      method:  'POST',
      headers: {
        'apikey':       SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer':       'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        source,
        state:         state.state,
        failure_count: state.failures,
        last_failure:  state.lastFailureAt ? new Date(state.lastFailureAt).toISOString() : null,
        last_success:  state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : null,
        last_latency:  latencyMs,
        updated_at:    now,
      }),
    })
  } catch {
    // Never let persistence errors bubble up to the caller
  }
}
