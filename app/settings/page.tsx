'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../components/Sidebar'
import Icon from '../components/Icon'
import { createClient } from '../lib/supabase/client'

const supabase = createClient()

interface ApiKeyInfo {
  key: string
  configured: boolean
  source: 'env' | 'db' | 'none'
  value?: string
}

const KEY_LABELS: Record<string, { label: string; desc: string; url: string; icon: string }> = {
  SHODAN_API_KEY:      { label: 'Shodan',       desc: 'Мережева розвідка / IP / порти',       url: 'https://account.shodan.io',           icon: '🌐' },
  DEHASHED_API_KEY:    { label: 'DeHashed',      desc: 'Витоки паролів та даних',              url: 'https://dehashed.com/profile',        icon: '🔓' },
  DEHASHED_EMAIL:      { label: 'DeHashed Email',desc: 'Email акаунту DeHashed',               url: 'https://dehashed.com',                icon: '📧' },
  LEAKCHECK_API_KEY:   { label: 'LeakCheck',     desc: 'Перевірка витоків email/телефон',      url: 'https://leakcheck.io',                icon: '🔍' },
  SNUSBASE_API_KEY:    { label: 'SnusBase',       desc: 'База витоків ~10 млрд записів',        url: 'https://snusbase.com',                icon: '🗄️' },
  VK_ACCESS_TOKEN:     { label: 'VK Token',       desc: 'Пошук по ВКонтакте',                  url: 'https://vk.com/apps?act=manage',      icon: '💙' },
  YOUCONTROL_API_KEY:  { label: 'YouControl',    desc: 'Бізнес-розвідка Україна',              url: 'https://youcontrol.com.ua/api/',      icon: '🏢' },
  OPENDATABOT_API_KEY: { label: 'Opendatabot',   desc: 'ЄДР, ФОП, бізнес-реєстри',            url: 'https://opendatabot.ua/api',          icon: '📋' },
  TAVILY_API_KEY:      { label: 'Tavily',         desc: 'Веб-пошук (вже налаштований)',         url: 'https://app.tavily.com',              icon: '🔍' },
  ANTHROPIC_API_KEY:   { label: 'Claude AI',      desc: 'AI профілі (вже налаштований)',        url: 'https://console.anthropic.com',       icon: '🤖' },
}

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--odb-surface)', border: '1px solid var(--odb-border)' }}>
      <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--odb-border)' }}>
        <span className="text-xl">{icon}</span>
        <h2 className="font-semibold" style={{ color: 'var(--odb-text)' }}>{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const router  = useRouter()
  const [user, setUser]          = useState<any>(null)
  const [isAdmin, setIsAdmin]    = useState(false)
  const [apiKeys, setApiKeys]    = useState<ApiKeyInfo[]>([])
  const [prefs, setPrefs]        = useState<Record<string, string>>({})
  const [platform, setPlatform]  = useState<any>({})
  const [loading, setLoading]    = useState(true)
  const [saving, setSaving]      = useState(false)
  const [saveMsg, setSaveMsg]    = useState('')
  const [editKeys, setEditKeys]  = useState<Record<string, string>>({})
  const [showKeys, setShowKeys]  = useState<Record<string, boolean>>({})
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg]        = useState('')
  const [activeTab, setActiveTab] = useState<'profile'|'keys'|'platform'|'admin'>('profile')

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) { router.push('/login'); return }
      setUser(u)

      // Load settings via API with auth token
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      try {
        const res  = await fetch('/api/settings', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        setIsAdmin(data.is_admin || false)
        setApiKeys(data.api_keys || [])
        setPrefs(data.preferences || {})
        setPlatform(data.platform || {})
      } catch {}

      setLoading(false)
    }
    load()
  }, [router])

  async function handleSendReset() {
    setPwLoading(true)
    setPwMsg('')
    const { error } = await supabase.auth.resetPasswordForEmail(user?.email || '', {
      redirectTo: `${window.location.origin}/settings?tab=profile`,
    })
    setPwMsg(error ? `❌ ${error.message}` : '✅ Лист надіслано на ' + user?.email)
    setPwLoading(false)
  }

  async function saveSettings() {
    setSaving(true)
    setSaveMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ settings: { ...editKeys, ...prefs } }),
      })
      const data = await res.json()
      if (data.error) setSaveMsg('❌ ' + data.error)
      else { setSaveMsg('✅ Збережено'); setEditKeys({}) }
    } catch (e: any) {
      setSaveMsg('❌ ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--odb-bg)' }}>
      <div style={{ color: 'var(--odb-text-dim)' }}>Завантаження...</div>
    </div>
  )

  const tabs = [
    { id: 'profile',  icon: '👤', label: 'Профіль' },
    { id: 'keys',     icon: '🔑', label: 'API Ключі' },
    { id: 'platform', icon: '⚙️', label: 'Платформа' },
    ...(isAdmin ? [{ id: 'admin', icon: '👑', label: 'Адмін' }] : []),
  ] as const

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)', color: 'var(--odb-text)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        <header className="px-6 py-4 flex items-center gap-3 shrink-0"
          style={{ background: 'var(--odb-surface)', borderBottom: '1px solid var(--odb-border)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', boxShadow: '0 0 16px rgba(99,102,241,0.3)' }}>
            <Icon name="settings" size={20} strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Налаштування</h1>
            {isAdmin && (
              <span className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.4)', color: '#eab308' }}>
                👑 Адміністратор
              </span>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Tabs */}
          <div className="px-6" style={{ borderBottom: '1px solid var(--odb-border)', background: 'var(--odb-surface2)' }}>
            <div className="flex gap-1">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                  className="px-4 py-3 text-sm font-medium border-b-2 transition"
                  style={activeTab === tab.id
                    ? { borderBottomColor: 'var(--odb-accent)', color: 'var(--odb-text)' }
                    : { borderBottomColor: 'transparent', color: 'var(--odb-text-dim)' }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 max-w-4xl mx-auto space-y-5">

            {/* ── PROFILE ── */}
            {activeTab === 'profile' && (
              <div className="space-y-5">
                <SectionCard title="Мій профіль" icon="👤">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-blue-700 rounded-full flex items-center justify-center text-2xl font-bold">
                        {(user?.email || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white font-semibold">{user?.user_metadata?.full_name || user?.email?.split('@')[0]}</p>
                        <p className="text-gray-400 text-sm">{user?.email}</p>
                        <p className="text-gray-600 text-xs mt-0.5">
                          Останній вхід: {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('uk-UA') : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-gray-700 pt-4">
                      <p className="text-sm text-gray-300 mb-3">Зміна паролю</p>
                      <button
                        onClick={handleSendReset}
                        disabled={pwLoading}
                        className="px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
        style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                      >
                        {pwLoading ? '⏳ Надсилання...' : '📧 Надіслати лист для зміни паролю'}
                      </button>
                      {pwMsg && <p className="text-sm mt-2 text-gray-300">{pwMsg}</p>}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Інформація про акаунт" icon="ℹ️">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      { label: 'User ID', value: user?.id?.slice(0, 18) + '...' },
                      { label: 'Email', value: user?.email },
                      { label: 'Роль', value: isAdmin ? '👑 Адміністратор' : '🔍 Аналітик' },
                      { label: 'Акаунт створено', value: user?.created_at ? new Date(user.created_at).toLocaleDateString('uk-UA') : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg p-3" style={{ background: 'var(--odb-surface3)' }}>
                        <p className="text-gray-500 text-xs mb-0.5">{label}</p>
                        <p className="text-gray-200 font-mono text-xs">{value}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* ── API KEYS ── */}
            {activeTab === 'keys' && (
              <div className="space-y-5">
                {!isAdmin && (
                  <div className="bg-yellow-950/40 border border-yellow-700 rounded-xl p-4 text-yellow-300 text-sm">
                    ⚠️ Редагувати API ключі може тільки адміністратор.
                  </div>
                )}

                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--odb-surface)', border: '1px solid var(--odb-border)' }}>
                  <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--odb-border)' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🔑</span>
                      <h2 className="font-semibold">API Ключі</h2>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-3">
                        {saveMsg && <span className="text-sm text-gray-300">{saveMsg}</span>}
                        <button
                          onClick={saveSettings}
                          disabled={saving || Object.keys(editKeys).length === 0}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg text-sm font-medium transition"
                        >
                          {saving ? '⏳' : '💾 Зберегти зміни'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="divide-y" style={{ borderColor: 'var(--odb-border)' }}>
                    {apiKeys.map(k => {
                      const meta = KEY_LABELS[k.key]
                      if (!meta) return null
                      const isEditing = isAdmin
                      return (
                        <div key={k.key} className="px-6 py-4 flex items-center gap-4">
                          <span className="text-2xl w-8 shrink-0">{meta.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium text-sm">{meta.label}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                k.configured
                                  ? 'bg-green-900/50 text-green-400 border border-green-700'
                                  : 'bg-red-900/30 text-red-400 border border-red-800'
                              }`}>
                                {k.configured ? '✓ Налаштовано' : '✗ Не вказано'}
                              </span>
                              {k.source === 'env' && (
                                <span className="text-xs text-gray-600">.env</span>
                              )}
                            </div>
                            <p className="text-gray-500 text-xs mt-0.5">{meta.desc}</p>
                            {k.value && !isEditing && (
                              <p className="text-gray-600 text-xs font-mono mt-0.5">{k.value}</p>
                            )}
                          </div>
                          {isEditing && k.source !== 'env' && (
                            <div className="flex items-center gap-2 w-72">
                              <input
                                type={showKeys[k.key] ? 'text' : 'password'}
                                placeholder={k.configured ? k.value || 'Змінити...' : 'Ввести ключ...'}
                                value={editKeys[k.key] ?? ''}
                                onChange={e => setEditKeys(prev => ({ ...prev, [k.key]: e.target.value }))}
                                className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none font-mono"
                              style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}
                              onFocus={e => (e.target.style.borderColor = 'var(--odb-accent)')}
                              onBlur={e => (e.target.style.borderColor = 'var(--odb-border)')}
                              />
                              <button
                                onClick={() => setShowKeys(p => ({ ...p, [k.key]: !p[k.key] }))}
                                className="text-gray-500 hover:text-gray-300 px-1"
                              >
                                {showKeys[k.key] ? '🙈' : '👁️'}
                              </button>
                            </div>
                          )}
                          {isEditing && k.source === 'env' && (
                            <span className="text-xs text-gray-600 w-72 text-right">Налаштовано через .env.local</span>
                          )}
                          <a href={meta.url} target="_blank" rel="noopener noreferrer"
                            className="text-gray-600 hover:text-blue-400 text-xs shrink-0">
                            Отримати →
                          </a>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* SQL migration hint */}
                <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-4">
                  <p className="text-blue-300 text-sm font-semibold mb-2">💡 Для збереження ключів у базі</p>
                  <p className="text-gray-400 text-xs mb-2">
                    Запусти SQL в Supabase Dashboard → SQL Editor:
                  </p>
                  <a href="https://supabase.com/dashboard/project/zvvtldyxmjuzpyozneoo/sql" target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline text-xs">
                    → Відкрити SQL Editor
                  </a>
                  <p className="text-gray-500 text-xs mt-1">
                    Файл: <code className="bg-gray-800 px-1 rounded">supabase-migrations/001_activity_logs.sql</code>
                  </p>
                </div>
              </div>
            )}

            {/* ── PLATFORM ── */}
            {activeTab === 'platform' && (
              <div className="space-y-5">
                <SectionCard title="Підключення" icon="🔌">
                  <div className="space-y-3 text-sm">
                    {[
                      { label: 'Supabase URL',     value: platform.supabase_url,    ok: !!platform.supabase_url },
                      { label: 'VPS Host',          value: platform.vps_host,        ok: !!platform.vps_host },
                      { label: 'Telegram порт',    value: platform.telegram_port,   ok: !!platform.telegram_port },
                      { label: 'SpiderFoot порт',  value: platform.spiderfoot_port, ok: !!platform.spiderfoot_port },
                    ].map(({ label, value, ok }) => (
                      <div key={label} className="flex items-center justify-between py-2 last:border-0" style={{ borderBottom: '1px solid var(--odb-border)' }}>
                        <span className="text-gray-400">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className={ok ? 'text-green-400' : 'text-red-400'}>{ok ? '✓' : '✗'}</span>
                          <span className="text-gray-300 font-mono text-xs">{value || '—'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Перевірка VPS" icon="🖥️">
                  <VpsStatus />
                </SectionCard>
              </div>
            )}

            {/* ── ADMIN ── */}
            {activeTab === 'admin' && isAdmin && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: '📊', title: 'Активність', desc: 'Хто, що і коли шукав', href: '/admin/activity' },
                    { icon: '👥', title: 'Користувачі', desc: 'Управління доступом', href: '/admin/users' },
                    { icon: '📥', title: 'Імпорт',      desc: 'CSV масовий імпорт',  href: '/admin/import' },
                    { icon: '🔧', title: 'Інструменти', desc: 'OSINT та утиліти',    href: '/admin/tools' },
                  ].map(item => (
                    <a key={item.href} href={item.href}
                      className="odb-card-hover rounded-xl p-5 transition"
                      style={{ background: 'var(--odb-surface2)', border: '1px solid var(--odb-border)' }}>
                      <div className="text-3xl mb-2">{item.icon}</div>
                      <div className="font-semibold" style={{ color: 'var(--odb-text)' }}>{item.title}</div>
                      <div className="text-sm" style={{ color: 'var(--odb-text-dim)' }}>{item.desc}</div>
                    </a>
                  ))}
                </div>

                <SectionCard title="Системна інформація" icon="ℹ️">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      { label: 'Node ENV', value: process.env.NODE_ENV || 'development' },
                      { label: 'Admin email', value: user?.email },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg p-3" style={{ background: 'var(--odb-surface3)' }}>
                        <p className="text-gray-500 text-xs mb-0.5">{label}</p>
                        <p className="text-gray-200 font-mono text-xs">{value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

function VpsStatus() {
  const [status, setStatus] = useState<'idle'|'checking'|'ok'|'error'>('idle')
  const [info, setInfo]     = useState<any>(null)

  async function check() {
    setStatus('checking')
    try {
      const res = await fetch('/api/osint/sherlock', { method: 'GET' }).catch(() => null)
      const vps = await fetch(`http://${process.env.NEXT_PUBLIC_VPS_HOST || '161.35.86.145'}:8001/health`).catch(() => null)
      setStatus('ok')
      setInfo({ sherlock: res?.ok, vps: vps?.ok })
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button onClick={check} disabled={status === 'checking'}
        className="px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
        style={{ background: 'var(--odb-surface3)', border: '1px solid var(--odb-border)', color: 'var(--odb-text)' }}>
        {status === 'checking' ? '⏳ Перевіряю...' : '🔄 Перевірити VPS'}
      </button>
      {status === 'ok' && (
        <div className="text-sm">
          <span className="text-green-400">✓ VPS доступний</span>
          {info && <span className="text-gray-500 ml-2 text-xs">sherlock: {info.sherlock ? 'ok' : 'err'}</span>}
        </div>
      )}
      {status === 'error' && <span className="text-red-400 text-sm">✗ Не вдалося підключитись</span>}
    </div>
  )
}
