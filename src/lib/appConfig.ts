import { createClient } from '@/lib/supabase/client'
import { loadAppConfig, normalizeAppConfig, type AppConfig } from './types'

// Reads the shared app config from Supabase (set by the admin on the Admin
// page). The result is cached in localStorage so pages can render instantly
// on the next load; if the fetch fails, the last cached copy is used.
export async function fetchAppConfig(): Promise<AppConfig> {
  try {
    const supabase = createClient()
    const { data } = await supabase.from('app_config').select('config').eq('id', 1).single()
    if (!data?.config) return loadAppConfig()
    const cfg = normalizeAppConfig(data.config)
    localStorage.setItem('app_config', JSON.stringify(cfg))
    window.dispatchEvent(new StorageEvent('storage', { key: 'app_config' }))
    return cfg
  } catch {
    return loadAppConfig()
  }
}

// Reads the config for the CURRENT signed-in user: the shared config, with a
// per-account bonus override (from user_bonus_config) layered on top if one
// exists. Accounts with no override row just get the shared config unchanged.
export async function fetchUserConfig(): Promise<AppConfig> {
  const base = await fetchAppConfig()
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return base
    const { data } = await supabase
      .from('user_bonus_config')
      .select('badge_multipliers')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!data?.badge_multipliers) return base
    const merged = normalizeAppConfig({
      badgeMultipliers: { ...base.badgeMultipliers, ...data.badge_multipliers },
      currencySymbol: base.currencySymbol,
    })
    localStorage.setItem('app_config', JSON.stringify(merged))
    window.dispatchEvent(new StorageEvent('storage', { key: 'app_config' }))
    return merged
  } catch {
    return base
  }
}

// Saves the shared app config to Supabase. Only the admin passes RLS.
// Returns an error message, or null on success.
export async function saveAppConfig(cfg: AppConfig): Promise<string | null> {
  const supabase = createClient()
  const { error } = await supabase
    .from('app_config')
    .upsert({ id: 1, config: cfg, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) return error.message
  localStorage.setItem('app_config', JSON.stringify(cfg))
  window.dispatchEvent(new StorageEvent('storage', { key: 'app_config' }))
  return null
}
