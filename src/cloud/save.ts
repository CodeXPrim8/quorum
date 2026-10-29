import type { AppState } from '../types'
import { getSupabase } from './supabase'

export async function loadCloudState(userId: string): Promise<AppState | null> {
  const db = getSupabase()
  if (!db) return null
  const { data, error } = await db.from('company_saves').select('state').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(cloudError(error.message))
  if (!data?.state || typeof data.state !== 'object') return null
  return data.state as AppState
}

export async function saveCloudState(userId: string, state: AppState): Promise<void> {
  const db = getSupabase()
  if (!db) return
  const { error } = await db.from('company_saves').upsert({
    user_id: userId,
    state,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(cloudError(error.message))
}

export async function deleteCloudState(userId: string): Promise<void> {
  const db = getSupabase()
  if (!db) return
  const { error } = await db.from('company_saves').delete().eq('user_id', userId)
  if (error) throw new Error(cloudError(error.message))
}

function cloudError(message: string): string {
  if (/could not find the table|schema cache|relation .* does not exist/i.test(message)) {
    return 'Supabase is linked, but the company_saves table is missing. Run supabase/schema.sql in the SQL editor.'
  }
  return message
}
