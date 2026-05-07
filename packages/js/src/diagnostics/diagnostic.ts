export type DiagnosticSeverity = "info" | "warning" | "error"

/**
 * Structured message describing validation issues or lossy conversion
 * fallbacks.
 */
export type Diagnostic = {
  severity: DiagnosticSeverity
  code: string
  path?: string
  message: string
  fallback?: string
}
