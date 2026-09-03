import { describe, expect, it, vi } from 'vitest'
import { backoffMs, FigmaApiError, FigmaClient } from '../src/figma/client.js'

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init })

function clientWith(fetchImpl: typeof globalThis.fetch) {
  return new FigmaClient({ token: 'tok', fetch: fetchImpl, sleep: async () => {} })
}

describe('FigmaClient', () => {
  it('sends the token as X-Figma-Token', async () => {
    const fetchImpl = vi.fn(async () => json({ nodes: {} }))
    await clientWith(fetchImpl as unknown as typeof fetch).getNodes('KEY', ['1:2'])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/v1/files/KEY/nodes?ids=1%3A2')
    expect((init.headers as Record<string, string>)['X-Figma-Token']).toBe('tok')
  })

  it('retries on 429 then succeeds', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls++
      return calls === 1
        ? json({}, { status: 429, statusText: 'Too Many Requests' })
        : json({ nodes: {} })
    })
    const res = await clientWith(fetchImpl as unknown as typeof fetch).getNodes('KEY', ['1:2'])
    expect(calls).toBe(2)
    expect(res).toEqual({ nodes: {} })
  })

  it('does not retry a 404 — a bad id will never become good', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ err: 'Not found' }, { status: 404, statusText: 'Not Found' }),
    )
    await expect(
      clientWith(fetchImpl as unknown as typeof fetch).getNodes('KEY', ['9:9']),
    ).rejects.toThrow(FigmaApiError)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('batches image exports instead of one request per node', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `1:${i}`)
    const fetchImpl = vi.fn(async (url: string) => {
      const requested = new URL(url).searchParams.get('ids')!.split(',')
      return json({
        err: null,
        images: Object.fromEntries(requested.map((id) => [id, `https://x/${id}.svg`])),
      })
    })
    const out = await clientWith(fetchImpl as unknown as typeof fetch).exportImages('KEY', ids)
    expect(fetchImpl).toHaveBeenCalledTimes(3) // 50 + 50 + 20
    expect(Object.keys(out)).toHaveLength(120)
  })

  it('refuses to construct without a token', () => {
    expect(() => new FigmaClient({ token: '' })).toThrow(/Missing Figma token/)
  })
})

describe('backoffMs', () => {
  it('honours Retry-After when present', () => {
    expect(backoffMs(1, '3')).toBe(3000)
  })

  it('grows exponentially and stays capped', () => {
    expect(backoffMs(1)).toBeLessThan(backoffMs(4))
    expect(backoffMs(20)).toBeLessThanOrEqual(16_250)
  })
})
