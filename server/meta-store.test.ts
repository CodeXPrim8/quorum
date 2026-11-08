import { describe, expect, it } from 'vitest'
import {
  clearCompanyChannel,
  encryptKeyFromEnv,
  findCompanyByWhatsAppPhone,
  patchCompanyMeta,
  publicMetaStatus,
  readCompanyMeta,
} from './meta-store'
import { companyMetaPublic, metaAppEnv, readOAuthState, signOAuthState } from './meta-oauth'

const COMPANY = 'co_test_meta_store'
const KEY_PASS = 'test-meta-encrypt-passphrase'

describe('meta store', () => {
  it('derives a 32-byte key from a passphrase or hex', () => {
    expect(encryptKeyFromEnv({})).toBeNull()
    expect(encryptKeyFromEnv({ META_ENCRYPT_KEY: 'passphrase' })?.length).toBe(32)
    expect(encryptKeyFromEnv({ META_ENCRYPT_KEY: 'a'.repeat(64) })?.length).toBe(32)
  })

  it('seals and opens per-company Instagram and WhatsApp secrets', () => {
    const key = encryptKeyFromEnv({ META_ENCRYPT_KEY: KEY_PASS })
    expect(key).not.toBeNull()
    patchCompanyMeta(key, COMPANY, {
      instagram: {
        token: 'ig-token',
        userId: '17841400000000000',
        username: 'clemx',
        connectedAt: new Date().toISOString(),
      },
      whatsapp: {
        token: 'wa-token',
        phoneNumberId: 'phone_1',
        displayPhone: '+15551234567',
        connectedAt: new Date().toISOString(),
      },
    })
    const record = readCompanyMeta(key, COMPANY)
    expect(record?.instagram?.username).toBe('clemx')
    expect(record?.whatsapp?.phoneNumberId).toBe('phone_1')
    expect(findCompanyByWhatsAppPhone(key, 'phone_1')?.companyId).toBe(COMPANY)
    expect(publicMetaStatus(record).instagram.connected).toBe(true)
    clearCompanyChannel(key, COMPANY, 'instagram')
    clearCompanyChannel(key, COMPANY, 'whatsapp')
    expect(readCompanyMeta(key, COMPANY)).toBeNull()
  })
})

describe('meta oauth helpers', () => {
  it('signs and reads Instagram OAuth state', () => {
    const app = metaAppEnv({
      META_APP_ID: 'app',
      META_APP_SECRET: 'secret',
      META_ENCRYPT_KEY: KEY_PASS,
      META_PUBLIC_BASE: 'https://example.ngrok-free.app',
    })
    const state = signOAuthState(app, COMPANY, 'instagram')
    expect(readOAuthState(app, state)).toEqual({ companyId: COMPANY, channel: 'instagram' })
    expect(readOAuthState(app, state + 'x')).toBeNull()
  })

  it('reports env fallback when no company connection exists', () => {
    const app = metaAppEnv({
      META_APP_ID: 'app',
      META_APP_SECRET: 'secret',
      META_ENCRYPT_KEY: KEY_PASS,
      META_PUBLIC_BASE: 'https://example.ngrok-free.app',
      INSTAGRAM_TOKEN: 'ig',
      INSTAGRAM_BUSINESS_ACCOUNT_ID: '17841400000000000',
      WHATSAPP_TOKEN: 'wa',
      WHATSAPP_PHONE_NUMBER_ID: 'phone_env',
    })
    const status = companyMetaPublic(app, COMPANY)
    expect(status.appReady).toBe(true)
    expect(status.instagram.source).toBe('env')
    expect(status.whatsapp.source).toBe('env')
    expect(status.instagram.connected).toBe(true)
  })
})
