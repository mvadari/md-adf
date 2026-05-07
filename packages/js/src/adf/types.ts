/**
 * Minimal structural representation for ADF nodes used by the converters.
 */
export type AdfNode = {
  type: string
  attrs?: Record<string, unknown>
  marks?: Array<Record<string, unknown>>
  content?: AdfNode[]
  text?: string
}

/**
 * Root ADF document shape accepted and emitted by this package.
 */
export type AdfDocument = {
  version: 1
  type: "doc"
  content: AdfNode[]
}
