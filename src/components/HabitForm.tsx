'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Habit } from '@/lib/types'

type MultiQuestion = { type: 'multi'; label: string; options: string[] }
type NumberQuestion = { type: 'number'; label: string; unit: string }
type PopupQuestion = MultiQuestion | NumberQuestion
type HabitPopupConfig = { trigger: 'yes' | 'no'; questions: PopupQuestion[] }

type Props = {
  habit: Habit | null
  onClose: () => void
  onSaved: () => void
}

const DEFAULT_EXERCISE_QUESTIONS: PopupQuestion[] = [
  { type: 'multi', label: 'What did you do?', options: ['Running', 'Swimming', 'Biking', 'Resistance', 'Yoga', 'Other'] },
  { type: 'number', label: 'Weight', unit: 'kg' },
]
const DEFAULT_READING_QUESTIONS: PopupQuestion[] = [
  { type: 'number', label: 'Minutes read', unit: 'min' },
]
const DEFAULT_EATING_QUESTIONS: PopupQuestion[] = [
  { type: 'multi', label: 'Why not?', options: ['Sugar', 'Alcohol', 'Carbs at dinner', 'Other'] },
]

export default function HabitForm({ habit, onClose, onSaved }: Props) {
  const [name, setName] = useState(habit?.name ?? '')
  const [description, setDescription] = useState(habit?.description ?? '')
  const [dollarValue, setDollarValue] = useState(habit?.dollar_value?.toString() ?? '1.00')
  const [allowedNoDays, setAllowedNoDays] = useState(habit?.allowed_no_days_per_week?.toString() ?? '0')
  const [saving, setSaving] = useState(false)

  // Popup config state
  const [hasPopup, setHasPopup] = useState(false)
  const [trigger, setTrigger] = useState<'yes' | 'no'>('yes')
  const [questions, setQuestions] = useState<PopupQuestion[]>([])
  const [newOptions, setNewOptions] = useState<Record<number, string>>({})

  const supabase = createClient()

  useEffect(() => {
    if (!habit) return
    const stored = localStorage.getItem('habit_popup_config')
    const all: Record<string, HabitPopupConfig> = stored ? JSON.parse(stored) : {}

    if (all[habit.id]) {
      setHasPopup(true)
      setTrigger(all[habit.id].trigger)
      setQuestions(all[habit.id].questions)
    } else {
      // Pre-populate defaults for known habit types
      const n = habit.name.toLowerCase()
      if (n.includes('exercise') || n.includes('workout') || n.includes('gym')) {
        setHasPopup(true); setTrigger('yes'); setQuestions(DEFAULT_EXERCISE_QUESTIONS)
      } else if (n.includes('eat') || n.includes('healthy')) {
        setHasPopup(true); setTrigger('no'); setQuestions(DEFAULT_EATING_QUESTIONS)
      } else if (n.includes('read')) {
        setHasPopup(true); setTrigger('yes'); setQuestions(DEFAULT_READING_QUESTIONS)
      }
    }
  }, [habit?.id])

  function addQuestion(type: 'multi' | 'number') {
    if (type === 'multi') {
      setQuestions(prev => [...prev, { type: 'multi', label: '', options: [] }])
    } else {
      setQuestions(prev => [...prev, { type: 'number', label: '', unit: '' }])
    }
  }

  function deleteQuestion(i: number) {
    setQuestions(prev => prev.filter((_, j) => j !== i))
    setNewOptions(prev => { const next = { ...prev }; delete next[i]; return next })
  }

  function updateQuestionLabel(i: number, label: string) {
    setQuestions(prev => prev.map((q, j) => j === i ? { ...q, label } : q))
  }

  function updateNumberUnit(i: number, unit: string) {
    setQuestions(prev => prev.map((q, j) => j === i && q.type === 'number' ? { ...q, unit } : q))
  }

  function addOption(qi: number) {
    const text = (newOptions[qi] ?? '').trim()
    if (!text) return
    setQuestions(prev => prev.map((q, j) => {
      if (j !== qi || q.type !== 'multi') return q
      return { ...q, options: [...q.options, text] }
    }))
    setNewOptions(prev => ({ ...prev, [qi]: '' }))
  }

  function updateOption(qi: number, oi: number, value: string) {
    setQuestions(prev => prev.map((q, j) => {
      if (j !== qi || q.type !== 'multi') return q
      const opts = [...q.options]; opts[oi] = value
      return { ...q, options: opts }
    }))
  }

  function deleteOption(qi: number, oi: number) {
    setQuestions(prev => prev.map((q, j) => {
      if (j !== qi || q.type !== 'multi') return q
      return { ...q, options: q.options.filter((_, k) => k !== oi) }
    }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      dollar_value: parseFloat(dollarValue) || 1,
      allowed_no_days_per_week: parseInt(allowedNoDays) || 0,
    }
    if (habit) {
      await supabase.from('habits').update(payload).eq('id', habit.id)
      // Save popup config
      const stored = localStorage.getItem('habit_popup_config')
      const all: Record<string, HabitPopupConfig> = stored ? JSON.parse(stored) : {}
      const validQuestions = questions.filter(q => q.label.trim())
      if (hasPopup && validQuestions.length > 0) {
        all[habit.id] = { trigger, questions: validQuestions }
      } else {
        delete all[habit.id]
      }
      localStorage.setItem('habit_popup_config', JSON.stringify(all))
      window.dispatchEvent(new StorageEvent('storage', { key: 'habit_popup_config' }))
    } else {
      await supabase.from('habits').insert({ ...payload, user_id: user.id })
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center pb-16" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-10 shadow-xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-5">{habit ? 'Edit Habit' : 'New Habit'}</h2>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">Habit question</label>
            <input
              type="text"
              placeholder="e.g. Did I go for a run?"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">Description (optional)</label>
            <textarea
              placeholder="e.g. Why this habit matters to me..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">Reward per day (S$)</label>
            <input
              type="number" step="0.01" min="0.01" placeholder="1.00"
              value={dollarValue} onChange={e => setDollarValue(e.target.value)} required
              className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block font-medium">
              Allowed &quot;No&quot; days per week (streak still counts)
            </label>
            <select
              value={allowedNoDays} onChange={e => setAllowedNoDays(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-100 text-gray-900 border border-gray-200 focus:outline-none focus:border-emerald-600 text-base"
            >
              {[0, 1, 2, 3, 4, 5, 6].map(n => (
                <option key={n} value={n}>{n} day{n !== 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>

          {/* Popup section — only for existing habits */}
          {habit && (
            <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
              {/* Header with toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Check-in pop-up</p>
                  <p className="text-xs text-gray-400">Ask questions when answering Yes or No</p>
                </div>
                <button
                  type="button"
                  onClick={() => setHasPopup(p => !p)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${hasPopup ? 'bg-emerald-600' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${hasPopup ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              {hasPopup && (
                <>
                  {/* Trigger */}
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-2">Show when answering</p>
                    <div className="flex gap-2">
                      <button
                        type="button" onClick={() => setTrigger('yes')}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${trigger === 'yes' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                      >✅ Yes</button>
                      <button
                        type="button" onClick={() => setTrigger('no')}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${trigger === 'no' ? 'bg-red-500 text-white border-red-500' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                      >❌ No</button>
                    </div>
                  </div>

                  {/* Questions list */}
                  {questions.length > 0 && (
                    <div className="space-y-3">
                      {questions.map((q, qi) => (
                        <div key={qi} className="bg-gray-50 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${q.type === 'multi' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {q.type === 'multi' ? 'Multi-choice' : 'Number input'}
                            </span>
                            <button
                              type="button" onClick={() => deleteQuestion(qi)}
                              className="text-red-400 text-sm font-bold px-2"
                            >✕</button>
                          </div>

                          {/* Label */}
                          <input
                            type="text"
                            placeholder="Question label (e.g. What did you do?)"
                            value={q.label}
                            onChange={e => updateQuestionLabel(qi, e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white text-gray-900 border border-gray-200 focus:outline-none focus:border-emerald-600 text-sm"
                          />

                          {/* Number: unit */}
                          {q.type === 'number' && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1">Unit shown after the number (e.g. min, kg)</p>
                              <input
                                type="text"
                                placeholder="e.g. min, kg, calories"
                                value={q.unit}
                                onChange={e => updateNumberUnit(qi, e.target.value)}
                                className="w-full px-3 py-2 rounded-xl bg-white text-gray-900 border border-gray-200 focus:outline-none focus:border-emerald-600 text-sm"
                              />
                            </div>
                          )}

                          {/* Multi: options */}
                          {q.type === 'multi' && (
                            <div className="space-y-1.5">
                              {q.options.map((opt, oi) => (
                                <div key={oi} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={e => updateOption(qi, oi, e.target.value)}
                                    className="flex-1 px-3 py-1.5 rounded-xl bg-white text-gray-900 border border-gray-200 focus:outline-none focus:border-emerald-600 text-sm"
                                  />
                                  <button
                                    type="button" onClick={() => deleteOption(qi, oi)}
                                    className="px-2 text-red-400 text-sm font-bold"
                                  >✕</button>
                                </div>
                              ))}
                              <div className="flex gap-2 mt-1">
                                <input
                                  type="text"
                                  placeholder="Add option..."
                                  value={newOptions[qi] ?? ''}
                                  onChange={e => setNewOptions(prev => ({ ...prev, [qi]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(qi) } }}
                                  className="flex-1 px-3 py-1.5 rounded-xl bg-white text-gray-900 border border-gray-200 focus:outline-none focus:border-emerald-600 text-sm placeholder-gray-400"
                                />
                                <button
                                  type="button" onClick={() => addOption(qi)}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-semibold"
                                >Add</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add question buttons */}
                  <div className="flex gap-2">
                    <button
                      type="button" onClick={() => addQuestion('multi')}
                      className="flex-1 py-2 rounded-xl bg-purple-50 text-purple-700 text-sm font-semibold border border-purple-200"
                    >+ Multi-choice</button>
                    <button
                      type="button" onClick={() => addQuestion('number')}
                      className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold border border-blue-200"
                    >+ Number</button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
