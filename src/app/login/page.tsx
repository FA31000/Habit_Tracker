'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏆</div>
          <h1 className="text-2xl font-bold text-white">Habit Tracker</h1>
          <p className="text-gray-400 text-sm mt-1">Build streaks. Earn rewards.</p>
        </div>

        {sent ? (
          <div className="text-center space-y-3">
            <div className="text-4xl">📬</div>
            <p className="text-white font-semibold">Check your email</p>
            <p className="text-gray-400 text-sm">
              We sent a login link to <span className="text-white">{email}</span>.<br />
              Tap the link to sign in.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-4 text-gray-400 text-sm underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:outline-none focus:border-indigo-500 text-base"
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-base transition disabled:opacity-50"
            >
              {loading ? '...' : 'Send Login Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
