// lib/circuit-breaker.ts
// In-memory Circuit Breaker per external data source.
// Prevents wasting time on APIs that are temporarily down.
//
// States:
//   CLOSED    — normal operation
//   OPEN      — source failed N times → skip all requests for RECOVERY_MS
//   HALF_OPEN — recovery window expired → allow one probe request through

export type CBState = 'closed' | 'open' | 'half_open'

export interface CBRecord {
  state:         CBState
  failures:      number
  lastFailureAt: number  // unix ms
  lastSuccessAt: number  // unix ms
  lastLatencyMs: number
  openUntil:     number  // unix ms when OPEN expires
}

// Configurable thresholds
const FAILURE_THRESHOLD = 3         // failures to trip breaker
const RECOVERY_MS       = 60_000    // 60 s in OPEN before probing
const HALF_OPEN_PASSES  = 1         // successes needed to re-close

const _map = new Map<string, CBRecord>()

function _get(source: string): CBRecord {
  if (!_map.has(source)) {
    _map.set(source, {
      state: 'closed', failures: 0,
      lastFailureAt: 0, lastSuccessAt: 0,
      lastLatencyMs: 0, openUntil: 0,
    })
  }
  return _map.get(source)!
}

/** Returns true if a query to this source is allowed right now. */
export function canQuery(source: string): boolean {
  const r   = _get(source)
  const now = Date.now()

  if (r.state === 'closed') return true

  if (r.state === 'open') {
    if (now >= r.openUntil) {
      // Transition: OPEN → HALF_OPEN for one probe
      r.state    = 'half_open'
      r.failures = 0
      return true
    }
    return false
  }

  // HALF_OPEN — let the probe through
  return true
}

/** Call after a successful response. */
export function recordSuccess(source: string, latencyMs = 0): void {
  const r = _get(source)
  r.lastSuccessAt = Date.now()
  r.lastLatencyMs = latencyMs

  if (r.state === 'half_open') {
    // One success is enough to restore
    r.state    = 'closed'
    r.failures = 0
  } else if (r.state === 'closed') {
    r.failures = 0
  }
}

/** Call after a failure (timeout, network error, HTTP 5xx). */
export function recordFailure(source: string): void {
  const r = _get(source)
  r.lastFailureAt = Date.now()
  r.failures++

  if (r.state === 'half_open' || r.failures >= FAILURE_THRESHOLD) {
    r.state    = 'open'
    r.openUntil = Date.now() + RECOVERY_MS
    r.failures  = FAILURE_THRESHOLD  // cap counter
  }
}

/** Returns a snapshot of a single source's state. */
export function getSourceState(source: string): CBRecord & { source: string } {
  return { source, ..._get(source) }
}

/** Returns snapshots of all tracked sources. */
export function getAllStates(): Array<CBRecord & { source: string }> {
  return Array.from(_map.entries()).map(([s, r]) => ({ source: s, ...r }))
}

/** Manually reset a source (admin use). */
export function resetSource(source: string): void {
  _map.delete(source)
}
