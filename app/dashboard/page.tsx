'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState({ total: 0, loading: true })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      const { count } = await supabase.from('persons').select('*', { count: 'exact', head: true })
      setStats({ total: count || 0, loading: false })
    }
    init()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user) return <div className="min-h-screen bg-gray-900 flex items-center justify-center"><p className="text-white">Завантаження...</p></div>

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">🛡️ ODB Platform</h1>
          <p className="text-gray-400 text-sm">Оперативна База Даних</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user.email}</span>
          <button onClick={handleLogout} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm transition">Вийти</button>
        </div>
      </header>
      <main className="p-6">
        <h2 className="text-lg font-semibold mb-4">Огляд бази</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
            <p className="text-gray-400 text-sm">Всього осіб</p>
            <p className="text-3xl font-bold text-blue-400 mt-1">{stats.loading ? '...' : stats.total.toLocaleString('uk-UA')}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
            <p className="text-gray-400 text-sm">Статус системи</p>
            <p className="text-xl font-bold text-green-400 mt-1">✅ Активна</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
            <p className="text-gray-400 text-sm">Версія</p>
            <p className="text-xl font-bold text-purple-400 mt-1">Next.js 2.0</p>
          </div>
        </div>
        <h2 className="text-lg font-semibold mb-4">Швидкий доступ</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '🔍', label: 'Реєстр осіб', path: '/persons' },
            { icon: '📊', label: 'Аналітика', path: '/dashboard' },
            { icon: '🗺️', label: 'Карта', path: '/dashboard' },
            { icon: '⚙️', label: 'Налаштування', path: '/dashboard' },
          ].map((item) => (
            <button key={item.label} onClick={() => router.push(item.path)}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg p-4 text-center transition">
              <div className="text-3xl mb-2">{item.icon}</div>
              <p className="text-sm font-medium">{item.label}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}