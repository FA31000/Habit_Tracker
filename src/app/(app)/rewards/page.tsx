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

    const { data: wishlist } = await supabase
      .from('wishlist_items')
      .select('*')
      .eq('user_id', user.id)
      .order('redeemed', { ascending: true })
      .order('price', { ascending: true })

    // Calculate balance
    const { data: checkins } = await supabase
      .from('checkins')
      .select('habit_id, response')
      .eq('user_id', user.id)
      .eq('response', 'yes')

    const { data: habits } = await supabase
      .from('habits')
      .select('id, dollar_value')
      .eq('user_id', user.id)

    const { data: streaks } = await supabase
      .from('streaks')
      .select('habit_id, current_streak')
      .eq('user_id', user.id)

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

    await supabase.from('wishlist_items').update({
      redeemed: true,
      redeemed_at: new Date().toISOString(),
    }).eq('id', item.id)

    await load()
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('wishlist_items').insert({
      user_id: user.id,
      name: newName.trim(),
      price: parseFloat(newPrice),
    })

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
      <div className="pt-4 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Rewards</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold"
        >
          + Add
        </button>
      </div>

      {/* Balance */}
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 mb-6 text-center">
        <p className="text-xs text-gray-400 mb-1">Your balance</p>
        <p className="text-4xl font-bold text-green-400">S${balance.toFixed(2)}</p>
        <p className="text-xs text-gray-500 mt-1">Earned from keeping your habits</p>
      </div>

      {/* Wishlist */}
      {available.length === 0 && (
        <p className="text-gray-500 text-center mt-8 text-sm">No rewards yet. Add something to save up for!</p>
      )}

      <div className="space-y-3">
        {available.map(item => {
          const canRedeem = balance >= item.price
          const progress = Math.min(100, (balance / item.price) * 100)
          return (
            <div key={item.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-green-400 font-bold text-lg">S${item.price.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-xs text-red-500 mt-1"
                >
                  ✕
                </button>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-gray-800 rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{progress.toFixed(0)}% saved</span>
                <button
                  onClick={() => redeem(item)}
                  disabled={!canRedeem}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    canRedeem
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  {canRedeem ? '🎁 Redeem' : `Need S$${(item.price - balance).toFixed(2)} more`}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Redeemed history */}
      {redeemed.length > 0 && (
        <div className="mt-8">
          <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">Redeemed</p>
          <div className="space-y-2">
            {redeemed.map(item => (
              <div key={item.id} className="bg-gray-900/50 rounded-2xl p-4 border border-gray-800/50 flex justify-between items-center opacity-60">
                <div>
                  <p className="text-sm font-medium line-through text-gray-500">{item.name}</p>
                  <p className="text-xs text-gray-600">
                    {item.redeemed_at ? new Date(item.redeemed_at).toLocaleDateString('en-SG') : ''}
                  </p>
                </div>
                <p className="text-gray-500 font-semibold">S${item.price.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add item modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-gray-900 rounded-t-3xl w-full max-w-lg p-6 pb-10" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-5">Add Reward</h2>
            <form onSubmit={addItem} className="space-y-4">
              <input
                type="text"
                placeholder="e.g. New headphones"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:outline-none focus:border-indigo-500 text-base"
              />
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Price in SGD"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:outline-none focus:border-indigo-500 text-base"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-xl bg-gray-800 text-gray-300 font-semibold">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50">
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
