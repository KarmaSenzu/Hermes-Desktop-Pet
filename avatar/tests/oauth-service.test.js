import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  generatePkcePair,
  buildOpenRouterAuthUrl,
  parseRateLimitHeaders,
  checkProviderQuota
} from '../src/main/oauth-service.js'
import {
  formatQuotaNumber,
  formatQuotaCountdown,
  normalizeRouterUsageQuotas,
  resolveRouterAccountsQuota
} from '../src/main/path-resolver.js'

describe('oauth-service', () => {
  it('generatePkcePair menghasilkan codeVerifier dan codeChallenge SHA-256 base64url valid', () => {
    const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePkcePair()

    expect(codeChallengeMethod).toBe('S256')
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]{40,}$/)

    const expectedChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
    expect(codeChallenge).toBe(expectedChallenge)
  })

  it('buildOpenRouterAuthUrl membentuk URL OAuth PKCE sah dan menolak callback non-loopback', () => {
    const { codeChallenge } = generatePkcePair()
    const authUrl = buildOpenRouterAuthUrl({
      callbackUrl: 'http://127.0.0.1:51234/oauth/callback',
      codeChallenge
    })

    const u = new URL(authUrl)
    expect(u.origin).toBe('https://openrouter.ai')
    expect(u.pathname).toBe('/auth')
    expect(u.searchParams.get('callback_url')).toBe('http://127.0.0.1:51234/oauth/callback')
    expect(u.searchParams.get('code_challenge')).toBe(codeChallenge)
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')

    expect(() =>
      buildOpenRouterAuthUrl({ callbackUrl: 'https://evil.tld/oauth/callback', codeChallenge })
    ).toThrow('127.0.0.1')

    expect(() =>
      buildOpenRouterAuthUrl({ callbackUrl: 'http://localhost:51234/oauth/callback', codeChallenge })
    ).toThrow('127.0.0.1')

    expect(() =>
      buildOpenRouterAuthUrl({ callbackUrl: 'http://127.0.0.1/oauth/callback', codeChallenge })
    ).toThrow('127.0.0.1')

    expect(() =>
      buildOpenRouterAuthUrl({ callbackUrl: 'http://127.0.0.1:51234/cb', codeChallenge: 'short' })
    ).toThrow('PKCE')
  })

  it('parseRateLimitHeaders mengekstrak sisa request dan token dari Headers dan objek', () => {
    const fetchHeaders = new Headers({
      'x-ratelimit-limit-requests': '14400',
      'x-ratelimit-remaining-requests': '14392',
      'x-ratelimit-limit-tokens': '6000',
      'x-ratelimit-remaining-tokens': '5850',
      'x-ratelimit-reset-requests': '12s'
    })

    expect(parseRateLimitHeaders(fetchHeaders)).toEqual({
      reqLimit: 14400,
      reqRemaining: 14392,
      tokLimit: 6000,
      tokRemaining: 5850,
      reset: '12s'
    })

    const plainObjHeaders = {
      'X-RateLimit-Limit-Requests': '100',
      'X-RateLimit-Remaining-Requests': '42'
    }

    expect(parseRateLimitHeaders(plainObjHeaders)).toEqual({
      reqLimit: 100,
      reqRemaining: 42,
      tokLimit: null,
      tokRemaining: null,
      reset: null
    })
  })

  it('checkProviderQuota menolak URL kosong tanpa fallback config dan protokol selain http/https', async () => {
    const r1 = await checkProviderQuota({ baseUrl: '', getConfiguredProvider: () => null })
    expect(r1.ok).toBe(false)
    expect(r1.unconfigured).toBe(true)
    expect(r1.error).toContain('Belum ada provider AI')

    const rCfgEmpty = await checkProviderQuota({
      baseUrl: '',
      getConfiguredProvider: () => ({ baseUrl: 'file:///C:/bad', configuredModel: 'x', configuredProvider: 'p' })
    })
    expect(rCfgEmpty.ok).toBe(false)
    expect(rCfgEmpty.error).toContain('tidak valid')

    const r2 = await checkProviderQuota({ baseUrl: 'file:///C:/Windows/win.ini' })
    expect(r2.ok).toBe(false)
    expect(r2.error).toContain('tidak valid')

    const r3 = await checkProviderQuota({ baseUrl: 'javascript:alert(1)' })
    expect(r3.ok).toBe(false)
    expect(r3.error).toContain('tidak valid')
  })

  it('formatQuotaNumber dan formatQuotaCountdown memformat angka desimal, ribuan, dan hitung mundur akurat', () => {
    expect(formatQuotaNumber(456.07999968)).toBe('456.08')
    expect(formatQuotaNumber(1500)).toBe('1,500')
    expect(formatQuotaNumber(0)).toBe('0')

    const now = Date.UTC(2026, 10, 17, 14, 0, 0)
    const monthlyReset = new Date(now + ((13 * 24 + 3) * 60 + 1) * 60000).toISOString()
    const bonusExpire = new Date(now + ((19 * 24 + 1) * 60 + 36) * 60000).toISOString()

    expect(formatQuotaCountdown(monthlyReset, true, now)).toBe('in 13d 3h 1m')
    expect(formatQuotaCountdown(bonusExpire, false, now)).toBe('expires in 19d 1h 36m')
    expect(formatQuotaCountdown(new Date(now - 1000).toISOString(), true, now)).toBe('resetting...')
  })

  it('normalizeRouterUsageQuotas menormalkan 25 paket kuota codebuddy-cn dan kuota kiro secara akurat', () => {
    const now = Date.UTC(2026, 10, 17, 14, 0, 0)
    const rawQuotas = {
      Monthly: {
        used: 456.07999968,
        total: 500,
        resetAt: new Date(now + ((13 * 24 + 3) * 60 + 1) * 60000).toISOString(),
        unlimited: false,
        recurring: true
      }
    }
    for (let i = 1; i <= 24; i++) {
      rawQuotas[`Bonus Pack ${i}`] = {
        used: 0,
        total: i === 1 ? 1500 : 100,
        resetAt: new Date(now + ((19 * 24 + 1) * 60 + 36) * 60000).toISOString(),
        unlimited: false,
        recurring: false
      }
    }

    const list = normalizeRouterUsageQuotas('codebuddy-cn', { quotas: rawQuotas }, now)
    expect(list).toHaveLength(25)
    expect(list[0]).toMatchObject({
      label: 'Monthly',
      used: 456.08,
      limit: 500,
      usedFormatted: '456.08',
      limitFormatted: '500',
      remainingPct: 9,
      recurring: true,
      resetText: 'in 13d 3h 1m'
    })
    expect(list[1]).toMatchObject({
      label: 'Bonus Pack 1',
      used: 0,
      limit: 1500,
      usedFormatted: '0',
      limitFormatted: '1,500',
      remainingPct: 100,
      recurring: false,
      resetText: 'expires in 19d 1h 36m'
    })

    const kiroList = normalizeRouterUsageQuotas('kiro', {
      quotas: { credit: { used: 0, total: 50, remaining: 50, unlimited: false } }
    }, now)
    expect(kiroList).toHaveLength(1)
    expect(kiroList[0]).toMatchObject({
      label: 'Credit',
      used: 0,
      limit: 50,
      remainingPct: 100
    })
  })

  it('resolveRouterAccountsQuota mengambil data kuota live dari API 9Router dan menyinkronkan modelGroups', async () => {
    const mockFetch = async (url) => {
      if (String(url).includes('/api/providers/client')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            connections: [
              { id: 'c1', provider: 'codebuddy-cn', name: 'bisa', authType: 'apikey', isActive: true, testStatus: 'active' },
              { id: 'c2', provider: 'codebuddy-cn', name: '10', authType: 'apikey', isActive: true, testStatus: 'unavailable' }
            ]
          })
        }
      }
      if (String(url).includes('/api/usage/c1')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            plan: 'CodeBuddy个人体验版',
            quotas: {
              Monthly: { used: 456.08, total: 500, unlimited: false, recurring: true },
              'Bonus Pack 1': { used: 0, total: 1500, unlimited: false, recurring: false }
            }
          })
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ message: 'CodeBuddy CN credential invalid or expired.' })
      }
    }

    const res = await resolveRouterAccountsQuota({ routerBaseUrl: 'http://127.0.0.1:20128', fetchImpl: mockFetch })
    expect(res.ok).toBe(true)
    expect(res.liveSynced).toBe(true)
    expect(res.accounts).toHaveLength(2)
    expect(res.accounts[0].totalQuotas).toBe(2)
    expect(res.accounts[0].quotas[0].remainingPct).toBe(9)
    expect(res.accounts[1].isExpiredOrInvalid).toBe(true)
    expect(res.accounts[1].errorMessage).toContain('expired')

    const deepseekGroup = res.modelGroups.find((g) => g.id === 'deepseek-glm')
    expect(deepseekGroup.rows[0].remainingPct).toBe(9)
    expect(deepseekGroup.rows[0].subtext).toContain('456.08 / 500')
  })

  it('checkProviderQuota pada endpoint 9Router menyertakan primaryQuotaPct real-time untuk bar ringkasan', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data: [{ id: 'cbcn/deepseek-v4-pro' }, { id: 'kr/claude-sonnet-4' }] })
    })

    const res = await checkProviderQuota({
      baseUrl: 'http://127.0.0.1:20128/v1',
      apiKey: '',
      fetchImpl: mockFetch,
      getConfiguredProvider: () => ({ configuredModel: 'cbcn/deepseek-v4-pro', configuredProvider: 'custom' }),
      getRouterQuota: async () => ({
        ok: true,
        accounts: [
          {
            id: 'c1',
            providerKey: 'codebuddy-cn',
            providerLabel: 'Codebuddy-Cn',
            accountName: 'bisa',
            isActive: true,
            isExpiredOrInvalid: false,
            totalQuotas: 25,
            quotas: [{ label: 'Monthly', used: 456.08, limit: 500, usedFormatted: '456.08', limitFormatted: '500', remainingPct: 9 }]
          }
        ],
        modelGroups: []
      })
    })

    expect(res.ok).toBe(true)
    expect(res.providerType).toBe('9router')
    expect(res.primaryQuotaPct).toBe(9)
    expect(res.summary).toContain('456.08/500 (9%)')
    expect(res.summary).toContain('25 kuota aktif')
  })
})
