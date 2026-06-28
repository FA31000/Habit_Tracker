'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { loadAppConfig, DEFAULT_APP_CONFIG, type AppConfig } from '@/lib/types'

export default function SettingsPage() {
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [notifStatus, setNotifStatus] = useState<'unknown' | 'subscribed' | 'denied' | 'unsupported'>('unknown')
  const [reminderTime, setReminderTime] = useState('21:00')
  const [savingTime, setSavingTime] = useState(false)
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const load = useCallback(async () => {
    let { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const { data } = await supabase.auth.signInAnonymously()
      user = data.user
    }
    if (!user) return
    setUserEmail(user.email ?? null)

    const [{ data: link }, { data: settings }] = await Promise.all([
      supabase.from('share_links').select('token').eq('user_id', user.id).single(),
      supabase.from('user_settings').select('reminder_time').eq('user_id', user.id).single(),
    ])

    setShareToken(link?.token ?? null)
    if (settings?.reminder_time) setReminderTime(settings.reminder_time)

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotifStatus('unsupported')
    } else if (Notification.permission === 'denied') {
      setNotifStatus('denied')
    } else if (Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setNotifStatus(sub ? 'subscribed' : 'unknown')
    }

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => { setAppConfig(loadAppConfig()) }, [])

  function saveAppConfig(updated: AppConfig) {
    setAppConfig(updated)
    localStorage.setItem('app_config', JSON.stringify(updated))
    // notify other tabs
    window.dispatchEvent(new StorageEvent('storage', { key: 'app_config' }))
  }

  function updateConfig<K extends keyof AppConfig>(key: K, raw: string) {
    const val = key === 'currencySymbol' ? raw : parseFloat(raw)
    if (key !== 'currencySymbol' && isNaN(val as number)) return
    saveAppConfig({ ...appConfig, [key]: val })
  }

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

  async function subscribeNotifications() {
    if (!('serviceWorker' in navigator)) return
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') { setNotifStatus('denied'); return }
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), user_id: user.id, role: 'user' }),
    })
    setNotifStatus('subscribed')
  }

  async function saveReminderTime(time: string) {
    setReminderTime(time)
    setSavingTime(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('user_settings').upsert({ user_id: user.id, reminder_time: time }, { onConflict: 'user_id' })
    setSavingTime(false)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  const partnerUrl = shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/partner/${shareToken}`
    : null

  return (
    <div className="p-4">
      {/* Account */}
      <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 mb-4 mt-2">
        <h2 className="font-semibold text-gray-900 mb-1">Account</h2>
        <p className="text-sm text-gray-500 mb-4">
          {userEmail ?? 'Anonymous user'}
        </p>
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-sm transition"
        >
          Log Out
        </button>
      </div>

      {/* Push Notifications */}
      <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 mb-4 mt-2">
        <h2 className="font-semibold text-gray-900 mb-1">Daily Reminder</h2>
        <p className="text-sm text-gray-500 mb-4">
          Get a push notification to remind you to check in each day.
        </p>

        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-gray-500">Remind me at</label>
          <input
            type="time"
            value={reminderTime}
            onChange={e => saveReminderTime(e.target.value)}
            className="bg-gray-100 text-gray-900 rounded-xl px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-emerald-600"
          />
          {savingTime && <span className="text-xs text-gray-400">Saving...</span>}
        </div>

        {notifStatus === 'unsupported' && (
          <p className="text-xs text-amber-600">Push notifications are not supported on this browser.</p>
        )}
        {notifStatus === 'denied' && (
          <p className="text-xs text-red-500">Notifications are blocked. Please enable them in your browser settings.</p>
        )}
        {notifStatus === 'subscribed' ? (
          <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
            <span>✅</span><span>Notifications are on</span>
          </div>
        ) : notifStatus === 'unknown' ? (
          <button
            onClick={subscribeNotifications}
            className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold shadow-sm"
          >
            🔔 Enable Notifications
          </button>
        ) : null}
      </div>

      {/* Accountability Partner */}
      <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 mb-4">
        <h2 className="font-semibold text-gray-900 mb-1">Accountability Partner</h2>
        <p className="text-sm text-gray-500 mb-4">
          Share a link with your partner. They can see your streaks and badges, and react with an emoji. No account needed.
        </p>

        {!shareToken ? (
          <button
            onClick={generateLink}
            className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold shadow-sm"
          >
            Generate Share Link
          </button>
        ) : (
          <div className="space-y-3">
            <div className="bg-gray-100 rounded-xl p-3 text-xs text-gray-600 break-all">
              {partnerUrl}
            </div>
            <button
              onClick={copyLink}
              className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold shadow-sm"
            >
              {copied ? '✅ Copied!' : '📋 Copy Link'}
            </button>
            <p className="text-xs text-gray-400 text-center">Send this to your wife via WhatsApp</p>
          </div>
        )}
      </div>

      {shareToken && <ReactionsPanel token={shareToken} />}

      {/* Streak Bonuses */}
      <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 mt-4">
        <h2 className="font-semibold text-gray-900 mb-1">Streak Bonuses</h2>
        <p className="text-sm text-gray-500 mb-4">
          Earn more points the longer your streak. Set the multiplier for each tier.
        </p>
        <div className="space-y-3">
          {([
            { label: `After ${appConfig.streakTier1Days} days`, daysKey: 'streakTier1Days' as const, multKey: 'streakTier1Multiplier' as const },
            { label: `After ${appConfig.streakTier2Days} days`, daysKey: 'streakTier2Days' as const, multKey: 'streakTier2Multiplier' as const },
            { label: `After ${appConfig.streakTier3Days} days`, daysKey: 'streakTier3Days' as const, multKey: 'streakTier3Multiplier' as const },
          ]).map(tier => (
            <div key={tier.multKey} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm text-gray-600 w-24">After</span>
                <input
                  type="number"
                  min="1"
                  value={appConfig[tier.daysKey]}
                  onChange={e => updateConfig(tier.daysKey, e.target.value)}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-600">days</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={appConfig[tier.multKey]}
                  onChange={e => updateConfig(tier.multKey, e.target.value)}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-600">× bonus</span>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => saveAppConfig({ ...appConfig, streakTier1Days: 7, streakTier1Multiplier: 1.5, streakTier2Days: 30, streakTier2Multiplier: 2, streakTier3Days: 365, streakTier3Multiplier: 3 })}
          className="mt-4 text-xs text-gray-400 underline"
        >
          Reset to defaults
        </button>
      </div>

    </div>
  )
}

function ReactionsPanel({ token }: { token: string }) {
  const [reactions, setReactions] = useState<{ emoji: string; reacted_at: string }[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: link } = await supabase.from('share_links').select('id').eq('token', token).single()
      if (!link) return
      const { data } = await supabase.from('reactions').select('emoji, reacted_at').eq('share_link_id', link.id).order('reacted_at', { ascending: false }).limit(10)
      setReactions(data ?? [])
    }
    load()
  }, [token])

  if (reactions.length === 0) return (
    <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 text-center">
      <p className="text-gray-400 text-sm">No reactions yet from your partner.</p>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-semibold text-gray-900 mb-3">Reactions from your partner</h2>
      <div className="space-y-2">
        {reactions.map((r, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-2xl">{r.emoji}</span>
            <span className="text-xs text-gray-400">
              {new Date(r.reacted_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)))
}
