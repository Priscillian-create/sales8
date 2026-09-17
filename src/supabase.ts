import { createClient } from '@supabase/supabase-js'

declare global {
  interface Window {
    __PURELA_SUPABASE__?: {
      url?: string
      publishableKey?: string
      anonKey?: string
    }
  }
}

const runtimeSupabase = typeof window !== 'undefined' ? window.__PURELA_SUPABASE__ : undefined
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? runtimeSupabase?.url
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  runtimeSupabase?.publishableKey ??
  runtimeSupabase?.anonKey

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
