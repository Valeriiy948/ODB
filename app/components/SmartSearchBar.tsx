'use client'

import { useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type QType =
  | 'email' | 'phone' | 'name' | 'inn' | 'snils'
  | 'passport' | 'ip' | 'domain' | 'username' | ''

export interface QueryDetection {
  type:    QType
  label:   string
  icon:    string
  color:   string   // hex accent
  sources: string[]
  hint:    string | null
  // Which enrichField key this maps to for unified search
  fieldKey: 'email' | 'phone' | 'name' | 'inn' | 'passport' | null
}

const EMPTY_DETECTION: QueryDetection = {
  type: '', label: '', icon: '', color: '', sources: [], hint: null, fieldKey: null,
}

// ─── Detection engine ─────────────────────────────────────────────────────────

export function detectQuery(raw: string): QueryDetection {
  const q = raw.trim()
  if (!q) return EMPTY_DETECTION

  // Email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(q)) {
    return {
      type: 'email', label: 'Email', icon: '✉️', color: '#60a5fa', fieldKey: 'email',
      sources: ['DeHashed', 'HIBP', 'LeakCheck', 'SnusBase', 'LeakOsint'],
      hint: null,
    }
  }

  // IP address
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(q)) {
    const parts = q.split('.').map(Number)
    const valid = parts.every(n => n >= 0 && n <= 255)
    if (valid) {
      return {
        type: 'ip', label: 'IP-адреса', icon: '🌐', color: '#22d3ee', fieldKey: null,
        sources: ['Shodan', 'Censys'],
        hint: null,
      }
    }
  }

  // Domain (has dot, no spaces, not pure IP, not email)
  if (/^[a-zA-Z0-9][a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}$/.test(q) && !q.includes('@')) {
    return {
      type: 'domain', label: 'Домен', icon: '🔗', color: '#22d3ee', fieldKey: null,
      sources: ['Shodan', 'Censys'],
      hint: null,
    }
  }

  // Pure-digit string → phone / IPN / SNILS / passport
  const stripped = q.replace(/[\s\-\(\)\+\.]/g, '')
  if (/^\d+$/.test(stripped)) {
    const len = stripped.length

    // Phone patterns
    if (len === 10 && stripped.startsWith('0')) {
      return {
        type: 'phone', label: 'Телефон (UA)', icon: '📞', color: '#4ade80', fieldKey: 'phone',
        sources: ['OsintKit', 'LeakOsint', 'Telegram BOTS'],
        hint: null,
      }
    }
    if (len === 11 && (stripped.startsWith('7') || stripped.startsWith('8'))) {
      return {
        type: 'phone', label: 'Телефон (RU)', icon: '📞', color: '#4ade80', fieldKey: 'phone',
        sources: ['OsintKit', 'LeakOsint', 'Telegram BOTS'],
        hint: null,
      }
    }
    if (len === 12 && stripped.startsWith('380')) {
      return {
        type: 'phone', label: 'Телефон (UA)', icon: '📞', color: '#4ade80', fieldKey: 'phone',
        sources: ['OsintKit', 'LeakOsint', 'Telegram BOTS'],
        hint: null,
      }
    }
    if (len === 13 && stripped.startsWith('380')) {
      return {
        type: 'phone', label: 'Телефон (UA)', icon: '📞', color: '#4ade80', fieldKey: 'phone',
        sources: ['OsintKit', 'LeakOsint', 'Telegram BOTS'],
        hint: null,
      }
    }
    if (len >= 10 && len <= 15) {
      return {
        type: 'phone', label: 'Телефон', icon: '📞', color: '#4ade80', fieldKey: 'phone',
        sources: ['OsintKit', 'LeakOsint', 'Telegram BOTS'],
        hint: 'Спробуй з кодом країни: 7xxx... або 380xxx...',
      }
    }
    // СНІЛС: 11 digits (not phone)
    if (len === 11) {
      return {
        type: 'snils', label: 'СНІЛС', icon: '📋', color: '#a78bfa', fieldKey: 'inn',
        sources: ['OsintKit', 'LeakOsint'],
        hint: 'СНІЛС: 11 цифр (Росія)',
      }
    }
    // IPN / ИНН: 10 digits (RU company/person) or 12 digits (RU person)
    if (len === 10 || len === 12) {
      const label = len === 12 ? 'РНОКПП / ІНН' : 'ІПН (RU 10 цифр)'
      return {
        type: 'inn', label, icon: '🔢', color: '#fbbf24', fieldKey: 'inn',
        sources: ['OsintKit', 'LeakOsint'],
        hint: null,
      }
    }
    // Passport series+number: 10 digits
    if (len === 10) {
      return {
        type: 'passport', label: 'Паспорт (серія+номер)', icon: '🪪', color: '#f97316', fieldKey: 'passport',
        sources: ['OsintKit', 'LeakOsint'],
        hint: 'Серія 4 цифри + номер 6 цифр без пробілу',
      }
    }
  }

  // Cyrillic passport: 2 letters + 6-7 digits (UA) or Кириличні серії (RU)
  if (/^[А-ЯA-Z]{2}\d{6,7}$/iu.test(q)) {
    return {
      type: 'passport', label: 'Паспорт', icon: '🪪', color: '#f97316', fieldKey: 'passport',
      sources: ['OsintKit', 'LeakOsint'],
      hint: null,
    }
  }

  // Username: latin only, no spaces, 3-30 chars, no Cyrillic
  if (/^[a-zA-Z0-9_\.]{3,30}$/.test(q) && !/\s/.test(q)) {
    return {
      type: 'username', label: 'Username', icon: '👤', color: '#e879f9', fieldKey: 'name',
      sources: ['DeHashed', 'LeakCheck', 'SnusBase'],
      hint: null,
    }
  }

  // Name: Cyrillic words or multi-word Latin
  if (/[а-яА-ЯіІїЇєЄ]/u.test(q)) {
    const words = q.trim().split(/\s+/).filter(Boolean)
    return {
      type: 'name', label: "ПІБ / Ім'я", icon: '🔍', color: '#c084fc', fieldKey: 'name',
      sources: ['OsintKit', 'LeakOsint', 'Telegram BOTS'],
      hint: words.length < 2 ? "Додай прізвище та по-батькові для точнішого пошуку" : null,
    }
  }

  // Multi-word (Latin name)
  if (q.includes(' ') && q.length > 4) {
    return {
      type: 'name', label: 'Ім\'я', icon: '🔍', color: '#c084fc', fieldKey: 'name',
      sources: ['OsintKit', 'LeakCheck', 'DeHashed'],
      hint: null,
    }
  }

  // Fallback: short string
  return {
    type: 'username', label: 'Пошук', icon: '🔍', color: '#94a3b8', fieldKey: 'name',
    sources: ['OsintKit', 'LeakCheck', 'DeHashed'],
    hint: 'Введи email, телефон, ПІБ або ІПН для кращих результатів',
  }
}

