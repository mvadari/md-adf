export type AdfNode = {
  type: string
  attrs?: Record<string, unknown>
  marks?: Array<Record<string, unknown>>
  content?: AdfNode[]
  text?: string
}

export type AdfDocument = {
  version: 1
  type: "doc"
  content: AdfNode[]
}
