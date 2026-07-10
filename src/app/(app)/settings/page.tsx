'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [notifStatus, setNotifStatus] = useState<'unknown' | 'subscribed' | 'denied' | 'unsupported'>('unknown')
  const [reminderTime, setReminderTime] = useState('21:00')
  const [savingTime, setSavingTime] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const supabase = createClient()
  const router = useRouter()

  async function sendFeedback() {
    const message = feedbackText.trim()
    if (!message) return
    setFeedbackStatus('sending')
    let { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const { data } = await supabase.auth.signInAnonymously()
      user = data.user
    }
    if (!user) { setFeedbackStatus('idle'); return }
    const { error } = await supabase.from('feedback').insert({
      user_id: user.id,
      user_email: user.email ?? null,
      message,
    })
    if (error) { alert('Could not send: ' + error.message); setFeedbackStatus('idle'); return }
    setFeedbackText('')
    setFeedbackStatus('sent')
    setTimeout(() => setFeedbackStatus('idle'), 3000)
  }

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

    const [{ data: profile }, { data: settings }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', user.id).single(),
      supabase.from('user_settings').select('reminder_time').eq('user_id', user.id).single(),
    ])

    setDisplayName(profile?.display_name ?? '')
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

  async function saveDisplayName() {
    const trimmed = displayName.trim()
    if (!trimmed) return
    setSavingName(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingName(false); return }
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, display_name: trimmed }, { onConflict: 'id' })
    setSavingName(false)
    if (error) { alert('Could not save name: ' + error.message); return }
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
  }

  async function subscribeNotifications() {
    if (!('serviceWorker' in navigator)) return
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') { setNotifStatus('denied'); return }
    await navigator.serviceWorker.register('/sw.js')
    const reg = await navigator.serviceWorker.ready
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

  return (
    <div className="p-4">
      {/* Account */}
      <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 mb-4 mt-2">
        <h2 className="font-semibold text-gray-900 mb-1">Account</h2>
        <p className="text-sm text-gray-500 mb-4">
          {userEmail ?? 'Anonymous user'}
        </p>

        <label className="text-sm text-gray-500 block mb-1">Your name (shown to friends)</label>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={saveDisplayName}
            disabled={savingName || !displayName.trim()}
            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-sm shadow-sm disabled:opacity-50"
          >
            {savingName ? '...' : nameSaved ? '✅' : 'Save'}
          </button>
        </div>

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

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <label className="text-sm text-gray-500 shrink-0">Remind me at</label>
          <div className="flex items-center gap-1">
            <select
              value={reminderTime.split(':')[0]}
              onChange={e => saveReminderTime(`${e.target.value}:${reminderTime.split(':')[1]}`)}
              className="bg-gray-100 text-gray-900 rounded-xl px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-emerald-600"
            >
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <span className="text-gray-500 font-bold">:</span>
            <select
              value={reminderTime.split(':')[1]}
              onChange={e => saveReminderTime(`${reminderTime.split(':')[0]}:${e.target.value}`)}
              className="bg-gray-100 text-gray-900 rounded-xl px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-emerald-600"
            >
              {['00', '15', '30', '45'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
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

      {/* Send Feedback */}
      <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 mt-4">
        <h2 className="font-semibold text-gray-900 mb-1">Send Feedback</h2>
        <p className="text-sm text-gray-500 mb-4">
          Have an idea, a feature request, or found a bug? Let us know.
        </p>
        <textarea
          value={feedbackText}
          onChange={e => setFeedbackText(e.target.value)}
          placeholder="Type your feedback here..."
          rows={4}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
        />
        <button
          onClick={sendFeedback}
          disabled={feedbackStatus === 'sending' || !feedbackText.trim()}
          className="w-full mt-3 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold shadow-sm disabled:opacity-50"
        >
          {feedbackStatus === 'sending' ? 'Sending...' : feedbackStatus === 'sent' ? '✅ Thank you!' : 'Send Feedback'}
        </button>
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
