// Pure utility functions — no state, no side effects

export function formatGender(g?: string): string | null {
  if (!g) return null
  const u = g.toUpperCase().trim()
  if (u === 'MALE' || u === 'M' || u === 'Ч' || u === 'ЧОЛОВІЧА') return '♂ Чоловіча'
  if (u === 'FEMALE' || u === 'F' || u === 'Ж' || u === 'ЖІНОЧА') return '♀ Жіноча'
  return g
}

export function normalizeDob(dob: string): string {
  if (!dob) return ''
  const iso = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`
  const dot4 = dob.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/)
  if (dot4) return `${dot4[1].padStart(2,'0')}.${dot4[2].padStart(2,'0')}.${dot4[3]}`
  const dot2 = dob.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2})$/)
  if (dot2) {
    const yy = parseInt(dot2[3], 10)
    const yyyy = yy >= 0 && yy <= 30 ? `20${dot2[3].padStart(2,'0')}` : `19${dot2[3].padStart(2,'0')}`
    return `${dot2[1].padStart(2,'0')}.${dot2[2].padStart(2,'0')}.${yyyy}`
  }
  return dob.trim()
}

export function deduplicateTgResults(results: any[]): any[] {
  const seen = new Set<string>()
  return results.filter(r => {
    const f = r.fields || {}
    const passport = f.passport ? String(f.passport).replace(/\s/g, '').toLowerCase() : ''
    const inn      = f.inn     ? String(f.inn)                                          : ''
    const phone    = f.phone   ? String(f.phone).replace(/\D/g, '')                    : ''
    const snils    = f.snils   ? String(f.snils).replace(/\D/g, '')                    : ''
    const hasId    = passport || inn || phone || snils
    const fp       = hasId
      ? `${r.source}|${passport}|${inn}|${phone}|${snils}`
      : `${r.source}|${(r.snippet || '').slice(0, 60)}`
    if (seen.has(fp)) return false
    seen.add(fp)
    return true
  })
}

export function filterTgByQuery(results: any[], query: string, personDob?: string): any[] {
  const isPatronymic = (w: string) => /(?:вна|вич|ович|евич|овна|евна|ична)$/.test(w)
  const queryWords   = query.toLowerCase().split(/\s+/)
    .filter(w => /^[а-яґєіїё]/i.test(w) && w.length >= 4 && !isPatronymic(w))
  const targetDob    = personDob ? normalizeDob(personDob) : ''

  return results.filter(r => {
    const f = r.fields || {}
    if (targetDob && f.dob) {
      const resultDob = normalizeDob(String(f.dob))
      if (resultDob && resultDob !== targetDob) return false
    }
    if (queryWords.length > 0 && f.name) {
      const nameWords = String(f.name).toLowerCase().split(/\s+/)
        .filter(w => /^[а-яa-z]/i.test(w) && w.length >= 4 && !isPatronymic(w))
      if (nameWords.length > 0) {
        const hasMatch = nameWords.some(nw => queryWords.some(qw => {
          const len = Math.min(nw.length, qw.length, 8)
          return len >= 5 && nw.slice(0, len) === qw.slice(0, len)
        }))
        if (!hasMatch) return false
      }
    }
    return true
  })
}

export function threatColor(level: string): string {
  switch (level?.toLowerCase()) {
    case 'critical': return 'bg-red-900 text-red-300 border-red-700'
    case 'high':     return 'bg-orange-900 text-orange-300 border-orange-700'
    case 'medium':   return 'bg-yellow-900 text-yellow-300 border-yellow-700'
    case 'low':      return 'bg-green-900 text-green-300 border-green-700'
    default:         return 'bg-gray-800 text-gray-400 border-gray-600'
  }
}

export function getYouTubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

export function openWayback(url: string): void {
  window.open(`https://web.archive.org/web/${url}`, '_blank')
}

export function openGoogleCache(url: string): void {
  window.open(`https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`, '_blank')
}
