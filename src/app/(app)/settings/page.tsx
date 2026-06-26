'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const supabase = createClient()

  const load = useCallback(async () => {
    let { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const { data } = await supabase.auth.signInAnonymously()
      user = data.user
    }
    if (!user) return

    const { data } = await supabase
      .from('share_links')
      .select('token')
      .eq('user_id', user.id)
      .single()

    setShareToken(data?.token ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function generateLink() {
    try {
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const { data } = await supabase.auth.signInAnonymously()
        user = data.user
      }
      if (!user) { alert('No user session'); return }

      const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('')

      const { data, error } = await supabase
        .from('share_links')
        .upsert({ user_id: user.id, token }, { onConflict: 'user_id' })
        .select('token')
        .single()

      if (error) { alert('DB error: ' + error.message); return }
      setShareToken(data?.token ?? token)
    } catch (e) {
      alert('Error: ' + String(e))
    }
  }

  async function copyLink() {
    if (!shareToken) return
    const url = `${window.location.origin}/partner/${shareToken}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  const partnerUrl = shareToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/partner/${shareToken}` : null

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold pt-4 mb-6">Settings</h1>

      {/* Accountability Partner */}
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 mb-4">
        <h2 className="font-semibold mb-1">Accountability Partner</h2>
        <p className="text-sm text-gray-400 mb-4">
          Share a link with your partner. They can see your streaks and badges, and react with an emoji. No account needed.
        </p>

        {!shareToken ? (
          <button
            onClick={generateLink}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
          >
            Generate Share Link
          </button>
        ) : (
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-xl p-3 text-xs text-gray-300 break-all">
              {partnerUrl}
            </div>
            <button
              onClick={copyLink}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
            >
              {copied ? '✅ Copied!' : '📋 Copy Link'}
            </button>
            <p className="text-xs text-gray-500 text-center">
              Send this to your wife via WhatsApp
            </p>
          </div>
        )}
      </div>

      {/* Reactions received */}
      {shareToken && <ReactionsPanel token={shareToken} />}
    </div>
  )
}

function ReactionsPanel({ token }: { token: string }) {
  const [reactions, setReactions] = useState<{ emoji: string; reacted_at: string }[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: link } = await supabase
        .from('share_links')
        .select('id')
        .eq('token', token)
        .single()

      if (!link) return

      const { data } = await supabase
        .from('reactions')
        .select('emoji, reacted_at')
        .eq('share_link_id', link.id)
        .order('reacted_at', { ascending: false })
        .limit(10)

      setReactions(data ?? [])
    }
    load()
  }, [token])

  if (reactions.length === 0) return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 text-center">
      <p className="text-gray-500 text-sm">No reactions yet from your partner.</p>
    </div>
  )

  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <h2 className="font-semibold mb-3">Reactions from your partner</h2>
      <div className="space-y-2">
        {reactions.map((r, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-2xl">{r.emoji}</span>
            <span className="text-xs text-gray-500">
              {new Date(r.reacted_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
