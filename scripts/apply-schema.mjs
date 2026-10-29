import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const at = line.indexOf('=')
      return [line.slice(0, at), line.slice(at + 1)]
    }),
)
const url = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const secret = env.SUPABASE_SECRET_KEY
const sql = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8')
if (!url || !secret) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY in .env')
  process.exit(1)
}

const endpoints = [`${url}/pg/query`, `${url}/pg-meta/query`]
let applied = false
for (const endpoint of endpoints) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await response.text()
  if (response.ok) {
    console.log(`Schema applied via ${endpoint}`)
    applied = true
    break
  }
  console.log(`Could not apply via ${endpoint} (${response.status}).`)
}
if (!applied) {
  console.log('Open the Supabase SQL editor and run supabase/schema.sql once.')
  process.exit(2)
}
