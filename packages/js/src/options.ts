import type { Diagnostic } from "./diagnostics/diagnostic.js"

export const markdownDialects = ["gfm"] as const
export const conversionProfiles = [
  "jira",
  "confluence",
  "portableMarkdown",
] as const

export type MarkdownDialect = (typeof markdownDialects)[number]
export type ConversionProfile = (typeof conversionProfiles)[number]

export type ConversionResult<T> = {
  value: T
  diagnostics: Diagnostic[]
}

export type ConversionOptions = {
  /**
   * Currently only GitHub Flavored Markdown is supported.
   */
  markdownDialect?: MarkdownDialect
  /**
   * Accepted for API and CLI parity. Profiles do not change Phase 1 conversion
   * behavior yet.
   */
  profile?: ConversionProfile
  /**
   * When true, ADF input is validated against the pinned ADF schema before
   * ADF-to-Markdown conversion.
   */
  validateAdf?: boolean
  /**
   * Accepted for future ADF normalization controls. Phase 1 converters already
   * emit normalized ADF where they can, so this is currently a no-op.
   */
  normalizeAdf?: boolean
}

export type ResolvedConversionOptions = Required<ConversionOptions>

const markdownDialectSet = new Set<string>(markdownDialects)
const conversionProfileSet = new Set<string>(conversionProfiles)

/**
 * Applies default conversion options and rejects unsupported dialect/profile
 * values before a converter starts work.
 */
export function resolveConversionOptions(
  options: ConversionOptions = {},
): ResolvedConversionOptions {
  const markdownDialect = options.markdownDialect ?? "gfm"
  if (!markdownDialectSet.has(markdownDialect)) {
    throw new Error(
      `Unsupported markdownDialect '${String(markdownDialect)}'. Supported markdownDialect is 'gfm'.`,
    )
  }

  const profile = options.profile ?? "portableMarkdown"
  if (!conversionProfileSet.has(profile)) {
    throw new Error(
      `Unsupported profile '${String(profile)}'. Supported profiles are jira, confluence, and portableMarkdown.`,
    )
  }

  return {
    markdownDialect,
    profile,
    validateAdf: options.validateAdf ?? true,
    normalizeAdf: options.normalizeAdf ?? true,
  }
}
