'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../components/Sidebar'
import Icon from '../components/Icon'

interface Investigation {
  id: string
  title: string
  description: string
  status: 'active' | 'archived'
  person_ids: string[]
  tags: string[]
  created_at: string
  updated_at: string
}

export default function InvestigationsPage() {
  const router = useRouter()
  const [items, setItems] = useState<Investigation[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/investigations?status=${filter}`)
      const data = await res.json()
      setItems(data.data || [])
    } catch {}
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, description: newDesc }),
      })
      const data = await res.json()
      if (data.id) router.push(`/investigations/${data.id}`)
    } catch {}
    setCreating(false)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--odb-bg)', color: 'var(--odb-text)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{ background: 'var(--odb-surface)', borderBottom: '1px solid var(--odb-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', boxShadow: '0 0 16px rgba(124,58,237,0.3)' }}>
              <Icon name="folder" size={20} strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Розслідування</h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--odb-text-dim)' }}>
                Справи та граф зв&apos;язків
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', color: '#fff', boxShadow: '0 0 12px rgba(124,58,237,0.25)' }}>
            <Icon name="plus" size={16} />
            Нове розслідування
          </button>
        </header>

        {/* Filter tabs */}
        <div className="px-6 pt-4 flex gap-2">
          {(['active', 'archived', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={filter === f
                ? { background: 'var(--odb-accent-glow)', color: 'var(--odb-accent-hi)' }
                : { background: 'var(--odb-surface-2)', color: 'var(--odb-text-dim)' }}>
              {f === 'active' ? 'Активні' : f === 'archived' ? 'Архів' : 'Всі'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: 'var(--odb-accent-hi)', borderTopColor: 'transparent' }} />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--odb-surface-2)' }}>
                <Icon name="folder" size={32} />
              </div>
              <p style={{ color: 'var(--odb-text-dim)' }} className="text-sm">
                Немає розслідувань. Створіть перше.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--odb-accent-glow)', color: 'var(--odb-accent-hi)' }}>
                <Icon name="plus" size={14} />
                Створити
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(inv => (
                <button
                  key={inv.id}
                  onClick={() => router.push(`/investigations/${inv.id}`)}
                  className="text-left rounded-2xl p-4 border transition-all hover:scale-[1.02] hover:shadow-lg"
                  style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border-soft)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--odb-accent-lo)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--odb-border-soft)' }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(124,58,237,0.15)' }}>
                        <Icon name="folder" size={16} />
                      </span>
                      <h3 className="font-semibold text-sm leading-tight">{inv.title}</h3>
                    </div>
                    <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      inv.status === 'active'
                        ? 'bg-emerald-900/40 text-emerald-400'
                        : 'bg-gray-700 text-gray-400'
                    }`}>
                      {inv.status === 'active' ? 'Активне' : 'Архів'}
                    </span>
                  </div>

                  {inv.description && (
                    <p className="text-xs mb-2 line-clamp-2" style={{ color: 'var(--odb-text-dim)' }}>
                      {inv.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-3">
                    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--odb-text-faint)' }}>
                      <Icon name="users" size={12} />
                      {inv.person_ids?.length ?? 0} {getPersonWord(inv.person_ids?.length ?? 0)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--odb-text-faint)' }}>
                      {formatDate(inv.updated_at)}
                    </span>
                  </div>

                  {inv.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {inv.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--odb-surface-3)', color: 'var(--odb-text-faint)' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div className="w-full max-w-md rounded-2xl p-6 border"
            style={{ background: 'var(--odb-surface)', borderColor: 'var(--odb-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">Нове розслідування</h2>
              <button onClick={() => setShowCreate(false)}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors">
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--odb-text-dim)' }}>
                  Назва *
                </label>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                  placeholder="Справа №1 — Іванов І.С."
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2"
                  style={{
                    background: 'var(--odb-surface-2)',
                    borderColor: 'var(--odb-border-soft)',
                    color: 'var(--odb-text)',
                  }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--odb-text-dim)' }}>
                  Опис (необов&apos;язково)
                </label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  rows={3}
                  placeholder="Мета розслідування..."
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none resize-none"
                  style={{
                    background: 'var(--odb-surface-2)',
                    borderColor: 'var(--odb-border-soft)',
                    color: 'var(--odb-text)',
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 rounded-lg text-sm border transition-all hover:bg-white/5"
                style={{ borderColor: 'var(--odb-border-soft)', color: 'var(--odb-text-dim)' }}>
                Скасувати
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim() || creating}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:scale-100"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', color: '#fff' }}>
                {creating ? 'Створення…' : 'Створити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getPersonWord(n: number) {
  if (n === 1) return 'особа'
  if (n >= 2 && n <= 4) return 'особи'
  return 'осіб'
}
