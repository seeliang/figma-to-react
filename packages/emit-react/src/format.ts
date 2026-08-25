import prettier from 'prettier'

/**
 * Generated JSX is emitted with best-effort indentation; prettier makes it
 * actually readable. Formatting failures are non-fatal — unformatted valid TSX
 * is far better than no output at all — but they do signal an emitter bug, so
 * the error is surfaced to the caller.
 */
export async function format(source: string, onError?: (err: unknown) => void): Promise<string> {
  try {
    return await prettier.format(source, {
      parser: 'typescript',
      semi: false,
      singleQuote: true,
      printWidth: 100,
    })
  } catch (err) {
    onError?.(err)
    return source
  }
}

export async function formatAll(
  files: Map<string, string>,
  onError?: (file: string, err: unknown) => void,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const [name, source] of files) {
    out.set(name, await format(source, (err) => onError?.(name, err)))
  }
  return out
}
