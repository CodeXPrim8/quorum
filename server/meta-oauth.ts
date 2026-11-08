import { createHmac, timingSafeEqual } from 'node:crypto'
import type { InstagramEnv } from './instagram'
import { instagramEnv } from './instagram'
import {
  encryptKeyFromEnv,
  patchCompanyMeta,
  publicMetaStatus,
  readCompanyMeta,
  type CompanyInstagramSecret,
  type CompanyWhatsAppSecret,
} from './meta-store'
import { whatsAppEnv, type WaEnv } from './whatsapp'

export type MetaAppEnv = {
  appId: string
  appSecret: string
  encryptKey: Buffer | null
  publicBase: string
  /** Optional single-tenant fallback from .env */
  fallbackInstagram: InstagramEnv
  fallbackWhatsApp: WaEnv
}

export function metaAppEnv(env: Record<string, string | undefined>): MetaAppEnv {
  const publicBase = String(env.META_PUBLIC_BASE ?? env.INSTAGRAM_PUBLIC_BASE ?? '')
    .trim()
    .replace(/\/$/, '')
  return {
    appId: String(env.META_APP_ID ?? '').trim(),
    appSecret: String(env.META_APP_SECRET ?? '').trim(),
    encryptKey: encryptKeyFromEnv(env),
    publicBase,
    fallbackInstagram: instagramEnv(env),
    fallbackWhatsApp: whatsAppEnv(env),
  }
}

export function metaAppReady(app: MetaAppEnv): boolean {
  return Boolean(app.appId && app.appSecret && app.encryptKey && app.publicBase.startsWith('https://'))
}

export function redirectUri(app: MetaAppEnv): string {
  return `${app.publicBase}/api/meta/callback`
}

export function signOAuthState(app: MetaAppEnv, companyId: string, channel: 'instagram'): string {
  const stamp = Math.floor(Date.now() / 1000).toString(36)
  const nonce = Math.random().toString(36).slice(2, 10)
  const body = `${companyId}.${channel}.${stamp}.${nonce}`
  const mac = createHmac('sha256', app.appSecret).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function readOAuthState(
  app: MetaAppEnv,
  state: string,
): { companyId: string; channel: 'instagram' } | null {
  const parts = state.split('.')
  if (parts.length !== 5) return null
  const [companyId, channel, stamp, nonce, mac] = parts
  if (!companyId || channel !== 'instagram' || !stamp || !nonce || !mac) return null
  const age = Math.floor(Date.now() / 1000) - parseInt(stamp, 36)
  if (!Number.isFinite(age) || age < 0 || age > 900) return null
  const body = `${companyId}.${channel}.${stamp}.${nonce}`
  const expect = createHmac('sha256', app.appSecret).update(body).digest('base64url')
  const left = Buffer.from(mac)
  const right = Buffer.from(expect)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  return { companyId, channel }
}

export function instagramAuthUrl(app: MetaAppEnv, companyId: string): string | null {
  if (!metaAppReady(app) || !companyId) return null
  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth')
  url.searchParams.set('client_id', app.appId)
  url.searchParams.set('redirect_uri', redirectUri(app))
  url.searchParams.set('state', signOAuthState(app, companyId, 'instagram'))
  url.searchParams.set(
    'scope',
    [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
    ].join(','),
  )
  url.searchParams.set('response_type', 'code')
  return url.toString()
}

async function exchangeCode(app: MetaAppEnv, code: string): Promise<string> {
  const url = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
  url.searchParams.set('client_id', app.appId)
  url.searchParams.set('client_secret', app.appSecret)
  url.searchParams.set('redirect_uri', redirectUri(app))
  url.searchParams.set('code', code)
  const response = await fetch(url)
  const data = (await response.json()) as { access_token?: string; error?: { message?: string } }
  if (!response.ok || !data.access_token) {
    throw new Error(data.error?.message || 'Meta did not return an access token.')
  }
  return data.access_token
}

async function longLivedUserToken(app: MetaAppEnv, shortToken: string): Promise<string> {
  const url = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', app.appId)
  url.searchParams.set('client_secret', app.appSecret)
  url.searchParams.set('fb_exchange_token', shortToken)
  const response = await fetch(url)
  const data = (await response.json()) as { access_token?: string; error?: { message?: string } }
  if (!response.ok || !data.access_token) {
    throw new Error(data.error?.message || 'Meta could not extend the access token.')
  }
  return data.access_token
}

type PageRow = {
  id?: string
  name?: string
  access_token?: string
  instagram_business_account?: { id?: string; username?: string }
}

async function pickInstagramPage(userToken: string): Promise<CompanyInstagramSecret> {
  const url = new URL('https://graph.facebook.com/v21.0/me/accounts')
  url.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}')
  url.searchParams.set('access_token', userToken)
  const response = await fetch(url)
  const data = (await response.json()) as { data?: PageRow[]; error?: { message?: string } }
  if (!response.ok) throw new Error(data.error?.message || 'Meta pages could not be listed.')
  const pages = data.data ?? []
  const page = pages.find((item) => item.instagram_business_account?.id && item.access_token)
  if (!page?.instagram_business_account?.id || !page.access_token) {
    throw new Error(
      'No Facebook Page with a linked Instagram Business account was found for this login. Link Instagram to a Page, then connect again.',
    )
  }
  return {
    token: page.access_token,
    userId: page.instagram_business_account.id,
    username: page.instagram_business_account.username,
    pageId: page.id,
    connectedAt: new Date().toISOString(),
  }
}

