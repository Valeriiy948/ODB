'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import Sidebar from '../../components/Sidebar'
import ConnectionsGraph from '../../components/ConnectionsGraph'

interface OsintVectorResult {
  vector: string; label: string; query: string; count: number
  results: { title: string; link: string; snippet: string; source: string; relevanceScore?: number }[]
}
interface OsintSearchData {
  total: number; vectorCount: number; searchedAt: string; vectors: OsintVectorResult[]
}

const TABS = [
  { id: 'overview', icon: '📋', label: 'Огляд' },
  { id: 'connections', icon: '🔗', label: 'Зв\'язки' },
  { id: 'incidents', icon: '⚖️', label: 'Злочини' },
  { id: 'media', icon: '🎬', label: 'Медіа' },
  { id: 'documents', icon: '📁', label: 'Документи' },
  { id: 'unit', icon: '🏢', label: 'В/Ч та техніка' },
  { id: 'osint', icon: '🔍', label: 'OSINT' },
  { id: 'notes', icon: '📝', label: 'Нотатки' },
]

function Field({ label, value }: { label: string; value: any }) {
  if (!value) return null
  return (
    <div className="mb-3">
      <p className="text-gray-500 text-xs uppercase tracking-wide">{label}</p>
      <p className="text-white mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap">
        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
      </p>
    </div>
  )
}

function formatGender(g?: string) {
  if (!g) return null
  const u = g.toUpperCase().trim()
  if (u === 'MALE' || u === 'M' || u === 'Ч' || u === 'ЧОЛОВІЧА') return '♂ Чоловіча'
  if (u === 'FEMALE' || u === 'F' || u === 'Ж' || u === 'ЖІНОЧА') return '♀ Жіноча'
  return g
}

function deduplicateTgResults(results: any[]): any[] {
  const seen = new Set<string>()
  return results.filter(r => {
    const f = r.fields || {}
    const passport = f.passport ? String(f.passport).replace(/\s/g, '').toLowerCase() : ''
    const inn = f.inn ? String(f.inn) : ''
    const phone = f.phone ? String(f.phone).replace(/\D/g, '') : ''
    const snils = f.snils ? String(f.snils).replace(/\D/g, '') : ''
    const hasId = passport || inn || phone || snils
    const fp = hasId
      ? `${r.source}|${passport}|${inn}|${phone}|${snils}`
      : `${r.source}|${(r.snippet || '').slice(0, 60)}`
    if (seen.has(fp)) return false
    seen.add(fp)
    return true
  })
}

