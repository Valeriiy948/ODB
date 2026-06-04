'use client'
// components/AiProfileCard.tsx
// AI-картка особи — підтримує обидва формати: enrich (persons[]) та old (threat_level)

import { useState } from 'react'

// ─── Типи ────────────────────────────────────────────────────────────────────

interface AiPersonNew {
  id?: number
  full_name?: string
  aliases?: string[]
  birth_date?: string
  gender?: string
  phones?: string[]
  emails?: string[]
  addresses?: string[]
  passports?: string[]
  passport_issuer?: string
  birthplace?: string
  inn?: string
  snils?: string
  social?: Record<string, any>
  logins?: Array<{ service?: string; login?: string; password?: string }>
  vehicles?: string[]
  military?: { rank?: string; unit?: string; position?: string }
  ip_addresses?: string[]
  relatives?: Array<{ name?: string; dob?: string; relation?: string }>
  financial?: { bank_accounts?: string[]; credit_cards?: string[] }
  source_databases?: string[]
  source_count?: number
  confidence?: string
  threat_indicators?: string[]
  notes?: string
}

interface AiProfileNew {
  persons?: AiPersonNew[]
  relationships?: any[]
  primary_person_id?: number
  summary?: string
  military_alert?: string | null
  total_unique_persons?: number
}

interface AiProfileOld {
  threat_level?: string
  role?: string
  summary?: string
  identification?: {
    full_name?: string
    dob?: string
    nationality?: string
    documents?: string[]
    addresses?: string[]
  }
  military?: { unit?: string; rank?: string; role_description?: string }
  crimes?: Array<{
    title: string; date?: string; location?: string
    type?: string; severity?: string; icc_article?: string; role?: string
  }>
  digital_footprint?: {
    phones?: string[]; emails?: string[]; social?: string[]
    leaks_count?: number; leak_sources?: string[]
  }
  connections?: string[]
  evidence_summary?: string
  icc_articles?: string[]
  ua_criminal_articles?: string[]
  key_facts?: string[]
  recommendations?: string[]
  information_gaps?: string[]
  analyst_note?: string
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  aiProfileRaw: string | object
  threatScore?: number
  onRefresh: () => void
  loading: boolean
  error?: string
}

// ─── Утиліти ─────────────────────────────────────────────────────────────────

const THREAT_COLORS: Record<string, string> = {
  'критичний': 'bg-red-900/50 border-red-500 text-red-300',
  'високий':   'bg-orange-900/50 border-orange-500 text-orange-300',
  'середній':  'bg-yellow-900/50 border-yellow-500 text-yellow-300',
  'низький':   'bg-green-900/50 border-green-500 text-green-300',
  'невідомий': 'bg-gray-800 border-gray-600 text-gray-400',
}
const THREAT_ICONS: Record<string, string> = {
  'критичний': '🔴', 'високий': '🟠', 'середній': '🟡', 'низький': '🟢', 'невідомий': '⚪',
}
const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-950/30',
  high:     'border-l-orange-500 bg-orange-950/30',
  medium:   'border-l-yellow-500 bg-yellow-950/30',
  low:      'border-l-blue-500 bg-blue-950/30',
}
const CONFIDENCE_COLORS: Record<string, string> = {
  high:   'bg-green-900/40 text-green-300 border border-green-700',
  medium: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
  low:    'bg-red-900/40 text-red-300 border border-red-700',
}
const RELATION_ICONS: Record<string, string> = {
  'батько': '👨', 'мати': '👩', 'брат': '👦', 'сестра': '👧',
  'дружина': '💍', 'чоловік': '💍', 'дитина': '👶', 'дід': '👴',
  'баба': '👵', 'бабуся': '👵',
}

function Section({ title, children, badge }: { title: string; children: React.ReactNode; badge?: string | number }) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <h4 className="text-gray-400 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
        {title}
        {badge !== undefined && badge !== 0 && (
          <span className="ml-auto bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full">{badge}</span>
        )}
      </h4>
      {children}
    </div>
  )
}

