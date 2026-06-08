'use client'

import AiProfileCard from '../../../components/AiProfileCard'
import { Card, Field } from './shared'
import { formatGender } from '../utils/person-utils'
import type { PersonPageState } from '../hooks/usePersonPage'

interface OverviewTabProps {
  state: PersonPageState
}

export function OverviewTab({ state: s }: OverviewTabProps) {
  const person = s.person
  const p      = person

  // ── Derived from telegram_raw ──
  const allLeaks     = (p.telegram_raw || []).flatMap((e: any) => e.leaks || [])
  const tgFieldMap: Record<string, string> = {}
  const tgPhones:   string[] = []
  const tgCarPlates: string[] = []
  const tgEmails:   string[] = []

  for (const l of allLeaks) {
    const f = l.fields || {}
    for (const [k, v] of Object.entries(f)) {
      if (v && typeof v === 'string' && !tgFieldMap[k]) tgFieldMap[k] = v as string
    }
    if (Array.isArray(f.phones_list))    tgPhones.push(...f.phones_list)
    if (Array.isArray(f.car_plates_list)) tgCarPlates.push(...f.car_plates_list)
    if (Array.isArray(f.emails_list))    tgEmails.push(...f.emails_list)
  }

  const aiP0 = (() => {
    const ap = typeof p.ai_profile === 'object' ? p.ai_profile : null
    return ap?.persons?.[0] || null
  })()
  const aiPhones: string[]  = aiP0?.phones || []
  const aiEmails: string[]  = aiP0?.emails || []
  const allPhones            = Array.from(new Set([...(p.phones || []), ...aiPhones, ...tgPhones]))
  const allCarPlates         = Array.from(new Set(tgCarPlates))
  const allEmails            = Array.from(new Set([...(p.email ? [p.email] : []), ...aiEmails, ...tgEmails]))
  const tgLastSearch         = p.telegram_raw?.length
    ? new Date(p.telegram_raw[p.telegram_raw.length - 1].searched_at).toLocaleString('uk-UA')
    : null

  const topMentions         = s.personMentions.slice(0, 8)
  const myrotvoretsSnippet  = s.personMentions.find((m: any) => m.source_name?.includes('myrotvorets'))

  return (
    <div className="space-y-4">

      {/* ── Hero: Threat Score + Quick Stats ── */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Threat Score circle */}
          <div className="flex items-center gap-3">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold border-4 shrink-0 ${
              (p.threat_score || 0) >= 80 ? 'border-red-500 bg-red-950/60 text-red-300'    :
              (p.threat_score || 0) >= 50 ? 'border-orange-500 bg-orange-950/60 text-orange-300' :
              (p.threat_score || 0) >= 20 ? 'border-yellow-500 bg-yellow-950/60 text-yellow-300' :
              'border-gray-600 bg-gray-800 text-gray-400'
            }`}>{p.threat_score || '?'}</div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide">Threat Score</p>
              <p className={`text-sm font-semibold ${
                (p.threat_score || 0) >= 80 ? 'text-red-400' :
                (p.threat_score || 0) >= 50 ? 'text-orange-400' :
                (p.threat_score || 0) >= 20 ? 'text-yellow-400' : 'text-gray-500'
              }`}>
                {(p.threat_score || 0) >= 80 ? '🔴 Критичний' :
                 (p.threat_score || 0) >= 50 ? '🟠 Високий'   :
                 (p.threat_score || 0) >= 20 ? '🟡 Помірний'  : '⚪ Не оцінено'}
              </p>
            </div>
          </div>

          <div className="h-12 w-px bg-gray-700 hidden md:block" />

          {/* Quick Stats */}
          <div className="flex gap-4 flex-wrap flex-1">
            {[
              { icon: '⚖️', label: 'Злочинів',    value: s.incidents.length,               color: s.incidents.length > 0 ? 'text-red-400' : 'text-gray-500' },
              { icon: '🔗', label: "Зв'язків",     value: p.connections_count || 0,          color: 'text-blue-400' },
              { icon: '📜', label: 'НАЗК декл.',   value: s.regNazk?.total || 0,             color: s.regNazk?.total > 0 ? 'text-yellow-400' : 'text-gray-500' },
              { icon: '🔍', label: 'OSINT хітів',  value: s.osintData?.total || s.personMentions.length, color: 'text-purple-400' },
              { icon: '💧', label: 'Витоки',       value: allLeaks.length,                   color: 'text-amber-400' },
            ].map(({ icon, label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-lg font-bold ${color}`}>{value}</p>
                <p className="text-gray-500 text-xs">{icon} {label}</p>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 shrink-0">
            <button onClick={() => s.setActiveTab('registries')}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition">
              🏛️ Реєстри
            </button>
            <button onClick={() => s.runOsint(true)} disabled={s.osintLoading}
              className="px-3 py-1.5 bg-purple-800 hover:bg-purple-700 disabled:opacity-50 text-purple-200 rounded-lg text-xs transition">
              {s.osintLoading ? '⟳' : '🔍 OSINT'}
            </button>
          </div>
        </div>

        {/* AI summary */}
        {p.ai_profile && (() => {
          const ap      = typeof p.ai_profile === 'object' ? p.ai_profile : (() => { try { return JSON.parse(p.ai_profile) } catch { return null } })()
          const summary = ap?.summary || ap?.persons?.[0]?.notes || ''
          if (!summary) return null
          return (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">🤖 AI Резюме</p>
              <p className="text-gray-300 text-sm leading-relaxed line-clamp-3">{summary}</p>
            </div>
          )
        })()}
      </div>

      {/* ── Myrotvorets banner ── */}
      {p.myrotvorets_url && (
        <div className="bg-red-950/80 border border-red-700 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-red-400 font-bold text-sm">🚨 ВНЕСЕНИЙ ДО БАЗИ МИРОТВОРЕЦЬ</span>
            </div>
            {myrotvoretsSnippet?.snippet && (
              <p className="text-red-300/80 text-xs leading-relaxed line-clamp-2">{myrotvoretsSnippet.snippet}</p>
            )}
          </div>
          <a href={p.myrotvorets_url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition">
            Відкрити профіль →
          </a>
        </div>
      )}

      {/* ── AI Profile Card ── */}
      {p.last_full_osint && (
        <p className="text-gray-600 text-xs text-right">AI оновлено: {new Date(p.last_full_osint).toLocaleString('uk-UA')}</p>
      )}
      <AiProfileCard
        aiProfileRaw={p.ai_profile || ''}
        threatScore={p.threat_score}
        onRefresh={s.runAiProfile}
        loading={s.aiLoading}
        error={s.aiError}
      />

      {/* ── Evidence strip ── */}
      {s.evidenceItems.length > 0 && (() => {
        const evPhotos = s.evidenceItems.filter(e => e.ev_type === 'photo')
        const evVideos = s.evidenceItems.filter(e => e.ev_type === 'video')
        const evDocs   = s.evidenceItems.filter(e => e.ev_type === 'document' || e.ev_type === 'audio')
        return (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-300 font-semibold text-sm">📎 Файли та докази</p>
              <button onClick={() => s.setActiveTab('documents')} className="text-blue-400 hover:text-blue-300 text-xs">
                Всі {s.evidenceItems.length} →
              </button>
            </div>
            {evPhotos.length > 0 && (
              <div className="mb-3">
                <p className="text-gray-500 text-xs mb-2">🖼️ Фото ({evPhotos.length})</p>
                <div className="flex gap-2 flex-wrap">
                  {evPhotos.map((item: any) => (
                    <img key={item.id} src={item.file_url} alt={item.original_name}
                      onClick={() => s.setPhotoLightboxIdx(Math.max(0, s.allPersonPhotos.indexOf(item.file_url)))}
                      className="w-20 h-20 object-cover rounded-lg border border-gray-600 cursor-zoom-in hover:border-blue-500 transition"
                    />
                  ))}
                </div>
              </div>
            )}
            {evVideos.length > 0 && (
              <div className="mb-3">
                <p className="text-gray-500 text-xs mb-2">🎬 Відео ({evVideos.length})</p>
                <div className="flex gap-2 flex-wrap">
                  {evVideos.map((item: any) => (
                    <a key={item.id} href={item.file_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300 transition max-w-xs truncate">
                      🎬 {item.original_name}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {evDocs.length > 0 && (
              <div>
                <p className="text-gray-500 text-xs mb-2">📄 Документи ({evDocs.length})</p>
                <div className="space-y-1.5">
                  {evDocs.map((item: any) => (
                    <a key={item.id}
                      href={item.mime_type === 'text/html' ? `/api/evidence/view/${item.id}` : item.file_url}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition group">
                      <span className="text-lg">
                        {item.mime_type === 'application/pdf' ? '📄' : item.mime_type?.includes('word') ? '📝' : item.mime_type === 'text/html' ? '🌐' : '📁'}
                      </span>
                      <span className="text-gray-300 text-xs flex-1 truncate group-hover:text-white">{item.original_name}</span>
                      <span className="text-gray-600 text-xs shrink-0">{item.file_size ? `${(item.file_size / 1024).toFixed(0)} KB` : ''}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Row 1: Personal | Military | Documents ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="👤 Особисті дані">
          <Field label="Дата народження" value={p.dob} />
          <Field label="Стать"           value={formatGender(p.gender)} />
          <Field label="Місце народження" value={p.birth_place} />
          <Field label="Громадянство"    value={p.nationality} />
          <Field label="Регіон"          value={p.region || tgFieldMap.region} />
          {p.description && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Опис</p>
              <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{p.description}</p>
            </div>
          )}
        </Card>

        <Card title="🎖️ Військова служба">
          <Field label="Звання"      value={p.rank || tgFieldMap.rank} />
          <Field label="Посада"      value={p.position} />
          <Field label="Підрозділ"   value={p.unit || tgFieldMap.unit} />
          <Field label="Номер в/ч"   value={p.unit_num} />
          <Field label="Особистий №" value={p.military_id || tgFieldMap.personal_num} />
          <Field label="Табельний №" value={tgFieldMap.tab_num} />
          <Field label="Роботодавець" value={tgFieldMap.employer} />
        </Card>

        <Card title="📄 Документи та ID">
          <Field label="ІПН"     value={p.ipn || tgFieldMap.inn} />
          <Field label="СНІЛС"   value={p.snils || tgFieldMap.snils} />
          <Field label="Паспорт" value={p.passport} />
          {/* Transport */}
          {(() => {
            const aiVehicles: string[] = (() => {
              const ap = typeof p.ai_profile === 'object' ? p.ai_profile : null
              return ap?.persons?.[0]?.vehicles || []
            })()
            const dbVehicles: any[] = Array.isArray(p.vehicles) ? p.vehicles : []
            const hasTransport = aiVehicles.length > 0 || dbVehicles.length > 0 || allCarPlates.length > 0 || tgFieldMap.vin || tgFieldMap.car_info
            if (!hasTransport) return null
            return (
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
                    {allCarPlates.map((plate: string, i: number) => (
                      <span key={i} className="text-yellow-300 text-sm font-mono bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-800/50">{plate}</span>
                    ))}
                  </div>
                )}
                {tgFieldMap.vin      && <Field label="VIN"  value={tgFieldMap.vin} />}
                {tgFieldMap.car_info && <Field label="Авто" value={tgFieldMap.car_info} />}
              </div>
            )
          })()}
        </Card>
      </div>

      {/* ── Row 2: Contacts | Relatives | Telegram leaks ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="📞 Контакти">
          {allPhones.length > 0 && (
            <div className="mb-3">
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Телефони ({allPhones.length})</p>
              <div className="flex flex-col gap-1">
                {allPhones.map((phone: string, i: number) => (
                  <a key={i} href={`/breach-intel?q=${encodeURIComponent(phone.replace(/\D/g,''))}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300 text-sm font-mono hover:underline transition flex items-center gap-1 group">
                    📱 {phone}
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
          {allEmails.length === 0 && <Field label="Email" value={p.email} />}
          <Field label="Адреса реєстрації" value={p.addr_reg || tgFieldMap.address} />
          <Field label="Адреса проживання" value={p.addr_live} />
          {/* Social links */}
          {(p.vk_url || p.ok_url || p.instagram_url || p.fb_url || tgFieldMap.vk) && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-1.5">Соцмережі</p>
              <div className="flex flex-col gap-1">
                {(p.vk_url || tgFieldMap.vk) && (
                  <a href={p.vk_url || tgFieldMap.vk} target="_blank" rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1.5 hover:underline truncate">
                    💙 VK: {(p.vk_url || tgFieldMap.vk || '').replace('https://', '')}
                  </a>
                )}
                {p.ok_url        && <a href={p.ok_url}        target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 text-xs flex items-center gap-1.5 hover:underline truncate">🟠 OK: {p.ok_url.replace('https://','')}</a>}
                {p.instagram_url && <a href={p.instagram_url} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300 text-xs flex items-center gap-1.5 hover:underline truncate">📸 Instagram: {p.instagram_url.replace('https://','')}</a>}
                {p.fb_url        && <a href={p.fb_url}        target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 text-xs flex items-center gap-1.5 hover:underline truncate">👤 Facebook: {p.fb_url.replace('https://','')}</a>}
              </div>
            </div>
          )}
        </Card>

        {/* Relatives */}
        <Card title="👨‍👩‍👧 Родичі та зв'язки">
          <RelativesBlock person={p} tgFieldMap={tgFieldMap} />
        </Card>

        {/* Telegram leaks summary */}
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
              {tgLastSearch && <p className="text-gray-600 text-xs mb-2">Останній пошук: {tgLastSearch}</p>}
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

      {/* ── Web mentions ── */}
      {topMentions.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-gray-300 font-semibold mb-4 pb-2 border-b border-gray-700 text-sm flex items-center justify-between">
            <span>🌐 Web-згадки ({s.personMentions.length})</span>
            <button onClick={() => s.setActiveTab('osint')} className="text-blue-400 hover:text-blue-300 text-xs font-normal transition">
              Всі результати →
            </button>
          </h3>
          <div className="space-y-3">
            {topMentions.map((m: any, i: number) => {
              const isMyrto   = (m.source_name || '').includes('myrotvorets') || (m.url || '').includes('myrotvorets')
              const isVk      = (m.source_name || '').includes('vk.com')
              return (
                <div key={i} className={`rounded-lg p-3 border ${isMyrto ? 'bg-red-950/40 border-red-800/50' : isVk ? 'bg-blue-950/30 border-blue-800/40' : 'bg-gray-750 border-gray-700/50'}`}>
                  <a href={m.url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium hover:underline line-clamp-1">
                    {isMyrto && '🚨 '}{isVk && '💙 '}{m.title || m.url}
                  </a>
                  <p className="text-gray-400 text-xs mt-1 line-clamp-2 leading-relaxed">{m.snippet}</p>
                  <p className="text-gray-600 text-xs mt-1">{m.source_name}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── VK Search ── */}
      <VkSearchBlock person={p} vkLoading={s.vkLoading} vkProfiles={s.vkProfiles} vkError={s.vkError} onRun={s.runVkSearch} />

      {/* ── ЄДР Search ── */}
      <OdbSearchBlock person={p} odbLoading={s.odbLoading} odbResults={s.odbResults} odbError={s.odbError} onRun={s.runOdbSearch} />

      {/* ── Vehicles ── */}
      <VehiclesBlock person={p} vehiclesLoading={s.vehiclesLoading} vehiclesResults={s.vehiclesResults} vehiclesError={s.vehiclesError} onRun={s.runVehicleSearch} />

      {/* ── Search4Faces ── */}
      <FaceSearchBlock person={p} faceLoading={s.faceLoading} faceResults={s.faceResults} faceError={s.faceError} onRun={s.runFaceSearch} />

      {/* ── FindFace / FindClone ── */}
      <FindFaceBlock person={p} findFaceLoading={s.findFaceLoading} findFaceResults={s.findFaceResults} findFaceError={s.findFaceError} onRun={s.runFindFaceSearch} />

      {/* ── Kadaster ── */}
      <KadasterBlock person={p} kadasterLoading={s.kadasterLoading} kadasterResults={s.kadasterResults} kadasterError={s.kadasterError} onRun={s.runKadasterSearch} />

      {/* ── Obits ── */}
      <ObitsBlock person={p} obitsLoading={s.obitsLoading} obitsResults={s.obitsResults} obitsError={s.obitsError} onRun={s.runObituariesSearch} />

      {/* ── Telegram Phone ── */}
      <TgPhoneBlock person={p} tgPhoneLoading={s.tgPhoneLoading} tgPhoneResults={s.tgPhoneResults} tgPhoneError={s.tgPhoneError} onRun={s.runTgPhoneLookup} />

      {/* ── Photo Collection ── */}
      <PhotoCollBlock person={p} photoCollLoading={s.photoCollLoading} photoCollMsg={s.photoCollMsg} onRun={s.runPhotoCollection} />

      {/* ── Presence check ── */}
      <PresenceBlock person={p} presenceLoading={s.presenceLoading} presenceResults={s.presenceResults} presenceError={s.presenceError} onRun={s.runPresenceCheck} />

      {/* ── VPN Search ── */}
      <VpnBlock person={p} vpnLoading={s.vpnLoading} vpnResults={s.vpnResults} vpnError={s.vpnError} onRun={s.runVpnSearch} />

      {/* ── Leaks DB ── */}
      <LeaksBlock person={p} leaksLoading={s.leaksLoading} leaksResults={s.leaksResults} leaksError={s.leaksError} onRun={s.runLeaksSearch} />

      {/* ── Analytics ── */}
      <Card title="📊 Аналітика та верифікація">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Field label="Пріоритет"        value={p.priority} />
            <Field label="МКС релевантність" value={p.icc_relevant ? '✅ Так' : null} />
            <Field label="Верифіковано"      value={p.verified ? '✅ Так' : null} />
            <Field label="Теги"              value={p.tags?.join(', ')} />
          </div>
          <div>
            <Field label="OSINT зв'язки" value={p.osint_connections} />
            {allLeaks.length > 0 && (
              <div className="mb-3">
                <p className="text-gray-500 text-xs uppercase tracking-wide">Telegram витоки</p>
                <p className="text-white mt-1 text-sm">{allLeaks.length} записів з {(p.telegram_raw || []).length} пошуків</p>
              </div>
            )}
            {s.personMentions.length > 0 && (
              <div className="mb-3">
                <p className="text-gray-500 text-xs uppercase tracking-wide">Web-згадки</p>
                <p className="text-white mt-1 text-sm">{s.personMentions.length} посилань</p>
              </div>
            )}
          </div>
        </div>
      </Card>

    </div>
  )
}

// ─── Sub-components (extracted for readability) ───────────────────────────────

function RelativesBlock({ person, tgFieldMap }: { person: any; tgFieldMap: Record<string,string> }) {
  const aiObj: any = (() => {
    const raw = person.ai_profile
    if (!raw) return null
    if (typeof raw === 'object') return raw
    try { return JSON.parse(raw as string) } catch { return null }
  })()
  const aiP0         = aiObj?.persons?.[0] || null
  const relationships: any[] = aiObj?.relationships || []
  const allPersonsMap: Record<number, any> = {}
  if (aiObj?.persons) for (const p of aiObj.persons) if (p.id) allPersonsMap[p.id] = p
  const relIdByName: Record<string, number> = {}
  for (const r of relationships) {
    const p2 = allPersonsMap[r.person2_id]
    if (p2?.full_name) relIdByName[p2.full_name.toLowerCase()] = r.person2_id
  }
  const aiRelatives: any[] = (aiP0?.relatives || []).map((rel: any) => {
    const pid      = relIdByName[(rel.name || '').toLowerCase()]
    const enriched = pid ? allPersonsMap[pid] : null
    return {
      ...rel,
      phones:    enriched?.phones?.length ? enriched.phones : (rel.phones || []),
      emails:    enriched?.emails?.length ? enriched.emails : (rel.emails || []),
      addresses: enriched?.addresses?.length ? enriched.addresses : (rel.addresses || []),
      passports: enriched?.passports || rel.passports || [],
      inn:       enriched?.inn || rel.inn || null,
    }
  })
  const dbRelatives: any[] = (() => {
    const raw = Array.isArray(person.relatives) ? person.relatives : []
    return raw.map((r: any) => { if (typeof r === 'string') { try { return JSON.parse(r) } catch { return { name: r } } } return r })
  })()
  const seen    = new Set<string>()
  const allRels: any[] = []
  for (const r of [...aiRelatives, ...dbRelatives]) {
    const nm = (r.name || r.full_name || '').toLowerCase()
    if (nm && seen.has(nm)) continue
    if (nm) seen.add(nm)
    allRels.push(r)
  }

  if (allRels.length === 0 && relationships.length === 0 && !tgFieldMap.relatives) {
    return <p className="text-gray-600 text-sm italic">Дані відсутні</p>
  }

  const ICONS: Record<string,string> = {
    'батько':'👨','мати':'👩','брат':'👦','сестра':'👧','дружина':'💍','чоловік':'💍',
    'дитина':'👶','дід':'👴','баба':'👵','бабуся':'👵','родич':'🧑',
  }

  return (
    <div className="space-y-2">
      {allRels.map((rel: any, i: number) => {
        const relLabel = rel.role || rel.relation || ''
        const relStr   = relLabel.toLowerCase()
        const icon     = Object.entries(ICONS).find(([k]) => relStr.includes(k))?.[1] || '👤'
        const name     = rel.name || rel.full_name || '—'
        const phones: string[] = rel.phones || (rel.phone ? [rel.phone] : [])
        const emails: string[] = rel.emails || (rel.email ? [rel.email] : [])
        const addresses: string[] = rel.addresses || (rel.address ? [rel.address] : [])
        return (
          <div key={i} className="bg-gray-900/60 rounded-xl border border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-base shrink-0">{icon}</span>
                <div className="min-w-0">
                  <p className="text-gray-200 text-sm font-medium truncate">{name}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {rel.dob && <span className="text-gray-500 text-xs">📅 {rel.dob}</span>}
                    {rel.inn && <span className="text-yellow-600 text-xs font-mono">ІПН: {rel.inn}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {relLabel && (
                  <span className="text-xs px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full border border-blue-800/50">{relLabel}</span>
                )}
                <a href={`/breach-intel?q=${encodeURIComponent(name)}`} target="_blank" rel="noopener noreferrer"
                  className="text-gray-600 hover:text-green-400 transition text-sm">🔍</a>
              </div>
            </div>
            {rel.passports?.length > 0 && (
              <div className="border-t border-gray-800 px-3 py-1.5 flex flex-wrap gap-1.5">
                {rel.passports.map((pp: string, pi: number) => (
                  <span key={pi} className="text-green-300 text-xs font-mono px-2 py-0.5 bg-green-950/30 border border-green-800/50 rounded">🪪 {pp}</span>
                ))}
              </div>
            )}
            {phones.length > 0 && (
              <div className="border-t border-gray-800 px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {phones.map((phone: string, pi: number) => (
                  <a key={pi} href={`/breach-intel?q=${encodeURIComponent(phone.replace(/\D/g,''))}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300 text-xs font-mono hover:underline transition">📱 {phone}</a>
                ))}
              </div>
            )}
            {emails.length > 0 && (
              <div className="border-t border-gray-800 px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {emails.map((em: string, ei: number) => (
                  <a key={ei} href={`/breach-intel?q=${encodeURIComponent(em)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-xs font-mono hover:underline transition">✉️ {em}</a>
                ))}
              </div>
            )}
            {addresses.length > 0 && (
              <div className="border-t border-gray-800 px-3 py-1.5 space-y-1">
                {addresses.map((addr: string, ai: number) => (
                  <div key={ai} className="flex items-start gap-1.5 group">
                    <span className="text-gray-600 text-xs mt-0.5 shrink-0">📍</span>
                    <span className="text-gray-400 text-xs flex-1">{addr}</span>
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <a href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 text-xs">🗺️</a>
                      <a href={`/breach-intel?q=${encodeURIComponent(addr)}`}             target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-400 text-xs">🔍</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {(relationships.length > 0 || tgFieldMap.relatives) && (
        <div className="mt-1 pt-2 border-t border-gray-800">
          <p className="text-gray-600 text-xs mb-1.5">🔗 Встановлені зв'язки</p>
          {relationships.map((r: any, i: number) => (
            <p key={i} className="text-gray-500 text-xs leading-relaxed">{r.type || r.relation_type}: {r.evidence || r.description || ''}</p>
          ))}
          {tgFieldMap.relatives && !allRels.length && (
            <p className="text-gray-400 text-xs whitespace-pre-wrap">{tgFieldMap.relatives}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── One-liners for the OSINT search blocks ───────────────────────────────────

function SearchBlock({ title, desc, loading, error, emptyMsg, onRun, btnColor = 'bg-blue-800 hover:bg-blue-700', children }: any) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
        <div>
          <h3 className="text-gray-300 font-semibold text-sm">{title}</h3>
          {desc && <p className="text-gray-600 text-xs mt-0.5">{desc}</p>}
        </div>
        <button onClick={onRun} disabled={loading}
          className={`px-3 py-1.5 ${btnColor} disabled:opacity-50 rounded-lg text-xs font-medium transition flex items-center gap-1.5`}>
          {loading ? <><span className="animate-spin">⟳</span> Пошук...</> : '🔍 Знайти'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mb-2">❌ {error}</p>}
      {children || (!loading && <p className="text-gray-600 text-sm italic">{emptyMsg}</p>)}
    </div>
  )
}

function VkSearchBlock({ person, vkLoading, vkProfiles, vkError, onRun }: any) {
  const saved   = (person.social_profiles || []).filter((s: any) => s.platform === 'vk')
  const toShow  = vkProfiles.length > 0 ? vkProfiles : saved
  return (
    <SearchBlock title="💙 VK — соціальні профілі" loading={vkLoading} error={vkError}
      emptyMsg={vkLoading ? 'Шукаємо у VK...' : 'Натисніть "Знайти" для пошуку профілів'} onRun={onRun} btnColor="bg-blue-700 hover:bg-blue-600">
      {toShow.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {toShow.map((prof: any, i: number) => (
            <a key={i} href={prof.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-blue-950/20 border border-blue-800/30 rounded-lg hover:border-blue-600/50 transition group">
              {(prof.photo || prof.photo_url) && <img src={prof.photo || prof.photo_url} alt={prof.name} className="w-10 h-10 rounded-full object-cover border border-blue-700/50 shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />}
              <div className="flex-1 min-w-0">
                <p className="text-blue-300 text-sm font-medium group-hover:text-blue-200 truncate">{prof.name}</p>
                <p className="text-gray-500 text-xs truncate">{prof.city || prof.url}</p>
                {prof.confidence && <span className={`text-xs ${prof.confidence >= 70 ? 'text-green-400' : 'text-yellow-500'}`}>Збіг: {prof.confidence}%</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </SearchBlock>
  )
}

function OdbSearchBlock({ person, odbLoading, odbResults, odbError, onRun }: any) {
  const saved  = person.business_connections || []
  const toShow = odbResults.length > 0 ? odbResults : saved
  return (
    <SearchBlock title="🏢 ЄДР / Бізнес-зв'язки" loading={odbLoading} error={odbError}
      emptyMsg={odbLoading ? 'Перевіряємо ЄДР...' : "Натисніть 'Знайти' для перевірки ЄДР"} onRun={onRun} btnColor="bg-yellow-700 hover:bg-yellow-600">
      {toShow.length > 0 && (
        <div className="space-y-2">
          {toShow.map((r: any, i: number) => (
            <div key={i} className={`p-3 rounded-lg border ${r.type === 'fop' ? 'bg-yellow-950/20 border-yellow-800/40' : 'bg-gray-750 border-gray-700/50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{r.name}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{r.role} {r.code ? `• ЄДРПОУ: ${r.code}` : ''}</p>
                  {r.address && <p className="text-gray-500 text-xs truncate">{r.address}</p>}
                </div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${r.status?.includes('зареєстрований') || r.status?.includes('active') ? 'bg-green-900/50 text-green-400 border border-green-800/50' : 'bg-gray-700 text-gray-400'}`}>{r.status || '?'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </SearchBlock>
  )
}

function VehiclesBlock({ person, vehiclesLoading, vehiclesResults, vehiclesError, onRun }: any) {
  const saved  = person.vehicles || []
  const toShow = vehiclesResults.length > 0 ? vehiclesResults : saved
  return (
    <SearchBlock title="🚗 Транспортні засоби" loading={vehiclesLoading} error={vehiclesError}
      emptyMsg={vehiclesLoading ? 'Шукаємо транспорт...' : 'Транспортних засобів не знайдено'} onRun={onRun}>
      {toShow.length > 0 && (
        <div className="space-y-2">
          {toShow.map((v: any, i: number) => (
            <div key={i} className="p-3 rounded-lg bg-blue-950/20 border border-blue-800/30 flex items-start gap-3">
              <span className="text-2xl">🚗</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {v.plate && <span className="font-mono text-sm font-bold text-white bg-gray-700 px-2 py-0.5 rounded border border-gray-600">{v.plate}</span>}
                  {v.model && <span className="text-white text-sm">{v.model}</span>}
                  {v.year  && <span className="text-gray-400 text-xs">{v.year} р.</span>}
                  {v.color && <span className="text-gray-400 text-xs">{v.color}</span>}
                </div>
                {v.vin        && <p className="text-gray-500 text-xs font-mono mt-0.5">VIN: {v.vin}</p>}
                {v.owner_name && <p className="text-gray-400 text-xs mt-0.5">Власник: {v.owner_name}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SearchBlock>
  )
}

function FaceSearchBlock({ person, faceLoading, faceResults, faceError, onRun }: any) {
  const saved  = (person.person_photos || []).filter((pp: any) => pp.profile_url)
  const toShow = faceResults.length > 0 ? faceResults : saved
  return (
    <SearchBlock title="📷 Пошук за фото" loading={faceLoading} error={faceError}
      emptyMsg={!person.photo_url ? 'Фото відсутнє — додайте фото до картки' : 'Профілів не знайдено'} onRun={onRun} btnColor="bg-indigo-800 hover:bg-indigo-700">
      {toShow.length > 0 && (
        <div className="space-y-2">
          {toShow.map((r: any, i: number) => (
            <div key={i} className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-800/30 flex items-center gap-3">
              {r.photo_url ? <img src={r.photo_url} alt="face" className="w-10 h-10 rounded-full object-cover border border-indigo-700/50 flex-shrink-0" /> : <div className="w-10 h-10 rounded-full bg-indigo-900/40 flex items-center justify-center flex-shrink-0 text-lg">{r.source === 'vk' ? '🔵' : '📷'}</div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${r.source === 'vk' ? 'bg-blue-900/50 text-blue-300' : 'bg-orange-900/50 text-orange-300'}`}>{r.source?.toUpperCase()}</span>
                  {r.similarity != null && <span className={`text-xs font-bold ${r.similarity >= 80 ? 'text-green-400' : r.similarity >= 60 ? 'text-yellow-400' : 'text-gray-400'}`}>{Math.round(r.similarity)}% схожість</span>}
                  {r.name && <span className="text-gray-300 text-sm truncate">{r.name}</span>}
                </div>
                {r.profile_url && <a href={r.profile_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 text-xs truncate block mt-0.5">{r.profile_url}</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SearchBlock>
  )
}

function FindFaceBlock({ person, findFaceLoading, findFaceResults, findFaceError, onRun }: any) {
  return (
    <SearchBlock title="🕵️ FindFace / FindClone" loading={findFaceLoading} error={findFaceError}
      emptyMsg={!person.photo_url ? 'Потрібне фото особи' : 'Профілів не знайдено'} onRun={onRun} btnColor="bg-violet-800 hover:bg-violet-700">
      {findFaceResults.length > 0 && (
        <div className="space-y-2">
          {findFaceResults.map((r: any, i: number) => (
            <div key={i} className="p-3 rounded-lg bg-violet-950/20 border border-violet-800/30 flex items-center gap-3">
              {r.photo_url ? <img src={r.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-violet-700/50" /> : <div className="w-9 h-9 rounded-full bg-violet-900/40 flex items-center justify-center flex-shrink-0 text-base">🎭</div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-300">{(r.source || 'findclone').toUpperCase()}</span>
                  {r.similarity != null && <span className={`text-xs font-bold ${r.similarity >= 80 ? 'text-green-400' : 'text-yellow-400'}`}>{r.similarity}%</span>}
                  {r.name && <span className="text-gray-300 text-sm">{r.name}</span>}
                </div>
                {r.profile_url && <a href={r.profile_url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 text-xs truncate block mt-0.5">{r.profile_url}</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SearchBlock>
  )
}

function KadasterBlock({ person, kadasterLoading, kadasterResults, kadasterError, onRun }: any) {
  const toShow = kadasterResults.length > 0 ? kadasterResults : (person.real_estate || [])
  return (
    <SearchBlock title="🏠 Кадастр нерухомості" loading={kadasterLoading} error={kadasterError}
      emptyMsg={kadasterLoading ? 'Пошук...' : 'Нерухомість не знайдено'} onRun={onRun} btnColor="bg-teal-800 hover:bg-teal-700">
      {toShow.length > 0 && (
        <div className="space-y-2">
          {toShow.map((r: any, i: number) => (
            <div key={i} className="p-3 rounded-lg bg-teal-950/20 border border-teal-800/30 text-sm">
              {r.cadastral_number && <p className="text-teal-300 font-mono text-xs">{r.cadastral_number}</p>}
              {r.address && <p className="text-gray-200">{r.address}</p>}
              <div className="flex gap-3 mt-1 text-xs text-gray-500">
                {r.type && <span>{r.type}</span>}
                {r.area && <span>{r.area}</span>}
                {r.source && <span className="ml-auto">{r.source}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SearchBlock>
  )
}

function ObitsBlock({ person, obitsLoading, obitsResults, obitsError, onRun }: any) {
  const toShow = obitsResults.length > 0 ? obitsResults : (person.obituary_data || [])
  return (
    <SearchBlock title="🕯️ Некрологи / ЗАГС" loading={obitsLoading} error={obitsError}
      emptyMsg={obitsLoading ? 'Пошук...' : 'Записів не знайдено'} onRun={onRun} btnColor="bg-gray-700 hover:bg-gray-600">
      {toShow.length > 0 && (
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
      )}
    </SearchBlock>
  )
}

function TgPhoneBlock({ person, tgPhoneLoading, tgPhoneResults, tgPhoneError, onRun }: any) {
  const toShow = tgPhoneResults.length > 0 ? tgPhoneResults : (person.telegram_accounts || [])
  return (
    <SearchBlock title="📱 Telegram за номером" loading={tgPhoneLoading} error={tgPhoneError}
      emptyMsg={!person.phones?.length ? 'Немає номерів для пошуку' : 'Telegram акаунтів не знайдено'} onRun={onRun} btnColor="bg-sky-800 hover:bg-sky-700">
      {toShow.length > 0 && (
        <div className="space-y-2">
          {toShow.map((r: any, i: number) => (
            <div key={i} className="p-3 rounded-lg bg-sky-950/20 border border-sky-800/30 flex items-center gap-3 text-sm">
              {r.photo_url ? <img src={r.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" /> : <div className="w-9 h-9 rounded-full bg-sky-900/40 flex items-center justify-center flex-shrink-0 text-base">📱</div>}
              <div className="flex-1 min-w-0">
                <p className="text-sky-300 font-medium">{r.first_name} {r.last_name}</p>
                {r.username && <a href={`https://t.me/${r.username}`} target="_blank" rel="noopener noreferrer" className="text-sky-400 text-xs hover:underline">@{r.username}</a>}
                <p className="text-gray-500 text-xs mt-0.5">{r.phone} {r.user_id ? `· ID: ${r.user_id}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SearchBlock>
  )
}

function PhotoCollBlock({ person, photoCollLoading, photoCollMsg, onRun }: any) {
  const hasSocial = person.vk_url || person.ok_url || person.instagram_url
  return (
    <SearchBlock title="📸 Авто-збір фото" loading={photoCollLoading} error=""
      emptyMsg={!hasSocial ? 'Не знайдено соцмереж (VK/OK/Instagram)' : 'Натисніть для збору фото'} onRun={onRun} btnColor="bg-pink-800 hover:bg-pink-700">
      {(photoCollMsg || person.person_photos?.length > 0) && (
        <div>
          {photoCollMsg && <p className="text-sm text-gray-300 mb-2">{photoCollMsg}</p>}
          {person.person_photos?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(person.person_photos || []).slice(0, 12).map((pp: any, i: number) => (
                <a key={i} href={pp.profile_url || pp.url} target="_blank" rel="noopener noreferrer">
                  <img src={pp.url} alt="" className="w-12 h-12 rounded object-cover border border-gray-600 hover:border-pink-500 transition" />
                </a>
              ))}
              {person.person_photos?.length > 12 && <span className="text-gray-500 text-xs self-center ml-1">+{person.person_photos.length - 12}</span>}
            </div>
          )}
        </div>
      )}
    </SearchBlock>
  )
}

function PresenceBlock({ person, presenceLoading, presenceResults, presenceError, onRun }: any) {
  return (
    <SearchBlock title="💬 WhatsApp / Viber" loading={presenceLoading} error={presenceError}
      emptyMsg={!person.phones?.length ? 'Немає номерів для перевірки' : 'Натисніть для перевірки'} onRun={onRun} btnColor="bg-green-800 hover:bg-green-700">
      {presenceResults.length > 0 && (
        <div className="space-y-2">
          {presenceResults.map((r: any, i: number) => (
            <div key={i} className="p-3 rounded-lg bg-green-950/20 border border-green-800/30 text-sm">
              <p className="text-gray-200 font-mono">{r.phone}</p>
              <div className="flex gap-3 mt-1.5 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded ${r.whatsapp ? 'bg-green-900/60 text-green-300' : 'bg-gray-700 text-gray-500'}`}>{r.whatsapp ? '✓ WhatsApp' : '✗ WhatsApp'}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${r.viber ? 'bg-purple-900/60 text-purple-300' : 'bg-gray-700 text-gray-500'}`}>{r.viber ? '✓ Viber' : '✗ Viber'}</span>
                {r.truecaller?.name && <span className="text-xs text-yellow-300 px-2 py-0.5 rounded bg-yellow-900/40">TC: {r.truecaller.name}</span>}
                {r.carrier && <span className="text-gray-500 text-xs">{r.carrier}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SearchBlock>
  )
}

function VpnBlock({ person: _p, vpnLoading, vpnResults, vpnError, onRun }: any) {
  return (
    <SearchBlock title="🔒 VPN пошук (ipbd/leb.su)" desc="ipbd.ru · leb.su · rusprofile.ru" loading={vpnLoading} error={vpnError}
      emptyMsg="Натисніть для пошуку в заблокованих базах" onRun={onRun} btnColor="bg-red-900 hover:bg-red-800">
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
    </SearchBlock>
  )
}

function LeaksBlock({ person: _p, leaksLoading, leaksResults, leaksError, onRun }: any) {
  return (
    <SearchBlock title="💧 База витоків" loading={leaksLoading} error={leaksError}
      emptyMsg="Натисніть для пошуку в локальній БД витоків" onRun={onRun} btnColor="bg-amber-800 hover:bg-amber-700">
      {leaksResults.length > 0 && (
        <div className="space-y-1.5">
          {leaksResults.map((r: any, i: number) => (
            <div key={i} className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/30 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-1.5 py-0.5 rounded text-xs font-medium"
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
    </SearchBlock>
  )
}
