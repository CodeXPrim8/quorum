import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

export function supabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
}

let client: SupabaseClient | null = null

/** Browser client. Uses the publishable key only. The secret key never ships here. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'quorum.auth.v1' },
    })
  }
  return client
}

export type CloudSession = { userId: string; email: string }

export function sessionFrom(session: Session | null): CloudSession | null {
  if (!session?.user) return null
  return { userId: session.user.id, email: session.user.email ?? session.user.id }
}
