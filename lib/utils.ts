// lib/utils.ts

/**
 * Normalized Levenshtein distance [0..1].
 * 0 = identical, 1 = maximally different.
 * O(n*m) classical DP, no external dependencies.
 */
export function levenshteinNorm(a: string, b: string): number {
  const la = a.toLowerCase()
  const lb = b.toLowerCase()
  if (la === lb) return 0
  if (!la.length)  return 1
  if (!lb.length)  return 1

  const maxLen = Math.max(la.length, lb.length)
  // Allocate two rows instead of full matrix (O(n) space)
  let prev = Array.from({ length: lb.length + 1 }, (_, j) => j)
  let curr = new Array<number>(lb.length + 1)

  for (let i = 1; i <= la.length; i++) {
    curr[0] = i
    for (let j = 1; j <= lb.length; j++) {
      const cost = la[i - 1] === lb[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost, // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[lb.length] / maxLen
}
