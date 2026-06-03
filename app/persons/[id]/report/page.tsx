'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'

export default function PersonReportPage() {
  const params = useParams()
  const [person, setPerson] = useState<any>(null)
  const [nazk, setNazk] = useState<any>(null)
  const [myro, setMyro] = useState<any>(null)
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generated, setGenerated] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }

      const [pRes, incRes] = await Promise.all([
        fetch(`/api/persons/${params.id}`),
        fetch(`/api/incidents?person_id=${params.id}`),
      ])
      const p = await pRes.json()
      const inc = await incRes.json()
      setPerson(p)
      setIncidents(inc.data || [])
      setGenerated(new Date().toLocaleString('uk-UA'))

      // Реєстри
      const name = p?.name_ukr || p?.name_rus || p?.name || ''
      if (name.length >= 3) {
        const [nazkRes, myroRes] = await Promise.allSettled([
          fetch('/api/nazk/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: name }) }).then(r => r.json()),
          fetch('/api/myrotvorets/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: name }) }).then(r => r.json()),
        ])
        if (nazkRes.status === 'fulfilled') setNazk(nazkRes.value)
        if (myroRes.status === 'fulfilled') setMyro(myroRes.value)
      }
      setLoading(false)
    }
    load()
  }, [params.id])

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-gray-500 text-lg">Генерую звіт...</div>
    </div>
  )
  if (!person) return <div className="p-8 text-red-500">Особу не знайдено</div>

  const personName = person.name_ukr || person.name_rus || person.name || 'Невідомо'
  const allLeaks = (person.telegram_raw || []).flatMap((e: any) => e.leaks || [])
  const tgFieldMap: Record<string, string> = {}
  const tgPhones: string[] = []
  const tgEmails: string[] = []
  for (const l of allLeaks) {
    const f = l.fields || {}
    for (const [k, v] of Object.entries(f)) {
      if (v && typeof v === 'string' && !tgFieldMap[k]) tgFieldMap[k] = v as string
    }
    if (Array.isArray(f.phones_list)) tgPhones.push(...f.phones_list)
    if (Array.isArray(f.emails_list)) tgEmails.push(...f.emails_list)
  }
  const allPhones = Array.from(new Set([...(person.phones || []), ...tgPhones]))
  const allEmails = Array.from(new Set([...(person.email ? [person.email] : []), ...tgEmails]))

  // Парсимо ai_profile (JSONB об'єкт або рядок)
  const aiObj = typeof person.ai_profile === 'object' ? person.ai_profile
    : (person.ai_profile ? (() => { try { return JSON.parse(person.ai_profile) } catch { return null } })() : null)
  const aiP = aiObj?.persons?.find((p: any) => p.id === aiObj.primary_person_id) || aiObj?.persons?.[0] || null
  const aiSummary: string = aiObj?.summary || ''
  // Додаємо телефони і email з ai_profile
  const aiPhones: string[] = aiP?.phones || []
  const aiEmailsProfile: string[] = aiP?.emails || []
  const allPhonesReport = Array.from(new Set([...allPhones, ...aiPhones]))
  const allEmailsReport = Array.from(new Set([...allEmails, ...aiEmailsProfile]))

  return (
    <div className="bg-white text-gray-900 min-h-screen" id="report">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 11pt; }
          @page { margin: 15mm; }
        }
        .section { margin-bottom: 20px; break-inside: avoid; }
        .label { color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
        .value { color: #111827; font-size: 13px; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f3f4f6; padding: 6px 8px; text-align: left; font-weight: 600; border: 1px solid #e5e7eb; }
        td { padding: 5px 8px; border: 1px solid #e5e7eb; }
        tr:nth-child(even) { background: #f9fafb; }
      `}</style>

      {/* Кнопки (не друкуються) */}
      <div className="no-print fixed top-4 right-4 flex gap-2 z-50">
        <button onClick={() => window.print()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold shadow-lg">
          🖨️ Друк / Зберегти PDF
        </button>
        <button onClick={() => window.close()}
          className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm">
          ✕ Закрити
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-8">
        {/* Шапка */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl">🛡️</span>
                <span className="text-gray-500 text-sm font-medium uppercase tracking-wider">ODB Platform · Досьє</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">{personName}</h1>
              {/* ДН + рік одразу під іменем */}
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {person.dob && (
                  <span className="text-gray-600 text-sm font-mono">
                    📅 {person.dob} {person.dob.match(/(\d{4})/)?.[1] ? `(${new Date().getFullYear() - parseInt(person.dob.match(/(\d{4})/)?.[1] || '0')} р.)` : ''}
                  </span>
                )}
                {person.gender && (
                  <span className="text-gray-500 text-sm">{person.gender === 'м' || person.gender === 'M' ? '♂' : '♀'}</span>
                )}
                {person.birth_place && (
                  <span className="text-gray-500 text-sm">🏙️ {person.birth_place}</span>
                )}
                {(person.ipn || tgFieldMap.inn) && (
                  <span className="text-gray-500 text-xs font-mono">ІПН: {person.ipn || tgFieldMap.inn}</span>
                )}
              </div>
              {person.name_rus && person.name_ukr && person.name_rus !== personName && (
                <p className="text-gray-600 text-base mt-0.5">{person.name_rus}</p>
              )}
              {person.rank && <p className="text-gray-600 text-sm mt-1">{person.rank}{person.unit ? ` · ${person.unit}` : ''}</p>}
            </div>
            <div className="text-right">
              {person.photo_url && (
                <img src={person.photo_url} alt="" className="w-20 h-20 object-cover rounded border border-gray-300 mb-2 ml-auto" />
              )}
              <p className="text-gray-400 text-xs">Звіт згенеровано:</p>
              <p className="text-gray-600 text-xs font-mono">{generated}</p>
              {person.threat_score != null && (
                <div className={`mt-2 inline-block px-3 py-1 rounded text-sm font-bold ${
                  person.threat_score >= 80 ? 'bg-red-100 text-red-700' :
                  person.threat_score >= 50 ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  Threat Score: {person.threat_score}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Попередження Миротворець */}
        {(person.myrotvorets_url || (myro?.found ?? 0) > 0) && (
          <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-6 rounded-r">
            <p className="text-red-700 font-bold text-sm">⚠️ ВНЕСЕНИЙ ДО БАЗИ МИРОТВОРЕЦЬ</p>
            {person.myrotvorets_url && <p className="text-red-600 text-xs mt-1 font-mono">{person.myrotvorets_url}</p>}
          </div>
        )}

        {/* Особисті дані */}
        <div className="section">
          <h2 className="text-base font-bold text-gray-800 border-b border-gray-300 pb-1 mb-3">👤 Особисті дані</h2>
          <div className="grid grid-cols-3 gap-x-6 gap-y-3">
            {[
              { label: 'Дата народження', value: person.dob },
              { label: 'Стать', value: person.gender },
              { label: 'Місце народження', value: person.birth_place },
              { label: 'Громадянство', value: person.nationality },
              { label: 'Регіон', value: person.region || tgFieldMap.region },
              { label: 'Статус', value: person.status },
            ].filter(f => f.value).map(({ label, value }) => (
              <div key={label}>
                <p className="label">{label}</p>
                <p className="value">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Військова служба */}
        {(person.rank || person.unit || person.position) && (
          <div className="section">
            <h2 className="text-base font-bold text-gray-800 border-b border-gray-300 pb-1 mb-3">🎖️ Військова служба</h2>
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              {[
                { label: 'Звання', value: person.rank || tgFieldMap.rank },
                { label: 'Посада', value: person.position },
                { label: 'Підрозділ', value: person.unit || tgFieldMap.unit },
                { label: 'Номер в/ч', value: person.unit_num },
                { label: 'Особистий №', value: person.military_id },
              ].filter(f => f.value).map(({ label, value }) => (
                <div key={label}>
                  <p className="label">{label}</p>
                  <p className="value">{String(value)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Документи */}
        {(person.ipn || person.passport || person.snils || tgFieldMap.inn || aiP) && (
          <div className="section">
            <h2 className="text-base font-bold text-gray-800 border-b border-gray-300 pb-1 mb-3">📄 Документи та ідентифікатори</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {[
                { label: 'ІПН / ІНН', value: person.ipn || aiP?.inn || tgFieldMap.inn },
                { label: 'СНІЛС', value: person.snils || aiP?.snils || tgFieldMap.snils },
                { label: 'Адреса реєстрації', value: person.addr_reg || tgFieldMap.address },
                { label: 'Адреса проживання', value: person.addr_live },
              ].filter(f => f.value).map(({ label, value }) => (
                <div key={label}>
                  <p className="label">{label}</p>
                  <p className="value font-mono text-xs">{String(value)}</p>
                </div>
              ))}
            </div>
            {/* Всі паспорти */}
            {(aiP?.passports?.length || person.passport) && (
              <div className="mt-3">
                <p className="label mb-1">Паспорти</p>
                <div className="flex flex-wrap gap-2">
                  {(aiP?.passports?.length ? aiP.passports : [person.passport]).filter(Boolean).map((p: string, i: number) => (
                    <span key={i} className="font-mono text-xs bg-gray-100 border border-gray-300 px-2 py-0.5 rounded">🪪 {p}</span>
                  ))}
                </div>
                {aiP?.passport_issuer && <p className="text-gray-500 text-xs mt-1">Ким видано: {aiP.passport_issuer}</p>}
              </div>
            )}
            {/* Всі адреси з AI — клікабельні */}
            {aiP?.addresses?.length > 1 && (
              <div className="mt-3">
                <p className="label mb-1">Всі відомі адреси ({aiP.addresses.length})</p>
                <ul className="space-y-1">
                  {aiP.addresses.map((addr: string, i: number) => (
                    <li key={i} className="text-xs flex gap-1.5 items-center">
                      <span>📍</span>
                      <span className="text-gray-700">{addr}</span>
                      <a href={`/breach-intel?q=${encodeURIComponent(addr)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="ml-1 text-blue-600 hover:underline no-print text-xs shrink-0">🔍</a>
                      <a href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-green-600 hover:underline no-print text-xs shrink-0">🗺️</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Транспорт */}
            {(aiP?.vehicles?.length || (person.vehicles as any[])?.length) && (
              <div className="mt-3">
                <p className="label mb-1">Транспортні засоби</p>
                <ul className="space-y-0.5">
                  {(aiP?.vehicles || (person.vehicles || []).map((v: any) => v.raw || v.plate || JSON.stringify(v))).map((v: string, i: number) => (
                    <li key={i} className="text-xs text-gray-700 font-mono flex gap-1.5"><span>🚗</span><span>{v}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Контакти */}
        {(allPhonesReport.length > 0 || allEmailsReport.length > 0) && (
          <div className="section">
            <h2 className="text-base font-bold text-gray-800 border-b border-gray-300 pb-1 mb-3">📞 Контакти</h2>
            <p className="text-gray-400 text-xs mb-3 no-print">↗ Клік — автоматичний пошук по базах ODB</p>
            <div className="grid grid-cols-2 gap-6">
              {allPhonesReport.length > 0 && (
                <div>
                  <p className="label mb-1">Телефони ({allPhonesReport.length})</p>
                  <div className="space-y-1">
                    {allPhonesReport.map((p, i) => (
                      <a key={i} href={`/breach-intel?q=${encodeURIComponent(p.replace(/\D/g,''))}`}
                        target="_blank" rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-700 hover:text-blue-500 flex items-center gap-1 no-underline hover:underline">
                        📱 {p}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {allEmailsReport.length > 0 && (
                <div>
                  <p className="label mb-1">Email ({allEmailsReport.length})</p>
                  <div className="space-y-1">
                    {allEmailsReport.map((e, i) => (
                      <a key={i} href={`/breach-intel?q=${encodeURIComponent(e)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-700 hover:text-blue-500 flex items-center gap-1 no-underline hover:underline">
                        ✉️ {e}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Соцмережі */}
            {(person.vk_url || tgFieldMap.vk || aiP?.social?.vk) && (
              <div className="mt-3">
                <p className="label mb-1">Соцмережі</p>
                {(person.vk_url || tgFieldMap.vk || aiP?.social?.vk) && (
                  <a href={person.vk_url || tgFieldMap.vk || `https://vk.com/${aiP?.social?.vk}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-700 hover:underline">
                    💙 VK: {person.vk_url || tgFieldMap.vk || `vk.com/${aiP?.social?.vk}`}
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Злочини */}
        {incidents.length > 0 && (
          <div className="section">
            <h2 className="text-base font-bold text-gray-800 border-b border-gray-300 pb-1 mb-3">⚖️ Воєнні злочини ({incidents.length})</h2>
            <table>
              <thead>
                <tr>
                  <th>Назва</th>
                  <th>Тип</th>
                  <th>Дата</th>
                  <th>Місце</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc: any, i: number) => (
                  <tr key={i}>
                    <td>{inc.title}</td>
                    <td>{inc.inc_type}</td>
                    <td>{inc.date ? new Date(inc.date).toLocaleDateString('uk-UA') : '—'}</td>
                    <td>{inc.location || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* НАЗК декларації */}
        {nazk?.found > 0 && (
          <div className="section">
            <h2 className="text-base font-bold text-gray-800 border-b border-gray-300 pb-1 mb-3">📜 НАЗК — Декларації ({nazk.total})</h2>
            <table>
              <thead>
                <tr>
                  <th>ПІБ</th>
                  <th>Посада</th>
                  <th>Тип</th>
                  <th>Рік</th>
                </tr>
              </thead>
              <tbody>
                {nazk.declarations?.map((d: any, i: number) => (
                  <tr key={i}>
                    <td>{d.full_name}</td>
                    <td>{d.position}</td>
                    <td>{d.declaration_type}</td>
                    <td>{d.declaration_year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {nazk.latest?.assets && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {nazk.latest.assets.real_estate?.length > 0 && (
                  <div><span className="label">Нерухомість</span><p>{nazk.latest.assets.real_estate.length} об'єктів</p></div>
                )}
                {nazk.latest.assets.vehicles?.length > 0 && (
                  <div><span className="label">Транспорт</span><p>{nazk.latest.assets.vehicles.map((v: any) => `${v.brand} ${v.model} (${v.year})`).join(', ')}</p></div>
                )}
                {nazk.latest.assets.total_income_uah > 0 && (
                  <div><span className="label">Річний дохід (UAH)</span><p>{nazk.latest.assets.total_income_uah.toLocaleString()} грн</p></div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Миротворець */}
        {myro?.found > 0 && (
          <div className="section">
            <h2 className="text-base font-bold border-b border-red-300 pb-1 mb-3 text-red-700">🚨 Миротворець ({myro.found})</h2>
            {myro.results?.map((r: any, i: number) => (
              <div key={i} className="mb-2 p-2 bg-red-50 rounded border border-red-200">
                <p className="text-red-800 font-medium text-sm">{r.title}</p>
                <p className="text-gray-600 text-xs mt-0.5">{r.date} · {r.url}</p>
              </div>
            ))}
          </div>
        )}

        {/* Telegram витоки */}
        {allLeaks.length > 0 && (
          <div className="section">
            <h2 className="text-base font-bold text-gray-800 border-b border-gray-300 pb-1 mb-3">💧 Telegram-витоки ({allLeaks.length} записів)</h2>
            <p className="text-gray-500 text-xs mb-2">З {(person.telegram_raw || []).length} пошукових сесій</p>
            {tgFieldMap.relatives && (
              <div className="mb-2"><p className="label">Родичі</p><p className="value text-xs">{tgFieldMap.relatives}</p></div>
            )}
            {Object.entries(tgFieldMap).filter(([k]) => !['relatives','address','region','rank','unit','employer','tab_num'].includes(k)).slice(0, 8).map(([k, v]) => (
              <div key={k} className="inline-block mr-4 mb-1">
                <span className="label">{k}:</span> <span className="font-mono text-xs text-gray-700">{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Родичі */}
        {aiP?.relatives?.length > 0 && (
          <div className="section">
            <h2 className="text-base font-bold text-gray-800 border-b border-gray-300 pb-1 mb-3">👨‍👩‍👧 Родичі та зв'язки</h2>
            <table>
              <thead>
                <tr>
                  <th>ПІБ</th>
                  <th>Дата народження</th>
                  <th>Відношення</th>
                </tr>
              </thead>
              <tbody>
                {aiP.relatives.map((rel: any, i: number) => (
                  <tr key={i}>
                    <td className="font-medium">{rel.name || '—'}</td>
                    <td className="font-mono text-xs">{rel.dob || '—'}</td>
                    <td>{rel.relation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* AI профіль — структурований */}
        {aiObj && (
          <div className="section">
            <h2 className="text-base font-bold text-gray-800 border-b border-gray-300 pb-1 mb-3">🤖 AI-аналіз</h2>

            {/* Резюме */}
            {aiSummary && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded-r mb-4">
                <p className="text-blue-800 text-sm leading-relaxed">{aiSummary}</p>
              </div>
            )}

            {/* Threat indicators */}
            {aiP?.threat_indicators?.length > 0 && (
              <div className="mb-3">
                <p className="label mb-1">⚠️ Індикатори загрози</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {aiP.threat_indicators.map((t: string, i: number) => (
                    <li key={i} className="text-red-700 text-xs">{t}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Акаунти (витоки) */}
            {aiP?.logins?.length > 0 && (
              <div className="mb-3">
                <p className="label mb-1">🔐 Облікові записи у витоках ({aiP.logins.length})</p>
                <table style={{ fontSize: '10px' }}>
                  <thead><tr><th>Сервіс</th><th>Логін</th></tr></thead>
                  <tbody>
                    {aiP.logins.map((l: any, i: number) => (
                      <tr key={i}>
                        <td>{l.service || '—'}</td>
                        <td className="font-mono">{l.login}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Джерела */}
            {aiP?.source_databases?.length > 0 && (
              <div>
                <p className="label mb-1">📦 Бази даних ({aiP.source_count || aiP.source_databases.length} баз)</p>
                <p className="text-xs text-gray-600">{aiP.source_databases.join(' · ')}</p>
              </div>
            )}

            {/* Нотатки */}
            {aiP?.notes && (
              <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded p-2">
                <p className="text-yellow-800 text-xs leading-relaxed italic">{aiP.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Підпис */}
        <div className="mt-8 pt-4 border-t border-gray-300 flex items-center justify-between text-gray-400 text-xs">
          <span>🛡️ ODB Platform · Оперативна База Даних</span>
          <span>Згенеровано: {generated}</span>
          <span>Конфіденційно · Для службового використання</span>
        </div>
      </div>
    </div>
  )
}
