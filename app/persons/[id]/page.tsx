'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import Sidebar from '../../components/Sidebar'
import ConnectionsGraph from '../../components/ConnectionsGraph'
import EvidenceUploader from '../../components/EvidenceUploader'
import AiProfileCard from '../../components/AiProfileCard'

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
  { id: 'registries', icon: '🏛️', label: 'Реєстри' },
  { id: 'media', icon: '🎬', label: 'Медіа' },
  { id: 'documents', icon: '📁', label: 'Документи' },
  { id: 'unit', icon: '🏢', label: 'В/Ч та техніка' },
  { id: 'crypto', icon: '₿', label: 'Крипто' },
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

// ─── Crypto Wallets Tab ───────────────────────────────────────────────────────
function CryptoWalletsTab({ personId, personName }: { personId: string; personName: string }) {
  const [wallets, setWallets]           = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [linkMode, setLinkMode]         = useState(false)
  const [newAddr, setNewAddr]           = useState('')
  const [newChain, setNewChain]         = useState('eth')
  const [newNotes, setNewNotes]         = useState('')
  const [saving, setSaving]             = useState(false)
  const [analyzeLoading, setAnalyzeLoading] = useState<string | null>(null)
  const [walletDetails, setWalletDetails]   = useState<Record<string, any>>({})

  const CHAINS = ['eth','btc','tron','bsc','polygon']
  const CHAIN_ICONS: Record<string, string> = {
    eth: '⟠', btc: '₿', tron: '🔴', bsc: '🟡', polygon: '🟣'
  }
  const RISK_COLORS: Record<string, string> = {
    low: 'text-green-400', medium: 'text-yellow-400',
    high: 'text-orange-400', critical: 'text-red-400'
  }

  // Load wallets from person record
  useEffect(() => {
    fetch(`/api/persons/${personId}`)
      .then(r => r.json())
      .then(d => {
        setWallets(d.crypto_wallets || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [personId])

  async function handleLink() {
    if (!newAddr.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/crypto/link-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: newAddr.trim(),
          chain: newChain,
          person_id: personId,
          notes: newNotes,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setWallets(prev => [...prev, {
          address: newAddr.trim().toLowerCase(),
          chain: newChain,
          notes: newNotes,
          linked_at: new Date().toISOString(),
        }])
        setNewAddr(''); setNewNotes(''); setLinkMode(false)
      }
    } finally { setSaving(false) }
  }

  async function handleUnlink(address: string) {
    if (!confirm(`Відв'язати гаманець ${address.slice(0,12)}...?`)) return
    await fetch('/api/crypto/link-person', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: address, person_id: personId }),
    })
    setWallets(prev => prev.filter(w => w.address !== address))
  }

  async function handleAnalyze(wallet: any) {
    setAnalyzeLoading(wallet.address)
    try {
      const res = await fetch('/api/crypto/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address, chain: wallet.chain }),
      })
      const data = await res.json()
      if (data.success) {
        setWalletDetails(prev => ({ ...prev, [wallet.address]: data.wallet }))
        // Also update the linked wallet with fresh data
        await fetch('/api/crypto/link-person', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: wallet.address,
            chain: wallet.chain,
            person_id: personId,
            wallet_data: data.wallet,
          }),
        })
      }
    } finally { setAnalyzeLoading(null) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin text-4xl">₿</div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-lg">₿ Крипто-гаманці</h3>
          <p className="text-gray-500 text-sm">{wallets.length} гаманець(ів) прив'язано до {personName}</p>
        </div>
        <button
          onClick={() => setLinkMode(!linkMode)}
          className="px-4 py-2 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-sm transition font-medium"
        >
          {linkMode ? '✕ Скасувати' : '+ Прив’язати гаманець'}
        </button>
      </div>

      {/* Add wallet form */}
      {linkMode && (
        <div className="bg-gray-800/60 border border-orange-800/40 rounded-xl p-4 space-y-3">
          <p className="text-orange-400 text-sm font-medium">Прив'язати новий гаманець</p>
          <div className="flex gap-2">
            <select
              value={newChain}
              onChange={e => setNewChain(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-32 shrink-0"
            >
              {CHAINS.map(c => (
                <option key={c} value={c}>{CHAIN_ICONS[c]} {c.toUpperCase()}</option>
              ))}
            </select>
            <input
              value={newAddr}
              onChange={e => setNewAddr(e.target.value)}
              placeholder="Адреса гаманця (0x... / 1... / T...)"
              className="flex-1 bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>
          <input
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
            placeholder="Нотатки (необов'язково)"
            className="w-full bg-gray-900 border border-gray-700 text-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleLink}
              disabled={saving || !newAddr.trim()}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg text-sm transition"
            >
              {saving ? '⏳ Зберігаю...' : '✓ Прив’язати'}
            </button>
            <a
              href={`/crypto-intel?addr=${encodeURIComponent(newAddr)}&chain=${newChain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition"
            >
              🔍 Аналіз
            </a>
          </div>
        </div>
      )}

      {/* Wallet list */}
      {wallets.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-3">₿</p>
          <p className="text-gray-400">Гаманців не прив'язано</p>
          <p className="text-gray-600 text-sm mt-1">
            Натисніть "+ Прив'язати гаманець" або знайдіть гаманець через{' '}
            <a href="/crypto-intel" className="text-orange-400 hover:underline">Крипто-розвідку</a>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {wallets.map((w: any) => {
            const detail = walletDetails[w.address]
            const riskColor = RISK_COLORS[w.risk_level || detail?.risk_level || 'low']
            return (
              <div key={w.address} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">{CHAIN_ICONS[w.chain] || '🔗'}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs uppercase font-semibold">{w.chain}</span>
                        {(w.risk_level || detail?.risk_level) && (
                          <span className={`text-xs font-medium ${riskColor}`}>
                            ● {(w.risk_level || detail?.risk_level).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-white font-mono text-sm truncate">{w.address}</p>
                      {w.notes && <p className="text-gray-500 text-xs mt-0.5">{w.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleAnalyze(w)}
                      disabled={analyzeLoading === w.address}
                      className="px-3 py-1.5 bg-blue-800/50 hover:bg-blue-700/60 text-blue-300 rounded-lg text-xs transition"
                    >
                      {analyzeLoading === w.address ? '⏳' : '🔍 Аналіз'}
                    </button>
                    <a
                      href={`/crypto-intel?addr=${encodeURIComponent(w.address)}&chain=${w.chain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition"
                    >
                      ↗ Відкрити
                    </a>
                    <button
                      onClick={() => handleUnlink(w.address)}
                      className="px-2 py-1.5 bg-red-950/50 hover:bg-red-900/60 text-red-400 rounded-lg text-xs transition"
                      title="Відв'язати"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Wallet stats (after analysis) */}
                {(detail || w.balance != null) && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50 grid grid-cols-4 gap-3">
                    {[
                      { label: 'Баланс', value: detail?.balance_native != null ? `${detail.balance_native} ${detail.symbol || ''}` : (w.balance != null ? `${w.balance}` : null) },
                      { label: 'Транзакцій', value: detail?.tx_count ?? w.tx_count },
                      { label: 'Ризик', value: detail?.risk_score != null ? `${detail.risk_score}/100` : (w.risk_score != null ? `${w.risk_score}/100` : null) },
                      { label: 'Остання tx', value: detail?.last_tx ?? w.last_tx },
                    ].filter(s => s.value != null).map(stat => (
                      <div key={stat.label}>
                        <p className="text-gray-600 text-xs">{stat.label}</p>
                        <p className="text-gray-300 text-sm font-medium">{String(stat.value)}</p>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-gray-700 text-xs mt-2">
                  Прив'язано: {w.linked_at ? new Date(w.linked_at).toLocaleDateString('uk-UA') : '—'}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Link to Crypto Intel */}
      <div className="bg-orange-950/20 border border-orange-900/30 rounded-xl p-4 flex items-center gap-3">
        <span className="text-2xl">🕵️</span>
        <div className="flex-1">
          <p className="text-orange-400 text-sm font-medium">Крипто-розвідка</p>
          <p className="text-gray-500 text-xs">Знайдіть гаманці через OSINT Bridge і прив'яжіть до цієї особи</p>
        </div>
        <a
          href="/crypto-intel"
          className="px-4 py-2 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-sm transition shrink-0"
        >
          Відкрити →
        </a>
      </div>
    </div>
  )
}

export default function PersonDetailPage() {
  const [person, setPerson] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [osintAutoRan, setOsintAutoRan] = useState(false)
  const [photoUrl, setPhotoUrl] = useState('')
  const [editingPhoto, setEditingPhoto] = useState(false)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [photoLightbox, setPhotoLightbox] = useState(false)
  const [photoLightboxIdx, setPhotoLightboxIdx] = useState<number | null>(null)
  const [addingPhotoUrl, setAddingPhotoUrl] = useState('')
  const [savingNewPhoto, setSavingNewPhoto] = useState(false)

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

  // Evidence (фото/відео/документи) — завантажуємо для хедера та огляду
  const [evidenceItems, setEvidenceItems] = useState<any[]>([])

  // Photo collection (VK/OK/Instagram)
  const [photoCollLoading, setPhotoCollLoading] = useState(false)
  const [photoCollMsg, setPhotoCollMsg] = useState('')

  // WhatsApp/Viber presence
  const [presenceLoading, setPresenceLoading] = useState(false)
  const [presenceResults, setPresenceResults] = useState<any[]>([])
  const [presenceError, setPresenceError] = useState('')

  // 🏛️ Реєстри (НАЗК, Миротворець, ЄРБ, МВС, Санкції, ЄДР) — авто при відкритті
  const [regLoading, setRegLoading] = useState(false)
  const [regAutoRan, setRegAutoRan] = useState(false)
  const [regNazk, setRegNazk] = useState<any>(null)
  const [regMyrotvorets, setRegMyrotvorets] = useState<any>(null)
  const [regErb, setRegErb] = useState<any>(null)
  const [regMvs, setRegMvs] = useState<any>(null)
  const [regSanctions, setRegSanctions] = useState<any>(null)
  const [regCompany, setRegCompany] = useState<any>(null)

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

  // OsintKit — база даних РФ (731 БД: Альфабанк, ГосУслуги, etc.)
  const [osintKitLoading, setOsintKitLoading] = useState(false)
  const [osintKitResults, setOsintKitResults] = useState<any[]>([])
  const [osintKitTotal, setOsintKitTotal] = useState(0)
  const [osintKitError, setOsintKitError] = useState('')
  const [osintKitRan, setOsintKitRan] = useState(false)
  const [osintKitSaving, setOsintKitSaving] = useState(false)
  const [osintKitSaved, setOsintKitSaved] = useState(false)

  // LeakOsint — 800+ баз РФ/СНД
  const [leakOsintLoading, setLeakOsintLoading] = useState(false)
  const [leakOsintResults, setLeakOsintResults] = useState<any[]>([])
  const [leakOsintTotal, setLeakOsintTotal] = useState(0)
  const [leakOsintError, setLeakOsintError] = useState('')
  const [leakOsintRan, setLeakOsintRan] = useState(false)
  const [leakOsintSaving, setLeakOsintSaving] = useState(false)
  const [leakOsintSaved, setLeakOsintSaved] = useState(false)

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
      try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const res = await fetch(`/api/persons/${params.id}`)
      if (!res.ok) { setLoading(false); return }
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

      // ── Авто-реєстри: НАЗК + Миротворець + ЄРБ + МВС ──
      const personName = data?.name_ukr || data?.name_rus || data?.name || ''
      if (personName.length >= 3) {
        setTimeout(() => runRegistriesCheck(personName), 1000)
      }

      // ── Авто-детект Миротворця у фоні (веб-OSINT тепер запускається вручну) ──
      setTimeout(async () => {
        try {
          const enrichRes = await fetch(`/api/persons/${params.id}/enrich`)
          const enrichData = await enrichRes.json()
          if (enrichData.found && enrichData.url && !data.myrotvorets_url) {
            setEnrichUrl(enrichData.url)
            setEnrichOpen(true)
          }
        } catch {}
      }, 800)
      } catch { setLoading(false) }
    }
    init()
  }, [params.id])

  // Окремий useEffect для evidence — спрацьовує щойно person завантажено
  useEffect(() => {
    if (!person?.id) return
    fetch(`/api/evidence/${person.id}?type=person`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.evidence)) setEvidenceItems(d.evidence) })
      .catch(() => {})
  }, [person?.id])

  // ── Авто-запуск OsintKit + LeakOsint + Telegram при відкритті OSINT вкладки ──
  useEffect(() => {
    if (activeTab !== 'osint') return
    if (osintAutoRan) return
    if (!person) return
    setOsintAutoRan(true)
    // Паралельний запуск всіх трьох джерел
    if (!osintKitRan) runOsintKit()
    if (!leakOsintRan) runLeakOsint()
    const tgQ = [person.name_rus, person.name_ukr, person.name].find(n => n && n.trim().length >= 3) || ''
    if (tgQ.length >= 3) runTelegramSearch(tgQ)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, person])

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
      else {
        setOsintData(data)
        if (data.vectors?.length > 0) setActiveVector(data.vectors[0].vector)
        // Оновлюємо person_mentions (зберігались тільки >= 80 балів)
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
        // Якщо знайдено якісні збіги — оновлюємо AI профіль у фоні
        const highQualityHits = data.vectors?.reduce(
          (acc: number, v: any) => acc + (v.results?.filter((r: any) => (r.relevanceScore ?? 0) >= 80).length || 0), 0
        ) || 0
        if (highQualityHits > 0) {
          setAiLoading(true)
          fetch(`/api/osint/ai-profile/${params.id}`, { method: 'POST' })
            .then(r => r.json())
            .then(aiData => {
              if (aiData.ai_profile || aiData.threat_score !== undefined) {
                setPerson((prev: any) => ({
                  ...prev,
                  ai_profile: aiData.ai_profile || prev.ai_profile,
                  threat_score: aiData.threat_score ?? prev.threat_score,
                }))
              }
            })
            .catch(() => {})
            .finally(() => setAiLoading(false))
        }
      }
    } catch (e: any) { setOsintError(e.message) }
    finally { setOsintLoading(false) }
  }

  // ── OsintKit: пошук по 731 БД РФ за відомими ідентифікаторами ──────────────
  // OsintKit використовує AND між фільтрами → шукаємо по одному ідентифікатору,
  // починаємо з найунікальнішого (ІПН → телефони → паспорт → ім'я+ДН)
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

      // Збираємо унікальні ідентифікатори (від найунікальнішого до менш унікального)
      const queries: { fields: Record<string,string>; label: string }[] = []

      // 1. ІПН (12 цифр — абсолютно унікальний)
      const inn = String(person.ipn || aiP0?.inn || '').replace(/\D/g,'')
      if (inn.length >= 10) queries.push({ fields: { inn }, label: `ІПН: ${inn}` })

      // 2. СНІЛС
      const snils = (person.snils || aiP0?.snils || '').replace(/\D/g,'')
      if (snils.length >= 9) queries.push({ fields: { snils }, label: `СНІЛС: ${snils}` })

      // 3. Телефони (кожен окремо)
      const phones: string[] = [
        ...(aiP0?.phones || []),
        ...(Array.isArray(person.phones) ? person.phones : []),
      ].map((p: string) => p.replace(/\D/g,'')).filter(p => p.length >= 9)
      const uniquePhones = [...new Set(phones)].slice(0, 5) // не більше 5
      for (const phone of uniquePhones) {
        queries.push({ fields: { phone }, label: `Телефон: ${phone}` })
      }

      // 4. Паспорти
      const passports: string[] = [
        ...(person.passport ? [person.passport] : []),
        ...(aiP0?.passports || []),
      ].filter(Boolean)
      for (const passport of [...new Set(passports)].slice(0,2)) {
        queries.push({ fields: { passport }, label: `Паспорт: ${passport}` })
      }

      // 5. Ім'я + дата народження (якщо немає більш унікальних)
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

      if (queries.length === 0) {
        setOsintKitError('Недостатньо ідентифікаторів для пошуку')
        return
      }

      // Виконуємо всі запити паралельно
      const results = await Promise.all(
        queries.map(async ({ fields, label }) => {
          try {
            const res = await fetch('/api/breach/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields }),
            })
            const data = await res.json()
            const ok = data.sources?.osintkit
            if (ok?.error || !ok?.entries?.length) return []
            return ok.entries.map((e: any) => ({ ...e, _query: label }))
          } catch { return [] }
        })
      )

      // Дедублікуємо по database + name
      const seen = new Set<string>()
      const allEntries: any[] = []
      for (const batch of results) {
        for (const entry of batch) {
          const key = `${entry.database || ''}|${entry.name || ''}|${entry.phone || ''}`
          if (!seen.has(key)) { seen.add(key); allEntries.push(entry) }
        }
      }

      setOsintKitResults(allEntries)
      setOsintKitTotal(allEntries.length)
      if (allEntries.length === 0) setOsintKitError('')
    } catch (e: any) {
      setOsintKitError(e.message)
    } finally {
      setOsintKitLoading(false)
    }
  }

  // ── Зберегти дані OsintKit / LeakOsint в картку особи ──────────────────────
  async function saveLeakDataToDb(entries: any[], sourceName: string,
    setSaving: (v: boolean) => void, setSaved: (v: boolean) => void) {
    setSaving(true)
    try {
      const uniq = (a: string[]) => [...new Set(a.filter(Boolean))]
      const phones = uniq(entries.flatMap(e => {
        const all: string[] = []
        if (e.phone) all.push(String(e.phone).replace(/\D/g,''))
        if (e.extra_phones) all.push(...String(e.extra_phones).split(/[,;]/).map((s: string) => s.replace(/\D/g,'')))
        return all.filter(p => p.length >= 9)
      }))
      const emails = uniq(entries.flatMap(e => e.email ? [String(e.email).toLowerCase().trim()] : []))
      const addresses = uniq(entries.flatMap(e => e.address ? [String(e.address).trim()] : []))
      const inns = uniq(entries.flatMap(e => e.inn ? [String(e.inn).trim()] : []))
      const passports = uniq(entries.flatMap(e => e.passport ? [String(e.passport).trim()] : []))
      const vkUrls = uniq(entries.flatMap(e => e.vk_id ? [String(e.vk_id)] : []))

      const patch: Record<string, any> = {}

      if (phones.length > 0) {
        const existing: string[] = Array.isArray(person.phones) ? person.phones : []
        const merged = uniq([...existing, ...phones]).slice(0, 20)
        if (merged.length > existing.length) patch.phones = merged
      }
      if (emails.length > 0 && !person.email) patch.email = emails[0]
      if (addresses.length > 0 && !person.addr_live) patch.addr_live = addresses[0]
      if (inns.length > 0 && !person.ipn) patch.ipn = inns[0]
      if (passports.length > 0 && !person.passport) patch.passport = passports[0]
      if (vkUrls.length > 0 && !person.vk_url) patch.vk_url = vkUrls[0]

      // Додаємо тег "перевірено"
      const existingTags: string[] = Array.isArray(person.tags) ? person.tags : []
      if (!existingTags.includes('перевірено')) {
        patch.tags = [...existingTags, 'перевірено']
      }

      if (Object.keys(patch).length === 0) {
        alert(`${sourceName}: всі знайдені дані вже є в картці`)
        return
      }

      const res = await fetch(`/api/persons/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const saved: string[] = []
      if (patch.phones) saved.push(`📱 ${patch.phones.length} тел.`)
      if (patch.email) saved.push(`✉️ email`)
      if (patch.addr_live) saved.push(`📍 адреса`)
      if (patch.ipn) saved.push(`ІПН`)
      if (patch.passport) saved.push(`🪪 паспорт`)
      if (patch.vk_url) saved.push(`VK`)
      alert(`${sourceName}: збережено в базу:\n${saved.join(', ')}`)
      setSaved(true)
      // Перезавантажуємо дані особи
      window.location.reload()
    } catch (e: any) {
      alert(`Помилка збереження: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── LeakOsint: пошук по 800+ БД РФ/СНД ──────────────────────────────────────
  async function runLeakOsint() {
    setLeakOsintLoading(true); setLeakOsintError(''); setLeakOsintRan(true)
    try {
      const name = person.name_rus || person.name_ukr || person.name || ''
      if (!name) { setLeakOsintError('Немає імені для пошуку'); return }

      const res = await fetch('/api/leaks/leakosint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: name, limit: 100 }),
      })
      const data = await res.json()
      if (data.error) { setLeakOsintError(data.error); return }
      setLeakOsintResults(data.entries || [])
      setLeakOsintTotal(data.total || data.entries?.length || 0)
    } catch (e: any) {
      setLeakOsintError(e.message)
    } finally {
      setLeakOsintLoading(false)
    }
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

  // 🏛️ Перевірка по всіх реєстрах одночасно
  async function runRegistriesCheck(forceName?: string) {
    if (regLoading) return
    setRegLoading(true)
    const name = forceName || person?.name_ukr || person?.name_rus || person?.name || ''
    if (!name || name.length < 3) { setRegLoading(false); return }
    const lastName = name.trim().split(/\s+/)[0]
    const [nazkRes, myroRes, erbRes, mvsRes, sanctionsRes, companyRes] = await Promise.allSettled([
      fetch('/api/nazk/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: name }),
      }).then(r => r.json()),
      fetch('/api/myrotvorets/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: name }),
      }).then(r => r.json()),
      fetch('/api/erb/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: lastName, last_name: lastName }),
      }).then(r => r.json()),
      fetch('/api/mvs/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: name, resource: 'wanted' }),
      }).then(r => r.json()),
      fetch('/api/sanctions/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: name }),
      }).then(r => r.json()),
      fetch('/api/company/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: lastName }),
      }).then(r => r.json()),
    ])
    if (nazkRes.status === 'fulfilled') setRegNazk(nazkRes.value)
    if (myroRes.status === 'fulfilled') setRegMyrotvorets(myroRes.value)
    if (erbRes.status === 'fulfilled') setRegErb(erbRes.value)
    if (mvsRes.status === 'fulfilled') setRegMvs(mvsRes.value)
    if (sanctionsRes.status === 'fulfilled') setRegSanctions(sanctionsRes.value)
    if (companyRes.status === 'fulfilled') setRegCompany(companyRes.value)
    setRegAutoRan(true)
    setRegLoading(false)
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
      if (res.status === 403 || (!data.success && !data.results)) {
        setVpnError(data.error || data.reason || data.message || 'Помилка VPN пошуку')
      } else {
        const results = data.results || []
        setVpnResults(results)
        if (results.length === 0) {
          setVpnError('Нічого не знайдено в ipbd.ru та leb.su (або сайти заблокували запит)')
        }
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
        // Автоматично зберігаємо telegram_raw в БД якщо є результати
        if (raw.length > 0) {
          const existingRaw: any[] = person.telegram_raw || []
          const newEntry = {
            searched_at: new Date().toISOString(),
            query: dob ? `${q} ${dob}` : q,
            bot: '@PeopleFindBaseBot',
            leaks: raw.map((r: any) => ({
              source_label: r.source_label,
              page: r.page || 1,
              snippet: r.snippet,
              fields: r.fields || {},
              url: r.url || null,
              date: r.date || null,
            }))
          }
          // Зберігаємо у фоні — не блокуємо UI
          fetch(`/api/persons/${params.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_raw: [...existingRaw, newEntry] }),
          }).then(() => {
            // Оновлюємо person в стейті щоб overview показував нові дані
            fetch(`/api/persons/${params.id}`)
              .then(r => r.json())
              .then(updated => setPerson(updated))
              .catch(() => {})
          }).catch(() => {})
        }
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
    const updatedPerson = await refreshed.json()
    setPerson(updatedPerson)
    // Автоматично генеруємо AI-профіль з новими даними
    setActiveTab('overview')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Запускаємо AI аналіз у фоні (не блокуємо UI)
    setAiLoading(true)
    setAiError('')
    fetch(`/api/osint/ai-profile/${params.id}`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.ai_profile || data.threat_score !== undefined) {
          setPerson((prev: any) => ({
            ...prev,
            ai_profile: data.ai_profile || prev.ai_profile,
            threat_score: data.threat_score ?? prev.threat_score,
          }))
        }
        if (data.error && !data.ai_profile) setAiError(`⚠️ AI: ${data.error}`)
      })
      .catch(() => {})
      .finally(() => setAiLoading(false))
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

  // Всі фото особи: головне + manual + evidence
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

  async function addPersonPhoto(url: string) {
    if (!url.trim()) return
    setSavingNewPhoto(true)
    try {
      const current: any[] = person.person_photos || []
      const newEntry = { url: url.trim(), source: 'manual', added_at: new Date().toISOString() }
      const updates: any = { person_photos: [...current, newEntry] }
      if (!person.photo_url) updates.photo_url = url.trim()
      await fetch(`/api/persons/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      setPerson((p: any) => ({ ...p, ...updates }))
      setAddingPhotoUrl('')
    } finally { setSavingNewPhoto(false) }
  }

  async function removePersonPhoto(url: string) {
    const current: any[] = person.person_photos || []
    const updated = current.filter((p: any) => !(p.source === 'manual' && p.url === url))
    const isMain = person.photo_url === url
    const remaining = updated
      .filter((p: any) => p.source === 'manual' && p.url)
      .map((p: any) => p.url as string)
    const updates: any = { person_photos: updated }
    if (isMain) updates.photo_url = remaining[0] || null
    await fetch(`/api/persons/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    setPerson((p: any) => ({ ...p, ...updates }))
  }

  async function setMainPersonPhoto(url: string) {
    await fetch(`/api/persons/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_url: url }),
    })
    setPerson((p: any) => ({ ...p, photo_url: url }))
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
  const osintPdfsAll = osintData?.vectors.flatMap(v =>
    v.results.filter(r => r.link.toLowerCase().endsWith('.pdf') || r.title.toLowerCase().includes('[pdf]'))
  ) ?? []
  // Фільтруємо PDF — тільки з достатньою релевантністю або з прізвищем в тексті
  const personSurnameForFilter = (person?.name_rus || person?.name || '').split(' ')[0]?.toLowerCase() || ''
  const osintPdfs = osintPdfsAll.filter(r => {
    const rel = r.relevanceScore ?? 100
    if (rel >= 60) return true
    if (personSurnameForFilter.length >= 4) {
      const text = `${r.title} ${r.snippet || ''}`.toLowerCase()
      return text.includes(personSurnameForFilter)
    }
    return rel >= 45
  })
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
              📄 Звіт PDF
            </a>
            <button onClick={() => runOsint()} disabled={osintLoading}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-60 rounded-lg text-sm font-medium transition flex items-center gap-2">
              {osintLoading ? <><span className="animate-spin">⟳</span> Пошук...</> : <>🔍 OSINT</>}
            </button>
          </div>
        </header>

        {/* Name banner з фото */}
        <div className="bg-gray-800/40 border-b border-gray-700 px-6 py-3 flex items-center gap-4">
          {/* Фото-галерея */}
          <div className="relative shrink-0 flex gap-1.5 items-end pb-1">
            {allPersonPhotos.length > 0 ? (
              <>
                {allPersonPhotos.slice(0, 5).map((url, idx) => (
                  <div key={idx} className="relative group shrink-0">
                    <img
                      src={url}
                      alt={personName}
                      onClick={() => setPhotoLightboxIdx(idx)}
                      className={`cursor-zoom-in object-cover rounded-lg border-2 transition
                        ${idx === 0
                          ? 'w-16 h-16 border-blue-500 hover:border-blue-300'
                          : 'w-11 h-11 border-gray-600 opacity-80 hover:opacity-100 hover:border-gray-400'
                        }`}
                      title={idx === 0 ? 'Головне фото' : `Фото ${idx + 1}`}
                    />
                    {idx === 0 && (
                      <span className="absolute top-0.5 left-0.5 text-[8px] bg-blue-600 text-white rounded px-0.5 leading-tight">★</span>
                    )}
                  </div>
                ))}
                {allPersonPhotos.length > 5 && (
                  <div
                    onClick={() => setPhotoLightboxIdx(0)}
                    className="w-11 h-11 shrink-0 rounded-lg bg-gray-700 border-2 border-gray-600 flex items-center justify-center text-xs text-gray-300 cursor-pointer hover:bg-gray-600 font-medium"
                  >+{allPersonPhotos.length - 5}</div>
                )}
              </>
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gray-700 border-2 border-gray-600 flex items-center justify-center text-2xl">
                👤
              </div>
            )}
            <button
              onClick={() => { setEditingPhoto(true); setAddingPhotoUrl('') }}
              className="absolute -bottom-2 -right-2 w-6 h-6 bg-blue-600 hover:bg-blue-500 rounded-full text-xs flex items-center justify-center transition shadow-lg"
              title="Управління фото">
              ✏️
            </button>
          </div>

          {/* Лайтбокс з навігацією */}
          {photoLightboxIdx !== null && allPersonPhotos.length > 0 && (
            <div
              className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
              onClick={() => setPhotoLightboxIdx(null)}
            >
              <div className="relative flex flex-col items-center max-w-3xl w-full" onClick={e => e.stopPropagation()}>
                {/* Головне зображення */}
                <img
                  src={allPersonPhotos[photoLightboxIdx]}
                  alt={personName}
                  className="max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl"
                />
                <div className="mt-2 text-gray-300 text-sm text-center">
                  {personName}
                  {allPersonPhotos.length > 1 && (
                    <span className="text-gray-500 ml-2">{photoLightboxIdx + 1} / {allPersonPhotos.length}</span>
                  )}
                </div>

                {/* Мініатюри */}
                {allPersonPhotos.length > 1 && (
                  <div className="flex gap-2 mt-3 flex-wrap justify-center">
                    {allPersonPhotos.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        onClick={() => setPhotoLightboxIdx(idx)}
                        className={`w-12 h-12 object-cover rounded-lg cursor-pointer border-2 transition
                          ${idx === photoLightboxIdx ? 'border-blue-400 opacity-100' : 'border-gray-600 opacity-50 hover:opacity-80'}`}
                      />
                    ))}
                  </div>
                )}

                {/* Кнопка закрити */}
                <button
                  onClick={() => setPhotoLightboxIdx(null)}
                  className="absolute top-0 right-0 -translate-y-3 translate-x-3 w-8 h-8 bg-gray-700 hover:bg-red-700 rounded-full text-white flex items-center justify-center transition text-sm"
                >✕</button>

                {/* Відкрити оригінал */}
                <a
                  href={allPersonPhotos[photoLightboxIdx]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-0 left-0 -translate-y-3 -translate-x-3 w-8 h-8 bg-gray-700 hover:bg-blue-700 rounded-full text-white flex items-center justify-center transition text-xs"
                  title="Відкрити оригінал"
                >↗</a>

                {/* Стрілка назад */}
                {photoLightboxIdx > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setPhotoLightboxIdx(i => i! - 1) }}
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-10 text-white text-4xl hover:text-gray-300 px-2"
                  >‹</button>
                )}
                {/* Стрілка вперед */}
                {photoLightboxIdx < allPersonPhotos.length - 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); setPhotoLightboxIdx(i => i! + 1) }}
                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-10 text-white text-4xl hover:text-gray-300 px-2"
                  >›</button>
                )}

                {/* Зробити головним */}
                {allPersonPhotos[photoLightboxIdx] !== person.photo_url && (
                  <button
                    onClick={() => { setMainPersonPhoto(allPersonPhotos[photoLightboxIdx!]); setPhotoLightboxIdx(null) }}
                    className="mt-2 px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition"
                  >★ Зробити головним</button>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xl font-bold text-blue-400 truncate">{personName}</span>
              {person.dob && (() => {
                const year = person.dob.match(/(\d{4})/)?.[1]
                const age = year ? new Date().getFullYear() - parseInt(year) : null
                return (
                  <span className="text-gray-400 text-sm font-mono shrink-0">
                    {person.dob.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1')}
                    {age ? ` (${age} р.)` : ''}
                  </span>
                )
              })()}
              {person.name_rus && person.name_ukr && person.name_rus !== personName && (
                <span className="text-gray-500 text-sm">{person.name_rus}</span>
              )}
              {person.name_eng && <span className="text-gray-600 text-xs">{person.name_eng}</span>}
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
              onClick={() => {
                const printUrl = `/persons/${params.id}/report`
                window.open(printUrl, '_blank')
              }}
              className="px-3 py-1.5 bg-indigo-800 hover:bg-indigo-700 text-indigo-200 rounded-lg text-xs transition">
              📄 PDF звіт
            </button>
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

        {/* Менеджер фото */}
        {editingPhoto && (
          <div className="bg-blue-950/80 border-b border-blue-800 px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-blue-300 font-semibold text-sm">🖼️ Фото особи</span>
              <button onClick={() => { setEditingPhoto(false); setAddingPhotoUrl('') }}
                className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
            </div>

            {/* Поточні фото */}
            {allPersonPhotos.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-3">
                {allPersonPhotos.map((url, idx) => {
                  const isMain = url === person.photo_url || (idx === 0 && !person.photo_url)
                  const isManual = ((person.person_photos || []) as any[]).some((p: any) => p.source === 'manual' && p.url === url)
                  const isEvidence = evidenceItems.some(e => e.file_url === url)
                  return (
                    <div key={idx} className="relative group">
                      <img
                        src={url}
                        onClick={() => setPhotoLightboxIdx(idx)}
                        className={`w-14 h-14 object-cover rounded-lg border-2 cursor-pointer transition
                          ${isMain ? 'border-blue-500' : 'border-gray-600 hover:border-gray-400'}`}
                      />
                      {isMain && (
                        <span className="absolute top-0.5 left-0.5 text-[8px] bg-blue-600 text-white rounded px-0.5 leading-tight">★</span>
                      )}
                      {isEvidence && !isMain && (
                        <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-gray-800/80 text-gray-300 rounded px-0.5 leading-tight">📁</span>
                      )}
                      {/* Зробити головним */}
                      {!isMain && (
                        <button
                          onClick={() => setMainPersonPhoto(url)}
                          className="absolute top-0 left-0 hidden group-hover:flex w-5 h-5 bg-blue-700 rounded-br-lg text-white text-[9px] items-center justify-center"
                          title="Зробити головним"
                        >★</button>
                      )}
                      {/* Видалити (manual або evidence) */}
                      {(isManual || isEvidence) && (
                        <button
                          onClick={async () => {
                            if (isManual) { removePersonPhoto(url); return }
                            // видалення з evidence
                            const ev = evidenceItems.find(e => e.file_url === url)
                            if (ev) {
                              await fetch(`/api/evidence/${ev.id}`, { method: 'DELETE' })
                              setEvidenceItems(prev => prev.filter(e => e.id !== ev.id))
                              if (person.photo_url === url) setMainPersonPhoto('')
                            }
                          }}
                          className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-5 h-5 bg-red-600 hover:bg-red-500 rounded-full text-white text-xs items-center justify-center"
                          title="Видалити"
                        >✕</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Завантаження файлу або URL */}
            <div className="flex gap-2 items-center">
              {/* Завантажити файл */}
              <label className="cursor-pointer px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm text-gray-200 transition whitespace-nowrap flex items-center gap-1.5" title="Завантажити з комп'ютера">
                📁 Файл
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file || !person?.id) return
                    setSavingNewPhoto(true)
                    try {
                      const fd = new FormData()
                      fd.append('file', file)
                      fd.append('person_id', person.id)
                      fd.append('source', 'manual')
                      const res = await fetch('/api/evidence/upload', { method: 'POST', body: fd })
                      const data = await res.json()
                      if (data.evidence) {
                        setEvidenceItems(prev => [data.evidence, ...prev])
                      }
                    } finally { setSavingNewPhoto(false); e.target.value = '' }
                  }}
                />
              </label>
              {/* URL */}
              <input
                type="text"
                value={addingPhotoUrl}
                onChange={e => setAddingPhotoUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPersonPhoto(addingPhotoUrl)}
                placeholder="або вставте URL фото..."
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => addPersonPhoto(addingPhotoUrl)}
                disabled={!addingPhotoUrl.trim() || savingNewPhoto}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-sm transition whitespace-nowrap"
              >
                {savingNewPhoto ? <span className="animate-spin inline-block">⟳</span> : '➕'}
              </button>
            </div>
            <p className="text-gray-600 text-xs mt-1.5">★ = головне фото · наведіть для управління · завантажуйте з комп'ютера або URL</p>
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
              {tab.id === 'registries' && regLoading && (
                <span className="ml-1 animate-spin text-xs">⟳</span>
              )}
              {tab.id === 'registries' && !regLoading && regAutoRan && (() => {
                const hits = (regNazk?.found || 0) + (regMyrotvorets?.found || 0) + (regErb?.found || 0) + (regMvs?.total || 0) + (regSanctions?.total || 0)
                return hits > 0 ? <span className="ml-1 bg-red-700 text-red-200 text-xs px-1.5 py-0.5 rounded-full">{hits}</span> : null
              })()}
              {tab.id === 'osint' && osintData && (
                <span className="ml-1 bg-purple-800 text-purple-200 text-xs px-1.5 py-0.5 rounded-full">{osintData.total}</span>
              )}
              {tab.id === 'documents' && (evidenceItems.length > 0 || osintPdfsAll.length > 0) && (
                <span className="ml-1 bg-yellow-800 text-yellow-200 text-xs px-1.5 py-0.5 rounded-full">
                  {evidenceItems.length > 0 ? evidenceItems.length : osintPdfs.length}
                </span>
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
            // Додаємо телефони та email з ai_profile.persons[0] (може мати більше даних)
            const aiP0 = (() => { const ap = typeof person.ai_profile === 'object' ? person.ai_profile : null; return ap?.persons?.[0] || null })()
            const aiPhones: string[] = aiP0?.phones || []
            const aiEmails: string[] = aiP0?.emails || []
            const allPhones = Array.from(new Set([...(person.phones || []), ...aiPhones, ...tgPhones]))
            const allCarPlates = Array.from(new Set(tgCarPlates))
            const allEmails = Array.from(new Set([...(person.email ? [person.email] : []), ...aiEmails, ...tgEmails]))
            const tgLastSearch = person.telegram_raw?.length
              ? new Date(person.telegram_raw[person.telegram_raw.length - 1].searched_at).toLocaleString('uk-UA')
              : null

            // Топ OSINT згадки (з бази person_mentions)
            const topMentions = personMentions.slice(0, 8)
            const myrotvoretsSnippet = personMentions.find(m => m.source_name?.includes('myrotvorets'))

            return (
              <div className="space-y-4">

                {/* ── Hero: Threat Score + Quick Stats ── */}
                <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Threat Score */}
                    <div className="flex items-center gap-3">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold border-4 shrink-0 ${
                        (person.threat_score || 0) >= 80 ? 'border-red-500 bg-red-950/60 text-red-300' :
                        (person.threat_score || 0) >= 50 ? 'border-orange-500 bg-orange-950/60 text-orange-300' :
                        (person.threat_score || 0) >= 20 ? 'border-yellow-500 bg-yellow-950/60 text-yellow-300' :
                        'border-gray-600 bg-gray-800 text-gray-400'
                      }`}>
                        {person.threat_score || '?'}
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs uppercase tracking-wide">Threat Score</p>
                        <p className={`text-sm font-semibold ${
                          (person.threat_score || 0) >= 80 ? 'text-red-400' :
                          (person.threat_score || 0) >= 50 ? 'text-orange-400' :
                          (person.threat_score || 0) >= 20 ? 'text-yellow-400' : 'text-gray-500'
                        }`}>
                          {(person.threat_score || 0) >= 80 ? '🔴 Критичний' :
                           (person.threat_score || 0) >= 50 ? '🟠 Високий' :
                           (person.threat_score || 0) >= 20 ? '🟡 Помірний' : '⚪ Не оцінено'}
                        </p>
                      </div>
                    </div>

                    <div className="h-12 w-px bg-gray-700 hidden md:block" />

                    {/* Quick Stats */}
                    <div className="flex gap-4 flex-wrap flex-1">
                      {[
                        { icon: '⚖️', label: 'Злочинів', value: incidents.length, color: incidents.length > 0 ? 'text-red-400' : 'text-gray-500' },
                        { icon: '🔗', label: 'Зв\'язків', value: person.connections_count || 0, color: 'text-blue-400' },
                        { icon: '📜', label: 'НАЗК декл.', value: regNazk?.total || 0, color: regNazk?.total > 0 ? 'text-yellow-400' : 'text-gray-500' },
                        { icon: '🔍', label: 'OSINT хітів', value: osintData?.total || personMentions.length, color: 'text-purple-400' },
                        { icon: '💧', label: 'Витоки', value: (person.telegram_raw || []).flatMap((e: any) => e.leaks || []).length, color: 'text-amber-400' },
                      ].map(({ icon, label, value, color }) => (
                        <div key={label} className="text-center">
                          <p className={`text-lg font-bold ${color}`}>{value}</p>
                          <p className="text-gray-500 text-xs">{icon} {label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Quick actions */}
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setActiveTab('registries')}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition">
                        🏛️ Реєстри
                      </button>
                      <button onClick={() => runOsint(true)}
                        disabled={osintLoading}
                        className="px-3 py-1.5 bg-purple-800 hover:bg-purple-700 disabled:opacity-50 text-purple-200 rounded-lg text-xs transition">
                        {osintLoading ? '⟳' : '🔍 OSINT'}
                      </button>
                    </div>
                  </div>

                  {/* AI summary — тільки текстове резюме без JSON */}
                  {person.ai_profile && (() => {
                    const ap = typeof person.ai_profile === 'object'
                      ? person.ai_profile
                      : (() => { try { return JSON.parse(person.ai_profile) } catch { return null } })()
                    const summary: string = ap?.summary || ap?.persons?.[0]?.notes || ''
                    if (!summary) return null
                    return (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">🤖 AI Резюме</p>
                        <p className="text-gray-300 text-sm leading-relaxed line-clamp-3">{summary}</p>
                      </div>
                    )
                  })()}
                </div>

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

                {/* ── AI Profile Card — одразу після hero ── */}
                {person.ai_profile && (
                  <div>
                    {person.last_full_osint && (
                      <p className="text-gray-600 text-xs text-right mb-1">
                        AI оновлено: {new Date(person.last_full_osint).toLocaleString('uk-UA')}
                      </p>
                    )}
                    <AiProfileCard
                      aiProfileRaw={person.ai_profile || ''}
                      threatScore={person.threat_score}
                      onRefresh={runAiProfile}
                      loading={aiLoading}
                      error={aiError}
                    />
                  </div>
                )}
                {!person.ai_profile && (
                  <AiProfileCard
                    aiProfileRaw=""
                    threatScore={person.threat_score}
                    onRefresh={runAiProfile}
                    loading={aiLoading}
                    error={aiError}
                  />
                )}

                {/* ── Фото та Документи у досьє ── */}
                {(evidenceItems.length > 0) && (() => {
                  const evPhotos  = evidenceItems.filter(e => e.ev_type === 'photo')
                  const evVideos  = evidenceItems.filter(e => e.ev_type === 'video')
                  const evDocs    = evidenceItems.filter(e => e.ev_type === 'document' || e.ev_type === 'audio')
                  return (
                    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-gray-300 font-semibold text-sm">📎 Файли та докази</p>
                        <button
                          onClick={() => setActiveTab('documents')}
                          className="text-blue-400 hover:text-blue-300 text-xs"
                        >Всі {evidenceItems.length} →</button>
                      </div>

                      {/* Фото-стрічка */}
                      {evPhotos.length > 0 && (
                        <div className="mb-3">
                          <p className="text-gray-500 text-xs mb-2">🖼️ Фото ({evPhotos.length})</p>
                          <div className="flex gap-2 flex-wrap">
                            {evPhotos.map((item, idx) => (
                              <img
                                key={item.id}
                                src={item.file_url}
                                alt={item.original_name}
                                onClick={() => setPhotoLightboxIdx(allPersonPhotos.indexOf(item.file_url) >= 0 ? allPersonPhotos.indexOf(item.file_url) : 0)}
                                className="w-20 h-20 object-cover rounded-lg border border-gray-600 cursor-zoom-in hover:border-blue-500 transition"
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Відео */}
                      {evVideos.length > 0 && (
                        <div className="mb-3">
                          <p className="text-gray-500 text-xs mb-2">🎬 Відео ({evVideos.length})</p>
                          <div className="flex gap-2 flex-wrap">
                            {evVideos.map(item => (
                              <a
                                key={item.id}
                                href={item.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300 transition max-w-xs truncate"
                              >
                                🎬 {item.original_name}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Документи */}
                      {evDocs.length > 0 && (
                        <div>
                          <p className="text-gray-500 text-xs mb-2">📄 Документи ({evDocs.length})</p>
                          <div className="space-y-1.5">
                            {evDocs.map(item => (
                              <a
                                key={item.id}
                                href={item.mime_type === 'text/html' ? `/api/evidence/view/${item.id}` : item.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-3 py-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition group"
                              >
                                <span className="text-lg">
                                  {item.mime_type === 'application/pdf' ? '📄' :
                                   item.mime_type?.includes('word') ? '📝' :
                                   item.mime_type === 'text/html' ? '🌐' : '📁'}
                                </span>
                                <span className="text-gray-300 text-xs flex-1 truncate group-hover:text-white">
                                  {item.original_name}
                                </span>
                                <span className="text-gray-600 text-xs shrink-0">
                                  {item.file_size ? `${(item.file_size / 1024).toFixed(0)} KB` : ''}
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

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
                    {/* Транспорт — з ai_profile або tg витоків */}
                    {(() => {
                      const aiVehicles: string[] = (() => {
                        const ap = typeof person.ai_profile === 'object' ? person.ai_profile : null
                        return ap?.persons?.[0]?.vehicles || []
                      })()
                      const dbVehicles: any[] = Array.isArray(person.vehicles) ? person.vehicles : []
                      const hasTransport = aiVehicles.length > 0 || dbVehicles.length > 0
                        || allCarPlates.length > 0 || tgFieldMap.vin || tgFieldMap.car_info

                      return hasTransport ? (
                        <div className="mb-3 mt-2 pt-2 border-t border-gray-700">
                          <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">🚗 Транспорт</p>
                          {aiVehicles.length > 0 && (
                            <div className="space-y-1.5 mb-2">
                              {aiVehicles.map((v: string, i: number) => (
                                <div key={i} className="bg-gray-900/50 rounded px-2 py-1 border border-gray-700">
                                  <p className="text-gray-200 text-xs">{v}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {dbVehicles.length > 0 && aiVehicles.length === 0 && (
                            <div className="space-y-1.5 mb-2">
                              {dbVehicles.map((v: any, i: number) => (
                                <div key={i} className="bg-gray-900/50 rounded px-2 py-1 border border-gray-700">
                                  <p className="text-gray-200 text-xs">{typeof v === 'string' ? v : (v.raw || v.plate || JSON.stringify(v))}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {allCarPlates.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {allCarPlates.map((p: string, i: number) => (
                                <span key={i} className="text-yellow-300 text-sm font-mono bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-800/50">{p}</span>
                              ))}
                            </div>
                          )}
                          {tgFieldMap.vin && <Field label="VIN" value={tgFieldMap.vin} />}
                          {tgFieldMap.car_info && <Field label="Авто" value={tgFieldMap.car_info} />}
                        </div>
                      ) : null
                    })()}
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
                        <div className="flex flex-col gap-1">
                          {allPhones.map((p: string, i: number) => (
                            <a key={i} href={`/breach-intel?q=${encodeURIComponent(p.replace(/\D/g,''))}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300 text-sm font-mono hover:underline transition flex items-center gap-1 group">
                              📱 {p}
                              <span className="text-gray-600 group-hover:text-gray-400 text-xs">↗</span>
                            </a>
                          ))}
                        </div>
                        <p className="text-gray-600 text-xs mt-1">↗ Клік — пошук по всіх базах</p>
                      </div>
                    )}
                    {allEmails.length > 0 && (
                      <div className="mb-3">
                        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Email ({allEmails.length})</p>
                        <div className="flex flex-col gap-1">
                          {allEmails.map((em: string, i: number) => (
                            <a key={i} href={`/breach-intel?q=${encodeURIComponent(em)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 text-sm font-mono hover:underline transition flex items-center gap-1 group">
                              ✉️ {em}
                              <span className="text-gray-600 group-hover:text-gray-400 text-xs">↗</span>
                            </a>
                          ))}
                        </div>
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
                    {(() => {
                      // ── Парсимо ai_profile (може бути рядок АБО об'єкт) ──
                      const aiObj: any = (() => {
                        const raw = person.ai_profile
                        if (!raw) return null
                        if (typeof raw === 'object') return raw
                        try { return JSON.parse(raw as string) } catch { return null }
                      })()
                      const aiP0: any = aiObj?.persons?.[0] || null

                      // ── Родичі з ai_profile + збагачення даними з persons[] ──
                      const allPersonsMap: Record<number, any> = {}
                      if (aiObj?.persons) {
                        for (const p of aiObj.persons) {
                          if (p.id) allPersonsMap[p.id] = p
                        }
                      }

                      // Знаходимо id родичів через relationships
                      const relIdByName: Record<string, number> = {}
                      for (const r of (aiObj?.relationships || [])) {
                        const p2 = allPersonsMap[r.person2_id]
                        if (p2?.full_name) relIdByName[p2.full_name.toLowerCase()] = r.person2_id
                      }

                      const aiRelatives: any[] = (aiP0?.relatives || []).map((rel: any) => {
                        // Знаходимо відповідну особу в persons[] для збагачення даними
                        const personId = relIdByName[(rel.name || '').toLowerCase()]
                        const enriched = personId ? allPersonsMap[personId] : null
                        return {
                          ...rel,
                          phones: enriched?.phones?.length ? enriched.phones : (rel.phones || []),
                          emails: enriched?.emails?.length ? enriched.emails : (rel.emails || []),
                          addresses: enriched?.addresses?.length ? enriched.addresses : (rel.addresses || []),
                          passports: enriched?.passports || rel.passports || [],
                          inn: enriched?.inn || rel.inn || null,
                        }
                      })

                      // ── Родичі з БД (person.relatives) — парсимо JSON-рядки якщо треба ──
                      const dbRelatives: any[] = (() => {
                        const raw = Array.isArray(person.relatives) ? person.relatives : []
                        return raw.map((r: any) => {
                          if (typeof r === 'string') {
                            try { return JSON.parse(r) } catch { return { name: r } }
                          }
                          return r
                        })
                      })()

                      // ── Об'єднуємо: AI пріоритетніше, дедублікація по імені ──
                      const seen = new Set<string>()
                      const allRels: any[] = []
                      for (const r of [...aiRelatives, ...dbRelatives]) {
                        const nm = (r.name || r.full_name || '').toLowerCase()
                        if (nm && seen.has(nm)) continue
                        if (nm) seen.add(nm)
                        allRels.push(r)
                      }

                      // ── Зв'язки між особами (relationships[]) ──
                      const relationships: any[] = aiObj?.relationships || []

                      const ICONS: Record<string, string> = {
                        'батько': '👨', 'мати': '👩', 'брат': '👦', 'сестра': '👧',
                        'дружина': '💍', 'чоловік': '💍', 'дитина': '👶',
                        'дід': '👴', 'баба': '👵', 'бабуся': '👵', 'онук': '👦',
                        'племінниця': '👧', 'племінник': '👦', 'дядько': '👨', 'тітка': '👩',
                        'родич': '🧑', 'брат/сестра': '🧑',
                      }

                      if (allRels.length === 0 && relationships.length === 0 && !tgFieldMap.relatives) {
                        return <p className="text-gray-600 text-sm italic">Дані відсутні</p>
                      }

                      return (
                        <div className="space-y-2">
                          {allRels.map((rel: any, i: number) => {
                            // Support both 'role' (new format) and 'relation' (legacy)
                            const relLabel = rel.role || rel.relation || ''
                            const relStr = relLabel.toLowerCase()
                            const icon = Object.entries(ICONS).find(([k]) => relStr.includes(k))?.[1] || '👤'
                            const name = rel.name || rel.full_name || '—'
                            const phones: string[] = rel.phones || (rel.phone ? [rel.phone] : [])
                            const emails: string[] = rel.emails || (rel.email ? [rel.email] : [])
                            const addresses: string[] = rel.addresses || (rel.address ? [rel.address] : [])
                            const hasExtra = phones.length > 0 || emails.length > 0 || addresses.length > 0 || rel.inn || rel.passports?.length
                            return (
                              <div key={i} className="bg-gray-900/60 rounded-xl border border-gray-700 overflow-hidden">
                                {/* Рядок імені */}
                                <div className="flex items-center justify-between px-3 py-2.5">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-base shrink-0">{icon}</span>
                                    <div className="min-w-0">
                                      <p className="text-gray-200 text-sm font-medium truncate">{name}</p>
                                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                        {rel.dob && (
                                          <span className="text-gray-500 text-xs">📅 {rel.dob}</span>
                                        )}
                                        {rel.inn && (
                                          <span className="text-yellow-600 text-xs font-mono">ІПН: {rel.inn}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-2">
                                    {relLabel && (
                                      <span className="text-xs px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full border border-blue-800/50">
                                        {relLabel}
                                      </span>
                                    )}
                                    {/* Пошук по базах за іменем */}
                                    <a
                                      href={`/breach-intel?q=${encodeURIComponent(name)}`}
                                      target="_blank" rel="noopener noreferrer"
                                      title="Пошук по базах даних"
                                      className="text-gray-600 hover:text-green-400 transition text-sm"
                                    >🔍</a>
                                  </div>
                                </div>
                                {/* Паспорти */}
                                {rel.passports?.length > 0 && (
                                  <div className="border-t border-gray-800 px-3 py-1.5 flex flex-wrap gap-1.5">
                                    {rel.passports.map((p: string, pi: number) => (
                                      <span key={pi} className="text-green-300 text-xs font-mono px-2 py-0.5 bg-green-950/30 border border-green-800/50 rounded">
                                        🪪 {p}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {/* Телефони */}
                                {phones.length > 0 && (
                                  <div className="border-t border-gray-800 px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-1">
                                    {phones.map((p: string, pi: number) => (
                                      <a key={pi}
                                        href={`/breach-intel?q=${encodeURIComponent(p.replace(/\D/g, ''))}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="text-green-400 hover:text-green-300 text-xs font-mono hover:underline transition">
                                        📱 {p}
                                      </a>
                                    ))}
                                  </div>
                                )}
                                {/* Emails */}
                                {emails.length > 0 && (
                                  <div className="border-t border-gray-800 px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-1">
                                    {emails.map((e: string, ei: number) => (
                                      <a key={ei}
                                        href={`/breach-intel?q=${encodeURIComponent(e)}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 text-xs font-mono hover:underline transition">
                                        ✉️ {e}
                                      </a>
                                    ))}
                                  </div>
                                )}
                                {/* Адреси */}
                                {addresses.length > 0 && (
                                  <div className="border-t border-gray-800 px-3 py-1.5 space-y-1">
                                    {addresses.map((addr: string, ai: number) => (
                                      <div key={ai} className="flex items-start gap-1.5 group">
                                        <span className="text-gray-600 text-xs mt-0.5 shrink-0">📍</span>
                                        <span className="text-gray-400 text-xs flex-1">{addr}</span>
                                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                          <a href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="text-blue-500 hover:text-blue-400 text-xs">🗺️</a>
                                          <a href={`/breach-intel?q=${encodeURIComponent(addr)}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="text-green-500 hover:text-green-400 text-xs">🔍</a>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}

                          {/* Встановлені зв'язки */}
                          {(relationships.length > 0 || tgFieldMap.relatives) && (
                            <div className="mt-1 pt-2 border-t border-gray-800">
                              <p className="text-gray-600 text-xs mb-1.5">🔗 Встановлені зв'язки</p>
                              {relationships.map((r: any, i: number) => (
                                <p key={i} className="text-gray-500 text-xs leading-relaxed">
                                  {r.type || r.relation_type}: {r.evidence || r.description || ''}
                                </p>
                              ))}
                              {tgFieldMap.relatives && !allRels.length && (
                                <p className="text-gray-400 text-xs whitespace-pre-wrap">{tgFieldMap.relatives}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}
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
                      <p className="text-gray-600 text-xs mt-0.5">ipbd.ru · leb.su · rusprofile.ru</p>
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

                {/* AI-профіль перенесено вище, одразу після hero */}

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

          {/* ═══ РЕЄСТРИ ═══ */}
          {activeTab === 'registries' && (
            <div className="space-y-4">
              {/* Заголовок + кнопка перезапуску */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold">🏛️ Перевірка по реєстрах</h3>
                  <p className="text-gray-500 text-xs mt-0.5">НАЗК · Миротворець · ЄРБ · МВС Розшук · OpenSanctions · ЄДР/ФОП</p>
                </div>
                <button
                  onClick={() => runRegistriesCheck()}
                  disabled={regLoading}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-sm font-medium transition flex items-center gap-2">
                  {regLoading ? <><span className="animate-spin">⟳</span> Перевірка...</> : '🔄 Оновити'}
                </button>
              </div>

              {/* Швидкий підсумок */}
              {regAutoRan && !regLoading && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { icon: '📜', label: 'НАЗК декл.', value: regNazk?.found || 0, total: regNazk?.total, color: regNazk?.found > 0 ? 'yellow' : 'gray' },
                    { icon: '🚨', label: 'Миротворець', value: regMyrotvorets?.found || 0, color: regMyrotvorets?.found > 0 ? 'red' : 'gray' },
                    { icon: '💳', label: 'ЄРБ боржники', value: regErb?.found || 0, color: regErb?.found > 0 ? 'orange' : 'gray' },
                    { icon: '🚔', label: 'МВС Розшук', value: regMvs?.total || 0, color: regMvs?.total > 0 ? 'red' : (regMvs?.fallback_url ? 'yellow' : 'gray') },
                    { icon: '🌍', label: 'Санкції', value: regSanctions?.total || 0, color: regSanctions?.total > 0 ? 'red' : 'gray' },
                    { icon: '🏢', label: 'ЄДР/ФОП', value: regCompany?.total || 0, color: regCompany?.total > 0 ? 'blue' : 'gray' },
                  ].map(({ icon, label, value, total, color }) => (
                    <div key={label} className={`rounded-xl p-4 border text-center ${
                      color === 'red' ? 'bg-red-950/50 border-red-700' :
                      color === 'orange' ? 'bg-orange-950/50 border-orange-700' :
                      color === 'yellow' ? 'bg-yellow-950/50 border-yellow-700' :
                      color === 'blue' ? 'bg-blue-950/50 border-blue-700' :
                      'bg-gray-800 border-gray-700'
                    }`}>
                      <div className="text-2xl mb-1">{icon}</div>
                      <div className={`text-2xl font-bold ${color === 'gray' ? 'text-gray-400' : 'text-white'}`}>
                        {value}{total && total > value ? <span className="text-sm text-gray-400">/{total}</span> : ''}
                      </div>
                      <div className="text-gray-400 text-xs mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── НАЗК Декларації ── */}
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                  <h4 className="text-yellow-400 font-semibold text-sm">📜 НАЗК — Декларації держслужбовців</h4>
                  {regNazk?.total > 0 && (
                    <a href={`https://public.nazk.gov.ua/search?query=${encodeURIComponent(personName)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-yellow-600 hover:text-yellow-400 text-xs">Відкрити на НАЗК →</a>
                  )}
                </div>
                {!regAutoRan && !regLoading && <p className="text-gray-600 text-sm italic">Буде перевірено автоматично при завантаженні</p>}
                {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Перевірка НАЗК...</p>}
                {regNazk && !regLoading && (
                  regNazk.found === 0
                    ? <p className="text-gray-500 text-sm italic">Декларацій не знайдено — особа не є держслужбовцем або не подавала декларацію</p>
                    : <div className="space-y-2">
                        <p className="text-yellow-300/80 text-xs mb-2">Знайдено {regNazk.total} декларацій, показано {regNazk.declarations?.length}</p>
                        {regNazk.declarations?.map((d: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg bg-yellow-950/20 border border-yellow-800/30">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-white text-sm font-medium">{d.full_name || d.last_name}</p>
                                <p className="text-yellow-300/70 text-xs mt-0.5">{d.position} · {d.organization}</p>
                                <p className="text-gray-500 text-xs">{d.declaration_type} · {d.declaration_year}</p>
                              </div>
                              <a href={d.url} target="_blank" rel="noopener noreferrer"
                                className="shrink-0 px-2 py-1 bg-yellow-900/50 hover:bg-yellow-800/60 text-yellow-300 text-xs rounded transition">
                                Відкрити →
                              </a>
                            </div>
                            {regNazk.latest?.id === d.id && regNazk.latest?.assets && (
                              <div className="mt-2 pt-2 border-t border-yellow-900/50 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                {regNazk.latest.assets.real_estate?.length > 0 && (
                                  <span className="text-gray-300">🏠 Нерухомість: {regNazk.latest.assets.real_estate.length} об'єктів</span>
                                )}
                                {regNazk.latest.assets.vehicles?.length > 0 && (
                                  <span className="text-gray-300">🚗 Авто: {regNazk.latest.assets.vehicles.length} шт</span>
                                )}
                                {regNazk.latest.assets.total_income_uah > 0 && (
                                  <span className="text-gray-300">💰 Дохід: {(regNazk.latest.assets.total_income_uah / 1000).toFixed(0)}k грн</span>
                                )}
                                {regNazk.latest.assets.cash?.length > 0 && (
                                  <span className="text-gray-300">💵 Готівка: {regNazk.latest.assets.cash.map((c: any) => `${c.amount?.toLocaleString()} ${c.currency}`).join(', ')}</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                )}
              </div>

              {/* ── Миротворець ── */}
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                  <h4 className="text-red-400 font-semibold text-sm">🚨 Миротворець</h4>
                  {regMyrotvorets?.found > 0 && (
                    <a href={`https://myrotvorets.center/?s=${encodeURIComponent(personName)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-red-500 hover:text-red-300 text-xs">Відкрити на сайті →</a>
                  )}
                </div>
                {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Перевірка Миротворця...</p>}
                {regMyrotvorets && !regLoading && (
                  regMyrotvorets.found === 0
                    ? <p className="text-green-600 text-sm">✅ У базі Миротворця не знайдено</p>
                    : <div className="space-y-2">
                        <p className="text-red-400/80 text-xs mb-2">⚠️ Знайдено {regMyrotvorets.found} записів</p>
                        {regMyrotvorets.results?.map((r: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg bg-red-950/20 border border-red-800/30">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-white text-sm font-medium">{r.title}</p>
                                {r.excerpt && <p className="text-gray-400 text-xs mt-1 line-clamp-2">{r.excerpt}</p>}
                                <p className="text-gray-600 text-xs mt-1">{r.date}</p>
                              </div>
                              <a href={r.url} target="_blank" rel="noopener noreferrer"
                                className="shrink-0 px-2 py-1 bg-red-900/50 hover:bg-red-800/60 text-red-300 text-xs rounded transition">
                                Відкрити →
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                )}
              </div>

              {/* ── ЄРБ Боржники ── */}
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                  <h4 className="text-orange-400 font-semibold text-sm">💳 ЄРБ — Реєстр боржників</h4>
                  {regErb?.fallback_url && (
                    <a href={regErb.fallback_url} target="_blank" rel="noopener noreferrer"
                      className="text-orange-500 hover:text-orange-300 text-xs">Перевірити вручну →</a>
                  )}
                </div>
                {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Перевірка ЄРБ...</p>}
                {regErb && !regLoading && (
                  regErb.found === 0
                    ? <p className="text-green-600 text-sm">✅ Боргів не знайдено{regErb.fallback_url ? ' (або захист від ботів — перевірте вручну)' : ''}</p>
                    : <div className="space-y-2">
                        <p className="text-orange-400/80 text-xs mb-2">Знайдено {regErb.found} записів про борги</p>
                        {regErb.debtors?.map((d: any, i: number) => (
                          <div key={i} className="p-3 rounded-lg bg-orange-950/20 border border-orange-800/30 text-sm">
                            <p className="text-white font-medium">{d.lastName} {d.firstName} {d.middleName}</p>
                            {d.birthDate && <p className="text-gray-400 text-xs">ДН: {d.birthDate}</p>}
                            {d.debtSum && <p className="text-orange-300 text-xs">Борг: {d.debtSum?.toLocaleString()} грн</p>}
                            {d.creditorName && <p className="text-gray-400 text-xs">Стягувач: {d.creditorName}</p>}
                          </div>
                        ))}
                      </div>
                )}
              </div>

              {/* ── МВС Розшук ── */}
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                  <h4 className="text-blue-400 font-semibold text-sm">🚔 МВС — Розшук</h4>
                  {regMvs?.fallback_url && (
                    <a href={regMvs.fallback_url} target="_blank" rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-300 text-xs">Перевірити на сайті →</a>
                  )}
                </div>
                {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Перевірка МВС...</p>}
                {regMvs && !regLoading && (
                  regMvs.fallback_url && regMvs.total === 0
                    ? <div>
                        <p className="text-gray-500 text-sm mb-2">OpenData МВС тимчасово недоступний. Перевірте вручну:</p>
                        <a href={regMvs.fallback_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-900/50 hover:bg-blue-800/60 text-blue-300 rounded-lg text-sm transition">
                          🚔 Відкрити МВС Розшук
                        </a>
                      </div>
                    : regMvs.total === 0
                      ? <p className="text-green-600 text-sm">✅ В розшуку МВС не значиться</p>
                      : <div className="space-y-2">
                          <p className="text-red-400/80 text-xs mb-2">⚠️ Знайдено {regMvs.total} записів у розшуку</p>
                          {regMvs.records?.map((r: any, i: number) => (
                            <div key={i} className="p-3 rounded-lg bg-blue-950/20 border border-blue-800/30 text-sm">
                              <p className="text-white font-medium">{r.LAST_NAME_U || r.lastname} {r.FIRST_NAME_U || r.firstname}</p>
                              {(r.BORN_DATE || r.dob) && <p className="text-gray-400 text-xs">ДН: {r.BORN_DATE || r.dob}</p>}
                              {(r.ARTICLE_CRIM || r.article) && <p className="text-red-400 text-xs">Стаття: {r.ARTICLE_CRIM || r.article}</p>}
                            </div>
                          ))}
                        </div>
                )}
              </div>

              {/* ── OpenSanctions — міжнародні санкційні списки ── */}
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                  <div>
                    <h4 className="text-red-400 font-semibold text-sm">🌍 Міжнародні санкційні списки</h4>
                    <p className="text-gray-600 text-xs mt-0.5">OFAC (США) · EU · ООН РБ · UK HMT · РНБО України · Інтерпол · Panama Papers</p>
                  </div>
                  <a href={`https://www.opensanctions.org/search/?q=${encodeURIComponent(personName)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-red-500 hover:text-red-300 text-xs shrink-0">OpenSanctions →</a>
                </div>
                {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Перевірка санкційних баз...</p>}
                {regSanctions && !regLoading && (
                  regSanctions.no_key
                    ? <div className="space-y-3">
                        <p className="text-yellow-500 text-sm">⚠️ API ключ OpenSanctions не налаштовано. Перевірте вручну:</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(regSanctions.fallback_urls || {}).map(([k, url]: any) => (
                            <a key={k} href={url} target="_blank" rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-red-900/30 hover:bg-red-800/50 text-red-300 text-xs rounded-lg border border-red-800/40 transition">
                              🔗 {k.toUpperCase()}
                            </a>
                          ))}
                        </div>
                        <p className="text-gray-600 text-xs">
                          Безплатний ключ: <a href="https://www.opensanctions.org/api/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">opensanctions.org/api</a>
                          {' → додайте '}<code className="bg-gray-900 px-1 rounded text-gray-300">OPENSANCTIONS_API_KEY</code>{' у .env.local'}
                        </p>
                      </div>
                    : regSanctions.error
                    ? <p className="text-red-500 text-sm">❌ Помилка: {regSanctions.error}</p>
                    : regSanctions.total === 0
                      ? <p className="text-green-600 text-sm">✅ У санкційних списках не знайдено</p>
                      : <div className="space-y-3">
                          <p className="text-red-400/80 text-xs mb-2">⚠️ Знайдено {regSanctions.total} збігів у {regSanctions.sources_checked?.length || 6} базах</p>
                          {(regSanctions.entries || []).slice(0, 8).map((e: any, i: number) => (
                            <div key={i} className={`p-3 rounded-lg border text-sm ${
                              e.is_priority ? 'bg-red-950/30 border-red-700/50' : 'bg-gray-900 border-gray-700'
                            }`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-white font-semibold">{e.name}</p>
                                    {e.is_priority && <span className="text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded">🇷🇺 Росія/Білорусь</span>}
                                    {e.schema === 'LegalEntity' && <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">🏢 Юрособа</span>}
                                  </div>
                                  {e.aliases?.length > 0 && (
                                    <p className="text-gray-400 text-xs mt-0.5">Alias: {e.aliases.join(', ')}</p>
                                  )}
                                  {e.dob && <p className="text-gray-500 text-xs">ДН: {e.dob}</p>}
                                  {e.positions?.length > 0 && (
                                    <p className="text-gray-400 text-xs">Посада: {e.positions.join('; ')}</p>
                                  )}
                                  {e.programs?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {e.programs.slice(0, 5).map((p: string, pi: number) => (
                                        <span key={pi} className="text-xs bg-red-900/60 text-red-300 border border-red-800/40 px-1.5 py-0.5 rounded">
                                          {p}
                                        </span>
                                      ))}
                                      {e.programs.length > 5 && (
                                        <span className="text-xs text-gray-500">+{e.programs.length - 5} ще</span>
                                      )}
                                    </div>
                                  )}
                                  {e.passports?.length > 0 && (
                                    <p className="text-gray-500 text-xs mt-1">Паспорт: {e.passports.join(', ')}</p>
                                  )}
                                </div>
                                <a href={e.url} target="_blank" rel="noopener noreferrer"
                                  className="shrink-0 px-2 py-1 bg-red-900/50 hover:bg-red-800/60 text-red-300 text-xs rounded transition">
                                  Деталі →
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                )}
                {!regAutoRan && !regLoading && (
                  <p className="text-gray-600 text-sm italic">Буде перевірено автоматично при завантаженні</p>
                )}
              </div>

              {/* ── ЄДР / ФОП / Бізнес-реєстри ── */}
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                  <div>
                    <h4 className="text-blue-400 font-semibold text-sm">🏢 Бізнес-реєстри (ЄДР · ФОП · YouControl)</h4>
                    <p className="text-gray-600 text-xs mt-0.5">Компанії, ФОП, де особа є директором або засновником</p>
                  </div>
                  <a href={`https://youcontrol.com.ua/search/?q=${encodeURIComponent(personName)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-300 text-xs shrink-0">YouControl →</a>
                </div>
                {regLoading && <p className="text-gray-500 text-sm animate-pulse">⟳ Пошук у бізнес-реєстрах...</p>}
                {regCompany && !regLoading && (
                  regCompany.error
                    ? <p className="text-red-500 text-sm">❌ {regCompany.error}</p>
                    : (regCompany.companies || []).filter((c: any) => c.type !== 'fallback').length === 0
                      ? (
                        <div>
                          <p className="text-gray-500 text-sm mb-2">Компаній не знайдено у відкритих реєстрах. Перевірте вручну:</p>
                          <div className="flex flex-wrap gap-2">
                            {(regCompany.companies || []).filter((c: any) => c.type === 'fallback').map((c: any, i: number) => (
                              <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 text-xs rounded-lg transition">
                                🔗 {c.name}
                              </a>
                            ))}
                            <a href={`https://clarity-project.info/person/?search=${encodeURIComponent(personName)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 text-xs rounded-lg transition">
                              🔗 Clarity Project
                            </a>
                            <a href={`https://prozorro.gov.ua/search/?mode=_all_&q=${encodeURIComponent(personName)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 text-xs rounded-lg transition">
                              🔗 Prozorro тендери
                            </a>
                          </div>
                        </div>
                      )
                      : <div className="space-y-2">
                          <p className="text-blue-400/80 text-xs mb-2">Знайдено {(regCompany.companies || []).filter((c: any) => c.type !== 'fallback').length} компаній/ФОП</p>
                          {(regCompany.companies || []).filter((c: any) => c.type !== 'fallback').slice(0, 10).map((c: any, i: number) => (
                            <div key={i} className="p-3 rounded-lg bg-blue-950/20 border border-blue-800/30 text-sm">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-white font-medium">{c.name}</p>
                                    {c.type === 'fop' && <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">ФОП</span>}
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                      c.status?.toLowerCase().includes('зареєстр') ? 'bg-green-900 text-green-400' :
                                      c.status?.toLowerCase().includes('припин') || c.status?.toLowerCase().includes('ліквід') ? 'bg-red-900/50 text-red-400' :
                                      'bg-gray-700 text-gray-400'
                                    }`}>{c.status || 'Статус невідомий'}</span>
                                  </div>
                                  {c.edrpou && <p className="text-gray-500 text-xs">ЄДРПОУ: {c.edrpou}</p>}
                                  {c.director && <p className="text-gray-400 text-xs">Директор: {c.director}</p>}
                                  {c.address && <p className="text-gray-600 text-xs truncate">{c.address}</p>}
                                  <p className="text-gray-700 text-xs mt-0.5">Джерело: {c.source}</p>
                                </div>
                                {c.url && (
                                  <a href={c.url} target="_blank" rel="noopener noreferrer"
                                    className="shrink-0 px-2 py-1 bg-blue-900/50 hover:bg-blue-800/60 text-blue-300 text-xs rounded transition">
                                    →
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                          {/* Кнопки зовнішніх баз */}
                          <div className="pt-2 flex flex-wrap gap-2">
                            <a href={`https://prozorro.gov.ua/search/?mode=_all_&q=${encodeURIComponent(personName)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition">
                              🔗 Prozorro тендери
                            </a>
                            <a href={`https://clarity-project.info/person/?search=${encodeURIComponent(personName)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition">
                              🔗 Clarity Project
                            </a>
                            <a href={`https://opendatabot.ua/search?q=${encodeURIComponent(personName)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition">
                              🔗 Opendatabot
                            </a>
                          </div>
                        </div>
                )}
                {!regAutoRan && !regLoading && (
                  <p className="text-gray-600 text-sm italic">Буде перевірено автоматично при завантаженні</p>
                )}
              </div>

            </div>
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

          {/* ═══ МЕДІА (Блок 2) ═══ */}
          {activeTab === 'media' && person && (
            <EvidenceUploader personId={person.id} />
          )}

          {/* ═══ ДОКУМЕНТИ (Блок 2) ═══ */}
          {activeTab === 'documents' && person && (
            <div className="space-y-6">
              {/* OSINT PDFs залишаємо */}
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
              {/* Завантажувач файлів */}
              <EvidenceUploader personId={person.id} />
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

          {/* ═══ КРИПТО ═══ */}
          {activeTab === 'crypto' && (
            <CryptoWalletsTab personId={person.id} personName={person.name || person.name_ukr || person.name_rus || ''} />
          )}

          {/* ═══ OSINT ═══ */}
          {activeTab === 'osint' && (
            <div>
              {/* ── Статус авто-запуску ── */}
              {(osintKitLoading || leakOsintLoading || tgLoading) && (
                <div className="mb-3 px-4 py-2 bg-blue-950/50 border border-blue-800/50 rounded-lg flex items-center gap-3 text-xs text-blue-300">
                  <span className="animate-spin inline-block">⟳</span>
                  Авто-пошук запущено:
                  {osintKitLoading && <span className="bg-orange-900/50 px-2 py-0.5 rounded text-orange-300">OsintKit...</span>}
                  {leakOsintLoading && <span className="bg-red-900/50 px-2 py-0.5 rounded text-red-300">LeakOsint...</span>}
                  {tgLoading && <span className="bg-blue-900/50 px-2 py-0.5 rounded text-blue-300">Telegram...</span>}
                </div>
              )}
              {osintError && (
                <div className="bg-red-950 border border-red-700 rounded-xl p-4 text-red-300 mb-3">❌ {osintError}</div>
              )}
              {/* Старий дубльований веб-блок видалено — веб-пошук тепер внизу */}
              {false && osintData && (
                <div>
                  <div className="flex gap-1 p-3 bg-gray-900 border-b border-gray-700 overflow-x-auto flex-wrap">
                    {osintData?.vectors?.map(v => (
                      <button key={v.vector} onClick={() => setActiveVector(v.vector)}
                        className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition ${
                          activeVector === v.vector ? 'bg-purple-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}>
                        {v.label} <span className="opacity-70">({v.count})</span>
                      </button>
                    ))}
                  </div>
                  {activeVectorData && (() => {
                    // Фільтруємо нерелевантні результати
                    const REL_THRESHOLD = 35
                    const personSurname = (person.name_rus || person.name || '').split(' ')[0]?.toLowerCase() || ''
                    const relevantResults = (activeVectorData?.results ?? []).filter(r => {
                      const rel = r.relevanceScore ?? 100
                      if (rel < REL_THRESHOLD) return false
                      // Для результатів з rel 35-60 — додатково перевіряємо чи прізвище є в title/snippet
                      if (rel < 60 && personSurname.length >= 4) {
                        const text = `${r.title} ${r.snippet}`.toLowerCase()
                        if (!text.includes(personSurname)) return false
                      }
                      return true
                    })
                    const hiddenCount = activeVectorData.results.length - relevantResults.length

                    return (
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-gray-600 text-xs">
                            Запит: <span className="text-gray-300 font-mono">{activeVectorData.query}</span>
                          </p>
                          {hiddenCount > 0 && (
                            <span className="text-gray-600 text-xs bg-gray-800 px-2 py-0.5 rounded">
                              🔽 {hiddenCount} нерелевантних приховано
                            </span>
                          )}
                        </div>
                        {relevantResults.length === 0 ? (
                          <p className="text-gray-600 text-sm text-center py-6 italic">
                            Всі {activeVectorData.results.length} результатів нерелевантні (rel &lt; {REL_THRESHOLD})
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {relevantResults.map((result, i) => {
                              const isPdf = result.link.toLowerCase().endsWith('.pdf') || result.title.toLowerCase().includes('[pdf]')
                              const isMyrotvorets = result.link?.includes('myrotvorets.center/criminal/')
                              const rel = result.relevanceScore ?? 100
                              const relColor = rel >= 70 ? 'bg-green-900 text-green-400' : rel >= 40 ? 'bg-yellow-900 text-yellow-500' : 'bg-gray-800 text-gray-500'
                              return (
                                <div key={i} className={`rounded-lg p-4 border transition ${
                                  isMyrotvorets
                                    ? 'bg-yellow-950/40 border-yellow-700 hover:border-yellow-500'
                                    : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                                }`}>
                                  <div className="flex items-start justify-between gap-2">
                                    <a href={result.link} target="_blank" rel="noopener noreferrer"
                                      className={`font-medium text-sm leading-snug ${isMyrotvorets ? 'text-yellow-400 hover:text-yellow-300' : 'text-blue-400 hover:text-blue-300'}`}>
                                      {isMyrotvorets && '🇺🇦 '}{result.title}
                                    </a>
                                    {isMyrotvorets && !person.myrotvorets_url && (
                                      <button
                                        onClick={() => { setEnrichUrl(result.link); setEnrichOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                                        className="shrink-0 px-3 py-1 bg-yellow-700 hover:bg-yellow-600 text-white rounded text-xs font-medium transition">
                                        📥 Імпорт
                                      </button>
                                    )}
                                  </div>
                                  <p className={`text-xs mt-1 truncate ${isMyrotvorets ? 'text-yellow-800' : 'text-green-700'}`}>{result.link}</p>
                                  {result.snippet && <p className="text-gray-400 text-sm mt-2 leading-relaxed line-clamp-3">{result.snippet}</p>}
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-500">{result.source}</span>
                                    {result.relevanceScore !== undefined && (
                                      <span className={`text-xs px-2 py-0.5 rounded font-mono ${relColor}`}>rel: {result.relevanceScore}</span>
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
                        )}
                      </div>
                    )
                  })()}
                  {osintData.total === 0 && (
                    <div className="p-8 text-center text-gray-600">Нічого не знайдено по жодному вектору</div>
                  )}
                </div>
              )}

              {/* ── OsintKit — 731 баз РФ (Альфабанк, ГосУслуги, РСА, ГИБДД, ФНС...) ── */}
              <div className="mt-4 bg-gray-800 rounded-xl border border-orange-900 overflow-hidden">
                <div className="bg-orange-950/60 border-b border-orange-900 px-5 py-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-orange-300 font-semibold flex items-center gap-2">
                      🗄️ OsintKit — Бази даних РФ/СНД
                      {osintKitTotal > 0 && (
                        <span className="bg-orange-700 text-orange-100 text-xs px-2 py-0.5 rounded-full">{osintKitTotal}</span>
                      )}
                    </h3>
                    <p className="text-orange-800 text-xs mt-0.5">731 баз: Альфабанк, ГосУслуги, ГИБДД, РСА, ФНС, МТС, Білайн, Ощадбанк, Сбербанк...</p>
                  </div>
                  <button
                    onClick={runOsintKit}
                    disabled={osintKitLoading}
                    className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1 whitespace-nowrap">
                    {osintKitLoading
                      ? <><span className="animate-spin inline-block">⟳</span> Пошук...</>
                      : osintKitRan ? '🔄 Оновити' : '🔍 Перевірити'}
                  </button>
                </div>

                {osintKitError && (
                  <div className="px-5 py-3 text-sm text-red-400 bg-red-950/30">❌ {osintKitError}</div>
                )}
                {osintKitLoading && (
                  <div className="px-5 py-8 text-center text-orange-400 text-sm">
                    <span className="animate-spin inline-block mr-2 text-xl">⟳</span>
                    Пошук у 731 базах РФ/СНД...
                  </div>
                )}
                {!osintKitLoading && !osintKitRan && (
                  <div className="px-5 py-6 text-center text-gray-600 text-sm">
                    Натисніть "Перевірити" для пошуку по базах даних РФ/СНД<br/>
                    <span className="text-xs text-gray-700">Використовує: ІПН, телефон, паспорт, ім'я, дата народження</span>
                  </div>
                )}
                {!osintKitLoading && osintKitRan && osintKitResults.length === 0 && !osintKitError && (
                  <div className="px-5 py-6 text-center text-gray-600 text-sm">Нічого не знайдено в базах OsintKit</div>
                )}
                {osintKitResults.length > 0 && (
                  <div className="p-4 space-y-2">
                    {osintKitResults.map((entry: any, i: number) => (
                      <div key={i} className="bg-gray-900/70 rounded-lg border border-gray-700 px-4 py-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="text-orange-300 text-xs font-medium">
                            📂 {entry.database || '—'}
                          </p>
                          {entry.as_of && (
                            <span className="text-gray-600 text-xs shrink-0">{entry.as_of}</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          {entry.name && (
                            <div className="col-span-2 flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Ім'я</span>
                              <span className="text-gray-200 text-xs">{entry.name}</span>
                            </div>
                          )}
                          {entry.phone && (
                            <div className="flex gap-2 items-center">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Телефон</span>
                              <a href={`/breach-intel?q=${encodeURIComponent(entry.phone.replace(/\D/g,''))}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-green-400 text-xs font-mono hover:underline">
                                📱 {entry.phone}
                              </a>
                            </div>
                          )}
                          {entry.email && (
                            <div className="flex gap-2 items-center">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Email</span>
                              <a href={`/breach-intel?q=${encodeURIComponent(entry.email)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 text-xs font-mono hover:underline">
                                ✉️ {entry.email}
                              </a>
                            </div>
                          )}
                          {entry.dob && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">ДН</span>
                              <span className="text-gray-300 text-xs">📅 {entry.dob}</span>
                            </div>
                          )}
                          {entry.address && (
                            <div className="col-span-2 flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Адреса</span>
                              <a href={`/breach-intel?q=${encodeURIComponent(entry.address)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-gray-300 text-xs hover:text-green-400 hover:underline">
                                📍 {entry.address}
                              </a>
                            </div>
                          )}
                          {entry.inn && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">ІПН</span>
                              <span className="text-yellow-300 text-xs font-mono">{entry.inn}</span>
                            </div>
                          )}
                          {entry.passport && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Паспорт</span>
                              <span className="text-green-300 text-xs font-mono">🪪 {entry.passport}</span>
                            </div>
                          )}
                          {entry.vehicle && (
                            <div className="col-span-2 flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Авто</span>
                              <span className="text-gray-300 text-xs">🚗 {entry.vehicle}</span>
                            </div>
                          )}
                          {entry.military && (
                            <div className="col-span-2 flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Військо</span>
                              <span className="text-red-300 text-xs">🎖️ {entry.military}</span>
                            </div>
                          )}
                          {entry.username && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Логін</span>
                              <span className="text-purple-300 text-xs font-mono">{entry.username}</span>
                            </div>
                          )}
                          {entry.extra_phones && (
                            <div className="col-span-2 flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Ще тел.</span>
                              <span className="text-green-400 text-xs font-mono">{entry.extra_phones}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* ── Кнопка Зберегти в базу ── */}
                    <div className="mt-3 pt-3 border-t border-gray-700 flex justify-end">
                      <button
                        onClick={() => saveLeakDataToDb(osintKitResults, 'OsintKit', setOsintKitSaving, setOsintKitSaved)}
                        disabled={osintKitSaving || osintKitSaved}
                        className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium transition flex items-center gap-2">
                        {osintKitSaving
                          ? <><span className="animate-spin inline-block">⟳</span> Зберігаємо...</>
                          : osintKitSaved
                          ? '✅ Збережено'
                          : '💾 Зберегти в базу'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── LeakOsint блок ── */}
              <div className="mt-4 bg-gray-800 rounded-xl border border-red-900/50 overflow-hidden">
                <div className="bg-red-950/50 border-b border-red-900/50 px-5 py-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-red-300 font-semibold flex items-center gap-2">
                      🔴 LeakOsint — Бази даних РФ/СНД
                      {leakOsintTotal > 0 && (
                        <span className="bg-red-700 text-red-100 text-xs px-2 py-0.5 rounded-full">{leakOsintTotal}</span>
                      )}
                    </h3>
                    <p className="text-red-800 text-xs mt-0.5">800+ баз: ВКонтакте, ГИБДД, МТС, Сбербанк, ФНС, Білайн, Авіаквитки...</p>
                  </div>
                  <button
                    onClick={runLeakOsint}
                    disabled={leakOsintLoading}
                    className="px-3 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1 whitespace-nowrap">
                    {leakOsintLoading
                      ? <><span className="animate-spin inline-block">⟳</span> Пошук...</>
                      : leakOsintRan ? '🔄 Оновити' : '🔍 Перевірити'}
                  </button>
                </div>

                {leakOsintError && (
                  <div className="px-5 py-3 text-sm text-red-400 bg-red-950/30">❌ {leakOsintError}</div>
                )}
                {leakOsintLoading && (
                  <div className="px-5 py-8 text-center text-red-400 text-sm">
                    <span className="animate-spin inline-block mr-2 text-xl">⟳</span>
                    Пошук у 800+ базах РФ/СНД...
                  </div>
                )}
                {!leakOsintLoading && !leakOsintRan && (
                  <div className="px-5 py-6 text-center text-gray-600 text-sm">
                    Натисніть "Перевірити" для пошуку по LeakOsint<br/>
                    <span className="text-xs text-gray-700">Пошук по ім'ю у 800+ базах даних</span>
                  </div>
                )}
                {!leakOsintLoading && leakOsintRan && leakOsintResults.length === 0 && !leakOsintError && (
                  <div className="px-5 py-6 text-center text-gray-600 text-sm">Нічого не знайдено в LeakOsint</div>
                )}
                {leakOsintResults.length > 0 && (
                  <div className="p-4 space-y-2">
                    {leakOsintResults.map((entry: any, i: number) => (
                      <div key={i} className="bg-gray-900/70 rounded-lg border border-gray-700 px-4 py-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="text-red-300 text-xs font-medium">📂 {entry.database || '—'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          {entry.name && (
                            <div className="col-span-2 flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Ім'я</span>
                              <span className="text-gray-200 text-xs">{entry.name}</span>
                            </div>
                          )}
                          {entry.phone && (
                            <div className="flex gap-2 items-center">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Телефон</span>
                              <a href={`/breach-intel?q=${encodeURIComponent(entry.phone.replace(/\D/g,''))}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-green-400 text-xs font-mono hover:underline">
                                📱 {entry.phone}
                              </a>
                            </div>
                          )}
                          {entry.extra_phones && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Ще тел.</span>
                              <span className="text-green-400 text-xs font-mono">{entry.extra_phones}</span>
                            </div>
                          )}
                          {entry.email && (
                            <div className="flex gap-2 items-center">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Email</span>
                              <a href={`/breach-intel?q=${encodeURIComponent(entry.email)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 text-xs font-mono hover:underline">
                                ✉️ {entry.email}
                              </a>
                            </div>
                          )}
                          {entry.dob && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">ДН</span>
                              <span className="text-gray-300 text-xs">📅 {entry.dob}</span>
                            </div>
                          )}
                          {entry.address && (
                            <div className="col-span-2 flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Адреса</span>
                              <a href={`/breach-intel?q=${encodeURIComponent(entry.address)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-gray-300 text-xs hover:text-green-400 hover:underline">
                                📍 {entry.address}
                              </a>
                            </div>
                          )}
                          {entry.inn && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">ІПН</span>
                              <span className="text-yellow-300 text-xs font-mono">{entry.inn}</span>
                            </div>
                          )}
                          {entry.passport && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Паспорт</span>
                              <span className="text-green-300 text-xs font-mono">🪪 {entry.passport}</span>
                            </div>
                          )}
                          {entry.snils && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">СНІЛС</span>
                              <span className="text-yellow-300 text-xs font-mono">{entry.snils}</span>
                            </div>
                          )}
                          {entry.vk_id && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">VK</span>
                              <a href={entry.vk_id} target="_blank" rel="noopener noreferrer"
                                className="text-blue-400 text-xs hover:underline">🔵 {entry.vk_id}</a>
                            </div>
                          )}
                          {entry.username && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 text-xs w-20 shrink-0">Логін</span>
                              <span className="text-purple-300 text-xs font-mono">{entry.username}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* ── Кнопка Зберегти в базу ── */}
                    <div className="mt-3 pt-3 border-t border-gray-700 flex justify-end">
                      <button
                        onClick={() => saveLeakDataToDb(leakOsintResults, 'LeakOsint', setLeakOsintSaving, setLeakOsintSaved)}
                        disabled={leakOsintSaving || leakOsintSaved}
                        className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium transition flex items-center gap-2">
                        {leakOsintSaving
                          ? <><span className="animate-spin inline-block">⟳</span> Зберігаємо...</>
                          : leakOsintSaved
                          ? '✅ Збережено'
                          : '💾 Зберегти в базу'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

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
                  <div className="px-5 py-2 bg-green-950/20 border-b border-green-900/30 flex items-center justify-between">
                    <span className="text-green-400 text-xs">✅ Витоки автоматично збережено в досьє · {tgResults.length} записів</span>
                    <button
                      onClick={() => saveTelegramDataToPerson(
                        tgResults.reduce((acc: any, r: any) => { Object.assign(acc, r.fields || {}); return acc }, {}),
                        tgRawAll
                      )}
                      className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg text-xs font-semibold transition">
                      💾 Зберегти поля до картки
                    </button>
                  </div>
                )}

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

              {/* ── Веб-пошук (додатково, менш точний) ── */}
              <div className="mt-4 bg-gray-800/40 rounded-xl border border-gray-700/50 overflow-hidden">
                <div className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-gray-500 font-medium text-sm">🌐 Веб-пошук</h3>
                    <p className="text-gray-700 text-xs mt-0.5">Пошук через Google/Serper — може давати нерелевантні результати</p>
                  </div>
                  <button
                    onClick={() => runOsint(false)}
                    disabled={osintLoading}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-xs text-gray-300 transition flex items-center gap-1 whitespace-nowrap">
                    {osintLoading ? <><span className="animate-spin inline-block">⟳</span> Пошук...</> : osintData ? '🔄 Оновити' : '🌐 Запустити'}
                  </button>
                </div>
                {osintData && (
                  <div className="border-t border-gray-700/50">
                    {/* Миротворець банер */}
                    {myrotvoretsOsintUrl && !person.myrotvorets_url && (
                      <div className="mx-4 my-3 bg-yellow-950 border border-yellow-700 rounded-xl p-3 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-yellow-400 font-semibold text-xs">🇺🇦 Знайдено у Миротворці!</p>
                          <p className="text-yellow-700 text-xs font-mono truncate">{myrotvoretsOsintUrl}</p>
                        </div>
                        <button onClick={() => { setEnrichUrl(myrotvoretsOsintUrl); setEnrichOpen(true) }}
                          className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg text-xs font-medium transition whitespace-nowrap">
                          📥 Імпорт
                        </button>
                      </div>
                    )}
                    <div className="flex gap-1 px-4 py-2 overflow-x-auto flex-wrap">
                      {osintData.vectors?.map((v: any) => (
                        <button key={v.vector} onClick={() => setActiveVector(v.vector)}
                          className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition ${
                            activeVector === v.vector ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                          }`}>
                          {v.label} ({v.count})
                        </button>
                      ))}
                    </div>
                    {activeVectorData && (
                      <div className="px-4 pb-4 space-y-2">
                        {(() => {
                          const REL_THRESHOLD = 35
                          const personSurname = (person.name_rus || person.name || '').split(' ')[0]?.toLowerCase() || ''
                          const relevantResults = activeVectorData.results.filter((r: any) => {
                            const rel = r.relevanceScore ?? 100
                            if (rel < REL_THRESHOLD) return false
                            if (rel < 60 && personSurname.length >= 4) {
                              const text = `${r.title} ${r.snippet}`.toLowerCase()
                              if (!text.includes(personSurname)) return false
                            }
                            return true
                          })
                          return relevantResults.map((r: any, i: number) => (
                            <div key={i} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-sm hover:underline line-clamp-1">{r.title}</a>
                              <p className="text-gray-500 text-xs mt-1 line-clamp-2">{r.snippet}</p>
                              <p className="text-gray-700 text-xs mt-1">{r.domain} • rel:{r.relevanceScore}</p>
                            </div>
                          ))
                        })()}
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