function TagList({ items, color = 'bg-gray-700 text-gray-300' }: { items: string[]; color?: string }) {
  if (!items?.length) return <p className="text-gray-600 text-sm italic">Немає даних</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className={`px-2 py-0.5 rounded text-xs font-mono ${color}`}>{item}</span>
      ))}
    </div>
  )
}

function BulletList({ items, icon = '•' }: { items: string[]; icon?: string }) {
  if (!items?.length) return <p className="text-gray-600 text-sm italic">Немає даних</p>
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-gray-300">
          <span className="flex-shrink-0 text-gray-500">{icon}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  return (
    <button onClick={copy} className="text-gray-600 hover:text-gray-300 transition text-xs ml-1" title="Копіювати">
      {copied ? '✓' : '⎘'}
    </button>
  )
}

// Клікабельний телефон — відкриває breach-intel пошук
function ClickablePhone({ phone }: { phone: string }) {
  const clean = phone.replace(/\D/g, '')
  const href = `/breach-intel?q=${encodeURIComponent(clean)}&type=phone`
  return (
    <div className="flex items-center gap-1 group">
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="text-green-400 hover:text-green-300 text-sm font-mono hover:underline transition">
        📱 {phone}
      </a>
      <CopyButton text={clean} />
    </div>
  )
}

// Клікабельний email
function ClickableEmail({ email }: { email: string }) {
  const href = `/breach-intel?q=${encodeURIComponent(email)}&type=email`
  return (
    <div className="flex items-center gap-1 group">
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 text-sm font-mono hover:underline transition">
        ✉️ {email}
      </a>
      <CopyButton text={email} />
    </div>
  )
}

// ─── Новий формат (persons[]) ─────────────────────────────────────────────────

