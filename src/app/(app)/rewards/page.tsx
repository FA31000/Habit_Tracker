'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WishlistItem } from '@/lib/types'

export default function RewardsPage() {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: wishlist } = await supabase.from('wishlist_items').select('*').eq('user_id', user.id).order('redeemed', { ascending: true }).order('price', { ascending: true })
    const { data: checkins } = await supabase.from('checkins').select('habit_id, response').eq('user_id', user.id).eq('response', 'yes')
    const { data: habits } = await supabase.from('habits').select('id, dollar_value').eq('user_id', user.id)
    const { data: streaks } = await supabase.from('streaks').select('habit_id, current_streak').eq('user_id', user.id)

    const habitMap = new Map((habits ?? []).map(h => [h.id, h.dollar_value]))
    const streakMap = new Map((streaks ?? []).map(s => [s.habit_id, s.current_streak]))
    let earned = 0
    ;(checkins ?? []).forEach(c => {
      const dv = habitMap.get(c.habit_id) ?? 0
      const streak = streakMap.get(c.habit_id) ?? 0
      const mult = streak >= 365 ? 3 : streak >= 30 ? 2 : streak >= 7 ? 1.5 : 1
      earned += dv * mult
    })
    const spent = (wishlist ?? []).filter(i => i.redeemed).reduce((s, i) => s + i.price, 0)

    setItems(wishlist ?? [])
    setBalance(Math.max(0, earned - spent))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function redeem(item: WishlistItem) {
    if (balance < item.price) return
    if (!confirm(`Redeem "${item.name}" for S$${item.price.toFixed(2)}?`)) return
    await supabase.from('wishlist_items').update({ redeemed: true, redeemed_at: new Date().toISOString() }).eq('id', item.id)
    await load()
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('wishlist_items').insert({ user_id: user.id, name: newName.trim(), price: parseFloat(newPrice) })
    setNewName('')
    setNewPrice('')
    setShowAdd(false)
    setSaving(false)
    await load()
  }

  async function deleteItem(id: string) {
    if (!confirm('Remove this item?')) return
    await supabase.from('wishlist_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  const available = items.filter(i => !i.redeemed)
  const redeemed = items.filter(i => i.redeemed)

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4 mt-2">
        <p className="text-sm text-gray-500">Save up for something great</p>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold shadow-sm"
        >
          + Add
        </button>
      </div>

      {/* Balance */}
      <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-black/5 mb-5 text-center">
        <p className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">Your balance</p>
        <p className="text-4xl font-extrabold text-emerald-700">S${balance.toFixed(2)}</p>
        <p className="text-xs text-gray-400 mt-1">Earned from keeping your habits</p>
      </div>

      {available.length === 0 && (
        <p className="text-gray-400 text-center mt-8 text-sm">No rewards yet. Add something to save up for!</p>
      )}

      <div className="space-y-3">
        {available.map(item => {
          const canRedeem = balance >= item.price
          const progress = Math.min(100, (balance / item.price) * 100)
          return (
            <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="font-semibold text-sm text-gray-900">{item.name}</p>
                  <p className="text-emerald-700 font-extrabold text-lg">S${item.price.toFixed(2)}</p>
                </div>
                <button onClick={() => deleteItem(item.id)} className="text-xs text-red-400 mt-1">✕</button>
              </div>
              <div className="h-2 bg-gray-100 rounded-full mb-3 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{progress.toFixed(0)}% saved</span>
                <button
                  onClick={() => redeem(item)}
                  disabled={!canRedeem}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    canRedeem ? 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {canRedeem ? '🎁 Redeem' : `Need S$${(item.price - balance).toFixed(2)} more`}
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
                <p className="text-gray-400 font-semibold text-sm">S${item.price.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-10 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-5">Add Reward</h2>
            <form onSubmit={addItem} className="space-y-4">
              <input
                type="text"
                placeholder="e.g. New headphones"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
              />
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Price in SGD"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-emerald-700 text-white font-semibold disabled:opacity-50">
                  {saving ? 'Saving...' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