// ─── Quick examples ───────────────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'email',    value: 'ivanov@mail.ru' },
  { label: 'телефон', value: '79161234567' },
  { label: 'ПІБ',     value: 'Романов Александр Викторович' },
  { label: 'ІПН',     value: '771234567890' },
  { label: 'IP',      value: '185.234.219.15' },
  { label: 'паспорт', value: '4516409823' },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface SmartSearchBarProps {
  onSearch:    (query: string, detection: QueryDetection) => void
  loading:     boolean
  value?:      string
  onChange?:   (v: string) => void
  autoFocus?:  boolean
  size?:       'default' | 'compact'
}

export function SmartSearchBar({
  onSearch, loading,
  value: controlledValue,
  onChange: controlledOnChange,
  autoFocus = false,
  size = 'default',
}: SmartSearchBarProps) {
  const [internal, setInternal] = useState('')
  const value  = controlledValue  ?? internal
  const setValue = useCallback((v: string) => {
    controlledOnChange ? controlledOnChange(v) : setInternal(v)
  }, [controlledOnChange])

  const d = detectQuery(value)
  const hasD = d.type !== ''

  function handleSearch() {
    const q = value.trim()
    if (!q || loading) return
    onSearch(q, d)
  }

  const py    = size === 'compact' ? 'py-2.5' : 'py-3.5'
  const pyBtn = size === 'compact' ? 'py-2.5' : 'py-3.5'

  return (
    <div className="space-y-2">
      {/* Input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            autoFocus={autoFocus}
            placeholder="Email, телефон, ПІБ, ІПН, паспорт, IP..."
            className={`w-full px-4 ${py} rounded-xl text-sm outline-none transition-all font-mono`}
            style={{
              background:  'var(--odb-surface3)',
              border:      `1px solid ${hasD ? d.color + '70' : 'var(--odb-border)'}`,
              color:       'var(--odb-text)',
              boxShadow:   hasD ? `0 0 0 3px ${d.color}14` : 'none',
              paddingRight: hasD ? '8.5rem' : '1rem',
            }}
          />
          {/* Inline type badge */}
          {hasD && (
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold select-none pointer-events-none whitespace-nowrap"
              style={{
                background: d.color + '22',
                color:      d.color,
                border:     `1px solid ${d.color}50`,
              }}
            >
              {d.icon} {d.label}
            </span>
          )}
        </div>

        {/* Search button */}
        <button
          onClick={handleSearch}
          disabled={!value.trim() || loading}
          className={`px-5 ${pyBtn} rounded-xl font-bold text-sm transition-all disabled:opacity-40 shrink-0`}
          style={{
            background: hasD ? d.color : 'var(--odb-surface3)',
            color:      hasD ? (d.color === '#60a5fa' || d.color === '#22d3ee' || d.color === '#94a3b8' ? '#0f172a' : '#0f172a') : 'var(--odb-text-faint)',
            border:     hasD ? 'none' : '1px solid var(--odb-border)',
          }}
        >
          {loading
            ? <span className="inline-block animate-spin">⟳</span>
            : '→'}
        </button>
      </div>

      {/* Detection details row */}
      {hasD && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span style={{ color: 'var(--odb-text-faint)' }}>Шукатиме в:</span>
            {d.sources.map(s => (
              <span key={s} className="px-1.5 py-0.5 rounded"
                style={{ background: 'var(--odb-surface)', color: 'var(--odb-text-dim)', border: '1px solid var(--odb-border)' }}>
                {s}
              </span>
            ))}
          </div>
          {d.hint && (
            <span className="text-amber-400/80">⚠ {d.hint}</span>
          )}
        </div>
      )}

      {/* Quick examples — shown only when empty */}
      {!value && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map(({ label, value: ex }) => (
            <button
              key={label}
              onClick={() => setValue(ex)}
              className="text-xs px-2.5 py-1 rounded-lg transition"
              style={{
                background: 'var(--odb-surface)',
                color:      'var(--odb-text-faint)',
                border:     '1px solid var(--odb-border)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
