'use client'

import { useState } from 'react'
import { createClient } from '../lib/supabase/client'
import { useRouter } from 'next/navigation'
import Icon from '../components/Icon'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Невірний email або пароль')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  function fieldFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--odb-accent)'
    e.currentTarget.style.boxShadow = 'var(--odb-shadow-accent)'
  }
  function fieldBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--odb-border)'
    e.currentTarget.style.boxShadow = 'none'
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
         style={{ background: 'var(--odb-bg)' }}>

      {/* Фонове світіння */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full blur-[130px] opacity-[0.14]"
             style={{ background: 'radial-gradient(circle, var(--odb-accent), transparent 70%)' }} />
      </div>

      {/* Картка входу */}
      <div className="relative z-10 w-full max-w-md odb-glass rounded-3xl p-8 odb-animate-scale"
           style={{ boxShadow: 'var(--odb-shadow-lg)' }}>

        {/* Логотип */}
        <div className="flex flex-col items-center text-center mb-7">
          <span className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-white mb-4 odb-glow"
                style={{ background: 'linear-gradient(135deg, var(--odb-accent-hi), var(--odb-accent-lo))' }}>
            <Icon name="shield" size={32} strokeWidth={2} />
          </span>
          <h1 className="text-2xl font-bold">
            <span className="text-white">ODB </span>
            <span className="odb-gradient-text">Platform</span>
          </h1>
          <p className="text-[var(--odb-text-faint)] text-sm mt-1">Розвідувальна система відкритих джерел</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[var(--odb-text-dim)] text-xs font-medium uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={fieldFocus}
              onBlur={fieldBlur}
              className="w-full mt-1.5 px-4 py-3 text-white rounded-xl outline-none transition-all placeholder-[var(--odb-text-faint)]"
              style={{ background: 'var(--odb-surface-2)', border: '1px solid var(--odb-border)' }}
              placeholder="your@email.com"
              required
            />
          </div>
          <div>
            <label className="text-[var(--odb-text-dim)] text-xs font-medium uppercase tracking-wider">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={fieldFocus}
              onBlur={fieldBlur}
              className="w-full mt-1.5 px-4 py-3 text-white rounded-xl outline-none transition-all placeholder-[var(--odb-text-faint)]"
              style={{ background: 'var(--odb-surface-2)', border: '1px solid var(--odb-border)' }}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[var(--odb-danger)] text-sm odb-animate-fade">
              <Icon name="alert" size={15} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="odb-btn-accent w-full py-3 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading
              ? <><span className="inline-block animate-spin"><Icon name="spark" size={16} /></span> Вхід…</>
              : <><Icon name="logout" size={16} /> Увійти</>}
          </button>
        </form>
      </div>
    </div>
  )
}
