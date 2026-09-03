import { describe, expect, it } from 'vitest'
import { FigmaUrlError, parseFigmaTarget, toApiNodeId, toUrlNodeId } from '../src/figma/url.js'

describe('parseFigmaTarget', () => {
  it('parses a current /design/ URL and converts the node id to API form', () => {
    expect(parseFigmaTarget('https://www.figma.com/design/AbC123/My-File?node-id=1-2')).toEqual({
      fileKey: 'AbC123',
      nodeId: '1:2',
    })
  })

  it('parses a legacy /file/ URL with a percent-encoded node id', () => {
    expect(parseFigmaTarget('https://www.figma.com/file/AbC123/My-File?node-id=1%3A2')).toEqual({
      fileKey: 'AbC123',
      nodeId: '1:2',
    })
  })

  it('returns no node id when the URL points at the whole file', () => {
    expect(parseFigmaTarget('https://figma.com/design/AbC123/My-File')).toEqual({
      fileKey: 'AbC123',
    })
  })

  it('ignores unrelated query params and fragments', () => {
    expect(
      parseFigmaTarget('https://www.figma.com/design/AbC123/File?node-id=10-20&t=xyz&m=dev#frame'),
    ).toEqual({ fileKey: 'AbC123', nodeId: '10:20' })
  })

  it('accepts a bare file key', () => {
    expect(parseFigmaTarget('AbC123')).toEqual({ fileKey: 'AbC123' })
  })

  it('accepts key:node shorthand', () => {
    expect(parseFigmaTarget('AbC123:1-2')).toEqual({ fileKey: 'AbC123', nodeId: '1:2' })
  })

  it('rejects a URL with no file key', () => {
    expect(() => parseFigmaTarget('https://www.figma.com/community')).toThrow(FigmaUrlError)
  })

  it('rejects empty input', () => {
    expect(() => parseFigmaTarget('   ')).toThrow(FigmaUrlError)
  })
})

describe('node id forms', () => {
  it('round-trips between URL and API forms', () => {
    expect(toApiNodeId('1-2')).toBe('1:2')
    expect(toApiNodeId('1:2')).toBe('1:2')
    expect(toUrlNodeId('1:2')).toBe('1-2')
  })
})
