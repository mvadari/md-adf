export type DiagnosticSeverity = "info" | "warning" | "error"

export type Diagnostic = {
  severity: DiagnosticSeverity
  code: string
  path?: string
  message: string
  fallback?: string
}
