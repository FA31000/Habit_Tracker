'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WishlistItem, Credit } from '@/lib/types'
import { fetchUserConfig } from '@/lib/appConfig'
import { addDays, todayDate } from '@/lib/streak'
import { totalEarned, dayEarnings, creditsTotal, availableBalance, type CheckinsByHabit } from '@/lib/balance'
import RewardForecast from '@/components/RewardForecast'

// Legacy: the order used to live here, per browser. It now lives on the account
// in wishlist_items.sort_order. Only still read for the one-time migration.
const ORDER_KEY = 'rewards_order'

// Tells the header BalanceBadge to refetch. It lives in the layout and never
// remounts during client-side navigation, so it has to be told when money moves.
function notifyBalanceChanged() {
  window.dispatchEvent(new StorageEvent('storage', { key: 'balance' }))
}

// Shown at the top of the add modal so one "+ Add" button covers both kinds.
// Hidden when editing — an existing reward can't turn into a credit.
function AddTypeToggle({ type, onChange }: { type: 'reward' | 'credit'; onChange: (t: 'reward' | 'credit') => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-5">
      {(['reward', 'credit'] as const).map(t => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`py-2 rounded-xl text-sm font-semibold capitalize ${
            type === t ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

function applyOrder(items: WishlistItem[], order: string[]): WishlistItem[] {
  if (!order.length) return items
  const indexed = new Map(items.map(i => [i.id, i]))
  const sorted: WishlistItem[] = []
  order.forEach(id => { if (indexed.has(id)) sorted.push(indexed.get(id)!) })
  items.forEach(i => { if (!order.includes(i.id)) sorted.push(i) })
  return sorted
}

// Writes the list's positions back to the account, so the order is the same on
// every device.
async function persistOrder(supabase: ReturnType<typeof createClient>, ordered: WishlistItem[]) {
  await Promise.all(ordered.map((item, i) =>
    supabase.from('wishlist_items').update({ sort_order: i }).eq('id', item.id)
  ))
}

// One-time lift of the old browser-only order onto the account. Skipped when any
// reward already has a position, so an order set on another device always wins.
async function migrateLocalOrder(supabase: ReturnType<typeof createClient>, items: WishlistItem[]): Promise<WishlistItem[]> {
  const raw = localStorage.getItem(ORDER_KEY)
  if (!raw) return items
  localStorage.removeItem(ORDER_KEY)
  if (items.some(i => i.sort_order !== null)) return items
  let order: string[] = []
  try { order = JSON.parse(raw) } catch { return items }
  const sorted = applyOrder(items, order)
  await persistOrder(supabase, sorted)
  return sorted
}

export default function RewardsPage() {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [balance, setBalance] = useState(0)
  const [earnedTotal, setEarnedTotal] = useState(0)
  const [creditTotal, setCreditTotal] = useState(0)
  const [spentTotal, setSpentTotal] = useState(0)
  const [showCredits, setShowCredits] = useState(true)
  const [creditForm, setCreditForm] = useState<{ id: string | null; description: string; amount: string; date: string } | null>(null)
  const [ratePerDay, setRatePerDay] = useState(0)
  const [today, setToday] = useState('')
  const [history, setHistory] = useState<{ date: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [itemForm, setItemForm] = useState<{ id: string | null; name: string; price: string; url: string } | null>(null)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: wishlist } = await supabase.from('wishlist_items').select('*').eq('user_id', user.id).order('sort_order', { ascending: true, nullsFirst: false }).order('price', { ascending: true })
    const { data: checkins } = await supabase.from('checkins').select('habit_id, response, date').eq('user_id', user.id)
    const { data: habits } = await supabase.from('habits').select('id, dollar_value, allowed_no_days_per_week, start_date').eq('user_id', user.id).eq('is_active', true)
    const { data: creditRows } = await supabase.from('credits').select('*').eq('user_id', user.id).order('date', { ascending: false })

    const cfg = await fetchUserConfig()
    const today = todayDate()
    const checkinsByHabit: CheckinsByHabit = {}
    ;(checkins ?? []).forEach(c => {
      if (!checkinsByHabit[c.habit_id]) checkinsByHabit[c.habit_id] = []
      checkinsByHabit[c.habit_id].push({ date: c.date, response: c.response as 'yes' | 'no' | 'freeze' | 'na' })
    })
    const earned = totalEarned(habits ?? [], checkinsByHabit, cfg)
    const spent = (wishlist ?? []).filter(i => i.redeemed).reduce((s, i) => s + i.price, 0)
    const creditList = (creditRows ?? []) as Credit[]
    const credit = creditsTotal(creditList)

    // Run rate: average earnings per day over the last 14 full days (today
    // excluded, days before the first ever check-in excluded).
    const firstDate = (checkins ?? []).map(c => c.date).sort()[0]
    let rateSum = 0
    let rateDays = 0
    if (firstDate) {
      for (let i = 1; i <= 14; i++) {
        const d = addDays(today, -i)
        if (d < firstDate) break
        rateSum += dayEarnings(d, habits ?? [], checkinsByHabit, cfg)
        rateDays++
      }
    }
    setRatePerDay(rateDays > 0 ? rateSum / rateDays : 0)
    setToday(today)

    // Balance at the end of each of the past 4 weeks plus today, for the
    // "past" bars of the forecast chart.
    const allDates = Array.from(new Set((checkins ?? []).map(c => c.date))).sort()
    const earningsByDate = new Map(allDates.map(dt => [dt, dayEarnings(dt, habits ?? [], checkinsByHabit, cfg)]))
    const spentByDate = (wishlist ?? [])
      .filter(i => i.redeemed && i.redeemed_at)
      .map(i => ({ date: new Date(i.redeemed_at!).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }), price: i.price }))
    const balanceAt = (d: string) => {
      let e = 0
      for (const dt of allDates) {
        if (dt > d) break
        e += earningsByDate.get(dt)!
      }
      const s = spentByDate.filter(x => x.date <= d).reduce((sum, x) => sum + x.price, 0)
      return e + creditsTotal(creditList, d) - s
    }
    const hist: { date: string; value: number }[] = []
    for (let w = 4; w >= 0; w--) {
      const d = addDays(today, -7 * w)
      hist.push({ date: d, value: balanceAt(d) })
    }
    setHistory(hist)

    setItems(await migrateLocalOrder(supabase, wishlist ?? []))
    setCredits(creditList)
    setBalance(availableBalance(earned, credit, spent))
    setEarnedTotal(earned)
    setCreditTotal(credit)
    setSpentTotal(spent)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function redeem(item: WishlistItem) {
    // A reward can be redeemed even without the money for it. The balance then
    // goes negative and later earnings pay it back.
    const after = balance - item.price
    const warning = after < 0 ? `\n\nThis leaves your balance at −S$${Math.abs(after).toFixed(2)}.` : ''
    if (!confirm(`Redeem "${item.name}" for S$${item.price.toFixed(2)}?${warning}`)) return
    await supabase.from('wishlist_items').update({ redeemed: true, redeemed_at: new Date().toISOString() }).eq('id', item.id)
    await load()
    notifyBalanceChanged()
  }

  // Puts a redeemed reward back in the list and refunds its price.
  async function unredeem(item: WishlistItem) {
    if (!confirm(`Cancel "${item.name}"? S$${item.price.toFixed(2)} goes back to your balance.`)) return
    await supabase.from('wishlist_items').update({ redeemed: false, redeemed_at: null }).eq('id', item.id)
    await load()
    notifyBalanceChanged()
  }

  function openItem(item?: WishlistItem) {
    setItemForm(item
      ? { id: item.id, name: item.name, price: String(item.price), url: item.url ?? '' }
      : { id: null, name: '', price: '', url: '' })
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault()
    if (!itemForm) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const values = {
      name: itemForm.name.trim(),
      price: parseFloat(itemForm.price),
      url: itemForm.url.trim() || null,
    }
    if (itemForm.id) {
      await supabase.from('wishlist_items').update(values).eq('id', itemForm.id)
    } else {
      await supabase.from('wishlist_items').insert({ user_id: user.id, ...values })
    }
    setItemForm(null)
    setSaving(false)
    await load()
    notifyBalanceChanged()
  }

  async function deleteItem(id: string) {
    if (!confirm('Remove this reward?')) return
    await supabase.from('wishlist_items').delete().eq('id', id)
    await load()
    notifyBalanceChanged()
  }

  function openCredit(credit?: Credit) {
    setCreditForm(credit
      ? { id: credit.id, description: credit.description, amount: String(credit.amount), date: credit.date }
      : { id: null, description: '', amount: '', date: todayDate() })
  }

  async function saveCredit(e: React.FormEvent) {
    e.preventDefault()
    if (!creditForm) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const values = {
      description: creditForm.description.trim(),
      amount: parseFloat(creditForm.amount),
      date: creditForm.date,
    }
    if (creditForm.id) {
      await supabase.from('credits').update(values).eq('id', creditForm.id)
    } else {
      await supabase.from('credits').insert({ user_id: user.id, ...values })
    }
    setCreditForm(null)
    setSaving(false)
    await load()
    notifyBalanceChanged()
  }

  async function deleteCredit(id: string) {
    if (!confirm('Remove this credit?')) return
    await supabase.from('credits').delete().eq('id', id)
    await load()
    notifyBalanceChanged()
  }

  // index is the position in the visible list (the ones not yet redeemed), which
  // is what the arrows show. The move has to be applied to that same list — not
  // to `items`, which also holds redeemed rewards.
  async function moveItem(index: number, direction: -1 | 1) {
    const visible = items.filter(i => !i.redeemed)
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= visible.length) return
    const [moved] = visible.splice(index, 1)
    visible.splice(newIndex, 0, moved)
    setItems([...visible, ...items.filter(i => i.redeemed)])
    await persistOrder(supabase, visible)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  const available = items.filter(i => !i.redeemed)
  const redeemed = items.filter(i => i.redeemed)

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2 mt-1">
        <p className="text-sm text-gray-500">Save up for something great</p>
        <button
          onClick={() => openItem()}
          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold shadow-sm"
        >
          + Add
        </button>
      </div>

      <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2 shadow-sm ring-1 ring-black/5 mb-2">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Earned</p>
          <p className="text-sm font-semibold text-gray-700">S${Math.round(earnedTotal)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Credit</p>
          <p className="text-sm font-semibold text-gray-700">S${Math.round(creditTotal)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Spent</p>
          <p className="text-sm font-semibold text-gray-400">−S${Math.round(spentTotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Balance</p>
          <p className={`text-base font-extrabold ${balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {balance < 0 ? '−' : ''}S${Math.abs(Math.round(balance))}
          </p>
        </div>
      </div>

      <RewardForecast balance={balance} ratePerDay={ratePerDay} items={available} today={today} history={history} />

      {available.length === 0 && (
        <p className="text-gray-400 text-center mt-8 text-sm">No rewards yet. Add something to save up for!</p>
      )}

      <div className="space-y-2">
        {available.map((item, index) => {
          const canRedeem = balance >= item.price
          const progress = Math.max(0, Math.min(100, (balance / item.price) * 100))
          return (
            <div
              key={item.id}
              className="bg-white rounded-xl p-3 shadow-sm ring-1 ring-black/5"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                    <button
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                      className="text-gray-300 disabled:opacity-20 hover:text-gray-500 leading-none text-xs px-0.5"
                    >▲</button>
                    <button
                      onClick={() => moveItem(index, 1)}
                      disabled={index === available.length - 1}
                      className="text-gray-300 disabled:opacity-20 hover:text-gray-500 leading-none text-xs px-0.5"
                    >▼</button>
                  </div>
                  <div>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm text-gray-900 underline">{item.name}</a>
                    ) : (
                      <p className="font-semibold text-sm text-gray-900">{item.name}</p>
                    )}
                    <p className="text-emerald-700 font-extrabold text-base">S${Math.round(item.price)}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => openItem(item)} className="text-xs text-gray-400">✏️</button>
                  <button onClick={() => deleteItem(item.id)} className="text-xs text-red-400">✕</button>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full mb-2 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{progress.toFixed(0)}% saved</span>
                <button
                  onClick={() => redeem(item)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm text-white ${
                    canRedeem ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >
                  {canRedeem ? '🎁 Redeem' : `🎁 Redeem (−S$${Math.round(item.price - balance)})`}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {redeemed.length > 0 && (
        <div className="mt-8">
          <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-medium">Redeemed</p>
          <div className="space-y-2">
            {redeemed.map(item => (
              <div key={item.id} className="bg-white/60 rounded-2xl p-4 ring-1 ring-black/5 flex justify-between items-center opacity-60">
                <div>
                  <p className="text-sm font-medium line-through text-gray-400">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.redeemed_at ? new Date(item.redeemed_at).toLocaleDateString('en-SG') : ''}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-gray-400 font-semibold text-sm">S${Math.round(item.price)}</p>
                  <button onClick={() => unredeem(item)} className="text-xs text-gray-500 underline">Undo</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Credits ledger */}
      <div className="mt-8">
        <button onClick={() => setShowCredits(v => !v)} className="w-full flex items-center justify-between mb-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
            Credits · S${Math.round(creditsTotal(credits))}
          </p>
          <span className="text-gray-300 text-xs">{showCredits ? '▲' : '▼'}</span>
        </button>
        {showCredits && (
          <div className="space-y-2">
            {credits.map(credit => (
              <div key={credit.id} className="bg-white rounded-xl p-3 shadow-sm ring-1 ring-black/5 flex justify-between items-center gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{credit.description}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(credit.date + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-emerald-700 font-bold text-sm">+S${Math.round(credit.amount)}</p>
                  <button onClick={() => openCredit(credit)} className="text-xs text-gray-400">✏️</button>
                  <button onClick={() => deleteCredit(credit.id)} className="text-xs text-red-400">✕</button>
                </div>
              </div>
            ))}
            {credits.length === 0 && (
              <p className="text-gray-400 text-center text-sm py-2">No credits yet.</p>
            )}
          </div>
        )}
      </div>

      {/* Credit modal */}
      {creditForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setCreditForm(null)}>
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-24 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-5">{creditForm.id ? 'Edit Credit' : 'Add'}</h2>
            {!creditForm.id && (
              <AddTypeToggle type="credit" onChange={t => { if (t === 'reward') { setCreditForm(null); openItem() } }} />
            )}
            <form onSubmit={saveCredit} className="space-y-4">
              <input
                type="text"
                placeholder="e.g. Sold Garmin watch"
                value={creditForm.description}
                onChange={e => setCreditForm({ ...creditForm, description: e.target.value })}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
              />
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount received in SGD"
                value={creditForm.amount}
                onChange={e => setCreditForm({ ...creditForm, amount: e.target.value })}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
              />
              <input
                type="date"
                value={creditForm.date}
                onChange={e => setCreditForm({ ...creditForm, date: e.target.value })}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setCreditForm(null)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-emerald-700 text-white font-semibold disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reward modal */}
      {itemForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setItemForm(null)}>
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-24 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-5">{itemForm.id ? 'Edit Reward' : 'Add'}</h2>
            {!itemForm.id && (
              <AddTypeToggle type="reward" onChange={t => { if (t === 'credit') { setItemForm(null); openCredit() } }} />
            )}
            <form onSubmit={saveItem} className="space-y-4">
              <input
                type="text"
                placeholder="e.g. New headphones"
                value={itemForm.name}
                onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
              />
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Price in SGD"
                value={itemForm.price}
                onChange={e => setItemForm({ ...itemForm, price: e.target.value })}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
              />
              <input
                type="url"
                placeholder="Product URL (optional)"
                value={itemForm.url}
                onChange={e => setItemForm({ ...itemForm, url: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setItemForm(null)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-emerald-700 text-white font-semibold disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
