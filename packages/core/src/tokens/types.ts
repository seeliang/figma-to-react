import type { TokenRef } from '../ir/types.js'

export type TokenKind = 'color' | 'spacing' | 'radius' | 'fontSize' | 'shadow' | 'fontFamily'

/**
 * Maps a concrete style value to a theme key, or returns undefined to mean
 * "emit this as a literal".
 *
 * The emitter depends on this interface rather than on the collector, so
 * `--no-tokens` is simply {@link noTokens} and needs no branch in the emitter.
 */
export interface TokenResolver {
  resolve(kind: TokenKind, value: string | number, token?: TokenRef): string | undefined
}

/** Emits every value as a literal. */
export const noTokens: TokenResolver = { resolve: () => undefined }