// Нормалізація ДН → "DD.MM.YYYY"
function normalizeDob(dob: string): string {
  if (!dob) return ''
  const iso = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`
  const dot4 = dob.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/)
  if (dot4) return `${dot4[1].padStart(2,'0')}.${dot4[2].padStart(2,'0')}.${dot4[3]}`
  // 2-значний рік: 16.08.78 → 16.08.1978 (для народжених 1900-2000)
  const dot2 = dob.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2})$/)
  if (dot2) {
    const yy = parseInt(dot2[3], 10)
    const yyyy = yy >= 0 && yy <= 30 ? `20${dot2[3].padStart(2,'0')}` : `19${dot2[3].padStart(2,'0')}`
    return `${dot2[1].padStart(2,'0')}.${dot2[2].padStart(2,'0')}.${yyyy}`
  }
  return dob.trim()
}

// Фільтр: відхиляємо записи де ПІБ або ДН явно вказують на іншу особу
function filterTgByQuery(results: any[], query: string, personDob?: string): any[] {
  const isPatronymic = (w: string) => /(?:вна|вич|ович|евич|овна|евна|ична)$/.test(w)
  const queryWords = query.toLowerCase().split(/\s+/)
    .filter(w => /^[а-яґєіїё]/i.test(w) && w.length >= 4 && !isPatronymic(w))
  const targetDob = personDob ? normalizeDob(personDob) : ''

  return results.filter(r => {
    const f = r.fields || {}

    // ДН-фільтр: якщо є ДН особи І ДН у результаті — повинні збігатись
    if (targetDob && f.dob) {
      const resultDob = normalizeDob(String(f.dob))
      if (resultDob && resultDob !== targetDob) return false
    }

    // Ім'я-фільтр: якщо є ім'я у результаті — хоча б одне слово з ПІБ має збігатись
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

function SaveAllButton({ results, allRaw, onSave }: { results: any[]; allRaw: any[]; onSave: (fields: any, all: any[]) => void }) {
  function handleSaveAll() {
    // Злиття полів — з відфільтрованих (релевантних) результатів
    const merged: Record<string, any> = {}
    const allPhones: string[] = []
    for (const r of results) {
      const f = r.fields || {}
      for (const k of Object.keys(f)) { if (f[k] && !merged[k]) merged[k] = f[k] }
      if (Array.isArray(f.phones_list)) allPhones.push(...f.phones_list)
    }
    if (allPhones.length > 0) merged.phones_list = Array.from(new Set(allPhones))
    // До telegram_raw — передаємо ВЕСЬ масив (включно з неотфільтрованими)
    onSave(merged, allRaw.length > 0 ? allRaw : results)
  }
  const totalRaw = allRaw.length || results.length
  const filtered = results.length
  return (
    <div className="px-4 py-3 border-t border-gray-700 bg-gray-800/50 flex items-center justify-between">
      <span className="text-gray-400 text-sm">
        {filtered} релевантних / {totalRaw} всього записів
      </span>
      <button onClick={handleSaveAll}
        className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-semibold transition">
        💾 Зберегти все до досьє
      </button>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <h3 className="text-gray-300 font-semibold mb-4 pb-2 border-b border-gray-700 text-sm">{title}</h3>
      {children}
    </div>
  )
}

export default function PersonDetailPage() {
  const [person, setPerson] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [photoUrl, setPhotoUrl] = useState('')
  const [editingPhoto, setEditingPhoto] = useState(false)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [photoLightbox, setPhotoLightbox] = useState(false)

  const [osintLoading, setOsintLoading] = useState(false)
  const [osintData, setOsintData] = useState<OsintSearchData | null>(null)
  const [osintError, setOsintError] = useState('')
  const [activeVector, setActiveVector] = useState<string | null>(null)
  const [personMentions, setPersonMentions] = useState<any[]>([])

  // AI профіль та threat score
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  // VK пошук
  const [vkLoading, setVkLoading] = useState(false)
  const [vkProfiles, setVkProfiles] = useState<any[]>([])
  const [vkError, setVkError] = useState('')

  // OpenDataBot / ЄДР
  const [odbLoading, setOdbLoading] = useState(false)
  const [odbResults, setOdbResults] = useState<any[]>([])
  const [odbError, setOdbError] = useState('')

  // Транспортні засоби
  const [vehiclesLoading, setVehiclesLoading] = useState(false)
  const [vehiclesResults, setVehiclesResults] = useState<any[]>([])
  const [vehiclesError, setVehiclesError] = useState('')

  // Search4Faces / фото-пошук
  const [faceLoading, setFaceLoading] = useState(false)
  const [faceResults, setFaceResults] = useState<any[]>([])
  const [faceError, setFaceError] = useState('')

  // Кадастр
  const [kadasterLoading, setKadasterLoading] = useState(false)
  const [kadasterResults, setKadasterResults] = useState<any[]>([])
  const [kadasterError, setKadasterError] = useState('')

  // Некрологи / ЗАГС
  const [obitsLoading, setObitsLoading] = useState(false)
  const [obitsResults, setObitsResults] = useState<any[]>([])
  const [obitsError, setObitsError] = useState('')

  // VPN Search (ipbd.ru / leb.su)
  const [vpnLoading, setVpnLoading] = useState(false)
  const [vpnResults, setVpnResults] = useState<any[]>([])
  const [vpnError, setVpnError] = useState('')

  // Leaks DB
  const [leaksLoading, setLeaksLoading] = useState(false)
  const [leaksResults, setLeaksResults] = useState<any[]>([])
  const [leaksError, setLeaksError] = useState('')

  // Telegram phone lookup
  const [tgPhoneLoading, setTgPhoneLoading] = useState(false)
  const [tgPhoneResults, setTgPhoneResults] = useState<any[]>([])
  const [tgPhoneError, setTgPhoneError] = useState('')

  // Photo collection (VK/OK/Instagram)
  const [photoCollLoading, setPhotoCollLoading] = useState(false)
  const [photoCollMsg, setPhotoCollMsg] = useState('')

  // WhatsApp/Viber presence
  const [presenceLoading, setPresenceLoading] = useState(false)
  const [presenceResults, setPresenceResults] = useState<any[]>([])
  const [presenceError, setPresenceError] = useState('')

  // FindFace / FindClone
  const [findFaceLoading, setFindFaceLoading] = useState(false)
  const [findFaceResults, setFindFaceResults] = useState<any[]>([])
  const [findFaceError, setFindFaceError] = useState('')

  // Telegram пошук
  const [tgLoading, setTgLoading] = useState(false)
  const [tgResults, setTgResults] = useState<any[]>([])
  const [tgRawAll, setTgRawAll] = useState<any[]>([]) // повний масив до фільтрації (для збереження)
  const [tgError, setTgError] = useState('')
  const [tgQuery, setTgQuery] = useState('')
  const [tgEnrichLoading, setTgEnrichLoading] = useState<Set<string>>(new Set())
  // Async full-bots search via orchestrator
  const [tgFullLoading, setTgFullLoading] = useState(false)
  const [tgFullJobId, setTgFullJobId] = useState<string | null>(null)
  const [tgFullError, setTgFullError] = useState('')
  const [tgFullResults, setTgFullResults] = useState<any[]>([])

  const [videos, setVideos] = useState<{ url: string; note: string }[]>([])
  const [videoUrl, setVideoUrl] = useState('')
  const [videoNote, setVideoNote] = useState('')
  const [docs, setDocs] = useState<{ url: string; title: string }[]>([])
  const [docUrl, setDocUrl] = useState('')
  const [docTitle, setDocTitle] = useState('')

  // Інциденти
  const [incidents, setIncidents] = useState<any[]>([])
  const [incidentsLoading, setIncidentsLoading] = useState(false)
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [incidentTitle, setIncidentTitle] = useState('')
  const [incidentDate, setIncidentDate] = useState('')
  const [incidentLocation, setIncidentLocation] = useState('')
  const [incidentType, setIncidentType] = useState('unknown')
  const [incidentDesc, setIncidentDesc] = useState('')
  const [incidentIcc, setIncidentIcc] = useState('')
  const [incidentSeverity, setIncidentSeverity] = useState('medium')
  const [incidentRole, setIncidentRole] = useState('виконавець')
  const [savingIncident, setSavingIncident] = useState(false)

  // Збагачення з Миротворця
  const [enrichOpen, setEnrichOpen] = useState(false)
  const [enrichUrl, setEnrichUrl] = useState('')
  const [enrichLoading, setEnrichLoading] = useState(false)
  const [enrichResult, setEnrichResult] = useState<any>(null)
  const [enrichError, setEnrichError] = useState('')
  const [enrichHtmlMode, setEnrichHtmlMode] = useState(false)
  const [enrichHtml, setEnrichHtml] = useState('')

  const router = useRouter()
  const params = useParams()
  const supabase = createClient()

  const personName = person
    ? (person.name_ukr || person.name_rus || person.name || 'Невідомо')
    : ''

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const res = await fetch(`/api/persons/${params.id}`)
      const data = await res.json()
      setPerson(data)
      if (data.photo_url) setPhotoUrl(data.photo_url)
      setLoading(false)
      loadIncidents()
      // Завантажуємо збережені web-згадки з person_mentions
      try {
        const { data: mentions } = await supabase
          .from('person_mentions')
          .select('*')
          .eq('person_id', params.id)
          .eq('source_type', 'web')
          .order('created_at', { ascending: false })
          .limit(20)
        if (mentions) setPersonMentions(mentions)
      } catch {}

      // ── Авто-OSINT: запускаємо у фоні після завантаження ──
      setTimeout(async () => {
        try {
          setOsintLoading(true)
          const osintRes = await fetch(`/api/osint/search/${params.id}`, { method: 'POST' })
          const osintResult = await osintRes.json()
          if (!osintResult.error) {
            setOsintData(osintResult)
            if (osintResult.vectors?.length > 0) setActiveVector(osintResult.vectors[0].vector)
          }
        } catch {}
        finally { setOsintLoading(false) }

        // ── Авто-детект Миротворця у фоні ──
        try {
          const enrichRes = await fetch(`/api/persons/${params.id}/enrich`)
          const enrichData = await enrichRes.json()
          if (enrichData.found && enrichData.url && !data.myrotvorets_url) {
            setEnrichUrl(enrichData.url)
            setEnrichOpen(true)
          }
        } catch {}
      }, 800)
    }
    init()
  }, [params.id])

  async function loadIncidents() {
    setIncidentsLoading(true)
    try {
      const res = await fetch(`/api/incidents?person_id=${params.id}`)
      const data = await res.json()
      setIncidents(data.data || [])
    } catch {}
    setIncidentsLoading(false)
  }

  async function createIncident() {
    if (!incidentTitle.trim()) return
    setSavingIncident(true)
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: incidentTitle, date: incidentDate || null,
          location: incidentLocation || null, inc_type: incidentType,
          description: incidentDesc || null, icc_article: incidentIcc || null,
          severity: incidentSeverity,
        }),
      })
      if (res.ok) {
        const incident = await res.json()
        await fetch(`/api/incidents/${incident.id}/persons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person_id: params.id, role: incidentRole }),
        })
        setShowIncidentForm(false)
        setIncidentTitle(''); setIncidentDate(''); setIncidentLocation('')
        setIncidentType('unknown'); setIncidentDesc(''); setIncidentIcc('')
        await loadIncidents()
      }
    } finally { setSavingIncident(false) }
  }

  async function runOsint(switchTab = true) {
    setOsintLoading(true); setOsintError(''); setOsintData(null)
    if (switchTab) setActiveTab('osint')
    // Telegram запускаємо паралельно (не чекаємо)
    const tgQ = person?.name_rus || person?.name_ukr || person?.name || ''
    if (tgQ.length >= 3) runTelegramSearch(tgQ)
    try {
      const res = await fetch(`/api/osint/search/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) { setOsintError(data.error) }
      else { setOsintData(data); if (data.vectors?.length > 0) setActiveVector(data.vectors[0].vector) }
    } catch (e: any) { setOsintError(e.message) }
    finally { setOsintLoading(false) }
  }

  async function runAiProfile() {
    setAiLoading(true); setAiError('')
    try {
      const res = await fetch(`/api/osint/ai-profile/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.threat_score) {
        setAiError(data.error)
      } else {
        // Оновлюємо person в стейті
        setPerson((prev: any) => ({
          ...prev,
          ai_profile: data.ai_profile || prev.ai_profile,
          threat_score: data.threat_score ?? prev.threat_score,
        }))
        if (data.error) setAiError(`⚠️ AI недоступний: ${data.error}`)
      }
    } catch (e: any) {
      setAiError(e.message)
    } finally {
      setAiLoading(false)
    }
  }

  async function runVkSearch() {
    setVkLoading(true); setVkError(''); setVkProfiles([])
    try {
      const res = await fetch(`/api/osint/vk/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) setVkError(data.error)
      else {
        setVkProfiles(data.profiles || [])
        if (data.found > 0) {
          // Оновлюємо person
          const refreshed = await fetch(`/api/persons/${params.id}`)
          setPerson(await refreshed.json())
        }
      }
    } catch (e: any) {
      setVkError(e.message)
    } finally {
      setVkLoading(false)
    }
  }

  async function runOdbSearch() {
    setOdbLoading(true); setOdbError(''); setOdbResults([])
    try {
      const res = await fetch(`/api/osint/opendatabot/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) setOdbError(data.error)
      else {
        setOdbResults(data.results || [])
        if (data.found > 0) {
          const refreshed = await fetch(`/api/persons/${params.id}`)
          setPerson(await refreshed.json())
        }
      }
    } catch (e: any) {
      setOdbError(e.message)
    } finally {
      setOdbLoading(false)
    }
  }

  async function runFaceSearch() {
    setFaceLoading(true); setFaceError(''); setFaceResults([])
    try {
      const res = await fetch(`/api/osint/search4faces/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) { setFaceError(data.error) }
      else {
        setFaceResults(data.results || [])
        if ((data.results || []).length > 0) {
          const refreshed = await fetch(`/api/persons/${params.id}`)
          setPerson(await refreshed.json())
        }
      }
    } catch (e: any) {
      setFaceError(e.message)
    } finally {
      setFaceLoading(false)
    }
  }

  async function runVehicleSearch() {
    setVehiclesLoading(true); setVehiclesError(''); setVehiclesResults([])
    try {
      const res = await fetch(`/api/osint/vehicles/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.vehicles) { setVehiclesError(data.error) }
      else {
        const v = data.vehicles || []
        setVehiclesResults(v)
        if (v.length > 0) {
          const refreshed = await fetch(`/api/persons/${params.id}`)
          setPerson(await refreshed.json())
        }
      }
    } catch (e: any) {
      setVehiclesError(e.message)
    } finally {
      setVehiclesLoading(false)
    }
  }

  async function runKadasterSearch() {
    setKadasterLoading(true); setKadasterError(''); setKadasterResults([])
    try {
      const res = await fetch(`/api/osint/kadaster/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) { setKadasterError(data.error) }
      else {
        setKadasterResults(data.results || [])
        if ((data.results || []).length > 0) {
          const refreshed = await fetch(`/api/persons/${params.id}`)
          setPerson(await refreshed.json())
        }
      }
    } catch (e: any) { setKadasterError(e.message) }
    finally { setKadasterLoading(false) }
  }

  async function runObituariesSearch() {
    setObitsLoading(true); setObitsError(''); setObitsResults([])
    try {
      const res = await fetch(`/api/osint/obituaries/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) { setObitsError(data.error) }
      else {
        setObitsResults(data.results || [])
        if (data.status_updated) {
          const refreshed = await fetch(`/api/persons/${params.id}`)
          setPerson(await refreshed.json())
        }
      }
    } catch (e: any) { setObitsError(e.message) }
    finally { setObitsLoading(false) }
  }

  async function runVpnSearch() {
    setVpnLoading(true); setVpnError(''); setVpnResults([])
    try {
      const res = await fetch(`/api/osint/vpn-search/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (!data.success && !data.results) {
        setVpnError(data.error || data.message || 'Помилка VPN пошуку')
      } else {
        setVpnResults(data.results || [])
      }
    } catch (e: any) { setVpnError(e.message) }
    finally { setVpnLoading(false) }
  }

  async function runLeaksSearch() {
    setLeaksLoading(true); setLeaksError(''); setLeaksResults([])
    try {
      const query: Record<string, any> = {}
      if (person.phones?.length)    query.phone    = person.phones[0]
      if (person.email)             query.email    = person.email
      if (person.ipn)               query.inn      = person.ipn
      if (person.snils)             query.snils    = person.snils
      if (person.passport)          query.passport = person.passport
      if (person.name_rus || person.name_ukr || person.name)
        query.name = person.name_rus || person.name_ukr || person.name

      const res = await fetch('/api/leaks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      })
      const data = await res.json()
      if (data.error) setLeaksError(data.error)
      else setLeaksResults(data.results || [])
    } catch (e: any) { setLeaksError(e.message) }
    finally { setLeaksLoading(false) }
  }

  async function runTgPhoneLookup() {
    setTgPhoneLoading(true); setTgPhoneError(''); setTgPhoneResults([])
    try {
      const res = await fetch(`/api/osint/telegram-phone/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) { setTgPhoneError(data.error) }
      else {
        setTgPhoneResults(data.results || [])
        if ((data.results || []).length > 0) {
          const refreshed = await fetch(`/api/persons/${params.id}`)
          setPerson(await refreshed.json())
        }
      }
    } catch (e: any) { setTgPhoneError(e.message) }
    finally { setTgPhoneLoading(false) }
  }

  async function runPhotoCollection() {
    setPhotoCollLoading(true); setPhotoCollMsg('')
    try {
      const res = await fetch(`/api/osint/photos/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) { setPhotoCollMsg(`❌ ${data.error}`) }
      else {
        setPhotoCollMsg(`✅ Зібрано ${data.saved || 0} фото (VK: ${data.sources?.vk || 0}, OK: ${data.sources?.ok || 0}, IG: ${data.sources?.instagram || 0})`)
        if ((data.saved || 0) > 0) {
          const refreshed = await fetch(`/api/persons/${params.id}`)
          setPerson(await refreshed.json())
        }
      }
    } catch (e: any) { setPhotoCollMsg(`❌ ${e.message}`) }
    finally { setPhotoCollLoading(false) }
  }

  async function runPresenceCheck() {
    setPresenceLoading(true); setPresenceError(''); setPresenceResults([])
    try {
      const res = await fetch(`/api/osint/phone-presence/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) { setPresenceError(data.error) }
      else setPresenceResults(data.results || [])
    } catch (e: any) { setPresenceError(e.message) }
    finally { setPresenceLoading(false) }
  }

  async function runFindFaceSearch() {
    setFindFaceLoading(true); setFindFaceError(''); setFindFaceResults([])
    try {
      const res = await fetch(`/api/osint/findface/${params.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) { setFindFaceError(data.error) }
      else {
        setFindFaceResults(data.results || [])
        if ((data.results || []).length > 0) {
          const refreshed = await fetch(`/api/persons/${params.id}`)
          setPerson(await refreshed.json())
        }
      }
    } catch (e: any) { setFindFaceError(e.message) }
    finally { setFindFaceLoading(false) }
  }

  async function runTelegramSearch(customQuery?: string) {
    if (!person) return
    const q = customQuery || person.name_rus || person.name_ukr || person.name || ''
    if (!q || q.length < 3) return
    const dob = person.dob || ''
    setTgLoading(true); setTgError(''); setTgResults([]); setTgQuery(dob ? `${q} ${dob}` : q)
    try {
      const url = `/api/telegram/quick?q=${encodeURIComponent(q)}${dob ? `&dob=${encodeURIComponent(dob)}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) {
        setTgError(data.error)
      } else {
        const raw = deduplicateTgResults(data.results || [])
        setTgRawAll(raw) // зберігаємо всі результати без фільтрації
        setTgResults(filterTgByQuery(raw, q, person?.dob))
      }
    } catch (e: any) {
      setTgError('Telegram сервіс недоступний')
    } finally {
      setTgLoading(false)
    }
  }

  // Full multi-bot search via orchestrator async job (~40s, no Vercel timeout)
  async function runTelegramFull(customQuery?: string) {
    if (!person) return
    const q = customQuery || person.name_rus || person.name_ukr || person.name || ''
    if (!q || q.length < 3) return
    const dob = person.dob || ''
    const query = dob ? `${q} ${dob}` : q
    setTgFullLoading(true); setTgFullError(''); setTgFullResults([]); setTgFullJobId(null)
    try {
      // Start async job on orchestrator
      const startRes = await fetch('/api/vps/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type: 'name', sources: ['telegram', 'telethon'] }),
      })
      const startData = await startRes.json()
      if (!startData.job_id) {
        setTgFullError(startData.error || 'Не вдалось запустити пошук')
        setTgFullLoading(false)
        return
      }
      setTgFullJobId(startData.job_id)
      // Poll until done
      const poll = async () => {
        const r = await fetch(`/api/vps/jobs?id=${startData.job_id}`)
        const d = await r.json()
        if (d.status === 'done') {
          // Flatten results from all sources into array
          const flat: any[] = []
          for (const [src, payload] of Object.entries(d.results || {})) {
            const p = payload as any
            const items = p?.results || p?.leaks || []
            if (Array.isArray(items)) {
              flat.push(...items.map((x: any) => ({ ...x, _src: src })))
            }
          }
          setTgFullResults(deduplicateTgResults(flat))
          setTgFullLoading(false)
        } else if (d.status === 'error') {
          setTgFullError(d.error || 'Помилка пошуку')
          setTgFullLoading(false)
        } else {
          // still running — poll again in 4s
          setTimeout(poll, 4000)
        }
      }
      setTimeout(poll, 5000) // first check after 5s (bots need time)
    } catch (e: any) {
      setTgFullError(e.message || 'Помилка')
      setTgFullLoading(false)
    }
  }

  async function runTelegramEnrich(q: string) {
    if (tgEnrichLoading.has(q)) return
    setTgEnrichLoading(prev => new Set(prev).add(q))
    try {
      const res = await fetch(`/api/telegram/enrich?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (data.results?.length > 0) {
        setTgResults(prev => deduplicateTgResults([...prev, ...data.results.map((r: any) => ({ ...r, from_enrich: true }))]))
      }
    } catch {}
    setTgEnrichLoading(prev => { const s = new Set(prev); s.delete(q); return s })
  }

  async function saveTelegramDataToPerson(fields: Record<string, any>, allResults?: any[]) {
    const patch: Record<string, any> = {}
    // Зберігаємо весь масив Telegram результатів у telegram_raw
    if (allResults && allResults.length > 0) {
      const existingRaw: any[] = person.telegram_raw || []
      const newEntry = {
        searched_at: new Date().toISOString(),
        query: tgQuery,
        bot: '@PeopleFindBaseBot',
        leaks: allResults.map((r: any) => ({
          source_label: r.source_label,
          page: r.page || 1,
          total_pages: r.total_pages || allResults.length,
          snippet: r.snippet,
          fields: r.fields || {},
          url: r.url || null,
          date: r.date || null,
        }))
      }
      patch.telegram_raw = [...existingRaw, newEntry]
    }
    if (fields.phone || fields.phones_list?.length) {
      const newPhones = fields.phones_list || (fields.phone ? [fields.phone] : [])
      const existing = person.phones || []
      patch.phones = [...new Set([...existing, ...newPhones])]
    }
    if (fields.passport) {
      const passStr = String(fields.passport).trim()
      let passVal = (fields.series && /^\d{4}$/.test(String(fields.series)))
        ? `${fields.series} ${passStr}`
        : passStr
      if (fields.passport_issuer) passVal += ` / ${fields.passport_issuer}`
      patch.passport = passVal
    } else if (fields.passport_issuer && person.passport && !person.passport.includes(String(fields.passport_issuer).slice(0, 10))) {
      patch.passport = `${person.passport} / ${fields.passport_issuer}`
    }
    if (fields.snils) patch.snils = fields.snils
    if (fields.inn) patch.ipn = fields.inn
    if (fields.address) patch.addr_reg = fields.address
    if (fields.gender) {
      const g = String(fields.gender).trim().toUpperCase()
      if (['M', 'М', 'МУЖ', 'МУЖСКОЙ', 'ЧОЛОВІЧА', 'MALE'].includes(g)) patch.gender = 'male'
      else if (['F', 'Ж', 'ЖЕН', 'ЖЕНСКИЙ', 'ЖІНОЧА', 'FEMALE'].includes(g)) patch.gender = 'female'
    }
    // Резервне визначення статі з по батькові (виправляє попередньо неправильно збережені)
    if (!patch.gender) {
      const fullName = (person.name_rus || person.name_ukr || person.name || '').trim()
      const words = fullName.split(/\s+/)
      const patronymic = words.find((w: string) => /(?:вич|евич|ович|ьич)$/i.test(w))
        || words.find((w: string) => /(?:вна|евна|овна|ьна)$/i.test(w))
      if (patronymic) {
        patch.gender = /(?:вич|евич|ович|ьич)$/i.test(patronymic) ? 'male' : 'female'
      }
    }
    // Email: зберігаємо перший знайдений (або з emails_list)
    const foundEmail = fields.email
      || (Array.isArray(fields.emails_list) ? fields.emails_list[0] : null)
    if (foundEmail && !person.email) patch.email = foundEmail

    // Адреси: зберігаємо якщо порожні
    if (fields.address && !person.addr_reg) patch.addr_reg = fields.address

    // Автономери: зберігаємо у notes/description якщо є
    if (Array.isArray(fields.car_plates_list) && fields.car_plates_list.length > 0) {
      const platesStr = `Авто: ${fields.car_plates_list.join(', ')}`
      // Зберігаємо у osint_connections як додаткову інфу якщо не дублюється
      const existingConn = person.osint_connections || ''
      if (!existingConn.includes(fields.car_plates_list[0])) {
        patch.osint_connections = existingConn ? `${existingConn}\n${platesStr}` : platesStr
      }
    }

    if (fields.rank && !person.rank) patch.rank = fields.rank
    if (fields.unit && !person.unit) patch.unit = fields.unit
    if (fields.personal_num) patch.military_id = fields.personal_num
    if (fields.vk) patch.vk_url = fields.vk
    if (fields.ok) patch.ok_url = fields.ok
    if (fields.instagram) patch.instagram_url = fields.instagram
    if (fields.facebook) patch.fb_url = fields.facebook
    // Ім'я — зберігаємо тільки рівно 3 слова, всі кириличні (ПІБ без сміття)
    if (fields.name) {
      const fullName = String(fields.name).trim()
      const words = fullName.split(/\s+/).filter(Boolean)
      const isCyrillic3 = words.length === 3 && words.every(w => /^[А-ЯҐЄІЇа-яґєіїёЁ\-]{2,}$/u.test(w))
      if (isCyrillic3) {
        const toTitle = (s: string) => s.replace(/\b([А-ЯҐЄІЇа-яґєіїA-Za-z])(\S*)/gu,
          (_m: string, f0: string, r0: string) => f0.toUpperCase() + r0.toLowerCase())
        const titled = toTitle(fullName)
        if (/[іїєґІЇЄҐ]/.test(fullName)) {
          if (!person.name_ukr) patch.name_ukr = titled
        } else {
          if (!person.name_rus) patch.name_rus = titled
        }
      }
    }
    // DOB — зберігаємо якщо порожньо
    if (fields.dob && !person.dob) patch.dob = String(fields.dob).trim()
    // Регіон
    if (fields.region && !person.region) patch.region = String(fields.region).trim()
    // Табельний номер → military_id
    if (fields.tab_num && !person.military_id) patch.military_id = String(fields.tab_num)
    // ВП / водійське посвідчення → description
    const dlParts: string[] = []
    if (fields.dl_categories) dlParts.push(`Права (категорії): ${fields.dl_categories}`)
    if (fields.dl_issue_date) dlParts.push(`Права видано: ${fields.dl_issue_date}`)
    if (fields.dl_expiry) dlParts.push(`Права дійсні до: ${fields.dl_expiry}`)
    if (!fields.passport && fields.passport_issuer && !patch.passport) {
      dlParts.push(`Паспорт видано: ${fields.passport_issuer}`)
    }
    // Авто / VIN / карта / родичі → description
    if (fields.car_info) dlParts.push(`Авто: ${fields.car_info}${fields.vin ? ` / VIN: ${fields.vin}` : ''}`)
    if (fields.credit_card) dlParts.push(`Карта (маск.): ${fields.credit_card}`)
    if (fields.relatives) {
      const relStr = `Родичі: ${fields.relatives}`
      if (!((person.description || '').includes('Родичі:'))) dlParts.push(relStr)
    }
    if (dlParts.length > 0) {
      const existing = (person.description || '').trim()
      const newBlock = dlParts.join('\n')
      if (!existing.includes(dlParts[0])) {
        patch.description = existing ? `${existing}\n${newBlock}` : newBlock
      }
    }
    if (Object.keys(patch).length === 0) { alert('Немає нових даних для збереження'); return }
    await fetch(`/api/persons/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const refreshed = await fetch(`/api/persons/${params.id}`)
    setPerson(await refreshed.json())
    alert(`✅ Збережено ${Object.keys(patch).length} полів до картки`)
  }

  async function savePhoto() {
    setSavingPhoto(true)
    try {
      await fetch(`/api/persons/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: photoUrl }),
      })
      setPerson((p: any) => ({ ...p, photo_url: photoUrl }))
      setEditingPhoto(false)
    } finally { setSavingPhoto(false) }
  }

  const [showPhotoSearch, setShowPhotoSearch] = useState(false)

  function searchPhoto() {
    setShowPhotoSearch(true)
  }

  const photoSearchEngines = person ? [
    {
      label: 'Yandex (обличчя)',
      desc: 'Найкращий для РФ/СНД осіб',
      color: 'text-red-400',
      border: 'border-red-800',
      bg: 'bg-red-950/20',
      url: person.photo_url
        ? `https://yandex.ru/images/search?rpt=imageview&url=${encodeURIComponent(person.photo_url)}`
        : `https://yandex.ru/images/search?text=${encodeURIComponent(personName)}`,
    },
    {
      label: 'Google Images',
      desc: 'Глобальний зворотній пошук',
      color: 'text-blue-400',
      border: 'border-blue-800',
      bg: 'bg-blue-950/20',
      url: person.photo_url
        ? `https://images.google.com/searchbyimage?image_url=${encodeURIComponent(person.photo_url)}`
        : `https://www.google.com/search?q=${encodeURIComponent('"' + personName + '"')}&tbm=isch`,
    },
    {
      label: 'Search4Faces',
      desc: 'VK / OK.ru — 160M+ фото',
      color: 'text-green-400',
      border: 'border-green-800',
      bg: 'bg-green-950/20',
      url: `https://search4faces.com/`,
    },
    {
      label: 'TinEye',
      desc: 'Знайти де ще є це фото',
      color: 'text-purple-400',
      border: 'border-purple-800',
      bg: 'bg-purple-950/20',
      url: person.photo_url
        ? `https://www.tineye.com/search/?url=${encodeURIComponent(person.photo_url)}`
        : `https://www.tineye.com/`,
    },
    {
      label: 'PimEyes',
      desc: 'Глибокий пошук по обличчю',
      color: 'text-yellow-400',
      border: 'border-yellow-800',
      bg: 'bg-yellow-950/20',
      url: `https://pimeyes.com/`,
    },
    {
      label: 'FaceCheck.ID',
      desc: 'Широкий веб-пошук',
      color: 'text-orange-400',
      border: 'border-orange-800',
      bg: 'bg-orange-950/20',
      url: `https://facecheck.id/`,
    },
  ] : []

  function openWayback(url: string) { window.open(`https://web.archive.org/web/${url}`, '_blank') }
  function openGoogleCache(url: string) { window.open(`https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`, '_blank') }

  async function importFromMyrotvorets(force = false) {
    if (!enrichUrl.trim()) return
    setEnrichLoading(true)
    setEnrichError('')
    setEnrichResult(null)
    try {
      const res = await fetch(`/api/persons/${params.id}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        url: enrichUrl.trim(),
        force,
        ...(enrichHtmlMode && enrichHtml.trim().length > 500 ? { html: enrichHtml.trim() } : {}),
      }),
      })
      const data = await res.json()
      if (res.status === 409) {
        if (confirm('Дані вже імпортовано. Перезаписати?')) {
          await importFromMyrotvorets(true)
          return
        }
      }
      if (res.status === 503) {
        setEnrichError('Сервіс тимчасово недоступний. Спробуйте пізніше.')
        return
      }
      if (!res.ok) {
        setEnrichError(data.error || data.message || 'Помилка імпорту')
        return
      }
      setEnrichResult(data)
      // Оновлюємо картку особи з новими даними
      const refreshed = await fetch(`/api/persons/${params.id}`)
      const updatedPerson = await refreshed.json()
      setPerson(updatedPerson)
      if (updatedPerson.photo_url) setPhotoUrl(updatedPerson.photo_url)
    } catch (e: any) {
      setEnrichError(e.message)
    } finally {
      setEnrichLoading(false)
    }
  }

  // Автошук URL Миротворця — через Serper.dev (GET /api/persons/[id]/enrich)
  async function autoDetectMyrotvoretsUrl() {
    // Якщо вже є збережений URL
    if (person.myrotvorets_url) {
      setEnrichUrl(person.myrotvorets_url)
      setEnrichOpen(true)
      return
    }
    // Якщо OSINT вже запускався — шукаємо в результатах
    if (osintData) {
      for (const v of osintData.vectors) {
        for (const r of v.results) {
          if (r.link?.includes('myrotvorets.center/criminal/')) {
            setEnrichUrl(r.link)
            setEnrichOpen(true)
            return
          }
        }
      }
    }
    // Автошук через Serper.dev
    setEnrichOpen(true)
    setEnrichLoading(true)
    setEnrichError('')
    setEnrichUrl('')
    try {
      const res = await fetch(`/api/persons/${params.id}/enrich`)
      const data = await res.json()
      if (data.found && data.url) {
        setEnrichUrl(data.url)
      } else {
        setEnrichError(data.message || 'Не знайдено у Миротворці — вставте URL вручну')
      }
    } catch {
      setEnrichError('Помилка пошуку — вставте URL вручну')
    } finally {
      setEnrichLoading(false)
    }
  }

  function threatColor(level: string) {
    if (level === 'high') return 'bg-red-900 text-red-300 border-red-700'
    if (level === 'medium') return 'bg-yellow-900 text-yellow-300 border-yellow-700'
    return 'bg-gray-800 text-gray-400 border-gray-600'
  }

  function getYouTubeEmbed(url: string) {
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
    return m ? `https://www.youtube.com/embed/${m[1]}` : null
  }

  const activeVectorData = osintData?.vectors.find(v => v.vector === activeVector)
  const osintPdfs = osintData?.vectors.flatMap(v =>
    v.results.filter(r => r.link.toLowerCase().endsWith('.pdf') || r.title.toLowerCase().includes('[pdf]'))
  ) ?? []
  const osintRelatives = osintData?.vectors.filter(v => v.vector === 'relatives' || v.vector === 'relatives_vk') ?? []

  // Знаходимо посилання на Миротворець в OSINT результатах
  const myrotvoretsOsintUrl = osintData?.vectors
    .flatMap(v => v.results)
    .find(r => r.link?.includes('myrotvorets.center/criminal/'))?.link ?? null

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center"><p className="text-white">Завантаження...</p></div>
    </div>
  )
  if (!person || person.error) return (
    <div className="min-h-screen bg-gray-900 flex">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center"><p className="text-red-400">Особу не знайдено</p></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-sm">← Назад</button>
            <div>
              <h1 className="text-base font-bold">{personName}</h1>
              <p className="text-gray-600 text-xs">ID: {params.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Threat Score — числовий показник небезпеки */}
            {person.threat_score !== undefined && person.threat_score !== null && (
              <div className="flex items-center gap-1.5" title={`Threat Score: ${person.threat_score}/100`}>
                <div className="h-1.5 w-20 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      person.threat_score >= 70 ? 'bg-red-500' :
                      person.threat_score >= 40 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${person.threat_score}%` }}
                  />
                </div>
                <span className={`text-xs font-mono font-bold ${
                  person.threat_score >= 70 ? 'text-red-400' :
                  person.threat_score >= 40 ? 'text-yellow-400' : 'text-green-400'
                }`}>{person.threat_score}</span>
              </div>
            )}
            {person.threat_level && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs border ${threatColor(person.threat_level)}`}>
                Загроза: {person.threat_level}
              </span>
            )}
            {person.status && (
              <span className="px-2.5 py-0.5 rounded-full text-xs bg-blue-900 text-blue-300 border border-blue-700">
                {person.status}
              </span>
            )}
            <a
              href={`/api/persons/${params.id}/report`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition flex items-center gap-1.5 text-gray-300">
              🖨️ Досьє
            </a>
            <button onClick={() => runOsint()} disabled={osintLoading}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-60 rounded-lg text-sm font-medium transition flex items-center gap-2">
              {osintLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : <>🔍 OSINT</>}
            </button>
          </div>
        </header>

        {/* Name banner з фото */}
        <div className="bg-gray-800/40 border-b border-gray-700 px-6 py-3 flex items-center gap-4">
          {/* Фото */}
          <div className="relative shrink-0">
            {person.photo_url ? (
              <img
                src={person.photo_url}
                alt={personName}
                onClick={() => setPhotoLightbox(true)}
                className="w-16 h-16 rounded-xl object-cover border-2 border-gray-600 cursor-zoom-in hover:border-blue-500 transition"
                title="Натисніть для збільшення"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gray-700 border-2 border-gray-600 flex items-center justify-center text-2xl">
                👤
              </div>
            )}
            <button onClick={() => setEditingPhoto(true)}
              className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 hover:bg-blue-500 rounded-full text-xs flex items-center justify-center transition"
              title="Змінити фото">
              ✏️
            </button>
          </div>

          {/* Lightbox */}
          {photoLightbox && person.photo_url && (
            <div
              className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
              onClick={() => setPhotoLightbox(false)}>
              <div className="relative max-w-2xl max-h-full" onClick={e => e.stopPropagation()}>
                <img
                  src={person.photo_url}
                  alt={personName}
                  className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
                />
                <div className="mt-3 text-center text-gray-300 text-sm font-medium">{personName}</div>
                <button
                  onClick={() => setPhotoLightbox(false)}
                  className="absolute -top-3 -right-3 w-8 h-8 bg-gray-700 hover:bg-red-700 rounded-full text-white text-sm flex items-center justify-center transition">
                  ✕
                </button>
                <a
                  href={person.photo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute -top-3 -left-3 w-8 h-8 bg-gray-700 hover:bg-blue-700 rounded-full text-white text-xs flex items-center justify-center transition"
                  title="Відкрити оригінал">
                  ↗
                </a>
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-xl font-bold text-blue-400 truncate">{personName}</span>
              {person.name_rus && person.name_ukr && (
                <span className="text-gray-400 text-sm">{person.name_rus}</span>
              )}
              {person.name_eng && <span className="text-gray-500 text-xs">{person.name_eng}</span>}
            </div>
            {person.rank && (
              <p className="text-gray-400 text-sm mt-0.5">{person.rank}{person.unit ? ` • ${person.unit}` : ''}</p>
            )}
          </div>

          {/* Кнопки швидкого пошуку та імпорту */}
          <div className="flex gap-2 shrink-0 flex-wrap">
            <button onClick={searchPhoto}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition">
              🖼️ Пошук фото
            </button>
            <button
              onClick={autoDetectMyrotvoretsUrl}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                person.myrotvorets_url
                  ? 'bg-green-900 hover:bg-green-800 text-green-300 border border-green-700'
                  : 'bg-yellow-700 hover:bg-yellow-600 text-white'
              }`}
              title={person.myrotvorets_url ? `Вже імпортовано: ${person.myrotvorets_url}` : 'Імпорт даних з бази Миротворець'}>
              {person.myrotvorets_url ? '✅ Миротворець' : '📥 Миротворець'}
            </button>
            {person.myrotvorets_url && (
              <a href={person.myrotvorets_url} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition">
                🔗 Профіль
              </a>
            )}
            <button
              onClick={async () => {
                if (!confirm(`Видалити "${person.name_rus || person.name_ukr || person.name}"? Це незворотньо.`)) return
                await fetch(`/api/persons/${params.id}`, { method: 'DELETE' })
                router.push('/persons')
              }}
              className="px-3 py-1.5 bg-red-900/60 hover:bg-red-800 text-red-300 border border-red-800 rounded-lg text-xs transition ml-2">
              🗑 Видалити
            </button>
          </div>
        </div>

        {/* Панель імпорту з Миротворця */}
        {enrichOpen && (
          <div className="bg-yellow-950 border-b border-yellow-800 px-6 py-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-yellow-400 font-semibold text-sm">📥 Автоімпорт з Миротворця</span>
              <button onClick={() => { setEnrichOpen(false); setEnrichResult(null); setEnrichError('') }}
                className="ml-auto text-gray-500 hover:text-white text-sm">✕</button>
            </div>
            <div className="flex gap-3 items-center">
              <input
                type="text"
                value={enrichUrl}
                onChange={e => setEnrichUrl(e.target.value)}
                placeholder={enrichLoading ? '🔍 Шукаю у Миротворці...' : "https://myrotvorets.center/criminal/прізвище-ім'я/"}
                disabled={enrichLoading}
                className="flex-1 px-3 py-2 bg-gray-800 border border-yellow-700 rounded-lg text-white text-sm focus:border-yellow-500 focus:outline-none font-mono disabled:opacity-50"
              />
              <button
                onClick={() => importFromMyrotvorets(false)}
                disabled={enrichLoading || !enrichUrl.trim()}
                className="px-5 py-2 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 rounded-lg text-sm font-medium transition flex items-center gap-2 whitespace-nowrap">
                {enrichLoading
                  ? <><span className="animate-spin inline-block">⟳</span> Імпорт...</>
                  : '📥 Імпортувати'}
              </button>
            </div>
            <p className="text-yellow-700 text-xs mt-2">
              🔍 Пошук через Google — автоматично: ім'я в 3 мовах, дата народження, адреса, фото, опис
            </p>

            {/* Помилка */}
            {enrichError && (
              <div className="mt-3 bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm">
                ❌ {enrichError}
              </div>
            )}

            {/* Результат */}
            {enrichResult && (
              <div className="mt-3 bg-green-950 border border-green-800 rounded-lg px-4 py-3">
                <p className="text-green-400 font-semibold text-sm mb-2">
                  ✅ Імпортовано {enrichResult.imported} полів
                  {enrichResult.photo_saved && ' • фото збережено'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {enrichResult.data?.name_ukr && (
                    <div className="bg-green-900/40 rounded px-2 py-1">
                      <span className="text-green-600">ПІБ (укр)</span><br/>
                      <span className="text-white">{enrichResult.data.name_ukr}</span>
                    </div>
                  )}
                  {enrichResult.data?.name_rus && (
                    <div className="bg-green-900/40 rounded px-2 py-1">
                      <span className="text-green-600">ПІБ (рос)</span><br/>
                      <span className="text-white">{enrichResult.data.name_rus}</span>
                    </div>
                  )}
                  {enrichResult.data?.dob && (
                    <div className="bg-green-900/40 rounded px-2 py-1">
                      <span className="text-green-600">ДН</span><br/>
                      <span className="text-white">{enrichResult.data.dob}</span>
                    </div>
                  )}
                  {enrichResult.data?.rank && (
                    <div className="bg-green-900/40 rounded px-2 py-1">
                      <span className="text-green-600">Звання</span><br/>
                      <span className="text-white">{enrichResult.data.rank}</span>
                    </div>
                  )}
                  {enrichResult.data?.passport && (
                    <div className="bg-green-900/40 rounded px-2 py-1">
                      <span className="text-green-600">Паспорт</span><br/>
                      <span className="text-white font-mono">{enrichResult.data.passport}</span>
                    </div>
                  )}
                  {enrichResult.data?.vk_url && (
                    <div className="bg-green-900/40 rounded px-2 py-1">
                      <span className="text-green-600">VK</span><br/>
                      <a href={enrichResult.data.vk_url} target="_blank" rel="noopener noreferrer"
                        className="text-blue-400 truncate block hover:underline">{enrichResult.data.vk_url}</a>
                    </div>
                  )}
                  {enrichResult.data?.ok_url && (
                    <div className="bg-green-900/40 rounded px-2 py-1">
                      <span className="text-green-600">OK.ru</span><br/>
                      <a href={enrichResult.data.ok_url} target="_blank" rel="noopener noreferrer"
                        className="text-blue-400 truncate block hover:underline">{enrichResult.data.ok_url}</a>
                    </div>
                  )}
                  {enrichResult.data?.tags?.length > 0 && (
                    <div className="bg-green-900/40 rounded px-2 py-1 col-span-2">
                      <span className="text-green-600">Теги</span><br/>
                      <span className="text-gray-300">{enrichResult.data.tags.join(' ')}</span>
                    </div>
                  )}
                </div>
                {enrichResult.data?.photo_url && (
                  <div className="mt-2 flex items-center gap-3">
                    <img src={enrichResult.data.photo_url} alt="Фото" className="w-12 h-12 rounded object-cover border border-green-700" />
                    <span className="text-green-600 text-xs">Фото збережено у базі</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Панель пошуку фото */}
        {showPhotoSearch && (
          <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-200 font-semibold text-sm">🖼️ Пошук за фото / обличчям</span>
              <button onClick={() => setShowPhotoSearch(false)} className="text-gray-500 hover:text-white text-sm">✕</button>
            </div>
            {!person.photo_url && (
              <p className="text-yellow-600 text-xs mb-3">⚠️ Фото не додано — пошук за іменем. Для зворотного пошуку за обличчям спочатку додайте фото.</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {photoSearchEngines.map(eng => (
                <a key={eng.label} href={eng.url} target="_blank" rel="noopener noreferrer"
                  className={`p-3 rounded-lg border ${eng.border} ${eng.bg} hover:opacity-90 transition`}>
                  <p className={`font-semibold text-sm ${eng.color}`}>{eng.label}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{eng.desc}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Форма редагування фото */}
        {editingPhoto && (
          <div className="bg-blue-950 border-b border-blue-800 px-6 py-3 flex gap-3 items-center">
            <input type="text" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)}
              placeholder="URL фото (https://...)"
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none" />
            <button onClick={savePhoto} disabled={savingPhoto}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-60 rounded-lg text-sm transition">
              {savingPhoto ? 'Збереження...' : '💾 Зберегти'}
            </button>
            <button onClick={() => { setEditingPhoto(false); setPhotoUrl(person.photo_url || '') }}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition">Скасувати</button>
          </div>
        )}

        {/* Вкладки */}
        <div className="flex border-b border-gray-700 bg-gray-800/20 px-6 shrink-0 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap -mb-px ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-500'
              }`}>
              <span>{tab.icon}</span><span>{tab.label}</span>
              {tab.id === 'osint' && osintData && (
                <span className="ml-1 bg-purple-800 text-purple-200 text-xs px-1.5 py-0.5 rounded-full">{osintData.total}</span>
              )}
              {tab.id === 'documents' && osintPdfs.length > 0 && (
                <span className="ml-1 bg-yellow-800 text-yellow-200 text-xs px-1.5 py-0.5 rounded-full">{osintPdfs.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Контент вкладок */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ═══ ОГЛЯД — ПОВНЕ ДОСЬЄ ═══ */}
          {activeTab === 'overview' && (() => {
            // Витягуємо всі поля з Telegram витоків
            const allLeaks = (person.telegram_raw || []).flatMap((e: any) => e.leaks || [])
            const tgFieldMap: Record<string, string> = {}
            const tgPhones: string[] = []
            const tgCarPlates: string[] = []
            const tgEmails: string[] = []
            for (const l of allLeaks) {
              const f = l.fields || {}
              for (const [k, v] of Object.entries(f)) {
                if (v && typeof v === 'string' && !tgFieldMap[k]) tgFieldMap[k] = v as string
              }
              if (Array.isArray(f.phones_list)) tgPhones.push(...f.phones_list)
              if (Array.isArray(f.car_plates_list)) tgCarPlates.push(...f.car_plates_list)
              if (Array.isArray(f.emails_list)) tgEmails.push(...f.emails_list)
            }
            const allPhones = Array.from(new Set([...(person.phones || []), ...tgPhones]))
            const allCarPlates = Array.from(new Set(tgCarPlates))
            const allEmails = Array.from(new Set([...(person.email ? [person.email] : []), ...tgEmails]))
            const tgLastSearch = person.telegram_raw?.length
              ? new Date(person.telegram_raw[person.telegram_raw.length - 1].searched_at).toLocaleString('uk-UA')
              : null

            // Топ OSINT згадки (з бази person_mentions)
            const topMentions = personMentions.slice(0, 8)
            const myrotvoretsSnippet = personMentions.find(m => m.source_name?.includes('myrotvorets'))

            return (
              <div className="space-y-4">

                {/* ── Тривожний банер: Миротворець ── */}
                {person.myrotvorets_url && (
                  <div className="bg-red-950/80 border border-red-700 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-red-400 font-bold text-sm">🚨 ВНЕСЕНИЙ ДО БАЗИ МИРОТВОРЕЦЬ</span>
                      </div>
                      {myrotvoretsSnippet?.snippet && (
                        <p className="text-red-300/80 text-xs leading-relaxed line-clamp-2">{myrotvoretsSnippet.snippet}</p>
                      )}
                    </div>
                    <a href={person.myrotvorets_url} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition">
                      Відкрити профіль →
                    </a>
                  </div>
                )}

                {/* ── Рядок 1: Особисті | Військові | Документи ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card title="👤 Особисті дані">
                    <Field label="Дата народження" value={person.dob} />
                    <Field label="Стать" value={formatGender(person.gender)} />
                    <Field label="Місце народження" value={person.birth_place} />
                    <Field label="Громадянство" value={person.nationality} />
                    <Field label="Регіон" value={person.region || tgFieldMap.region} />
                    {person.description && (
                      <div className="mt-2 pt-2 border-t border-gray-700">
                        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Опис</p>
                        <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{person.description}</p>
                      </div>
                    )}
                  </Card>

                  <Card title="🎖️ Військова служба">
                    <Field label="Звання" value={person.rank || tgFieldMap.rank} />
                    <Field label="Посада" value={person.position} />
                    <Field label="Підрозділ" value={person.unit || tgFieldMap.unit} />
                    <Field label="Номер в/ч" value={person.unit_num} />
                    <Field label="Особистий №" value={person.military_id || tgFieldMap.personal_num} />
                    <Field label="Табельний №" value={tgFieldMap.tab_num} />
                    <Field label="Роботодавець" value={tgFieldMap.employer} />
                  </Card>

                  <Card title="📄 Документи та ID">
                    <Field label="ІПН" value={person.ipn || tgFieldMap.inn} />
                    <Field label="СНІЛС" value={person.snils || tgFieldMap.snils} />
                    <Field label="Паспорт" value={person.passport} />
                    {(allCarPlates.length > 0 || tgFieldMap.vin || tgFieldMap.car_info || tgFieldMap.car_plate) && (
                      <div className="mb-3 mt-2 pt-2 border-t border-gray-700">
                        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">🚗 Транспорт</p>
                        {allCarPlates.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {allCarPlates.map((p: string, i: number) => (
                              <span key={i} className="text-yellow-300 text-sm font-mono bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-800/50">{p}</span>
                            ))}
                          </div>
                        )}
                        <Field label="VIN" value={tgFieldMap.vin} />
                        <Field label="Автомобіль" value={tgFieldMap.car_info} />
                      </div>
                    )}
                    {(tgFieldMap.credit_card || tgFieldMap.card) && (
                      <div className="mb-3 mt-2 pt-2 border-t border-gray-700">
                        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">💳 Банківські картки</p>
                        <Field label="Картка" value={tgFieldMap.credit_card || tgFieldMap.card} />
                      </div>
                    )}
                  </Card>
                </div>

                {/* ── Рядок 2: Контакти | Родичі & Зв'язки | Telegram витоки ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card title="📞 Контакти">
                    {allPhones.length > 0 && (
                      <div className="mb-3">
                        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Телефони ({allPhones.length})</p>
                        <div className="flex flex-col gap-0.5">
                          {allPhones.map((p: string, i: number) => (
                            <p key={i} className="text-green-400 text-sm font-mono">{p}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {allEmails.length > 0 && (
                      <div className="mb-3">
                        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Email</p>
                        {allEmails.map((em: string, i: number) => (
                          <p key={i} className="text-blue-400 text-sm font-mono">{em}</p>
                        ))}
                      </div>
                    )}
                    {allEmails.length === 0 && <Field label="Email" value={person.email} />}
                    <Field label="Адреса реєстрації" value={person.addr_reg || tgFieldMap.address} />
                    <Field label="Адреса проживання" value={person.addr_live} />
                    {(person.vk_url || person.ok_url || person.instagram_url || person.fb_url || tgFieldMap.vk) && (
                      <div className="mt-2 pt-2 border-t border-gray-700">
                        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Соцмережі</p>
                        <div className="flex flex-col gap-1">
                          {(person.vk_url || tgFieldMap.vk) && (
                            <a href={person.vk_url || tgFieldMap.vk} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1.5 hover:underline truncate">
                              💙 VK: {(person.vk_url || tgFieldMap.vk || '').replace('https://', '')}
                            </a>
                          )}
                          {person.ok_url && (
                            <a href={person.ok_url} target="_blank" rel="noopener noreferrer"
                              className="text-orange-400 hover:text-orange-300 text-xs flex items-center gap-1.5 hover:underline truncate">
                              🟠 OK: {person.ok_url.replace('https://', '')}
                            </a>
                          )}
                          {person.instagram_url && (
                            <a href={person.instagram_url} target="_blank" rel="noopener noreferrer"
                              className="text-pink-400 hover:text-pink-300 text-xs flex items-center gap-1.5 hover:underline truncate">
                              📸 Instagram: {person.instagram_url.replace('https://', '')}
                            </a>
                          )}
                          {person.fb_url && (
                            <a href={person.fb_url} target="_blank" rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-400 text-xs flex items-center gap-1.5 hover:underline truncate">
                              👤 Facebook: {person.fb_url.replace('https://', '')}
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>

                  <Card title="👨‍👩‍👧 Родичі та зв'язки">
                    {tgFieldMap.relatives ? (
                      <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{tgFieldMap.relatives}</div>
                    ) : (
                      <p className="text-gray-600 text-sm italic">Дані відсутні</p>
                    )}
                    {(tgFieldMap.debt_collector || tgFieldMap.debt_amount) && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <p className="text-yellow-500 text-xs font-semibold uppercase mb-2">⚠️ Борги</p>
                        <Field label="Стягувач" value={tgFieldMap.debt_collector} />
                        <Field label="Сума" value={tgFieldMap.debt_amount} />
                        <Field label="Тип" value={tgFieldMap.debt_type} />
                        <Field label="№ справи" value={tgFieldMap.court_case} />
                        <Field label="Статус" value={tgFieldMap.court_status} />
                      </div>
                    )}
                    {(person.detained_date || person.detained_place) && (
                      <div className="mt-3 pt-3 border-t border-red-900">
                        <p className="text-red-400 text-xs font-semibold uppercase mb-2">🔒 Затримання</p>
                        <Field label="Дата" value={person.detained_date} />
                        <Field label="Місце" value={person.detained_place} />
                      </div>
                    )}
                  </Card>

                  <Card title={`🗂️ Telegram витоки${allLeaks.length > 0 ? ` (${allLeaks.length})` : ''}`}>
                    {allLeaks.length === 0 ? (
                      <p className="text-gray-600 text-sm italic">Пошук у Telegram ще не проводився.<br/>Натисніть вкладку OSINT → Telegram пошук.</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {allLeaks.map((l: any, i: number) => (
                            <span key={i} className="text-xs px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full border border-blue-800/50">
                              {l.source_label || 'Витік'}
                            </span>
                          ))}
                        </div>
                        {tgLastSearch && (
                          <p className="text-gray-600 text-xs mb-2">Останній пошук: {tgLastSearch}</p>
                        )}
                        <div className="space-y-1">
                          {Object.entries({
                            name: 'ПІБ', dob: 'Дата нар.', address: 'Адреса', region: 'Регіон',
                            rank: 'Звання', employer: 'Роботодавець', car_info: 'Авто', vin: 'VIN',
                          }).filter(([k]) => tgFieldMap[k]).map(([k, label]) => (
                            <div key={k} className="flex gap-2">
                              <span className="text-gray-500 text-xs w-24 shrink-0">{label}</span>
                              <span className="text-gray-200 text-xs truncate" title={tgFieldMap[k]}>{tgFieldMap[k]}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </Card>
                </div>

                {/* ── Рядок 3: Web-згадки (OSINT) ── */}
                {topMentions.length > 0 && (
                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <h3 className="text-gray-300 font-semibold mb-4 pb-2 border-b border-gray-700 text-sm flex items-center justify-between">
                      <span>🌐 Web-згадки ({personMentions.length})</span>
                      <button onClick={() => setActiveTab('osint')}
                        className="text-blue-400 hover:text-blue-300 text-xs font-normal transition">
                        Всі результати →
                      </button>
                    </h3>
                    <div className="space-y-3">
                      {topMentions.map((m: any, i: number) => {
                        const isMyrto = (m.source_name || '').includes('myrotvorets') || (m.url || '').includes('myrotvorets')
                        const isVk = (m.source_name || '').includes('vk.com')
                        const isWarcrime = (m.source_name || '').includes('war-crime') || (m.title || '').toLowerCase().includes('war crime')
                        return (
                          <div key={i} className={`rounded-lg p-3 border ${
                            isMyrto ? 'bg-red-950/40 border-red-800/50' :
                            isVk ? 'bg-blue-950/30 border-blue-800/40' :
                            'bg-gray-750 border-gray-700/50'
                          }`}>
                            <a href={m.url} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 text-sm font-medium hover:underline line-clamp-1">
                              {isMyrto && '🚨 '}{isVk && '💙 '}{isWarcrime && '⚖️ '}
                              {m.title || m.url}
                            </a>
                            <p className="text-gray-400 text-xs mt-1 line-clamp-2 leading-relaxed">{m.snippet}</p>
                            <p className="text-gray-600 text-xs mt-1">{m.source_name}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── Відео ── */}
                {videos.length > 0 && (
                  <Card title="🎬 Медіа матеріали">
                    <div className="grid grid-cols-1 gap-3">
                      {videos.map((v: any, i: number) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-gray-900/60 rounded-lg border border-gray-700/50">
                          <span className="text-2xl shrink-0">▶️</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-300 text-sm">{v.note || 'Без назви'}</p>
                            <a href={v.url} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 text-xs hover:underline truncate block">{v.url}</a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* ── VK Пошук ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <h3 className="text-gray-300 font-semibold text-sm">💙 VK — соціальні профілі</h3>
                    <button
                      onClick={runVkSearch}
                      disabled={vkLoading}
                      className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {vkLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 Знайти у VK'}
                    </button>
                  </div>
                  {vkError && <p className="text-red-400 text-xs mb-2">{vkError}</p>}
                  {/* Збережені профілі з БД */}
                  {(() => {
                    const saved = (person.social_profiles || []).filter((s: any) => s.platform === 'vk')
                    const toShow = vkProfiles.length > 0 ? vkProfiles : saved
                    if (toShow.length === 0) return (
                      <p className="text-gray-600 text-sm italic">
                        {vkLoading ? 'Шукаємо у VK...' : 'Натисніть "Знайти у VK" для пошуку профілів.'}
                        {!vkLoading && !vkError && ' Потрібен VK_ACCESS_TOKEN у .env.local'}
                      </p>
                    )
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {toShow.map((p: any, i: number) => (
                          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 bg-blue-950/20 border border-blue-800/30 rounded-lg hover:border-blue-600/50 transition group">
                            {(p.photo || p.photo_url) && (
                              <img src={p.photo || p.photo_url} alt={p.name}
                                className="w-10 h-10 rounded-full object-cover border border-blue-700/50 shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-blue-300 text-sm font-medium group-hover:text-blue-200 truncate">{p.name}</p>
                              <p className="text-gray-500 text-xs truncate">{p.city || p.url}</p>
                              {p.confidence && (
                                <span className={`text-xs ${p.confidence >= 70 ? 'text-green-400' : 'text-yellow-500'}`}>
                                  Збіг: {p.confidence}%
                                </span>
                              )}
                            </div>
                          </a>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* ── ЄДР / Бізнес-зв'язки ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <h3 className="text-gray-300 font-semibold text-sm">🏢 ЄДР / Бізнес-зв'язки</h3>
                    <button
                      onClick={runOdbSearch}
                      disabled={odbLoading}
                      className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {odbLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 Перевірити ЄДР'}
                    </button>
                  </div>
                  {odbError && <p className="text-red-400 text-xs mb-2">{odbError}</p>}
                  {(() => {
                    const saved = person.business_connections || []
                    const toShow = odbResults.length > 0 ? odbResults : saved
                    if (toShow.length === 0) return (
                      <p className="text-gray-600 text-sm italic">
                        {odbLoading ? 'Перевіряємо ЄДР...' : 'Дані про бізнес-зв\'язки відсутні. Натисніть "Перевірити ЄДР".'}
                      </p>
                    )
                    return (
                      <div className="space-y-2">
                        {toShow.map((r: any, i: number) => (
                          <div key={i} className={`p-3 rounded-lg border ${
                            r.type === 'fop' ? 'bg-yellow-950/20 border-yellow-800/40' :
                            'bg-gray-750 border-gray-700/50'
                          }`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium">{r.name}</p>
                                <p className="text-gray-400 text-xs mt-0.5">{r.role} {r.code ? `• ЄДРПОУ: ${r.code}` : ''}</p>
                                {r.address && <p className="text-gray-500 text-xs mt-0.5 truncate">{r.address}</p>}
                                {r.activity && <p className="text-gray-500 text-xs">{r.activity}</p>}
                              </div>
                              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
                                r.status?.includes('зареєстрований') || r.status?.includes('active')
                                  ? 'bg-green-900/50 text-green-400 border border-green-800/50'
                                  : 'bg-gray-700 text-gray-400'
                              }`}>{r.status || '?'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* ── Транспортні засоби ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <h3 className="text-gray-300 font-semibold text-sm">🚗 Транспортні засоби</h3>
                    <button
                      onClick={runVehicleSearch}
                      disabled={vehiclesLoading}
                      className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {vehiclesLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 Знайти авто'}
                    </button>
                  </div>
                  {vehiclesError && <p className="text-red-400 text-xs mb-2">{vehiclesError}</p>}
                  {(() => {
                    const saved = person.vehicles || []
                    const toShow = vehiclesResults.length > 0 ? vehiclesResults : saved
                    if (toShow.length === 0) return (
                      <p className="text-gray-600 text-sm italic">
                        {vehiclesLoading ? 'Шукаємо транспорт...' : 'Транспортних засобів не знайдено. Натисніть "Знайти авто".'}
                      </p>
                    )
                    return (
                      <div className="space-y-2">
                        {toShow.map((v: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg bg-blue-950/20 border border-blue-800/30 flex items-start gap-3">
                            <span className="text-2xl">🚗</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {v.plate && (
                                  <span className="font-mono text-sm font-bold text-white bg-gray-700 px-2 py-0.5 rounded border border-gray-600">
                                    {v.plate}
                                  </span>
                                )}
                                {v.model && <span className="text-white text-sm">{v.model}</span>}
                                {v.year && <span className="text-gray-400 text-xs">{v.year} р.</span>}
                                {v.color && <span className="text-gray-400 text-xs">{v.color}</span>}
                              </div>
                              {v.vin && <p className="text-gray-500 text-xs font-mono mt-0.5">VIN: {v.vin}</p>}
                              {v.owner_name && <p className="text-gray-400 text-xs mt-0.5">Власник: {v.owner_name}</p>}
                              <p className="text-gray-600 text-xs mt-0.5">{v.source}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* ── Search4Faces / Пошук за фото ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <h3 className="text-gray-300 font-semibold text-sm">📷 Пошук за фото</h3>
                    <button
                      onClick={runFaceSearch}
                      disabled={faceLoading || !person.photo_url}
                      title={!person.photo_url ? 'Додайте фото до картки' : ''}
                      className="px-3 py-1.5 bg-indigo-800 hover:bg-indigo-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {faceLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 Знайти профілі'}
                    </button>
                  </div>
                  {faceError && <p className="text-red-400 text-xs mb-2">{faceError}</p>}
                  {!person.photo_url && (
                    <p className="text-gray-600 text-sm italic">Фото відсутнє. Додайте фото у картку особи для пошуку профілів.</p>
                  )}
                  {person.photo_url && (() => {
                    const saved: any[] = (person.person_photos || []).filter((p: any) => p.profile_url)
                    const toShow = faceResults.length > 0 ? faceResults : saved
                    if (toShow.length === 0) return (
                      <p className="text-gray-600 text-sm italic">
                        {faceLoading ? 'Шукаємо профілі...' : 'Профілів не знайдено. Натисніть "Знайти профілі".'}
                      </p>
                    )
                    return (
                      <div className="space-y-2">
                        {toShow.map((r: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-800/30 flex items-center gap-3">
                            {r.photo_url
                              ? <img src={r.photo_url} alt="face" className="w-10 h-10 rounded-full object-cover border border-indigo-700/50 flex-shrink-0" />
                              : <div className="w-10 h-10 rounded-full bg-indigo-900/40 flex items-center justify-center flex-shrink-0 text-lg">
                                  {r.source === 'vk' ? '🔵' : r.source === 'ok' ? '🟠' : '📷'}
                                </div>
                            }
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${r.source === 'vk' ? 'bg-blue-900/50 text-blue-300' : r.source === 'ok' ? 'bg-orange-900/50 text-orange-300' : 'bg-gray-700 text-gray-300'}`}>
                                  {r.source?.toUpperCase()}
                                </span>
                                {r.similarity != null && (
                                  <span className={`text-xs font-bold ${r.similarity >= 80 ? 'text-green-400' : r.similarity >= 60 ? 'text-yellow-400' : 'text-gray-400'}`}>
                                    {Math.round(r.similarity)}% схожість
                                  </span>
                                )}
                                {r.name && <span className="text-gray-300 text-sm truncate">{r.name}</span>}
                              </div>
                              {r.profile_url && (
                                <a href={r.profile_url} target="_blank" rel="noopener noreferrer"
                                  className="text-indigo-400 hover:text-indigo-300 text-xs truncate block mt-0.5">
                                  {r.profile_url}
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* ── FindFace / FindClone ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <h3 className="text-gray-300 font-semibold text-sm">🕵️ FindFace / FindClone</h3>
                    <button
                      onClick={runFindFaceSearch}
                      disabled={findFaceLoading || !person.photo_url}
                      title={!person.photo_url ? 'Додайте фото' : ''}
                      className="px-3 py-1.5 bg-violet-800 hover:bg-violet-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {findFaceLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 Знайти профілі VK'}
                    </button>
                  </div>
                  {findFaceError && <p className="text-red-400 text-xs mb-2">{findFaceError}</p>}
                  {!person.photo_url && <p className="text-gray-600 text-sm italic">Потрібне фото особи</p>}
                  {findFaceResults.length > 0 && (
                    <div className="space-y-2">
                      {findFaceResults.map((r: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg bg-violet-950/20 border border-violet-800/30 flex items-center gap-3">
                          {r.photo_url
                            ? <img src={r.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-violet-700/50" />
                            : <div className="w-9 h-9 rounded-full bg-violet-900/40 flex items-center justify-center flex-shrink-0 text-base">🎭</div>
                          }
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-300">{(r.source || 'findclone').toUpperCase()}</span>
                              {r.similarity != null && <span className={`text-xs font-bold ${r.similarity >= 80 ? 'text-green-400' : 'text-yellow-400'}`}>{r.similarity}%</span>}
                              {r.name && <span className="text-gray-300 text-sm">{r.name}</span>}
                            </div>
                            {r.profile_url && (
                              <a href={r.profile_url} target="_blank" rel="noopener noreferrer"
                                className="text-violet-400 hover:text-violet-300 text-xs truncate block mt-0.5">{r.profile_url}</a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Кадастр нерухомості ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <h3 className="text-gray-300 font-semibold text-sm">🏠 Кадастр нерухомості</h3>
                    <button
                      onClick={runKadasterSearch}
                      disabled={kadasterLoading}
                      className="px-3 py-1.5 bg-teal-800 hover:bg-teal-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {kadasterLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 Шукати нерухомість'}
                    </button>
                  </div>
                  {kadasterError && <p className="text-red-400 text-xs mb-2">{kadasterError}</p>}
                  {(() => {
                    const toShow = kadasterResults.length > 0 ? kadasterResults : (person.real_estate || [])
                    if (toShow.length === 0) return <p className="text-gray-600 text-sm italic">{kadasterLoading ? 'Пошук...' : 'Нерухомість не знайдено'}</p>
                    return (
                      <div className="space-y-2">
                        {toShow.map((r: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg bg-teal-950/20 border border-teal-800/30 text-sm">
                            {r.cadastral_number && <p className="text-teal-300 font-mono text-xs">{r.cadastral_number}</p>}
                            {r.address && <p className="text-gray-200">{r.address}</p>}
                            <div className="flex gap-3 mt-1 text-xs text-gray-500">
                              {r.type  && <span>{r.type}</span>}
                              {r.area  && <span>{r.area}</span>}
                              {r.source && <span className="ml-auto">{r.source}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* ── Некрологи / ЗАГС ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <div>
                      <h3 className="text-gray-300 font-semibold text-sm">🕯️ Некрологи / ЗАГС</h3>
                      {person.status === 'загинув' && <span className="text-xs text-red-400 mt-0.5 block">⚠️ Підтверджено: загинув</span>}
                    </div>
                    <button
                      onClick={runObituariesSearch}
                      disabled={obitsLoading}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {obitsLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 Шукати некрологи'}
                    </button>
                  </div>
                  {obitsError && <p className="text-red-400 text-xs mb-2">{obitsError}</p>}
                  {(() => {
                    const toShow = obitsResults.length > 0 ? obitsResults : (person.obituary_data || [])
                    if (toShow.length === 0) return <p className="text-gray-600 text-sm italic">{obitsLoading ? 'Пошук...' : 'Записів не знайдено'}</p>
                    return (
                      <div className="space-y-2">
                        {toShow.map((r: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg bg-gray-700/30 border border-gray-600/40 text-sm">
                            {r.title && <p className="text-gray-200 font-medium">{r.title}</p>}
                            {r.snippet && <p className="text-gray-400 text-xs mt-1 line-clamp-2">{r.snippet}</p>}
                            <div className="flex gap-3 mt-1 text-xs text-gray-500 items-center">
                              {r.source && <span>{r.source}</span>}
                              {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-auto">↗</a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* ── Telegram Phone Lookup ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <h3 className="text-gray-300 font-semibold text-sm">📱 Telegram за номером</h3>
                    <button
                      onClick={runTgPhoneLookup}
                      disabled={tgPhoneLoading || !(person.phones?.length)}
                      title={!person.phones?.length ? 'Немає номерів телефону' : ''}
                      className="px-3 py-1.5 bg-sky-800 hover:bg-sky-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {tgPhoneLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 Знайти Telegram'}
                    </button>
                  </div>
                  {tgPhoneError && <p className="text-red-400 text-xs mb-2">{tgPhoneError}</p>}
                  {!person.phones?.length && <p className="text-gray-600 text-sm italic">Немає номерів для пошуку</p>}
                  {(() => {
                    const toShow = tgPhoneResults.length > 0 ? tgPhoneResults : (person.telegram_accounts || [])
                    if (toShow.length === 0 && person.phones?.length) return <p className="text-gray-600 text-sm italic">{tgPhoneLoading ? 'Пошук...' : 'Telegram акаунтів не знайдено'}</p>
                    return (
                      <div className="space-y-2">
                        {toShow.map((r: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg bg-sky-950/20 border border-sky-800/30 flex items-center gap-3 text-sm">
                            {r.photo_url
                              ? <img src={r.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                              : <div className="w-9 h-9 rounded-full bg-sky-900/40 flex items-center justify-center flex-shrink-0 text-base">📱</div>
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-sky-300 font-medium">{r.first_name} {r.last_name}</p>
                              {r.username && <a href={`https://t.me/${r.username}`} target="_blank" rel="noopener noreferrer" className="text-sky-400 text-xs hover:underline">@{r.username}</a>}
                              <p className="text-gray-500 text-xs mt-0.5">{r.phone} {r.user_id ? `· ID: ${r.user_id}` : ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* ── Збір фото з VK/OK/Instagram ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <h3 className="text-gray-300 font-semibold text-sm">📸 Авто-збір фото</h3>
                    <button
                      onClick={runPhotoCollection}
                      disabled={photoCollLoading || !(person.vk_url || person.ok_url || person.instagram_url)}
                      title={!(person.vk_url || person.ok_url || person.instagram_url) ? 'Потрібен VK, OK або Instagram профіль' : ''}
                      className="px-3 py-1.5 bg-pink-800 hover:bg-pink-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {photoCollLoading ? <><span className="animate-spin">⟳</span> Збір...</> : '📥 Зібрати фото'}
                    </button>
                  </div>
                  <div className="flex gap-2 mb-3">
                    {person.vk_url && <span className="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-300">VK ✓</span>}
                    {person.ok_url && <span className="text-xs px-2 py-0.5 rounded bg-orange-900/40 text-orange-300">OK ✓</span>}
                    {person.instagram_url && <span className="text-xs px-2 py-0.5 rounded bg-pink-900/40 text-pink-300">Instagram ✓</span>}
                    {!(person.vk_url || person.ok_url || person.instagram_url) && <span className="text-gray-600 text-xs italic">Не знайдено соцмереж</span>}
                  </div>
                  {photoCollMsg && <p className="text-sm text-gray-300">{photoCollMsg}</p>}
                  {person.person_photos?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(person.person_photos || []).slice(0, 12).map((p: any, i: number) => (
                        <a key={i} href={p.profile_url || p.url} target="_blank" rel="noopener noreferrer">
                          <img src={p.url} alt="" className="w-12 h-12 rounded object-cover border border-gray-600 hover:border-pink-500 transition" />
                        </a>
                      ))}
                      {person.person_photos?.length > 12 && <span className="text-gray-500 text-xs self-center ml-1">+{person.person_photos.length - 12}</span>}
                    </div>
                  )}
                </div>

                {/* ── WhatsApp / Viber presence ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <h3 className="text-gray-300 font-semibold text-sm">💬 WhatsApp / Viber</h3>
                    <button
                      onClick={runPresenceCheck}
                      disabled={presenceLoading || !(person.phones?.length)}
                      title={!person.phones?.length ? 'Немає номерів телефону' : ''}
                      className="px-3 py-1.5 bg-green-800 hover:bg-green-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {presenceLoading ? <><span className="animate-spin">⟳</span> Перевірка...</> : '🔍 Перевірити'}
                    </button>
                  </div>
                  {presenceError && <p className="text-red-400 text-xs mb-2">{presenceError}</p>}
                  {!person.phones?.length && <p className="text-gray-600 text-sm italic">Немає номерів для перевірки</p>}
                  {presenceResults.length > 0 && (
                    <div className="space-y-2">
                      {presenceResults.map((r: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg bg-green-950/20 border border-green-800/30 text-sm">
                          <p className="text-gray-200 font-mono">{r.phone}</p>
                          <div className="flex gap-3 mt-1.5 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded ${r.whatsapp ? 'bg-green-900/60 text-green-300' : 'bg-gray-700 text-gray-500'}`}>
                              {r.whatsapp ? '✓ WhatsApp' : '✗ WhatsApp'}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${r.viber ? 'bg-purple-900/60 text-purple-300' : 'bg-gray-700 text-gray-500'}`}>
                              {r.viber ? '✓ Viber' : '✗ Viber'}
                            </span>
                            {r.truecaller?.name && <span className="text-xs text-yellow-300 px-2 py-0.5 rounded bg-yellow-900/40">TC: {r.truecaller.name}</span>}
                            {r.carrier && <span className="text-gray-500 text-xs">{r.carrier}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── VPN Search (ipbd.ru / leb.su) ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <div>
                      <h3 className="text-gray-300 font-semibold text-sm">🔒 VPN пошук (ipbd/leb.su)</h3>
                      <p className="text-gray-600 text-xs mt-0.5">Потрібно мін. 2 ідентифікатори</p>
                    </div>
                    <button
                      onClick={runVpnSearch}
                      disabled={vpnLoading}
                      className="px-3 py-1.5 bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {vpnLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 VPN пошук'}
                    </button>
                  </div>
                  {vpnError && <p className="text-red-400 text-xs mb-2">{vpnError}</p>}
                  {vpnResults.length > 0 && (
                    <div className="space-y-2">
                      {vpnResults.map((r: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg bg-red-950/20 border border-red-800/30 text-sm">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 mr-2">{r.site}</span>
                          {r.snippet && <p className="text-gray-300 text-xs mt-1 line-clamp-3">{r.snippet}</p>}
                          {r.error && <p className="text-red-400 text-xs mt-1">{r.error}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  {!vpnLoading && vpnResults.length === 0 && !vpnError && (
                    <p className="text-gray-600 text-sm italic">Натисніть для пошуку в заблокованих базах</p>
                  )}
                </div>

                {/* ── Витоки (Leaks DB) ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <h3 className="text-gray-300 font-semibold text-sm">💧 База витоків</h3>
                    <button
                      onClick={runLeaksSearch}
                      disabled={leaksLoading}
                      className="px-3 py-1.5 bg-amber-800 hover:bg-amber-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {leaksLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 Шукати у витоках'}
                    </button>
                  </div>
                  {leaksError && <p className="text-red-400 text-xs mb-2">{leaksError}</p>}
                  {leaksResults.length > 0 && (
                    <div className="space-y-1.5">
                      {leaksResults.map((r: any, i: number) => (
                        <div key={i} className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/30 text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium`}
                              style={{ background: r.source_color === 'red' ? 'rgb(127,29,29,0.5)' : r.source_color === 'orange' ? 'rgb(124,45,18,0.5)' : 'rgb(55,65,81,0.5)',
                                color: r.source_color === 'red' ? '#fca5a5' : r.source_color === 'orange' ? '#fdba74' : '#9ca3af' }}>
                              {r.source_label || r.source}
                            </span>
                            {r.leaked_at && <span className="text-gray-600">{new Date(r.leaked_at).toLocaleDateString('uk-UA')}</span>}
                          </div>
                          {r.name     && <p className="text-gray-300"><span className="text-gray-500">Ім'я:</span> {r.name}</p>}
                          {r.phone    && <p className="text-gray-300"><span className="text-gray-500">Тел:</span> {r.phone}</p>}
                          {r.email    && <p className="text-gray-300"><span className="text-gray-500">Email:</span> {r.email}</p>}
                          {r.inn      && <p className="text-gray-300"><span className="text-gray-500">ІПН:</span> {r.inn}</p>}
                          {r.address  && <p className="text-gray-300"><span className="text-gray-500">Адреса:</span> {r.address}</p>}
                          {r.passport && <p className="text-gray-300"><span className="text-gray-500">Паспорт:</span> {r.passport}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  {!leaksLoading && leaksResults.length === 0 && !leaksError && (
                    <p className="text-gray-600 text-sm italic">Натисніть для пошуку в локальній БД витоків</p>
                  )}
                </div>

                {/* ── AI-профіль ── */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                    <div>
                      <h3 className="text-gray-300 font-semibold text-sm">🤖 AI-аналіз</h3>
                      {person.last_full_osint && (
                        <p className="text-gray-600 text-xs mt-0.5">
                          Оновлено: {new Date(person.last_full_osint).toLocaleString('uk-UA')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={runAiProfile}
                      disabled={aiLoading}
                      className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5">
                      {aiLoading
                        ? <><span className="animate-spin">⟳</span> Аналіз...</>
                        : person.ai_profile ? '🔄 Оновити аналіз' : '✨ Згенерувати профіль'}
                    </button>
                  </div>
                  {aiError && <p className="text-yellow-400 text-xs mb-3">{aiError}</p>}
                  {aiLoading && (
                    <div className="text-center py-8">
                      <div className="text-purple-400 text-2xl mb-2 animate-pulse">🤖</div>
                      <p className="text-gray-400 text-sm">Claude аналізує дані...</p>
                    </div>
                  )}
                  {!aiLoading && person.ai_profile ? (
                    <div className="prose prose-invert prose-sm max-w-none text-gray-200 leading-relaxed
                      [&>h2]:text-blue-400 [&>h2]:font-semibold [&>h2]:text-sm [&>h2]:mt-4 [&>h2]:mb-2
                      [&>h3]:text-blue-300 [&>h3]:font-medium [&>h3]:text-sm [&>h3]:mt-3 [&>h3]:mb-1
                      [&>p]:text-gray-200 [&>p]:text-sm [&>p]:mb-2
                      [&>ul]:text-gray-300 [&>ul]:text-sm [&>ul>li]:mb-1
                      [&>strong]:text-white [&_strong]:text-white">
                      {/* Простий markdown рендер без залежностей */}
                      {person.ai_profile.split('\n').map((line: string, i: number) => {
                        if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>
                        if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>
                        if (line.startsWith('**') && line.endsWith('**')) return (
                          <p key={i} className="text-white font-semibold">{line.slice(2, -2)}</p>
                        )
                        if (line.startsWith('- ') || line.startsWith('* ')) return (
                          <p key={i} className="text-gray-300 text-sm ml-3">• {line.slice(2)}</p>
                        )
                        if (line.trim() === '') return <div key={i} className="h-2" />
                        // Bold inline
                        const parts = line.split(/\*\*([^*]+)\*\*/g)
                        return (
                          <p key={i} className="text-gray-200 text-sm">
                            {parts.map((part, j) =>
                              j % 2 === 1 ? <strong key={j} className="text-white">{part}</strong> : part
                            )}
                          </p>
                        )
                      })}
                    </div>
                  ) : !aiLoading && (
                    <p className="text-gray-600 text-sm italic">
                      AI-профіль ще не згенеровано. Натисніть кнопку вище — Claude проаналізує всі зібрані дані та складе структурований звіт.
                      {!process.env.NEXT_PUBLIC_SUPABASE_URL && ' Потрібен ANTHROPIC_API_KEY у .env.local.'}
                    </p>
                  )}
                </div>

                {/* ── Аналітика ── */}
                <Card title="📊 Аналітика та верифікація">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Field label="Пріоритет" value={person.priority} />
                      <Field label="МКС релевантність" value={person.icc_relevant ? '✅ Так' : null} />
                      <Field label="Верифіковано" value={person.verified ? '✅ Так' : null} />
                      <Field label="Теги" value={person.tags?.join(', ')} />
                    </div>
                    <div>
                      <Field label="OSINT зв'язки" value={person.osint_connections} />
                      {allLeaks.length > 0 && (
                        <div className="mb-3">
                          <p className="text-gray-500 text-xs uppercase tracking-wide">Telegram витоки</p>
                          <p className="text-white mt-1 text-sm">{allLeaks.length} записів з {(person.telegram_raw || []).length} пошуків</p>
                        </div>
                      )}
                      {personMentions.length > 0 && (
                        <div className="mb-3">
                          <p className="text-gray-500 text-xs uppercase tracking-wide">Web-згадки</p>
                          <p className="text-white mt-1 text-sm">{personMentions.length} посилань</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>

              </div>
            )
          })()}

          {/* ═══ ЗВ'ЯЗКИ ═══ */}
          {activeTab === 'connections' && (
            <ConnectionsGraph personId={String(params.id)} personName={personName} />
          )}

          {/* ═══ ЗЛОЧИНИ ═══ */}
          {activeTab === 'incidents' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-semibold">⚖️ Воєнні злочини: {incidents.length}</span>
                <button onClick={() => setShowIncidentForm(!showIncidentForm)}
                  className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg text-sm font-medium transition">
                  + Додати інцидент
                </button>
              </div>

              {showIncidentForm && (
                <div className="bg-gray-800 border border-red-800 rounded-xl p-5 space-y-4">
                  <h4 className="text-red-400 font-semibold text-sm">Новий інцидент</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-gray-400 text-xs mb-1 block">Назва *</label>
                      <input type="text" value={incidentTitle} onChange={e => setIncidentTitle(e.target.value)}
                        placeholder="Короткий опис події"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-gray-400 text-xs mb-1 block">Дата</label>
                      <input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-gray-400 text-xs mb-1 block">Тип</label>
                      <select value={incidentType} onChange={e => setIncidentType(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none">
                        <option value="обстріл">Обстріл</option>
                        <option value="катування">Катування</option>
                        <option value="вбивство">Вбивство</option>
                        <option value="мародерство">Мародерство</option>
                        <option value="зґвалтування">Зґвалтування</option>
                        <option value="депортація">Депортація</option>
                        <option value="unknown">Інше</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-400 text-xs mb-1 block">Місце</label>
                      <input type="text" value={incidentLocation} onChange={e => setIncidentLocation(e.target.value)}
                        placeholder="Місто, координати"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-gray-400 text-xs mb-1 block">Роль особи</label>
                      <select value={incidentRole} onChange={e => setIncidentRole(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none">
                        <option value="виконавець">Виконавець</option>
                        <option value="командир">Командир</option>
                        <option value="організатор">Організатор</option>
                        <option value="свідок">Свідок</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-400 text-xs mb-1 block">Тяжкість</label>
                      <select value={incidentSeverity} onChange={e => setIncidentSeverity(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none">
                        <option value="low">Низька</option>
                        <option value="medium">Середня</option>
                        <option value="high">Висока</option>
                        <option value="critical">Критична</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-gray-400 text-xs mb-1 block">Стаття МКС</label>
                      <input type="text" value={incidentIcc} onChange={e => setIncidentIcc(e.target.value)}
                        placeholder="Ст. 8(2)(a)(i)"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-gray-400 text-xs mb-1 block">Опис</label>
                      <textarea value={incidentDesc} onChange={e => setIncidentDesc(e.target.value)} rows={3}
                        placeholder="Детальний опис події..."
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none resize-none" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={createIncident} disabled={!incidentTitle.trim() || savingIncident}
                      className="px-5 py-2 bg-red-800 hover:bg-red-700 disabled:opacity-50 rounded-lg text-sm font-medium transition">
                      {savingIncident ? 'Збереження...' : '💾 Зберегти'}
                    </button>
                    <button onClick={() => setShowIncidentForm(false)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition">
                      Скасувати
                    </button>
                  </div>
                </div>
              )}

              {incidentsLoading ? (
                <div className="text-center py-10 text-gray-500">Завантаження...</div>
              ) : incidents.length === 0 ? (
                <div className="text-center py-16 bg-gray-800 rounded-xl border border-gray-700">
                  <p className="text-4xl mb-3">⚖️</p>
                  <p className="text-gray-400">Інцидентів ще не додано</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {incidents.map((item: any, i: number) => {
                    const inc = item.incident || item
                    const severityColors: Record<string, string> = {
                      critical: 'border-red-700 bg-red-950/30',
                      high: 'border-orange-700 bg-orange-950/30',
                      medium: 'border-yellow-700 bg-yellow-950/20',
                      low: 'border-gray-600 bg-gray-800',
                    }
                    return (
                      <div key={i} className={`rounded-xl p-5 border ${severityColors[inc.severity] || severityColors.medium}`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h4 className="text-white font-semibold text-sm">{inc.title}</h4>
                          <div className="flex gap-2 flex-shrink-0">
                            {item.role && (
                              <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">{item.role}</span>
                            )}
                            {inc.icc_article && (
                              <span className="px-2 py-0.5 bg-blue-900 text-blue-300 rounded text-xs font-mono">{inc.icc_article}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
                          {inc.date && <span>📅 {inc.date}</span>}
                          {inc.location && <span>📍 {inc.location}</span>}
                          {inc.inc_type && <span>🔹 {inc.inc_type}</span>}
                        </div>
                        {inc.description && (
                          <p className="text-gray-300 text-sm mt-2 leading-relaxed">{inc.description}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ МЕДІА ═══ */}
          {activeTab === 'media' && (
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <h3 className="text-blue-400 font-semibold mb-3 text-sm">➕ Додати відео</h3>
                <div className="flex gap-3">
                  <input type="text" placeholder="URL відео (YouTube, Telegram, mp4...)" value={videoUrl}
                    onChange={e => setVideoUrl(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none" />
                  <input type="text" placeholder="Примітка" value={videoNote}
                    onChange={e => setVideoNote(e.target.value)}
                    className="w-40 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none" />
                  <button onClick={() => { if (videoUrl) { setVideos(p => [...p, { url: videoUrl, note: videoNote }]); setVideoUrl(''); setVideoNote('') } }}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm transition">Додати</button>
                </div>
                <p className="text-gray-600 text-xs mt-2">Підтримує YouTube, Telegram, прямі посилання на .mp4</p>
              </div>
              {videos.length === 0 ? (
                <div className="text-center py-16 text-gray-600">
                  <p className="text-5xl mb-3">🎬</p><p>Відеоматеріали ще не додано</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {videos.map((v, i) => {
                    const embed = getYouTubeEmbed(v.url)
                    return (
                      <div key={i} className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
                        {embed ? (
                          <iframe src={embed} className="w-full aspect-video" allowFullScreen />
                        ) : (
                          <div className="aspect-video bg-gray-900 flex items-center justify-center">
                            <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-sm">🔗 Відкрити відео</a>
                          </div>
                        )}
                        <div className="p-3 flex justify-between">
                          <div>
                            {v.note && <p className="text-gray-300 text-sm">{v.note}</p>}
                          </div>
                          <button onClick={() => setVideos(p => p.filter((_, idx) => idx !== i))} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ ДОКУМЕНТИ ═══ */}
          {activeTab === 'documents' && (
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <h3 className="text-yellow-400 font-semibold mb-3 text-sm">➕ Додати документ</h3>
                <div className="flex gap-3">
                  <input type="text" placeholder="URL документу або PDF" value={docUrl}
                    onChange={e => setDocUrl(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-yellow-500 focus:outline-none" />
                  <input type="text" placeholder="Назва" value={docTitle}
                    onChange={e => setDocTitle(e.target.value)}
                    className="w-48 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-yellow-500 focus:outline-none" />
                  <button onClick={() => { if (docUrl) { setDocs(p => [...p, { url: docUrl, title: docTitle || docUrl }]); setDocUrl(''); setDocTitle('') } }}
                    className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm transition">Додати</button>
                </div>
              </div>
              {osintPdfs.length > 0 && (
                <div className="bg-gray-800 rounded-xl p-5 border border-purple-800">
                  <h3 className="text-purple-400 font-semibold mb-4 text-sm">🔍 PDF знайдені через OSINT ({osintPdfs.length})</h3>
                  <div className="space-y-3">
                    {osintPdfs.map((pdf, i) => (
                      <div key={i} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                        <p className="text-blue-400 font-medium text-sm">{pdf.title}</p>
                        <p className="text-gray-600 text-xs mt-1 truncate">{pdf.link}</p>
                        {pdf.snippet && <p className="text-gray-400 text-sm mt-2">{pdf.snippet}</p>}
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => openWayback(pdf.link)} className="px-3 py-1 bg-blue-900 hover:bg-blue-800 text-blue-300 rounded text-xs transition">📦 Wayback</button>
                          <button onClick={() => openGoogleCache(pdf.link)} className="px-3 py-1 bg-green-900 hover:bg-green-800 text-green-300 rounded text-xs transition">🔍 Google Cache</button>
                          <a href={pdf.link} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition">🔗 Оригінал</a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {docs.length > 0 && (
                <div className="space-y-2">
                  {docs.map((doc, i) => (
                    <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                      <p className="text-white text-sm">{doc.title}</p>
                      <div className="flex gap-2">
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-blue-300 rounded-lg text-xs transition">Відкрити →</a>
                        <button onClick={() => setDocs(p => p.filter((_, idx) => idx !== i))} className="px-2 py-1.5 bg-red-950 hover:bg-red-900 text-red-400 rounded-lg text-xs transition">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {docs.length === 0 && osintPdfs.length === 0 && (
                <div className="text-center py-16 text-gray-600">
                  <p className="text-5xl mb-3">📁</p>
                  <p>Документи ще не додано</p>
                  <p className="text-sm mt-1">Запустіть OSINT або додайте посилання вручну</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ В/Ч ТА ТЕХНІКА ═══ */}
          {activeTab === 'unit' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card title="🏢 Військова частина">
                  <Field label="Підрозділ" value={person.unit} />
                  <Field label="Номер в/ч" value={person.unit_num} />
                  <Field label="Звання" value={person.rank} />
                  <Field label="Посада" value={person.position} />
                  <Field label="Військовий ID" value={person.military_id} />
                  <Field label="Регіон дислокації" value={person.region} />
                </Card>
                <Card title="⚙️ Матеріальна частина та озброєння">
                  <div className="text-center py-8 text-gray-600">
                    <p className="text-3xl mb-2">🔧</p>
                    <p className="text-sm">В розробці</p>
                    <p className="text-xs mt-1 text-gray-700">Тут буде техніка та озброєння підрозділу</p>
                  </div>
                </Card>
              </div>

              {/* Відкриті джерела — конкретні корисні посилання */}
              <Card title="🌐 Відкриті джерела по підрозділу">
                {(person.unit || person.unit_num) ? (
                  <div className="space-y-3">
                    <p className="text-gray-400 text-sm mb-4">
                      Підрозділ: <span className="text-white font-medium">{person.unit}</span>
                      {person.unit_num && <span className="text-gray-500 ml-2">({person.unit_num})</span>}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <a href={`https://www.google.com/search?q=${encodeURIComponent('"' + (person.unit_num || person.unit) + '" досьє злочини')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-3 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/50 rounded-lg text-center transition">
                        <p className="text-blue-400 font-medium text-sm">🔍 Злочини</p>
                        <p className="text-gray-500 text-xs mt-1">Пошук за в/ч + злочини</p>
                      </a>
                      <a href={`https://www.google.com/search?q=${encodeURIComponent('"' + (person.unit_num || person.unit) + '" Украина военные преступления')}&gl=ru&hl=ru`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-3 bg-red-900/20 hover:bg-red-900/40 border border-red-800/50 rounded-lg text-center transition">
                        <p className="text-red-400 font-medium text-sm">⚖️ МКС</p>
                        <p className="text-gray-500 text-xs mt-1">Пошук воєнних злочинів</p>
                      </a>
                      <a href={`https://www.oryxspioenkop.com/`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-3 bg-orange-900/20 hover:bg-orange-900/40 border border-orange-800/50 rounded-lg text-center transition">
                        <p className="text-orange-400 font-medium text-sm">📊 Oryx</p>
                        <p className="text-gray-500 text-xs mt-1">Підтверджені втрати техніки</p>
                      </a>
                      <a href={`https://deepstatemap.live/`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-3 bg-green-900/20 hover:bg-green-900/40 border border-green-800/50 rounded-lg text-center transition">
                        <p className="text-green-400 font-medium text-sm">🗺️ DeepState</p>
                        <p className="text-gray-500 text-xs mt-1">Актуальна карта фронту</p>
                      </a>
                      <a href={`https://www.google.com/search?q=${encodeURIComponent('"' + (person.unit_num || person.unit) + '" личный состав список')}&gl=ru&hl=ru`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-3 bg-purple-900/20 hover:bg-purple-900/40 border border-purple-800/50 rounded-lg text-center transition">
                        <p className="text-purple-400 font-medium text-sm">📋 Склад в/ч</p>
                        <p className="text-gray-500 text-xs mt-1">Список особового складу</p>
                      </a>
                      <a href={`https://www.google.com/search?q=${encodeURIComponent((person.unit_num || person.unit) + ' site:vk.com')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-3 bg-indigo-900/20 hover:bg-indigo-900/40 border border-indigo-800/50 rounded-lg text-center transition">
                        <p className="text-indigo-400 font-medium text-sm">💙 VK в/ч</p>
                        <p className="text-gray-500 text-xs mt-1">Сторінки підрозділу у VK</p>
                      </a>
                      <a href={`https://analytics.ulif.org.ua/index.php?gid=2132`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-3 bg-teal-900/20 hover:bg-teal-900/40 border border-teal-800/50 rounded-lg text-center transition">
                        <p className="text-teal-400 font-medium text-sm">📱 ULIF</p>
                        <p className="text-gray-500 text-xs mt-1">База ЗС РФ (Ontology)</p>
                      </a>
                      <a href={`https://www.google.com/search?q=${encodeURIComponent('"' + (person.unit_num || person.unit) + '" техника вооружение')}&gl=ru&hl=ru`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-3 bg-yellow-900/20 hover:bg-yellow-900/40 border border-yellow-800/50 rounded-lg text-center transition">
                        <p className="text-yellow-400 font-medium text-sm">🔫 Техніка</p>
                        <p className="text-gray-500 text-xs mt-1">Озброєння підрозділу</p>
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm">Підрозділ не вказано в картці</p>
                )}
              </Card>

              {/* Родичі з OSINT */}
              {osintRelatives.length > 0 && (
                <Card title="👨‍👩‍👧 Родичі (знайдено через OSINT)">
                  {osintRelatives.map(v => (
                    <div key={v.vector} className="mb-4">
                      <p className="text-gray-500 text-xs mb-2">Вектор: {v.label}</p>
                      <div className="space-y-2">
                        {v.results.map((r, i) => (
                          <div key={i} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                            <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-sm hover:text-blue-300">{r.title}</a>
                            {r.snippet && <p className="text-gray-400 text-xs mt-1">{r.snippet}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </Card>
              )}

              {person.tags?.length > 0 && (
                <Card title="🏷️ Теги">
                  <div className="flex flex-wrap gap-2">
                    {person.tags.map((tag: string, i: number) => (
                      <span key={i} className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm border border-gray-600">{tag}</span>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ═══ OSINT ═══ */}
          {activeTab === 'osint' && (
            <div>
              {!osintData && !osintLoading && !osintError && (
                <div className="text-center py-20">
                  <p className="text-6xl mb-4">🔍</p>
                  <p className="text-gray-400 text-lg mb-2">OSINT пошук не запущено</p>
                  <p className="text-gray-600 text-sm mb-6">Паралельний пошук по 18+ векторах: рос/укр мова, ДН, соцмережі, бази загиблих, родичі</p>
                  <button onClick={() => runOsint()} className="px-6 py-3 bg-purple-700 hover:bg-purple-600 rounded-lg font-medium transition">
                    🔍 Запустити OSINT Пошук
                  </button>
                </div>
              )}
              {osintLoading && (
                <div className="text-center py-20">
                  <p className="text-6xl mb-4">⟳</p>
                  <p className="text-purple-400 text-lg">Виконується пошук...</p>
                  <p className="text-gray-600 text-sm mt-2">Паралельний пошук по 18+ векторах</p>
                </div>
              )}
              {osintError && (
                <div className="bg-red-950 border border-red-700 rounded-xl p-4 text-red-300">❌ {osintError}</div>
              )}
              {/* Банер: знайдено в Миротворці */}
              {osintData && myrotvoretsOsintUrl && !person.myrotvorets_url && (
                <div className="mb-4 bg-yellow-950 border border-yellow-700 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-yellow-400 font-semibold text-sm">🇺🇦 Знайдено профіль у Миротворці!</p>
                    <p className="text-yellow-700 text-xs mt-1 font-mono truncate">{myrotvoretsOsintUrl}</p>
                  </div>
                  <button
                    onClick={() => {
                      setEnrichUrl(myrotvoretsOsintUrl)
                      setEnrichOpen(true)
                      // Скрол вгору до панелі
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium transition whitespace-nowrap shrink-0">
                    📥 Імпортувати дані
                  </button>
                </div>
              )}

              {osintData && (
                <div className="bg-gray-800 rounded-xl border border-purple-800 overflow-hidden">
                  <div className="bg-purple-950 border-b border-purple-800 px-5 py-4">
                    <h3 className="text-purple-300 font-semibold">🔍 OSINT Результати</h3>
                    <p className="text-purple-400 text-sm mt-0.5">
                      Знайдено <span className="text-white font-bold">{osintData.total}</span> результатів
                      по <span className="text-white font-bold">{osintData.vectorCount}</span> векторах •{' '}
                      {new Date(osintData.searchedAt).toLocaleString('uk-UA')}
                    </p>
                  </div>
                  <div className="flex gap-1 p-3 bg-gray-900 border-b border-gray-700 overflow-x-auto flex-wrap">
                    {osintData.vectors.map(v => (
                      <button key={v.vector} onClick={() => setActiveVector(v.vector)}
                        className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition ${
                          activeVector === v.vector ? 'bg-purple-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}>
                        {v.label} <span className="opacity-70">({v.count})</span>
                      </button>
                    ))}
                  </div>
                  {activeVectorData && (
                    <div className="p-4">
                      <p className="text-gray-600 text-xs mb-3">
                        Запит: <span className="text-gray-300 font-mono">{activeVectorData.query}</span>
                      </p>
                      <div className="space-y-3">
                        {activeVectorData.results.map((result, i) => {
                          const isPdf = result.link.toLowerCase().endsWith('.pdf') || result.title.toLowerCase().includes('[pdf]')
                          const isMyrotvorets = result.link?.includes('myrotvorets.center/criminal/')
                          return (
                            <div key={i} className={`rounded-lg p-4 border transition ${
                              isMyrotvorets
                                ? 'bg-yellow-950/40 border-yellow-700 hover:border-yellow-500'
                                : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                            }`}>
                              <div className="flex items-start justify-between gap-2">
                                <a href={result.link} target="_blank" rel="noopener noreferrer"
                                  className={`font-medium text-sm ${isMyrotvorets ? 'text-yellow-400 hover:text-yellow-300' : 'text-blue-400 hover:text-blue-300'}`}>
                                  {isMyrotvorets && '🇺🇦 '}{result.title}
                                </a>
                                {isMyrotvorets && !person.myrotvorets_url && (
                                  <button
                                    onClick={() => {
                                      setEnrichUrl(result.link)
                                      setEnrichOpen(true)
                                      window.scrollTo({ top: 0, behavior: 'smooth' })
                                    }}
                                    className="shrink-0 px-3 py-1 bg-yellow-700 hover:bg-yellow-600 text-white rounded text-xs font-medium transition">
                                    📥 Імпорт
                                  </button>
                                )}
                              </div>
                              <p className={`text-xs mt-1 truncate ${isMyrotvorets ? 'text-yellow-800' : 'text-green-700'}`}>{result.link}</p>
                              {result.snippet && <p className="text-gray-400 text-sm mt-2 leading-relaxed">{result.snippet}</p>}
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className={`text-xs px-2 py-0.5 rounded ${isMyrotvorets ? 'bg-yellow-900 text-yellow-600' : 'bg-gray-800 text-gray-500'}`}>{result.source}</span>
                                {result.relevanceScore !== undefined && (
                                  <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                                    result.relevanceScore >= 70 ? 'bg-green-900 text-green-400' :
                                    result.relevanceScore >= 40 ? 'bg-yellow-900 text-yellow-500' :
                                    'bg-red-950 text-red-500'
                                  }`}>
                                    rel: {result.relevanceScore}
                                  </span>
                                )}
                                {isPdf && (
                                  <>
                                    <button onClick={() => openWayback(result.link)} className="text-xs bg-blue-900 hover:bg-blue-800 text-blue-300 px-2 py-0.5 rounded transition">📦 Wayback</button>
                                    <button onClick={() => openGoogleCache(result.link)} className="text-xs bg-green-900 hover:bg-green-800 text-green-300 px-2 py-0.5 rounded transition">🔍 Cache</button>
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {osintData.total === 0 && (
                    <div className="p-8 text-center text-gray-600">Нічого не знайдено по жодному вектору</div>
                  )}
                </div>
              )}

              {/* ── Telegram блок ── */}
              <div className="mt-4 bg-gray-800 rounded-xl border border-blue-900 overflow-hidden">
                <div className="bg-blue-950 border-b border-blue-900 px-5 py-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-blue-300 font-semibold flex items-center gap-2">
                      ✈️ Telegram пошук
                      {tgResults.length > 0 && (
                        <span className="bg-blue-700 text-blue-100 text-xs px-2 py-0.5 rounded-full">{tgResults.length}</span>
                      )}
                    </h3>
                    {tgQuery && (
                      <p className="text-blue-600 text-xs mt-0.5">Запит: <span className="font-mono text-blue-400">{tgQuery}</span></p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Інший запит..."
                      className="px-3 py-1.5 bg-gray-900 border border-blue-800 rounded-lg text-white text-xs w-44 focus:border-blue-500 focus:outline-none"
                      onKeyDown={e => {
                        if (e.key === 'Enter') runTelegramSearch((e.target as HTMLInputElement).value)
                      }}
                    />
                    <button
                      onClick={() => runTelegramSearch()}
                      disabled={tgLoading || tgFullLoading}
                      className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1 whitespace-nowrap">
                      {tgLoading ? <><span className="animate-spin inline-block">⟳</span> Пошук...</> : '🔍 Швидко'}
                    </button>
                    <button
                      onClick={() => runTelegramFull()}
                      disabled={tgFullLoading || tgLoading}
                      title="Пошук через всі 10 ботів (~40с)"
                      className="px-3 py-1.5 bg-purple-800 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1 whitespace-nowrap">
                      {tgFullLoading
                        ? <><span className="animate-spin inline-block">⟳</span> Всі боти...</>
                        : '🤖 Всі боти'}
                    </button>
                  </div>
                </div>

                {tgError && (
                  <div className="px-5 py-3 text-sm text-yellow-400 bg-yellow-950/30 flex items-center gap-2">
                    ⚠️ {tgError}
                    {tgError.includes('unavailable') || tgError.includes('недоступний') ? (
                      <span className="text-yellow-600 text-xs ml-1">— перевірте чи запущено telegram_search.py на VPS</span>
                    ) : null}
                  </div>
                )}

                {tgLoading && (
                  <div className="px-5 py-6 text-center text-blue-400 text-sm">
                    <span className="animate-spin inline-block mr-2 text-xl">⟳</span>
                    Пошук у Telegram...
                  </div>
                )}

                {!tgLoading && !tgError && tgResults.length === 0 && tgQuery && (
                  <div className="px-5 py-6 text-center text-gray-600 text-sm">Нічого не знайдено у Telegram</div>
                )}

                {!tgLoading && !tgQuery && !tgError && (
                  <div className="px-5 py-6 text-center text-gray-600 text-sm">
                    Натисніть "Шукати" або запустіть OSINT — Telegram пошук запуститься автоматично
                  </div>
                )}

                {tgResults.length > 0 && (() => {
                  // Збираємо телефони / email / ІПН для поглибленого пошуку
                  const enrichTargets: { value: string; label: string }[] = []
                  const seen = new Set<string>()
                  for (const r of tgResults) {
                    const f = r.fields || {}
                    const phones = [f.phone, ...(Array.isArray(f.phones_list) ? f.phones_list : [])].filter(Boolean)
                    for (const p of phones) {
                      const pStr = String(p)
                      if (!seen.has(pStr)) { seen.add(pStr); enrichTargets.push({ value: pStr, label: `📞 ${pStr}` }) }
                    }
                    if (f.email && !seen.has(String(f.email))) {
                      seen.add(String(f.email)); enrichTargets.push({ value: String(f.email), label: `✉ ${f.email}` })
                    }
                    if (f.inn && !seen.has(String(f.inn))) {
                      seen.add(String(f.inn)); enrichTargets.push({ value: String(f.inn), label: `🔢 ${f.inn}` })
                    }
                  }
                  return (
                    <>
                      {enrichTargets.length > 0 && (
                        <div className="px-5 py-4 bg-blue-950/20 border-b border-blue-900/50">
                          <p className="text-blue-400 text-xs font-medium mb-2">🔍 Поглиблений пошук по знайдених даних:</p>
                          <div className="flex flex-wrap gap-2">
                            {enrichTargets.map(t => (
                              <button
                                key={t.value}
                                onClick={() => runTelegramEnrich(t.value)}
                                disabled={tgEnrichLoading.has(t.value)}
                                className="px-3 py-1.5 bg-blue-900/40 hover:bg-blue-900/70 border border-blue-800 text-blue-300 rounded-lg text-xs font-medium transition disabled:opacity-60 flex items-center gap-1.5">
                                {tgEnrichLoading.has(t.value) && <span className="animate-spin inline-block">⟳</span>}
                                {t.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-blue-800 text-xs mt-2">Натисніть щоб шукати через PHONE_BOTS — результати додадуться до списку</p>
                        </div>
                      )}
                    </>
                  )
                })()}

                {tgResults.length > 0 && (
                  <div className="divide-y divide-gray-700/50">
                    {tgResults.map((r: any, i: number) => {
                      const f = r.fields || {}
                      const hasData = Object.keys(f).some(k => f[k])
                      return (
                        <div key={i} className="px-5 py-4 hover:bg-gray-700/20 transition">
                          {/* Заголовок секції */}
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                                r.from_phone
                                  ? 'text-green-300 bg-green-950 border-green-700'
                                  : 'text-blue-300 bg-blue-950 border-blue-800'
                              }`}>
                                {r.source_label || r.source}
                              </span>
                              {r.name && <span className="text-white text-sm font-semibold">{r.name}</span>}
                              {r.username && (
                                <a href={r.url || `https://t.me/${r.username.replace('@','')}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="text-blue-400 text-xs hover:underline font-mono">
                                  {r.username}
                                </a>
                              )}
                              {r.tg_id && <span className="text-gray-600 text-xs font-mono">ID: {r.tg_id}</span>}
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {r.url && (
                                <a href={r.url} target="_blank" rel="noopener noreferrer"
                                  className="px-2.5 py-1 bg-blue-900 hover:bg-blue-800 text-blue-300 rounded text-xs transition">
                                  ↗
                                </a>
                              )}
                              {hasData && (
                                <button
                                  onClick={() => saveTelegramDataToPerson(f, tgResults)}
                                  className="px-3 py-1 bg-green-800 hover:bg-green-700 text-green-200 rounded text-xs font-medium transition">
                                  💾 Зберегти до картки
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Структуровані поля */}
                          {hasData && (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                              {f.phone && (
                                <div className="bg-green-950/40 border border-green-800/50 rounded px-2.5 py-1.5">
                                  <p className="text-green-600 text-xs">Телефон</p>
                                  <p className="text-green-300 font-mono text-sm">📞 {f.phone}</p>
                                </div>
                              )}
                              {f.phones_list?.length > 0 && f.phones_list.map((ph: string, pi: number) => (
                                <div key={pi} className="bg-green-950/40 border border-green-800/50 rounded px-2.5 py-1.5">
                                  <p className="text-green-600 text-xs">Телефон {pi + 1}</p>
                                  <p className="text-green-300 font-mono text-sm">📞 {ph}</p>
                                </div>
                              ))}
                              {f.passport && (
                                <div className="bg-yellow-950/40 border border-yellow-800/50 rounded px-2.5 py-1.5">
                                  <p className="text-yellow-600 text-xs">Паспорт</p>
                                  <p className="text-yellow-300 font-mono text-sm">🛂 {f.series ? `${f.series} ` : ''}{f.passport}</p>
                                </div>
                              )}
                              {f.snils && (
                                <div className="bg-purple-950/40 border border-purple-800/50 rounded px-2.5 py-1.5">
                                  <p className="text-purple-600 text-xs">СНІЛС</p>
                                  <p className="text-purple-300 font-mono text-sm">{f.snils}</p>
                                </div>
                              )}
                              {f.inn && (
                                <div className="bg-indigo-950/40 border border-indigo-800/50 rounded px-2.5 py-1.5">
                                  <p className="text-indigo-600 text-xs">ІПН</p>
                                  <p className="text-indigo-300 font-mono text-sm">{f.inn}</p>
                                </div>
                              )}
                              {f.address && (
                                <div className="bg-orange-950/40 border border-orange-800/50 rounded px-2.5 py-1.5 col-span-2">
                                  <p className="text-orange-600 text-xs">Адреса</p>
                                  <p className="text-orange-300 text-sm">📍 {f.address}</p>
                                </div>
                              )}
                              {f.rank && (
                                <div className="bg-red-950/40 border border-red-800/50 rounded px-2.5 py-1.5">
                                  <p className="text-red-600 text-xs">Звання</p>
                                  <p className="text-red-300 text-sm">⚔️ {f.rank}</p>
                                </div>
                              )}
                              {f.unit && (
                                <div className="bg-red-950/40 border border-red-800/50 rounded px-2.5 py-1.5 col-span-2">
                                  <p className="text-red-600 text-xs">В/Ч</p>
                                  <p className="text-red-300 text-sm">🏢 {f.unit}</p>
                                </div>
                              )}
                              {f.personal_num && (
                                <div className="bg-red-950/40 border border-red-800/50 rounded px-2.5 py-1.5">
                                  <p className="text-red-600 text-xs">Особ. номер</p>
                                  <p className="text-red-300 font-mono text-sm">{f.personal_num}</p>
                                </div>
                              )}
                              {f.gender && (
                                <div className="bg-pink-950/40 border border-pink-800/50 rounded px-2.5 py-1.5">
                                  <p className="text-pink-600 text-xs">Стать</p>
                                  <p className="text-pink-300 text-sm">{String(f.gender).toUpperCase() === 'M' ? '♂ Чоловіча' : '♀ Жіноча'}</p>
                                </div>
                              )}
                              {f.dl_categories && (
                                <div className="bg-cyan-950/40 border border-cyan-800/50 rounded px-2.5 py-1.5">
                                  <p className="text-cyan-600 text-xs">Категорії прав</p>
                                  <p className="text-cyan-300 text-sm">🚗 {f.dl_categories}</p>
                                </div>
                              )}
                              {f.passport_issuer && (
                                <div className="bg-yellow-950/40 border border-yellow-800/50 rounded px-2.5 py-1.5 col-span-2">
                                  <p className="text-yellow-600 text-xs">Паспорт видано ким</p>
                                  <p className="text-yellow-300 text-sm">{f.passport_issuer}</p>
                                </div>
                              )}
                              {(f.dl_issue_date || f.dl_expiry) && (
                                <div className="bg-cyan-950/40 border border-cyan-800/50 rounded px-2.5 py-1.5 col-span-2">
                                  <p className="text-cyan-600 text-xs">Терміни ВП</p>
                                  <p className="text-cyan-300 text-sm">
                                    {f.dl_issue_date ? `видано: ${f.dl_issue_date}` : ''}
                                    {f.dl_issue_date && f.dl_expiry ? ' — ' : ''}
                                    {f.dl_expiry ? `до: ${f.dl_expiry}` : ''}
                                  </p>
                                </div>
                              )}
                              {f.name && (
                                <div className="bg-blue-950/40 border border-blue-800/50 rounded px-2.5 py-1.5 col-span-2">
                                  <p className="text-blue-600 text-xs">ПІБ (з джерела)</p>
                                  <p className="text-blue-300 text-sm font-medium">{f.name}</p>
                                </div>
                              )}
                              {f.dob && (
                                <div className="bg-blue-950/40 border border-blue-800/50 rounded px-2.5 py-1.5">
                                  <p className="text-blue-600 text-xs">Дата народження</p>
                                  <p className="text-blue-300 font-mono text-sm">🎂 {f.dob}</p>
                                </div>
                              )}
                              {f.tab_num && (
                                <div className="bg-red-950/40 border border-red-800/50 rounded px-2.5 py-1.5">
                                  <p className="text-red-600 text-xs">Табельний №</p>
                                  <p className="text-red-300 font-mono text-sm">🆔 {f.tab_num}</p>
                                </div>
                              )}
                              {f.region && (
                                <div className="bg-gray-800/80 border border-gray-600/50 rounded px-2.5 py-1.5 col-span-2">
                                  <p className="text-gray-500 text-xs">Регіон</p>
                                  <p className="text-gray-300 text-sm">🗺️ {f.region}</p>
                                </div>
                              )}
                              {f.car_info && (
                                <div className="bg-gray-800/80 border border-gray-600/50 rounded px-2.5 py-1.5 col-span-2">
                                  <p className="text-gray-500 text-xs">Авто{f.vin ? ' / VIN' : ''}</p>
                                  <p className="text-gray-300 text-sm">🚗 {f.car_info}{f.vin ? ` · ${f.vin}` : ''}</p>
                                </div>
                              )}
                              {f.credit_card && (
                                <div className="bg-yellow-950/30 border border-yellow-800/30 rounded px-2.5 py-1.5">
                                  <p className="text-yellow-700 text-xs">Карта (маск.)</p>
                                  <p className="text-yellow-600 font-mono text-sm">💳 {f.credit_card}</p>
                                </div>
                              )}
                              {f.relatives && (
                                <div className="bg-teal-950/40 border border-teal-800/50 rounded px-2.5 py-1.5 col-span-3">
                                  <p className="text-teal-600 text-xs">Родичі</p>
                                  <p className="text-teal-300 text-sm">👪 {f.relatives}</p>
                                </div>
                              )}
                              {f.vk && (
                                <div className="bg-blue-950/40 border border-blue-800/50 rounded px-2.5 py-1.5 col-span-2">
                                  <p className="text-blue-600 text-xs">VK</p>
                                  <a href={f.vk} target="_blank" rel="noopener noreferrer" className="text-blue-300 text-sm hover:underline truncate block">💙 {f.vk}</a>
                                </div>
                              )}
                              {f.ok && (
                                <div className="bg-orange-950/40 border border-orange-800/50 rounded px-2.5 py-1.5 col-span-2">
                                  <p className="text-orange-600 text-xs">OK.ru</p>
                                  <a href={f.ok} target="_blank" rel="noopener noreferrer" className="text-orange-300 text-sm hover:underline truncate block">🟠 {f.ok}</a>
                                </div>
                              )}
                              {f.instagram && (
                                <div className="bg-pink-950/40 border border-pink-800/50 rounded px-2.5 py-1.5 col-span-2">
                                  <p className="text-pink-600 text-xs">Instagram</p>
                                  <a href={f.instagram} target="_blank" rel="noopener noreferrer" className="text-pink-300 text-sm hover:underline truncate block">📸 {f.instagram}</a>
                                </div>
                              )}
                              {f.facebook && (
                                <div className="bg-blue-950/40 border border-blue-800/50 rounded px-2.5 py-1.5 col-span-2">
                                  <p className="text-blue-600 text-xs">Facebook</p>
                                  <a href={f.facebook} target="_blank" rel="noopener noreferrer" className="text-blue-300 text-sm hover:underline truncate block">👤 {f.facebook}</a>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Повний текст (згорнутий) */}
                          {r.snippet && (
                            <details className="mt-1">
                              <summary className="text-gray-600 text-xs cursor-pointer hover:text-gray-400">
                                Повний текст ({r.snippet.length} символів)
                              </summary>
                              <pre className="text-gray-400 text-xs mt-2 whitespace-pre-wrap leading-relaxed bg-gray-900 rounded p-3 max-h-64 overflow-y-auto">
                                {r.snippet}
                              </pre>
                            </details>
                          )}
                        </div>
                      )
                    })}
                    {/* Кнопка "Зберегти все" знизу списку результатів */}
                    <SaveAllButton results={tgResults} allRaw={tgRawAll} onSave={saveTelegramDataToPerson} />
                  </div>
                )}

                {/* ── Full-bots results (async job) ── */}
                {(tgFullLoading || tgFullError || tgFullResults.length > 0) && (
                  <div className="border-t border-blue-900/50 px-5 py-4">
                    <p className="text-purple-400 text-xs font-medium mb-3 flex items-center gap-2">
                      🤖 Результати (всі боти)
                      {tgFullLoading && <span className="text-purple-600 text-xs">— пошук триває{tgFullJobId ? ` (job: ${tgFullJobId})` : ''}...</span>}
                      {tgFullResults.length > 0 && <span className="bg-purple-800 text-purple-200 px-1.5 py-0.5 rounded-full text-xs">{tgFullResults.length}</span>}
                    </p>
                    {tgFullError && <p className="text-red-400 text-xs mb-2">⚠️ {tgFullError}</p>}
                    {tgFullLoading && tgFullResults.length === 0 && (
                      <p className="text-purple-600 text-sm text-center py-4">
                        <span className="animate-spin inline-block mr-2">⟳</span>
                        Опитуємо 10 Telegram ботів... (~40с)
                      </p>
                    )}
                    {tgFullResults.length > 0 && (
                      <div className="space-y-2">
                        {tgFullResults.map((r: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg bg-purple-950/20 border border-purple-800/30 text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-purple-300 font-medium text-xs">{r.source_label || r.source || r._src}</span>
                              {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs flex-shrink-0">↗</a>}
                            </div>
                            {r.name && <p className="text-gray-200 mt-1">{r.name}</p>}
                            {r.snippet && <p className="text-gray-400 text-xs mt-1 line-clamp-3">{r.snippet}</p>}
                            {r.fields && Object.keys(r.fields).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                                {Object.entries(r.fields).slice(0, 6).map(([k, v]) => v ? (
                                  <span key={k} className="text-xs text-gray-400"><span className="text-gray-600">{k}:</span> {String(v).slice(0, 40)}</span>
                                ) : null)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ═══ НОТАТКИ ═══ */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card title="📝 Загальні нотатки">
                  {person.notes ? <p className="text-gray-300 text-sm whitespace-pre-wrap">{person.notes}</p>
                    : <p className="text-gray-600 text-sm">Нотатки відсутні</p>}
                </Card>
                <Card title="🔬 Аналітичні нотатки">
                  {person.analyst_notes ? <p className="text-gray-300 text-sm whitespace-pre-wrap">{person.analyst_notes}</p>
                    : <p className="text-gray-600 text-sm">Аналітичні нотатки відсутні</p>}
                </Card>
              </div>
              {(person.sources || person.source) && (
                <Card title="📎 Джерела">
                  <p className="text-gray-300 text-sm">{person.sources || person.source}</p>
                </Card>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
