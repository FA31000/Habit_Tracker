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
