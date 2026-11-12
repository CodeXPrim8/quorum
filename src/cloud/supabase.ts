import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

/** Vite names on this computer, then the names the Vercel Supabase integration already stores. */
function supabaseUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
}

function supabaseKey(): string {
  return (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim()
}

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseKey())
}

let client: SupabaseClient | null = null

/** Browser client. Uses the publishable key only. The secret key never ships here. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null
  if (!client) {
    client = createClient(supabaseUrl(), supabaseKey(), {
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