function NewFormatCard({ profile, threatScore }: { profile: AiProfileNew; threatScore?: number }) {
  const [showLogins, setShowLogins] = useState(false)

  const primary = profile.persons?.find(p => p.id === profile.primary_person_id)
    || profile.persons?.[0]

  if (!primary) return <p className="text-gray-600 text-sm italic">Профіль порожній</p>

  const conf = (primary.confidence || '').toLowerCase()
  const confColor = CONFIDENCE_COLORS[conf] || CONFIDENCE_COLORS.medium

  const hasMilitary = primary.military?.rank || primary.military?.unit || primary.military?.position
  const hasFinancial = (primary.financial?.bank_accounts?.length || 0) > 0
    || (primary.financial?.credit_cards?.length || 0) > 0

  const socialLinks: Array<{ name: string; value: string; url: string; icon: string }> = []
  if (primary.social) {
    if (primary.social.vk) socialLinks.push({ name: 'VK', value: String(primary.social.vk), url: `https://vk.com/${primary.social.vk}`, icon: '💙' })
    if (primary.social.ok) socialLinks.push({ name: 'OK', value: String(primary.social.ok), url: `https://ok.ru/profile/${primary.social.ok}`, icon: '🟠' })
    if (primary.social.telegram) socialLinks.push({ name: 'TG', value: String(primary.social.telegram), url: `https://t.me/${primary.social.telegram}`, icon: '✈️' })
    if (primary.social.instagram) socialLinks.push({ name: 'IG', value: String(primary.social.instagram), url: `https://instagram.com/${primary.social.instagram}`, icon: '📸' })
  }

  return (
    <div className="space-y-3">

      {/* ── Шапка особи ── */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-base leading-tight">{primary.full_name || '—'}</p>
            {primary.aliases?.length ? (
              <p className="text-gray-500 text-xs mt-0.5">
                Псевдоніми: {primary.aliases.join(', ')}
              </p>
            ) : null}
            <div className="flex items-center flex-wrap gap-2 mt-2">
              {primary.birth_date && (
                <span className="text-gray-400 text-xs">📅 {primary.birth_date}</span>
              )}
              {primary.gender && (
                <span className="text-gray-400 text-xs">
                  {primary.gender === 'M' || primary.gender === 'м' ? '♂ Чоловіча' : '♀ Жіноча'}
                </span>
              )}
              {primary.birthplace && (
                <span className="text-gray-400 text-xs">🏙️ {primary.birthplace}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {threatScore !== undefined && (
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm border-2 ${
                threatScore >= 80 ? 'border-red-500 bg-red-950/60 text-red-300' :
                threatScore >= 50 ? 'border-orange-500 bg-orange-950/60 text-orange-300' :
                threatScore >= 20 ? 'border-yellow-500 bg-yellow-950/60 text-yellow-300' :
                'border-gray-600 bg-gray-800 text-gray-400'
              }`}>{threatScore}</div>
            )}
            {primary.confidence && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${confColor}`}>
                {conf === 'high' ? '✓ Висока точність' : conf === 'medium' ? '~ Середня' : '? Низька'}
              </span>
            )}
          </div>
        </div>

        {/* Sources count — тільки цифра, без розгортання */}
        {(primary.source_count || primary.source_databases?.length) ? (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <span className="text-gray-500 text-xs">
              📦 Знайдено у <strong className="text-amber-400">{primary.source_count || primary.source_databases?.length}</strong> базах даних
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Summary ── */}
      {profile.summary && (
        <div className="bg-blue-950/30 border border-blue-700/50 rounded-xl p-4">
          <p className="text-blue-300 text-xs uppercase tracking-wider mb-2">📋 AI-резюме</p>
          <p className="text-gray-200 text-sm leading-relaxed">{profile.summary}</p>
        </div>
      )}

      {/* ── Threat indicators ── */}
      {primary.threat_indicators?.length ? (
        <div className="bg-red-950/30 border border-red-700/50 rounded-xl p-4">
          <p className="text-red-400 text-xs uppercase tracking-wider mb-2">🚨 Індикатори загрози</p>
          <ul className="space-y-1">
            {primary.threat_indicators.map((t, i) => (
              <li key={i} className="text-red-300 text-sm flex gap-2">
                <span>⚠️</span><span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── Military alert ── */}
      {profile.military_alert && (
        <div className="bg-orange-950/40 border border-orange-700 rounded-xl p-3">
          <p className="text-orange-300 text-sm font-medium">🎖️ {profile.military_alert}</p>
        </div>
      )}

      {/* ── Документи та ID ── */}
      <Section title="📄 Документи та ідентифікатори">
        <div className="space-y-2">
          {primary.inn && (
            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-xs w-20 shrink-0">ІПН/ИНН</span>
              <span className="text-yellow-300 text-sm font-mono flex-1">{primary.inn}</span>
              <CopyButton text={primary.inn} />
            </div>
          )}
          {primary.snils && (
            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-xs w-20 shrink-0">СНІЛС</span>
              <span className="text-yellow-300 text-sm font-mono flex-1">{primary.snils}</span>
              <CopyButton text={primary.snils} />
            </div>
          )}
          {primary.passports?.length ? (
            <div>
              <p className="text-gray-500 text-xs mb-1">Паспорти ({primary.passports.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {primary.passports.map((p, i) => (
                  <span key={i} className="text-green-300 text-xs font-mono px-2 py-0.5 bg-green-950/30 border border-green-800/50 rounded">
                    🪪 {p}
                  </span>
                ))}
              </div>
              {primary.passport_issuer && (
                <p className="text-gray-500 text-xs mt-1">🏛️ Ким видано: <span className="text-gray-400">{primary.passport_issuer}</span></p>
              )}
            </div>
          ) : null}
          {!primary.inn && !primary.snils && !primary.passports?.length && (
            <p className="text-gray-600 text-sm italic">Немає даних</p>
          )}
        </div>
      </Section>

      {/* ── Телефони ── */}
      {primary.phones?.length ? (
        <Section title="📱 Телефони" badge={primary.phones.length}>
          <div className="space-y-1.5">
            {primary.phones.map((phone, i) => (
              <ClickablePhone key={i} phone={phone} />
            ))}
          </div>
          <p className="text-gray-600 text-xs mt-2">↗ Клік — пошук по всіх базах</p>
        </Section>
      ) : null}

      {/* ── Email ── */}
      {primary.emails?.length ? (
        <Section title="✉️ Email-адреси" badge={primary.emails.length}>
          <div className="space-y-1.5">
            {primary.emails.map((email, i) => (
              <ClickableEmail key={i} email={email} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* ── Адреси — клікабельні ── */}
      {primary.addresses?.length ? (
        <Section title="🏠 Адреси" badge={primary.addresses.length}>
          <ul className="space-y-2">
            {primary.addresses.map((addr, i) => (
              <li key={i} className="flex items-start gap-2 group">
                <span className="text-gray-600 shrink-0 mt-0.5">📍</span>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-300 text-sm break-words">{addr}</span>
                  <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:text-blue-400 transition">
                      🗺️ Карта
                    </a>
                    <a href={`/breach-intel?q=${encodeURIComponent(addr)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-green-500 hover:text-green-400 transition">
                      🔍 Пошук по БД
                    </a>
                    <CopyButton text={addr} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-gray-600 text-xs mt-2">↗ Наведи на адресу — з'являться посилання</p>
        </Section>
      ) : null}

      {/* ── Транспорт ── */}
      {primary.vehicles?.length ? (
        <Section title="🚗 Транспортні засоби" badge={primary.vehicles.length}>
          <div className="space-y-2">
            {primary.vehicles.map((v, i) => {
              const parts = v.split(/\s+/)
              const hasVin = parts.find((p: string) => p.length >= 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(p))
              const hasPlate = parts.find((p: string) => /^[А-ЯЁҐЄІЇA-Z]{1,2}\d{3,4}[А-ЯЁҐЄІЇA-Z]{2,3}\d{2,3}$/i.test(p))
              return (
                <div key={i} className="bg-gray-900/50 rounded-lg px-3 py-2 border border-gray-700">
                  <p className="text-gray-200 text-sm">{v}</p>
                  <div className="flex gap-3 mt-1">
                    {hasVin && <span className="text-blue-400 text-xs font-mono">VIN: {hasVin}</span>}
                    {hasPlate && <span className="text-yellow-300 text-xs font-mono">🔖 {hasPlate}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      ) : null}

      {/* ── Родичі ── */}
      {primary.relatives?.length ? (
        <Section title="👨‍👩‍👧 Родичі та зв'язки" badge={primary.relatives.length}>
          <div className="space-y-2">
            {primary.relatives.map((rel, i) => {
              const icon = Object.entries(RELATION_ICONS).find(([k]) =>
                rel.relation?.toLowerCase().includes(k)
              )?.[1] || '👤'
              return (
                <div key={i} className="flex items-center justify-between bg-gray-900/50 rounded-lg px-3 py-2 border border-gray-700">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-lg shrink-0">{icon}</span>
                    <div className="min-w-0">
                      <p className="text-gray-200 text-sm font-medium truncate">{rel.name || '—'}</p>
                      {rel.dob && <p className="text-gray-500 text-xs">📅 {rel.dob}</p>}
                    </div>
                  </div>
                  {rel.relation && (
                    <span className="text-xs px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full border border-blue-800/50 shrink-0 ml-2">
                      {rel.relation}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {/* Зв'язки між особами */}
          {(profile.relationships?.length || 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-gray-500 text-xs mb-2">🔗 Встановлені зв'язки</p>
              {profile.relationships!.map((rel: any, i: number) => (
                <p key={i} className="text-gray-400 text-xs">{rel.type}: {rel.evidence}</p>
              ))}
            </div>
          )}
        </Section>
      ) : null}

      {/* ── Соцмережі ── */}
      {(socialLinks.length > 0 || (primary.ip_addresses?.length || 0) > 0) && (
        <Section title="🌐 Цифровий слід">
          <div className="space-y-2">
            {socialLinks.map((sl, i) => (
              <a key={i} href={sl.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition hover:underline text-sm">
                <span>{sl.icon}</span>
                <span>{sl.name}: {sl.value}</span>
              </a>
            ))}
            {primary.ip_addresses?.length ? (
              <div>
                <p className="text-gray-500 text-xs mb-1">🖥️ IP-адреси</p>
                <div className="flex flex-wrap gap-1.5">
                  {primary.ip_addresses.map((ip, i) => (
                    <span key={i} className="text-purple-300 text-xs font-mono px-2 py-0.5 bg-purple-950/30 border border-purple-800/50 rounded">{ip}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Section>
      )}

      {/* ── Логіни (без паролів) ── */}
      {primary.logins?.length ? (
        <Section title={`🔐 Акаунти (${primary.logins.length})`}>
          <button
            onClick={() => setShowLogins(!showLogins)}
            className="w-full text-left text-gray-400 hover:text-gray-200 text-xs transition mb-2 flex items-center justify-between"
          >
            <span>{showLogins ? '▲ Сховати' : `▼ Показати ${primary.logins.length} акаунтів`}</span>
            <span className="text-yellow-600 text-xs">⚠️ Дані з витоків</span>
          </button>
          {showLogins && (
            <div className="space-y-1.5">
              {primary.logins.map((l, i) => (
                <div key={i} className="bg-gray-900/60 rounded px-2.5 py-1.5 border border-gray-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500 text-xs shrink-0">{l.service || 'Сервіс'}</span>
                    <span className="text-blue-300 text-xs font-mono truncate flex-1 text-right">{l.login}</span>
                  </div>
                  {l.password && (
                    <p className="text-red-400 text-xs mt-0.5">
                      🔑 Пароль у витоку: <span className="font-mono">{l.password}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      ) : null}

      {/* ── Військові дані ── */}
      {hasMilitary && (
        <Section title="🎖️ Військові дані">
          <div className="space-y-2 text-sm">
            {primary.military?.rank && (
              <div className="flex gap-2">
                <span className="text-gray-500 w-24 shrink-0">Звання:</span>
                <span className="text-white font-medium">{primary.military.rank}</span>
              </div>
            )}
            {primary.military?.unit && (
              <div className="flex gap-2">
                <span className="text-gray-500 w-24 shrink-0">Підрозділ:</span>
                <span className="text-gray-200">{primary.military.unit}</span>
              </div>
            )}
            {primary.military?.position && (
              <div className="flex gap-2">
                <span className="text-gray-500 w-24 shrink-0">Посада:</span>
                <span className="text-gray-200">{primary.military.position}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Фінансові дані ── */}
      {hasFinancial && (
        <Section title="💳 Фінансові дані">
          {primary.financial?.bank_accounts?.length ? (
            <div className="mb-2">
              <p className="text-gray-500 text-xs mb-1">Банківські рахунки</p>
              {primary.financial.bank_accounts.map((acc, i) => (
                <p key={i} className="text-yellow-300 text-xs font-mono">{acc}</p>
              ))}
            </div>
          ) : null}
          {primary.financial?.credit_cards?.length ? (
            <div>
              <p className="text-gray-500 text-xs mb-1">Картки (маскованo)</p>
              {primary.financial.credit_cards.map((card, i) => (
                <p key={i} className="text-yellow-300 text-xs font-mono">{card}</p>
              ))}
            </div>
          ) : null}
        </Section>
      )}

      {/* Нотатки AI — прибрано (дублює summary) */}

    </div>
  )
}

// ─── Старий формат (threat_level/role/summary) ────────────────────────────────

function OldFormatCard({ profile, threatScore }: { profile: AiProfileOld; threatScore?: number }) {
  const threatLevel = profile.threat_level || 'невідомий'
  const threatColorClass = THREAT_COLORS[threatLevel] || THREAT_COLORS['невідомий']
  const threatIcon = THREAT_ICONS[threatLevel] || '⚪'

  return (
    <div className="space-y-4">
      {/* Шапка */}
      <div className={`rounded-xl p-4 border-2 ${threatColorClass}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{threatIcon}</span>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-70">Рівень загрози</p>
              <p className="font-bold text-lg uppercase">{threatLevel}</p>
            </div>
          </div>
          {threatScore !== undefined && (
            <div className="text-right">
              <p className="text-xs opacity-70">Threat Score</p>
              <p className="text-2xl font-bold">{threatScore}<span className="text-sm opacity-60">/100</span></p>
            </div>
          )}
        </div>
      </div>

      {profile.summary && (
        <div className="bg-blue-950/30 border border-blue-700/50 rounded-xl p-4">
          <p className="text-blue-300 text-xs uppercase tracking-wider mb-2">📋 Резюме аналітика</p>
          <p className="text-gray-200 text-sm leading-relaxed">{profile.summary}</p>
        </div>
      )}

      {profile.identification && (
        <Section title="👤 Ідентифікація">
          <div className="space-y-2 text-sm">
            {profile.identification.dob && (
              <div className="flex gap-2">
                <span className="text-gray-500 w-32 shrink-0">Дата народж.:</span>
                <span className="text-gray-200">{profile.identification.dob}</span>
              </div>
            )}
            {profile.identification.nationality && (
              <div className="flex gap-2">
                <span className="text-gray-500 w-32 shrink-0">Громадянство:</span>
                <span className="text-gray-200">{profile.identification.nationality}</span>
              </div>
            )}
            {profile.identification.documents?.length ? (
              <div>
                <p className="text-gray-500 text-xs mb-1">Документи:</p>
                <TagList items={profile.identification.documents} />
              </div>
            ) : null}
            {profile.identification.addresses?.length ? (
              <div>
                <p className="text-gray-500 text-xs mb-1">Адреси:</p>
                <BulletList items={profile.identification.addresses} icon="📍" />
              </div>
            ) : null}
          </div>
        </Section>
      )}

      {profile.digital_footprint && (
        <Section title="🌐 Цифровий слід">
          <div className="space-y-3">
            {profile.digital_footprint.phones?.length ? (
              <div>
                <p className="text-gray-500 text-xs mb-1">📱 Телефони:</p>
                <div className="space-y-1">
                  {profile.digital_footprint.phones.map((p, i) => <ClickablePhone key={i} phone={p} />)}
                </div>
              </div>
            ) : null}
            {profile.digital_footprint.emails?.length ? (
              <div>
                <p className="text-gray-500 text-xs mb-1">✉️ Emails:</p>
                <div className="space-y-1">
                  {profile.digital_footprint.emails.map((e, i) => <ClickableEmail key={i} email={e} />)}
                </div>
              </div>
            ) : null}
          </div>
        </Section>
      )}

      {profile.connections?.length ? (
        <Section title="🔗 Зв'язки">
          <BulletList items={profile.connections} icon="👤" />
        </Section>
      ) : null}

    </div>
  )
}

// ─── Головний компонент ───────────────────────────────────────────────────────

export default function AiProfileCard({ aiProfileRaw, threatScore, onRefresh, loading, error }: Props) {
  let parsed: any = null
  let format: 'new' | 'old' | 'raw' | null = null

  try {
    // Handle both string and object (Supabase JSONB comes back as object)
    if (aiProfileRaw) {
      // Стрипаємо markdown-обгортку ```json ... ``` якщо AI зберіг з нею
      let rawStr = typeof aiProfileRaw === 'string' ? aiProfileRaw : JSON.stringify(aiProfileRaw)
      rawStr = rawStr.trim()
      if (rawStr.startsWith('```')) {
        rawStr = rawStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
      }
      // Допоміжна функція: ремонт обрізаного JSON
      function repairJson(s: string): any {
        const match = s.match(/\{[\s\S]*/)
        if (!match) return null
        let t = match[0].trimEnd().replace(/,\s*$/, '').replace(/:\s*$/, ': null')
        // Закриваємо незакриті рядки
        const quoteCount = (t.match(/(?<!\\)"/g) || []).length
        if (quoteCount % 2 !== 0) t += '"'
        t = t.replace(/,\s*$/, '')
        let depth = 0
        for (const ch of t) {
          if (ch === '{' || ch === '[') depth++
          else if (ch === '}' || ch === ']') depth--
        }
        for (let i = 0; i < Math.max(0, depth); i++) t += '}'
        return JSON.parse(t)
      }

      let obj: any = null
      try {
        obj = typeof aiProfileRaw === 'string' ? JSON.parse(rawStr) : aiProfileRaw
      } catch {
        // Спробуємо відремонтувати обрізаний JSON
        try { obj = repairJson(rawStr) } catch { /* залишається null */ }
      }

      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj.persons) && obj.persons.length > 0) {
          parsed = obj
          format = 'new'
        } else if (obj.threat_level || obj.summary || obj.role) {
          parsed = obj
          format = 'old'
        } else if (obj.parse_error) {
          format = 'raw'
          parsed = obj.raw || String(aiProfileRaw)
        } else {
          parsed = obj
          format = 'new'
        }
      }
    }
  } catch {
    format = 'raw'
    parsed = typeof aiProfileRaw === 'string' ? aiProfileRaw : null
  }

  return (
    <div className="space-y-4">
      {/* Кнопка оновлення */}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="w-full px-4 py-2.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-xl text-sm font-medium transition flex items-center justify-center gap-2"
      >
        {loading ? (
          <><span className="animate-spin">⟳</span> Claude аналізує дані...</>
        ) : (
          <><span>✨</span> {aiProfileRaw ? 'Оновити AI-аналіз' : 'Згенерувати AI-профіль'}</>
        )}
      </button>

      {error && (
        <div className="p-3 bg-yellow-950/50 border border-yellow-700 rounded-lg text-yellow-400 text-xs">
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-10">
          <div className="text-purple-400 text-3xl mb-3 animate-pulse">🤖</div>
          <p className="text-gray-400 text-sm">Claude аналізує всі зібрані дані...</p>
          <p className="text-gray-600 text-xs mt-1">~15-30 секунд</p>
        </div>
      )}

      {!loading && format === 'new' && parsed && (
        <NewFormatCard profile={parsed as AiProfileNew} threatScore={threatScore} />
      )}

      {!loading && format === 'old' && parsed && (
        <OldFormatCard profile={parsed as AiProfileOld} threatScore={threatScore} />
      )}

      {!loading && format === 'raw' && parsed && (
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <p className="text-gray-400 text-xs mb-3">📄 Текстовий аналіз</p>
          <div className="prose prose-invert prose-sm max-w-none text-gray-200 leading-relaxed">
            {String(parsed).split('\n').map((line, i) => {
              if (line.startsWith('## ')) return <h2 key={i} className="text-blue-400 font-semibold text-sm mt-4 mb-2">{line.slice(3)}</h2>
              if (line.startsWith('### ')) return <h3 key={i} className="text-blue-300 text-sm mt-3 mb-1">{line.slice(4)}</h3>
              if (line.startsWith('- ') || line.startsWith('* ')) return <p key={i} className="text-gray-300 text-sm ml-3">• {line.slice(2)}</p>
              if (line.trim() === '') return <div key={i} className="h-2" />
              const parts = line.split(/\*\*([^*]+)\*\*/g)
              return (
                <p key={i} className="text-gray-200 text-sm">
                  {parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-white">{p}</strong> : p)}
                </p>
              )
            })}
          </div>
        </div>
      )}

      {!loading && !aiProfileRaw && (
        <div className="text-center py-12 text-gray-600">
          <p className="text-4xl mb-3">🤖</p>
          <p className="text-sm">AI-профіль ще не згенеровано</p>
          <p className="text-xs mt-1">Натисни кнопку вище — Claude проаналізує всі зібрані дані</p>
        </div>
      )}
    </div>
  )
}