export async function finishInstagramOAuth(
  app: MetaAppEnv,
  companyId: string,
  code: string,
): Promise<{ username?: string; accountId: string }> {
  if (!app.encryptKey) throw new Error('Set META_ENCRYPT_KEY before connecting company accounts.')
  const short = await exchangeCode(app, code)
  const longLived = await longLivedUserToken(app, short)
  const instagram = await pickInstagramPage(longLived)
  patchCompanyMeta(app.encryptKey, companyId, { instagram })
  return { username: instagram.username, accountId: instagram.userId }
}

export function saveCompanyWhatsApp(
  app: MetaAppEnv,
  companyId: string,
  input: { token: string; phoneNumberId: string; verifyToken?: string; displayPhone?: string },
): CompanyWhatsAppSecret {
  if (!app.encryptKey) throw new Error('Set META_ENCRYPT_KEY before connecting company accounts.')
  const whatsapp: CompanyWhatsAppSecret = {
    token: input.token.trim(),
    phoneNumberId: input.phoneNumberId.trim(),
    verifyToken: input.verifyToken?.trim() || undefined,
    displayPhone: input.displayPhone?.trim() || undefined,
    connectedAt: new Date().toISOString(),
  }
  if (!whatsapp.token || !whatsapp.phoneNumberId) {
    throw new Error('WhatsApp needs a Cloud API token and a phone number id.')
  }
  patchCompanyMeta(app.encryptKey, companyId, { whatsapp })
  return whatsapp
}

export function companyInstagramLine(app: MetaAppEnv, companyId: string | undefined): InstagramEnv {
  const record = companyId && app.encryptKey ? readCompanyMeta(app.encryptKey, companyId) : null
  if (record?.instagram?.token && record.instagram.userId) {
    return {
      token: record.instagram.token,
      userId: record.instagram.userId,
      publicBase: app.publicBase || app.fallbackInstagram.publicBase,
    }
  }
  return app.fallbackInstagram
}

export function companyWhatsAppLine(app: MetaAppEnv, companyId: string | undefined): WaEnv {
  const record = companyId && app.encryptKey ? readCompanyMeta(app.encryptKey, companyId) : null
  if (record?.whatsapp?.token && record.whatsapp.phoneNumberId) {
    return {
      token: record.whatsapp.token,
      phoneNumberId: record.whatsapp.phoneNumberId,
      verifyToken: record.whatsapp.verifyToken || app.fallbackWhatsApp.verifyToken,
      appSecret: app.fallbackWhatsApp.appSecret,
    }
  }
  return app.fallbackWhatsApp
}

export function companyMetaPublic(app: MetaAppEnv, companyId: string | undefined) {
  const record = companyId && app.encryptKey ? readCompanyMeta(app.encryptKey, companyId) : null
  const status = publicMetaStatus(record)
  const fallbackIg = Boolean(app.fallbackInstagram.token && app.fallbackInstagram.userId)
  const fallbackWa = Boolean(app.fallbackWhatsApp.token && app.fallbackWhatsApp.phoneNumberId)
  return {
    appReady: metaAppReady(app),
    canHost: Boolean(app.publicBase && /^https:\/\//i.test(app.publicBase)),
    instagram: {
      ...status.instagram,
      connected: status.instagram.connected || (!record?.instagram && fallbackIg),
      source: status.instagram.connected ? 'company' : fallbackIg ? 'env' : 'none',
    },
    whatsapp: {
      ...status.whatsapp,
      connected: status.whatsapp.connected || (!record?.whatsapp && fallbackWa),
      source: status.whatsapp.connected ? 'company' : fallbackWa ? 'env' : 'none',
    },
  }
}
