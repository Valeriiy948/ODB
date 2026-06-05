'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import {
  deduplicateTgResults,
  filterTgByQuery,
} from '../utils/person-utils'

export function usePersonPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const personId = String(params.id)

  // ── Core ─────────────────────────────────────────────────────────────────────
  const [person,    setPerson]    = useState<any>(null)
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [osintAutoRan, setOsintAutoRan] = useState(false)

  // ── Photo ─────────────────────────────────────────────────────────────────────
  const [photoUrl,        setPhotoUrl]        = useState('')
  const [editingPhoto,    setEditingPhoto]     = useState(false)
  const [savingPhoto,     setSavingPhoto]      = useState(false)
  const [photoLightboxIdx, setPhotoLightboxIdx] = useState<number | null>(null)
  const [addingPhotoUrl,  setAddingPhotoUrl]   = useState('')
  const [savingNewPhoto,  setSavingNewPhoto]   = useState(false)
  const [showPhotoSearch, setShowPhotoSearch]  = useState(false)

  // ── Evidence ──────────────────────────────────────────────────────────────────
  const [evidenceItems, setEvidenceItems] = useState<any[]>([])

  // ── OSINT (web search) ────────────────────────────────────────────────────────
  const [osintLoading,    setOsintLoading]    = useState(false)
  const [osintData,       setOsintData]       = useState<any>(null)
  const [osintError,      setOsintError]      = useState('')
  const [activeVector,    setActiveVector]    = useState<string | null>(null)
  const [personMentions,  setPersonMentions]  = useState<any[]>([])

  // ── AI ────────────────────────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState('')

  // ── VK ────────────────────────────────────────────────────────────────────────
  const [vkLoading,   setVkLoading]   = useState(false)
  const [vkProfiles,  setVkProfiles]  = useState<any[]>([])
  const [vkError,     setVkError]     = useState('')

  // ── OpenDataBot / ЄДР ─────────────────────────────────────────────────────────
  const [odbLoading,  setOdbLoading]  = useState(false)
  const [odbResults,  setOdbResults]  = useState<any[]>([])
  const [odbError,    setOdbError]    = useState('')

  // ── Транспорт ─────────────────────────────────────────────────────────────────
  const [vehiclesLoading, setVehiclesLoading] = useState(false)
  const [vehiclesResults, setVehiclesResults] = useState<any[]>([])
  const [vehiclesError,   setVehiclesError]   = useState('')

  // ── Пошук за фото ─────────────────────────────────────────────────────────────
  const [faceLoading,  setFaceLoading]  = useState(false)
  const [faceResults,  setFaceResults]  = useState<any[]>([])
  const [faceError,    setFaceError]    = useState('')

  // ── Кадастр ───────────────────────────────────────────────────────────────────
  const [kadasterLoading, setKadasterLoading] = useState(false)
  const [kadasterResults, setKadasterResults] = useState<any[]>([])
  const [kadasterError,   setKadasterError]   = useState('')

  // ── Некрологи ─────────────────────────────────────────────────────────────────
  const [obitsLoading, setObitsLoading] = useState(false)
  const [obitsResults, setObitsResults] = useState<any[]>([])
  const [obitsError,   setObitsError]   = useState('')

  // ── VPN Search ────────────────────────────────────────────────────────────────
  const [vpnLoading,  setVpnLoading]  = useState(false)
  const [vpnResults,  setVpnResults]  = useState<any[]>([])
  const [vpnError,    setVpnError]    = useState('')

  // ── Leaks DB ──────────────────────────────────────────────────────────────────
  const [leaksLoading, setLeaksLoading] = useState(false)
  const [leaksResults, setLeaksResults] = useState<any[]>([])
  const [leaksError,   setLeaksError]   = useState('')

  // ── Telegram phone lookup ─────────────────────────────────────────────────────
  const [tgPhoneLoading, setTgPhoneLoading] = useState(false)
  const [tgPhoneResults, setTgPhoneResults] = useState<any[]>([])
  const [tgPhoneError,   setTgPhoneError]   = useState('')

  // ── Photo collection ──────────────────────────────────────────────────────────
  const [photoCollLoading, setPhotoCollLoading] = useState(false)
  const [photoCollMsg,     setPhotoCollMsg]     = useState('')

  // ── WhatsApp / Viber presence ─────────────────────────────────────────────────
  const [presenceLoading, setPresenceLoading] = useState(false)
  const [presenceResults, setPresenceResults] = useState<any[]>([])
  const [presenceError,   setPresenceError]   = useState('')

  // ── Реєстри ───────────────────────────────────────────────────────────────────
  const [regLoading,      setRegLoading]      = useState(false)
  const [regAutoRan,      setRegAutoRan]      = useState(false)
  const [regNazk,         setRegNazk]         = useState<any>(null)
  const [regMyrotvorets,  setRegMyrotvorets]  = useState<any>(null)
  const [regErb,          setRegErb]          = useState<any>(null)
  const [regMvs,          setRegMvs]          = useState<any>(null)
  const [regSanctions,    setRegSanctions]    = useState<any>(null)
  const [regCompany,      setRegCompany]      = useState<any>(null)

  // ── FindFace / FindClone ──────────────────────────────────────────────────────
  const [findFaceLoading, setFindFaceLoading] = useState(false)
  const [findFaceResults, setFindFaceResults] = useState<any[]>([])
  const [findFaceError,   setFindFaceError]   = useState('')

  // ── Telegram search ───────────────────────────────────────────────────────────
  const [tgLoading,       setTgLoading]       = useState(false)
  const [tgResults,       setTgResults]       = useState<any[]>([])
  const [tgRawAll,        setTgRawAll]        = useState<any[]>([])
  const [tgError,         setTgError]         = useState('')
  const [tgQuery,         setTgQuery]         = useState('')
  const [tgEnrichLoading, setTgEnrichLoading] = useState<Set<string>>(new Set())
  const [tgFullLoading,   setTgFullLoading]   = useState(false)
  const [tgFullJobId,     setTgFullJobId]     = useState<string | null>(null)
  const [tgFullError,     setTgFullError]     = useState('')
  const [tgFullResults,   setTgFullResults]   = useState<any[]>([])

  // ── OsintKit ──────────────────────────────────────────────────────────────────
  const [osintKitLoading, setOsintKitLoading] = useState(false)
  const [osintKitResults, setOsintKitResults] = useState<any[]>([])
  const [osintKitTotal,   setOsintKitTotal]   = useState(0)
  const [osintKitError,   setOsintKitError]   = useState('')
  const [osintKitRan,     setOsintKitRan]     = useState(false)
  const [osintKitSaving,  setOsintKitSaving]  = useState(false)
  const [osintKitSaved,   setOsintKitSaved]   = useState(false)

  // ── LeakOsint ─────────────────────────────────────────────────────────────────
  const [leakOsintLoading, setLeakOsintLoading] = useState(false)
  const [leakOsintResults, setLeakOsintResults] = useState<any[]>([])
  const [leakOsintTotal,   setLeakOsintTotal]   = useState(0)
  const [leakOsintError,   setLeakOsintError]   = useState('')
  const [leakOsintRan,     setLeakOsintRan]     = useState(false)
  const [leakOsintSaving,  setLeakOsintSaving]  = useState(false)
  const [leakOsintSaved,   setLeakOsintSaved]   = useState(false)

  // ── Медіа (videos + docs) ─────────────────────────────────────────────────────
  const [videos,    setVideos]    = useState<{ url: string; note: string }[]>([])
  const [videoUrl,  setVideoUrl]  = useState('')
  const [videoNote, setVideoNote] = useState('')
  const [docs,      setDocs]      = useState<{ url: string; title: string }[]>([])
  const [docUrl,    setDocUrl]    = useState('')
  const [docTitle,  setDocTitle]  = useState('')

  // ── Інциденти ─────────────────────────────────────────────────────────────────
  const [incidents,        setIncidents]        = useState<any[]>([])
  const [incidentsLoading, setIncidentsLoading] = useState(false)
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [incidentTitle,    setIncidentTitle]    = useState('')
  const [incidentDate,     setIncidentDate]     = useState('')
  const [incidentLocation, setIncidentLocation] = useState('')
  const [incidentType,     setIncidentType]     = useState('unknown')
  const [incidentDesc,     setIncidentDesc]     = useState('')
  const [incidentIcc,      setIncidentIcc]      = useState('')
  const [incidentSeverity, setIncidentSeverity] = useState('medium')
  const [incidentRole,     setIncidentRole]     = useState('виконавець')
  const [savingIncident,   setSavingIncident]   = useState(false)

  // ── Збагачення з Миротворця ───────────────────────────────────────────────────
  const [enrichOpen,     setEnrichOpen]     = useState(false)
  const [enrichUrl,      setEnrichUrl]      = useState('')
  const [enrichLoading,  setEnrichLoading]  = useState(false)
  const [enrichResult,   setEnrichResult]   = useState<any>(null)
  const [enrichError,    setEnrichError]    = useState('')
  const [enrichHtmlMode, setEnrichHtmlMode] = useState(false)
  const [enrichHtml,     setEnrichHtml]     = useState('')

  // ── Derived values ────────────────────────────────────────────────────────────
  const personName = person
    ? (person.name_ukr || person.name_rus || person.name || 'Невідомо')
    : ''

  const evidencePhotos: string[] = evidenceItems
    .filter(e => e.ev_type === 'photo')
    .map(e => e.file_url as string)
    .filter(Boolean)

  const allPersonPhotos: string[] = person ? [
    ...(person.photo_url ? [person.photo_url] : []),
    ...((person.person_photos || []) as any[])
      .filter((p: any) => p.source === 'manual' && p.url)
      .map((p: any) => p.url as string),
    ...evidencePhotos,
  ].filter((url, idx, arr) => url && arr.indexOf(url) === idx) : []

  const activeVectorData = osintData?.vectors?.find((v: any) => v.vector === activeVector)
  const personSurnameForFilter = (person?.name_rus || person?.name || '').split(' ')[0]?.toLowerCase() || ''

  const osintPdfsAll = osintData?.vectors?.flatMap((v: any) =>
    v.results.filter((r: any) =>
      r.link.toLowerCase().endsWith('.pdf') || r.title.toLowerCase().includes('[pdf]')
    )
  ) ?? []

  const osintPdfs = osintPdfsAll.filter((r: any) => {
    const rel = r.relevanceScore ?? 100
    if (rel >= 60) return true
    if (personSurnameForFilter.length >= 4) {
      return `${r.title} ${r.snippet || ''}`.toLowerCase().includes(personSurnameForFilter)
    }
    return rel >= 45
  })

  const osintRelatives = osintData?.vectors?.filter((v: any) =>
    v.vector === 'relatives' || v.vector === 'relatives_vk'
  ) ?? []

  const myrotvoretsOsintUrl = osintData?.vectors
    ?.flatMap((v: any) => v.results)
    ?.find((r: any) => r.link?.includes('myrotvorets.center/criminal/'))?.link ?? null

  const photoSearchEngines = person ? [
    { label: 'Yandex (обличчя)', desc: 'Найкращий для РФ/СНД', color: 'text-red-400', border: 'border-red-800', bg: 'bg-red-950/20',
      url: person.photo_url ? `https://yandex.ru/images/search?rpt=imageview&url=${encodeURIComponent(person.photo_url)}` : `https://yandex.ru/images/search?text=${encodeURIComponent(personName)}` },
    { label: 'Google Images', desc: 'Глобальний зворотній пошук', color: 'text-blue-400', border: 'border-blue-800', bg: 'bg-blue-950/20',
      url: person.photo_url ? `https://images.google.com/searchbyimage?image_url=${encodeURIComponent(person.photo_url)}` : `https://www.google.com/search?q=${encodeURIComponent('"' + personName + '"')}&tbm=isch` },
    { label: 'Search4Faces', desc: 'VK / OK.ru — 160M+ фото', color: 'text-green-400', border: 'border-green-800', bg: 'bg-green-950/20', url: 'https://search4faces.com/' },
    { label: 'TinEye', desc: 'Знайти де ще є це фото', color: 'text-purple-400', border: 'border-purple-800', bg: 'bg-purple-950/20',
      url: person.photo_url ? `https://www.tineye.com/search/?url=${encodeURIComponent(person.photo_url)}` : 'https://www.tineye.com/' },
    { label: 'PimEyes', desc: 'Глибокий пошук по обличчю', color: 'text-yellow-400', border: 'border-yellow-800', bg: 'bg-yellow-950/20', url: 'https://pimeyes.com/' },
    { label: 'FaceCheck.ID', desc: 'Широкий веб-пошук', color: 'text-orange-400', border: 'border-orange-800', bg: 'bg-orange-950/20', url: 'https://facecheck.id/' },
  ] : []

  // ── Init ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const res = await fetch(`/api/persons/${personId}`)
        if (!res.ok) { setLoading(false); return }
        const data = await res.json()
        setPerson(data)
        if (data.photo_url) setPhotoUrl(data.photo_url)
        setLoading(false)
        loadIncidents()
        try {
          const { data: mentions } = await supabase
            .from('person_mentions').select('*')
            .eq('person_id', personId).eq('source_type', 'web')
            .order('created_at', { ascending: false }).limit(20)
          if (mentions) setPersonMentions(mentions)
        } catch {}
        const pName = data?.name_ukr || data?.name_rus || data?.name || ''
        if (pName.length >= 3) {
          setTimeout(() => runRegistriesCheck(pName), 1000)
        }
        setTimeout(async () => {
          try {
            const enrichRes = await fetch(`/api/persons/${personId}/enrich`)
            const enrichData = await enrichRes.json()
            if (enrichData.found && enrichData.url && !data.myrotvorets_url) {
              setEnrichUrl(enrichData.url); setEnrichOpen(true)
            }
          } catch {}
        }, 800)
      } catch { setLoading(false) }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId])

  useEffect(() => {
    if (!person?.id) return
    fetch(`/api/evidence/${person.id}?type=person`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.evidence)) setEvidenceItems(d.evidence) })
      .catch(() => {})
  }, [person?.id])

  useEffect(() => {
    if (activeTab !== 'osint' || osintAutoRan || !person) return
    setOsintAutoRan(true)
    if (!osintKitRan) runOsintKit()
    if (!leakOsintRan) runLeakOsint()
    const tgQ = [person.name_rus, person.name_ukr, person.name].find(n => n?.trim().length >= 3) || ''
    if (tgQ.length >= 3) runTelegramSearch(tgQ)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, person])

  // ── Functions ─────────────────────────────────────────────────────────────────

  async function loadIncidents() {
    setIncidentsLoading(true)
    try {
      const res = await fetch(`/api/incidents?person_id=${personId}`)
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
          body: JSON.stringify({ person_id: personId, role: incidentRole }),
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
    const tgQ = person?.name_rus || person?.name_ukr || person?.name || ''
    if (tgQ.length >= 3) runTelegramSearch(tgQ)
    try {
      const res = await fetch(`/api/osint/search/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) { setOsintError(data.error) }
      else {
        setOsintData(data)
        if (data.vectors?.length > 0) setActiveVector(data.vectors[0].vector)
        try {
          const { data: mentions } = await supabase
            .from('person_mentions').select('*')
            .eq('person_id', personId).eq('source_type', 'web')
            .order('created_at', { ascending: false }).limit(20)
          if (mentions) setPersonMentions(mentions)
        } catch {}
      }
    } catch { setOsintError('Помилка OSINT пошуку') }
    setOsintLoading(false)
  }

  async function runOsintKit() {
    setOsintKitLoading(true); setOsintKitError(''); setOsintKitRan(true)
    try {
      const aiObj: any = (() => {
        const raw = person.ai_profile
        if (!raw) return null
        if (typeof raw === 'object') return raw
        try { return JSON.parse(raw as string) } catch { return null }
      })()
      const aiP0 = aiObj?.persons?.[0] || null
      const queries: { fields: Record<string,string>; label: string }[] = []
      const inn = String(person.ipn || aiP0?.inn || '').replace(/\D/g,'')
      if (inn.length >= 10) queries.push({ fields: { inn }, label: `ІПН: ${inn}` })
      const snils = (person.snils || aiP0?.snils || '').replace(/\D/g,'')
      if (snils.length >= 9) queries.push({ fields: { snils }, label: `СНІЛС: ${snils}` })
      const phones: string[] = [...(aiP0?.phones || []), ...(Array.isArray(person.phones) ? person.phones : [])]
        .map((p: string) => p.replace(/\D/g,'')).filter(p => p.length >= 9)
      for (const phone of [...new Set(phones)].slice(0, 5))
        queries.push({ fields: { phone }, label: `Телефон: ${phone}` })
      const passports: string[] = [...(person.passport ? [person.passport] : []), ...(aiP0?.passports || [])].filter(Boolean)
      for (const passport of [...new Set(passports)].slice(0, 2))
        queries.push({ fields: { passport }, label: `Паспорт: ${passport}` })
      if (queries.length === 0) {
        const name = person.name_rus || person.name_ukr || person.name
        if (name) {
          const f: Record<string,string> = { name }
          if (person.dob) {
            const dobMatch = String(person.dob).match(/^(\d{4})-(\d{2})-(\d{2})$/)
            if (dobMatch) f.dob = `${dobMatch[3]}.${dobMatch[2]}.${dobMatch[1]}`
          }
          queries.push({ fields: f, label: `Ім'я: ${name}` })
        }
      }
      if (queries.length === 0) { setOsintKitError('Недостатньо ідентифікаторів'); return }
      const results = await Promise.all(
        queries.map(async ({ fields }) => {
          try {
            const res = await fetch('/api/breach/search', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields }),
            })
            const data = await res.json()
            const ok = data.sources?.osintkit
            if (ok?.error || !ok?.entries?.length) return []
            return ok.entries
          } catch { return [] }
        })
      )
      const seen = new Set<string>()
      const allEntries: any[] = []
      for (const batch of results) {
        for (const entry of batch) {
          const key = `${entry.database || ''}|${entry.name || ''}|${entry.phone || ''}`
          if (!seen.has(key)) { seen.add(key); allEntries.push(entry) }
        }
      }
      setOsintKitResults(allEntries); setOsintKitTotal(allEntries.length)
    } catch (e: any) { setOsintKitError(e.message) }
    finally { setOsintKitLoading(false) }
  }

  async function saveLeakDataToDb(
    entries: any[], sourceName: string,
    setSaving: (v: boolean) => void, setSaved: (v: boolean) => void,
  ) {
    setSaving(true)
    try {
      const uniq = (a: string[]) => [...new Set(a.filter(Boolean))]
      const phones = uniq(entries.flatMap(e => {
        const all: string[] = []
        if (e.phone) all.push(String(e.phone).replace(/\D/g,''))
        if (e.extra_phones) all.push(...String(e.extra_phones).split(/[,;]/).map((s: string) => s.replace(/\D/g,'')))
        return all.filter(p => p.length >= 9)
      }))
      const emails    = uniq(entries.flatMap(e => e.email    ? [String(e.email).toLowerCase().trim()] : []))
      const addresses = uniq(entries.flatMap(e => e.address  ? [String(e.address).trim()]             : []))
      const inns      = uniq(entries.flatMap(e => e.inn      ? [String(e.inn).trim()]                 : []))
      const passports = uniq(entries.flatMap(e => e.passport ? [String(e.passport).trim()]            : []))
      const vkUrls    = uniq(entries.flatMap(e => e.vk_id    ? [String(e.vk_id)]                      : []))
      const patch: Record<string, any> = {}
      if (phones.length > 0) {
        const existing: string[] = Array.isArray(person.phones) ? person.phones : []
        const merged = uniq([...existing, ...phones]).slice(0, 20)
        if (merged.length > existing.length) patch.phones = merged
      }
      if (emails.length > 0 && !person.email)    patch.email    = emails[0]
      if (addresses.length > 0 && !person.addr_live) patch.addr_live = addresses[0]
      if (inns.length > 0 && !person.ipn)        patch.ipn      = inns[0]
      if (passports.length > 0 && !person.passport) patch.passport = passports[0]
      if (vkUrls.length > 0 && !person.vk_url)   patch.vk_url   = vkUrls[0]
      const existingTags: string[] = Array.isArray(person.tags) ? person.tags : []
      if (!existingTags.includes('перевірено')) patch.tags = [...existingTags, 'перевірено']
      if (Object.keys(patch).length === 0) { alert(`${sourceName}: всі знайдені дані вже є в картці`); return }
      const res = await fetch(`/api/persons/${person.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const saved: string[] = []
      if (patch.phones) saved.push(`📱 ${patch.phones.length} тел.`)
      if (patch.email)    saved.push('✉️ email')
      if (patch.addr_live) saved.push('📍 адреса')
      if (patch.ipn)      saved.push('ІПН')
      if (patch.passport) saved.push('🪪 паспорт')
      if (patch.vk_url)   saved.push('VK')
      alert(`${sourceName}: збережено в базу:\n${saved.join(', ')}`)
      setSaved(true)
      window.location.reload()
    } catch (e: any) { alert(`Помилка збереження: ${e.message}`) }
    finally { setSaving(false) }
  }

  async function runLeakOsint() {
    setLeakOsintLoading(true); setLeakOsintError(''); setLeakOsintRan(true)
    try {
      const name = person.name_rus || person.name_ukr || person.name || ''
      if (!name) { setLeakOsintError('Немає імені для пошуку'); return }
      const res = await fetch('/api/leaks/leakosint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: name, limit: 100 }),
      })
      const data = await res.json()
      if (data.error) { setLeakOsintError(data.error); return }
      setLeakOsintResults(data.entries || [])
      setLeakOsintTotal(data.total || data.entries?.length || 0)
    } catch (e: any) { setLeakOsintError(e.message) }
    finally { setLeakOsintLoading(false) }
  }

  async function runAiProfile() {
    setAiLoading(true); setAiError('')
    try {
      const res = await fetch(`/api/osint/ai-profile/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.threat_score) { setAiError(data.error) }
      else {
        setPerson((prev: any) => ({ ...prev, ai_profile: data.ai_profile || prev.ai_profile, threat_score: data.threat_score ?? prev.threat_score }))
        if (data.error) setAiError(`⚠️ AI недоступний: ${data.error}`)
      }
    } catch (e: any) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  async function runRegistriesCheck(forceName?: string) {
    if (regLoading) return
    setRegLoading(true)
    const name = forceName || person?.name_ukr || person?.name_rus || person?.name || ''
    if (!name || name.length < 3) { setRegLoading(false); return }
    const lastName = name.trim().split(/\s+/)[0]
    const [nazkRes, myroRes, erbRes, mvsRes, sanctionsRes, companyRes] = await Promise.allSettled([
      fetch('/api/nazk/search',       { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: name }) }).then(r => r.json()),
      fetch('/api/myrotvorets/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: name }) }).then(r => r.json()),
      fetch('/api/erb/search',        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: lastName, last_name: lastName }) }).then(r => r.json()),
      fetch('/api/mvs/search',        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: name, resource: 'wanted' }) }).then(r => r.json()),
      fetch('/api/sanctions/search',  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: name }) }).then(r => r.json()),
      fetch('/api/company/search',    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: lastName }) }).then(r => r.json()),
    ])
    if (nazkRes.status === 'fulfilled')      setRegNazk(nazkRes.value)
    if (myroRes.status === 'fulfilled')      setRegMyrotvorets(myroRes.value)
    if (erbRes.status === 'fulfilled')       setRegErb(erbRes.value)
    if (mvsRes.status === 'fulfilled')       setRegMvs(mvsRes.value)
    if (sanctionsRes.status === 'fulfilled') setRegSanctions(sanctionsRes.value)
    if (companyRes.status === 'fulfilled')   setRegCompany(companyRes.value)
    setRegAutoRan(true); setRegLoading(false)
  }

  async function runVkSearch() {
    setVkLoading(true); setVkError(''); setVkProfiles([])
    try {
      const res = await fetch(`/api/osint/vk/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) setVkError(data.error)
      else {
        setVkProfiles(data.profiles || [])
        if (data.found > 0) { const r = await fetch(`/api/persons/${personId}`); setPerson(await r.json()) }
      }
    } catch (e: any) { setVkError(e.message) }
    finally { setVkLoading(false) }
  }

  async function runOdbSearch() {
    setOdbLoading(true); setOdbError(''); setOdbResults([])
    try {
      const res = await fetch(`/api/osint/opendatabot/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) setOdbError(data.error)
      else {
        setOdbResults(data.results || [])
        if (data.found > 0) { const r = await fetch(`/api/persons/${personId}`); setPerson(await r.json()) }
      }
    } catch (e: any) { setOdbError(e.message) }
    finally { setOdbLoading(false) }
  }

  async function runFaceSearch() {
    setFaceLoading(true); setFaceError(''); setFaceResults([])
    try {
      const res = await fetch(`/api/osint/search4faces/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) setFaceError(data.error)
      else {
        setFaceResults(data.results || [])
        if ((data.results || []).length > 0) { const r = await fetch(`/api/persons/${personId}`); setPerson(await r.json()) }
      }
    } catch (e: any) { setFaceError(e.message) }
    finally { setFaceLoading(false) }
  }

  async function runVehicleSearch() {
    setVehiclesLoading(true); setVehiclesError(''); setVehiclesResults([])
    try {
      const res = await fetch(`/api/osint/vehicles/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.vehicles) setVehiclesError(data.error)
      else {
        const v = data.vehicles || []; setVehiclesResults(v)
        if (v.length > 0) { const r = await fetch(`/api/persons/${personId}`); setPerson(await r.json()) }
      }
    } catch (e: any) { setVehiclesError(e.message) }
    finally { setVehiclesLoading(false) }
  }

  async function runKadasterSearch() {
    setKadasterLoading(true); setKadasterError(''); setKadasterResults([])
    try {
      const res = await fetch(`/api/osint/kadaster/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) setKadasterError(data.error)
      else {
        setKadasterResults(data.results || [])
        if ((data.results || []).length > 0) { const r = await fetch(`/api/persons/${personId}`); setPerson(await r.json()) }
      }
    } catch (e: any) { setKadasterError(e.message) }
    finally { setKadasterLoading(false) }
  }

  async function runObituariesSearch() {
    setObitsLoading(true); setObitsError(''); setObitsResults([])
    try {
      const res = await fetch(`/api/osint/obituaries/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) setObitsError(data.error)
      else {
        setObitsResults(data.results || [])
        if (data.status_updated) { const r = await fetch(`/api/persons/${personId}`); setPerson(await r.json()) }
      }
    } catch (e: any) { setObitsError(e.message) }
    finally { setObitsLoading(false) }
  }

  async function runVpnSearch() {
    setVpnLoading(true); setVpnError(''); setVpnResults([])
    try {
      const res = await fetch(`/api/osint/vpn-search/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (res.status === 403 || (!data.success && !data.results)) setVpnError(data.error || data.message || 'Помилка VPN пошуку')
      else {
        const results = data.results || []; setVpnResults(results)
        if (results.length === 0) setVpnError('Нічого не знайдено (або сайти заблокували запит)')
      }
    } catch (e: any) { setVpnError(e.message) }
    finally { setVpnLoading(false) }
  }

  async function runLeaksSearch() {
    setLeaksLoading(true); setLeaksError(''); setLeaksResults([])
    try {
      const query: Record<string, any> = {}
      if (person.phones?.length) query.phone   = person.phones[0]
      if (person.email)          query.email   = person.email
      if (person.ipn)            query.inn     = person.ipn
      if (person.snils)          query.snils   = person.snils
      if (person.passport)       query.passport = person.passport
      if (person.name_rus || person.name_ukr || person.name)
        query.name = person.name_rus || person.name_ukr || person.name
      const res = await fetch('/api/leaks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`/api/osint/telegram-phone/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) setTgPhoneError(data.error)
      else {
        setTgPhoneResults(data.results || [])
        if ((data.results || []).length > 0) { const r = await fetch(`/api/persons/${personId}`); setPerson(await r.json()) }
      }
    } catch (e: any) { setTgPhoneError(e.message) }
    finally { setTgPhoneLoading(false) }
  }

  async function runPhotoCollection() {
    setPhotoCollLoading(true); setPhotoCollMsg('')
    try {
      const res = await fetch(`/api/osint/photos/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) setPhotoCollMsg(`❌ ${data.error}`)
      else {
        setPhotoCollMsg(`✅ Зібрано ${data.saved || 0} фото (VK: ${data.sources?.vk || 0}, OK: ${data.sources?.ok || 0}, IG: ${data.sources?.instagram || 0})`)
        if ((data.saved || 0) > 0) { const r = await fetch(`/api/persons/${personId}`); setPerson(await r.json()) }
      }
    } catch (e: any) { setPhotoCollMsg(`❌ ${e.message}`) }
    finally { setPhotoCollLoading(false) }
  }

  async function runPresenceCheck() {
    setPresenceLoading(true); setPresenceError(''); setPresenceResults([])
    try {
      const res = await fetch(`/api/osint/phone-presence/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) setPresenceError(data.error)
      else setPresenceResults(data.results || [])
    } catch (e: any) { setPresenceError(e.message) }
    finally { setPresenceLoading(false) }
  }

  async function runFindFaceSearch() {
    setFindFaceLoading(true); setFindFaceError(''); setFindFaceResults([])
    try {
      const res = await fetch(`/api/osint/findface/${personId}`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.results) setFindFaceError(data.error)
      else {
        setFindFaceResults(data.results || [])
        if ((data.results || []).length > 0) { const r = await fetch(`/api/persons/${personId}`); setPerson(await r.json()) }
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
      if (data.error) { setTgError(data.error) }
      else {
        const raw = deduplicateTgResults(data.results || [])
        setTgRawAll(raw)
        setTgResults(filterTgByQuery(raw, q, person?.dob))
        if (raw.length > 0) {
          const existingRaw: any[] = person.telegram_raw || []
          const newEntry = {
            searched_at: new Date().toISOString(), query: dob ? `${q} ${dob}` : q, bot: '@PeopleFindBaseBot',
            leaks: raw.map((r: any) => ({ source_label: r.source_label, page: r.page || 1, snippet: r.snippet, fields: r.fields || {}, url: r.url || null, date: r.date || null }))
          }
          fetch(`/api/persons/${personId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_raw: [...existingRaw, newEntry] }),
          }).then(() => fetch(`/api/persons/${personId}`).then(r => r.json()).then(setPerson).catch(() => {})).catch(() => {})
        }
      }
    } catch { setTgError('Telegram сервіс недоступний') }
    finally { setTgLoading(false) }
  }

  async function runTelegramFull(customQuery?: string) {
    if (!person) return
    const q = customQuery || person.name_rus || person.name_ukr || person.name || ''
    if (!q || q.length < 3) return
    const dob = person.dob || ''
    const query = dob ? `${q} ${dob}` : q
    setTgFullLoading(true); setTgFullError(''); setTgFullResults([]); setTgFullJobId(null)
    try {
      const startRes = await fetch('/api/vps/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type: 'name', sources: ['telegram', 'telethon'] }),
      })
      const startData = await startRes.json()
      if (!startData.job_id) { setTgFullError(startData.error || 'Не вдалось запустити пошук'); setTgFullLoading(false); return }
      setTgFullJobId(startData.job_id)
      const poll = async () => {
        const r = await fetch(`/api/vps/jobs?id=${startData.job_id}`)
        const d = await r.json()
        if (d.status === 'done') {
          const flat: any[] = []
          for (const [src, payload] of Object.entries(d.results || {})) {
            const p = payload as any
            const items = p?.results || p?.leaks || []
            if (Array.isArray(items)) flat.push(...items.map((x: any) => ({ ...x, _src: src })))
          }
          setTgFullResults(deduplicateTgResults(flat)); setTgFullLoading(false)
        } else if (d.status === 'error') {
          setTgFullError(d.error || 'Помилка пошуку'); setTgFullLoading(false)
        } else { setTimeout(poll, 4000) }
      }
      setTimeout(poll, 5000)
    } catch (e: any) { setTgFullError(e.message || 'Помилка'); setTgFullLoading(false) }
  }

  async function runTelegramEnrich(q: string) {
    if (tgEnrichLoading.has(q)) return
    setTgEnrichLoading(prev => new Set(prev).add(q))
    try {
      const res = await fetch(`/api/telegram/enrich?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (data.results?.length > 0)
        setTgResults(prev => deduplicateTgResults([...prev, ...data.results.map((r: any) => ({ ...r, from_enrich: true }))]))
    } catch {}
    setTgEnrichLoading(prev => { const s = new Set(prev); s.delete(q); return s })
  }

  async function saveTelegramDataToPerson(fields: Record<string, any>, allResults?: any[]) {
    const patch: Record<string, any> = {}
    if (allResults && allResults.length > 0) {
      const existingRaw: any[] = person.telegram_raw || []
      patch.telegram_raw = [...existingRaw, {
        searched_at: new Date().toISOString(), query: tgQuery, bot: '@PeopleFindBaseBot',
        leaks: allResults.map((r: any) => ({ source_label: r.source_label, page: r.page || 1, total_pages: r.total_pages || allResults.length, snippet: r.snippet, fields: r.fields || {}, url: r.url || null, date: r.date || null }))
      }]
    }
    if (fields.phone || fields.phones_list?.length) {
      const newPhones = fields.phones_list || (fields.phone ? [fields.phone] : [])
      patch.phones = [...new Set([...(person.phones || []), ...newPhones])]
    }
    if (fields.passport) {
      let passVal = (fields.series && /^\d{4}$/.test(String(fields.series))) ? `${fields.series} ${fields.passport}` : String(fields.passport).trim()
      if (fields.passport_issuer) passVal += ` / ${fields.passport_issuer}`
      patch.passport = passVal
    }
    if (fields.snils) patch.snils = fields.snils
    if (fields.inn)   patch.ipn   = fields.inn
    if (fields.address && !person.addr_reg) patch.addr_reg = fields.address
    if (fields.gender) {
      const g = String(fields.gender).trim().toUpperCase()
      if (['M','М','МУЖ','МУЖСКОЙ','ЧОЛОВІЧА','MALE'].includes(g)) patch.gender = 'male'
      else if (['F','Ж','ЖЕН','ЖЕНСКИЙ','ЖІНОЧА','FEMALE'].includes(g)) patch.gender = 'female'
    }
    const foundEmail = fields.email || (Array.isArray(fields.emails_list) ? fields.emails_list[0] : null)
    if (foundEmail && !person.email) patch.email = foundEmail
    if (fields.rank && !person.rank) patch.rank = fields.rank
    if (fields.unit && !person.unit) patch.unit = fields.unit
    if (fields.personal_num) patch.military_id = fields.personal_num
    if (fields.vk)        patch.vk_url       = fields.vk
    if (fields.ok)        patch.ok_url       = fields.ok
    if (fields.instagram) patch.instagram_url = fields.instagram
    if (fields.facebook)  patch.fb_url       = fields.facebook
    if (fields.dob && !person.dob) patch.dob = String(fields.dob).trim()
    if (Object.keys(patch).length === 0) { alert('Немає нових даних для збереження'); return }
    await fetch(`/api/persons/${personId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const refreshed = await fetch(`/api/persons/${personId}`)
    setPerson(await refreshed.json())
    setActiveTab('overview')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setAiLoading(true); setAiError('')
    fetch(`/api/osint/ai-profile/${personId}`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.ai_profile || data.threat_score !== undefined)
          setPerson((prev: any) => ({ ...prev, ai_profile: data.ai_profile || prev.ai_profile, threat_score: data.threat_score ?? prev.threat_score }))
        if (data.error && !data.ai_profile) setAiError(`⚠️ AI: ${data.error}`)
      })
      .catch(() => {}).finally(() => setAiLoading(false))
  }

  async function savePhoto() {
    setSavingPhoto(true)
    try {
      await fetch(`/api/persons/${personId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo_url: photoUrl }) })
      setPerson((p: any) => ({ ...p, photo_url: photoUrl })); setEditingPhoto(false)
    } finally { setSavingPhoto(false) }
  }

  async function addPersonPhoto(url: string) {
    if (!url.trim()) return
    setSavingNewPhoto(true)
    try {
      const current: any[] = person.person_photos || []
      const newEntry = { url: url.trim(), source: 'manual', added_at: new Date().toISOString() }
      const updates: any = { person_photos: [...current, newEntry] }
      if (!person.photo_url) updates.photo_url = url.trim()
      await fetch(`/api/persons/${personId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
      setPerson((p: any) => ({ ...p, ...updates })); setAddingPhotoUrl('')
    } finally { setSavingNewPhoto(false) }
  }

  async function removePersonPhoto(url: string) {
    const current: any[] = person.person_photos || []
    const updated  = current.filter((p: any) => !(p.source === 'manual' && p.url === url))
    const isMain   = person.photo_url === url
    const remaining = updated.filter((p: any) => p.source === 'manual' && p.url).map((p: any) => p.url as string)
    const updates: any = { person_photos: updated }
    if (isMain) updates.photo_url = remaining[0] || null
    await fetch(`/api/persons/${personId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
    setPerson((p: any) => ({ ...p, ...updates }))
  }

  async function setMainPersonPhoto(url: string) {
    await fetch(`/api/persons/${personId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo_url: url }) })
    setPerson((p: any) => ({ ...p, photo_url: url }))
  }

  async function importFromMyrotvorets(force = false) {
    if (!enrichUrl.trim()) return
    setEnrichLoading(true); setEnrichError(''); setEnrichResult(null)
    try {
      const res = await fetch(`/api/persons/${personId}/enrich`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: enrichUrl.trim(), force, ...(enrichHtmlMode && enrichHtml.trim().length > 500 ? { html: enrichHtml.trim() } : {}) }),
      })
      const data = await res.json()
      if (res.status === 409 && confirm('Дані вже імпортовано. Перезаписати?')) { await importFromMyrotvorets(true); return }
      if (res.status === 503) { setEnrichError('Сервіс тимчасово недоступний'); return }
      if (!res.ok) { setEnrichError(data.error || data.message || 'Помилка імпорту'); return }
      setEnrichResult(data)
      const refreshed = await fetch(`/api/persons/${personId}`)
      const updatedPerson = await refreshed.json()
      setPerson(updatedPerson)
      if (updatedPerson.photo_url) setPhotoUrl(updatedPerson.photo_url)
    } finally { setEnrichLoading(false) }
  }

  // ── Return ────────────────────────────────────────────────────────────────────
  return {
    // Core
    person, setPerson, loading, personId, personName,
    activeTab, setActiveTab,
    // Photo
    photoUrl, setPhotoUrl, editingPhoto, setEditingPhoto, savingPhoto,
    photoLightboxIdx, setPhotoLightboxIdx,
    addingPhotoUrl, setAddingPhotoUrl, savingNewPhoto,
    showPhotoSearch, setShowPhotoSearch,
    allPersonPhotos, photoSearchEngines,
    savePhoto, addPersonPhoto, removePersonPhoto, setMainPersonPhoto,
    // Evidence
    evidenceItems,
    // OSINT
    osintLoading, osintData, osintError, activeVector, setActiveVector,
    personMentions, activeVectorData, personSurnameForFilter,
    osintPdfs, osintPdfsAll, osintRelatives, myrotvoretsOsintUrl,
    runOsint,
    // AI
    aiLoading, aiError, runAiProfile,
    // VK
    vkLoading, vkProfiles, vkError, runVkSearch,
    // ODB/ЄДР
    odbLoading, odbResults, odbError, runOdbSearch,
    // Vehicles
    vehiclesLoading, vehiclesResults, vehiclesError, runVehicleSearch,
    // Face
    faceLoading, faceResults, faceError, runFaceSearch,
    // Kadaster
    kadasterLoading, kadasterResults, kadasterError, runKadasterSearch,
    // Obits
    obitsLoading, obitsResults, obitsError, runObituariesSearch,
    // VPN
    vpnLoading, vpnResults, vpnError, runVpnSearch,
    // Leaks
    leaksLoading, leaksResults, leaksError, runLeaksSearch,
    // TG Phone
    tgPhoneLoading, tgPhoneResults, tgPhoneError, runTgPhoneLookup,
    // Photo collection
    photoCollLoading, photoCollMsg, runPhotoCollection,
    // Presence
    presenceLoading, presenceResults, presenceError, runPresenceCheck,
    // FindFace
    findFaceLoading, findFaceResults, findFaceError, runFindFaceSearch,
    // Registries
    regLoading, regAutoRan, regNazk, regMyrotvorets, regErb, regMvs, regSanctions, regCompany,
    runRegistriesCheck,
    // Telegram
    tgLoading, tgResults, tgRawAll, tgError, tgQuery, setTgQuery,
    tgEnrichLoading, tgFullLoading, tgFullJobId, tgFullError, tgFullResults,
    runTelegramSearch, runTelegramFull, runTelegramEnrich, saveTelegramDataToPerson,
    // OsintKit
    osintKitLoading, osintKitResults, osintKitTotal, osintKitError, osintKitRan,
    osintKitSaving, osintKitSaved,
    runOsintKit,
    saveOsintKit: () => saveLeakDataToDb(osintKitResults, 'OsintKit', setOsintKitSaving, setOsintKitSaved),
    // LeakOsint
    leakOsintLoading, leakOsintResults, leakOsintTotal, leakOsintError, leakOsintRan,
    leakOsintSaving, leakOsintSaved,
    runLeakOsint,
    saveLeakOsint: () => saveLeakDataToDb(leakOsintResults, 'LeakOsint', setLeakOsintSaving, setLeakOsintSaved),
    // Media
    videos, setVideos, videoUrl, setVideoUrl, videoNote, setVideoNote,
    docs, setDocs, docUrl, setDocUrl, docTitle, setDocTitle,
    // Incidents
    incidents, incidentsLoading, showIncidentForm, setShowIncidentForm,
    incidentTitle, setIncidentTitle, incidentDate, setIncidentDate,
    incidentLocation, setIncidentLocation, incidentType, setIncidentType,
    incidentDesc, setIncidentDesc, incidentIcc, setIncidentIcc,
    incidentSeverity, setIncidentSeverity, incidentRole, setIncidentRole,
    savingIncident, createIncident,
    // Enrich (Myrotvorets)
    enrichOpen, setEnrichOpen, enrichUrl, setEnrichUrl,
    enrichLoading, enrichResult, enrichError,
    enrichHtmlMode, setEnrichHtmlMode, enrichHtml, setEnrichHtml,
    importFromMyrotvorets,
  }
}

export type PersonPageState = ReturnType<typeof usePersonPage>
