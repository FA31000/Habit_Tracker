'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [signedUp, setSignedUp] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      router.push('/')
      router.refresh()
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name.trim() } },
      })
      if (error) { setError(error.message); setLoading(false); return }
      setSignedUp(true)
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-900">
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute top-24 -left-10 h-32 w-32 rounded-full bg-emerald-400/20" />
      <div className="pointer-events-none absolute -bottom-20 -right-8 h-56 w-56 rounded-full bg-teal-400/10" />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-white/15 backdrop-blur-sm mb-4 text-5xl shadow-lg">
            🌱
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Habit Tracker</h1>
          <p className="text-emerald-100/80 text-sm mt-1">Build the new you</p>
        </div>

        {signedUp ? (
          <div className="rounded-2xl bg-white/95 backdrop-blur-sm p-6 shadow-xl text-center space-y-3">
            <div className="text-4xl">📬</div>
            <p className="text-gray-900 font-semibold">Check your email</p>
            <p className="text-gray-500 text-sm">
              We sent a confirmation link to <span className="text-gray-900 font-medium">{email}</span>.<br />
              Click the link to activate your account, then come back and log in.
            </p>
            <button
              onClick={() => { setSignedUp(false); setMode('login') }}
              className="mt-4 text-emerald-600 text-sm font-semibold underline"
            >
              Go to Log In
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/95 backdrop-blur-sm p-6 shadow-xl">
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <input
                  type="text"
                  placeholder="Your name (shown to friends)"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-base"
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-50 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-base"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-50 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-base"
              />

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-base transition disabled:opacity-50 shadow-sm"
              >
                {loading ? '...' : mode === 'login' ? 'Log In' : 'Create Account'}
              </button>
            </form>

            <button
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="w-full mt-4 text-gray-500 hover:text-emerald-600 text-sm text-center transition"
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
