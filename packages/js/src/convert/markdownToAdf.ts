import { unified } from "unified"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"

import type { AdfDocument, AdfNode } from "../adf/types.js"
import type { Diagnostic } from "../diagnostics/diagnostic.js"
import {
  resolveConversionOptions,
  type ConversionOptions,
  type ConversionResult,
} from "../options.js"

type MarkdownNode = {
  type: string
  children?: MarkdownNode[]
  value?: string
  depth?: number
  ordered?: boolean
  start?: number | null
  lang?: string | null
  url?: string
  title?: string | null
  alt?: string | null
  checked?: boolean | null
  align?: Array<string | null>
}

const markdownParser = unified().use(remarkParse).use(remarkGfm)

/**
 * Converts Markdown text into an ADF document and reports any lossy fallback
 * decisions made during conversion.
 */
export function markdownToAdf(
  markdown: string,
  options: ConversionOptions = {},
): ConversionResult<AdfDocument> {
  resolveConversionOptions(options)
  const diagnostics: Diagnostic[] = []
  const tree = markdownParser.parse(markdown.replace(/\r\n?/g, "\n"))
  const content = blockChildren(
    (tree as MarkdownNode).children ?? [],
    diagnostics,
    "/content",
  )

  return {
    value: {
      version: 1,
      type: "doc",
      content,
    },
    diagnostics,
  }
}

/**
 * Converts a list of Markdown block nodes into ADF block nodes.
 */
function blockChildren(
  nodes: MarkdownNode[],
  diagnostics: Diagnostic[],
  path: string,
): AdfNode[] {
  const output: AdfNode[] = []
  for (let index = 0; index < nodes.length; index += 1) {
    const details = detailsBlock(nodes, index, diagnostics, path)
    if (details) {
      output.push(...details.nodes)
      index += details.consumed - 1
      continue
    }
    output.push(...blockNode(nodes[index]!, diagnostics, `${path}/${index}`))
  }
  return output
}

/**
 * Converts a simple Markdown raw-HTML <details>/<summary> sequence into ADF
 * expand, or consumes it as readable fallback with a stable diagnostic.
 */
function detailsBlock(
  nodes: MarkdownNode[],
  index: number,
  diagnostics: Diagnostic[],
  path: string,
): { nodes: AdfNode[]; consumed: number } | undefined {
  const opening = nodes[index]
  const openingRaw = htmlRaw(opening)
  if (!openingRaw || !isDetailsOpening(openingRaw)) return undefined

  const nodePath = `${path}/${index}`
  const closingIndex = nodes.findIndex(
    (node, candidateIndex) =>
      candidateIndex > index && isDetailsClosing(htmlRaw(node) ?? ""),
  )
  if (closingIndex === -1) {
    warnDetailsFallback(diagnostics, nodePath)
    return undefined
  }

  const summary = summaryTitle(openingRaw)
  const innerNodes = nodes.slice(index + 1, closingIndex)
  const fallback = (): { nodes: AdfNode[]; consumed: number } => ({
    nodes: [
      ...paragraphFromText(openingRaw.trim()),
      ...blockChildren(innerNodes, diagnostics, `${nodePath}/content`),
      ...paragraphFromText((htmlRaw(nodes[closingIndex]) ?? "").trim()),
    ],
    consumed: closingIndex - index + 1,
  })

  if (
    path !== "/content" ||
    summary === undefined ||
    innerNodes.length === 0 ||
    innerNodes.some((node) => isDetailsBoundary(htmlRaw(node) ?? ""))
  ) {
    warnDetailsFallback(diagnostics, nodePath)
    return fallback()
  }

  const content = blockChildren(innerNodes, diagnostics, `${nodePath}/content`)
  if (content.length === 0) {
    warnDetailsFallback(diagnostics, nodePath)
    return fallback()
  }

  return {
    nodes: [
      {
        type: "expand",
        attrs: { title: summary },
        content,
      },
    ],
    consumed: closingIndex - index + 1,
  }
}

/**
 * Converts one Markdown block node, returning zero or more ADF blocks when a
 * fallback produces or omits content.
 */
function blockNode(
  node: MarkdownNode,
  diagnostics: Diagnostic[],
  path: string,
): AdfNode[] {
  switch (node.type) {
    case "paragraph":
      return [
        {
          type: "paragraph",
          content: inlineChildren(node.children ?? [], diagnostics),
        },
      ]
    case "heading":
      return [
        {
          type: "heading",
          attrs: { level: Math.min(6, Math.max(1, node.depth ?? 1)) },
          content: inlineChildren(node.children ?? [], diagnostics),
        },
      ]
    case "thematicBreak":
      return [{ type: "rule" }]
    case "blockquote":
      return [
        {
          type: "blockquote",
          content: blockChildren(
            node.children ?? [],
            diagnostics,
            `${path}/content`,
          ),
        },
      ]
    case "list":
      return [listNode(node, diagnostics, path)]
    case "code":
      return [codeBlockNode(node)]
    case "table":
      return [tableNode(node, diagnostics, path)]
    case "html":
      return paragraphFromText(node.value ?? "")
    default:
      return textFallbackBlock(node)
  }
}

/**
 * Converts Markdown ordered, bullet, and task-list nodes into their closest ADF
 * list representation.
 */
function listNode(
  node: MarkdownNode,
  diagnostics: Diagnostic[],
  path: string,
): AdfNode {
  const children = (node.children ?? []).filter(
    (child) => child.type === "listItem",
  )
  if (
    !node.ordered &&
    children.length > 0 &&
    children.every((child) => typeof child.checked === "boolean")
  ) {
    const taskList = taskListNode(children, diagnostics, path)
    if (taskList) return taskList
  }
  if (children.some((child) => typeof child.checked === "boolean")) {
    diagnostics.push({
      severity: "warning",
      code: "TaskListFallback",
      path,
      message:
        "Mixed or complex GFM task list items were converted to bullet list items.",
      fallback: "bulletList",
    })
  }

  const list: AdfNode = {
    type: node.ordered ? "orderedList" : "bulletList",
    content: children.map((child, index) =>
      listItemNode(child, diagnostics, `${path}/content/${index}`),
    ),
  }
  if (node.ordered && node.start && node.start !== 1) {
    list.attrs = { order: node.start }
  }
  return list
}

/**
 * Converts a simple GFM task list into an ADF taskList, or signals fallback
 * when any item is too complex.
 */
function taskListNode(
  children: MarkdownNode[],
  diagnostics: Diagnostic[],
  path: string,
): AdfNode | undefined {
  const items = children.map((child, index) =>
    taskItemNode(child, diagnostics, `${path}/content/${index}`),
  )
  if (items.some((item) => item === undefined)) {
    diagnostics.push({
      severity: "warning",
      code: "TaskListFallback",
      path,
      message:
        "Complex GFM task list items were converted to bullet list items.",
      fallback: "bulletList",
    })
    return undefined
  }

  const localId = localIdFromPath("task-list", path)
  return {
    type: "taskList",
    attrs: { localId },
    content: items as AdfNode[],
  }
}

/**
 * Converts one simple Markdown task item into an ADF taskItem.
 */
function taskItemNode(
  node: MarkdownNode,
  diagnostics: Diagnostic[],
  path: string,
): AdfNode | undefined {
  const children = node.children ?? []
  if (children.length !== 1 || children[0]?.type !== "paragraph") {
    return undefined
  }
  return {
    type: "taskItem",
    attrs: {
      localId: localIdFromPath("task-item", path),
      state: node.checked === true ? "DONE" : "TODO",
    },
    content: inlineChildren(children[0].children ?? [], diagnostics),
  }
}

/**
 * Converts a Markdown list item and preserves task state as visible text when
 * the item cannot remain an ADF task item.
 */
function listItemNode(
  node: MarkdownNode,
  diagnostics: Diagnostic[],
  path: string,
): AdfNode {
  const content = blockChildren(
    node.children ?? [],
    diagnostics,
    `${path}/content`,
  )
  if (typeof node.checked === "boolean") {
    prependTaskFallbackMarker(content, node.checked === true)
  }
  return { type: "listItem", content }
}

/**
 * Inserts a checked/unchecked marker into fallback list item content.
 */
function prependTaskFallbackMarker(content: AdfNode[], checked: boolean): void {
  const marker = checked ? "[x] " : "[ ] "
  if (content[0]?.type !== "paragraph") {
    content.unshift({
      type: "paragraph",
      content: [{ type: "text", text: marker }],
    })
    return
  }
  content[0].content = [
    { type: "text", text: marker },
    ...(content[0].content ?? []),
  ]
}

/**
 * Converts a Markdown fenced or indented code block into an ADF codeBlock.
 */
function codeBlockNode(node: MarkdownNode): AdfNode {
  const codeBlock: AdfNode = {
    type: "codeBlock",
    content: [{ type: "text", text: node.value ?? "" }],
  }
  if (node.lang) codeBlock.attrs = { language: node.lang }
  return codeBlock
}

/**
 * Converts a GFM table into an ADF table and records dropped alignment hints.
 */
function tableNode(
  node: MarkdownNode,
  diagnostics: Diagnostic[],
  path: string,
): AdfNode {
  const rows = node.children ?? []
  const table: AdfNode = {
    type: "table",
    content: rows.map((row, rowIndex) => ({
      type: "tableRow",
      content: (row.children ?? []).map((cell) => ({
        type: rowIndex === 0 ? "tableHeader" : "tableCell",
        content: [
          {
            type: "paragraph",
            content: inlineChildren(cell.children ?? [], diagnostics),
          },
        ],
      })),
    })),
  }
  if (node.align && node.align.some((align) => align !== null)) {
    diagnostics.push({
      severity: "warning",
      code: "UnsupportedTableAlignment",
      path,
      message:
        "Markdown table column alignment is not representable in ADF and was omitted.",
      fallback: "omit",
    })
  }
  return table
}

/**
 * Falls an unsupported Markdown block back to a paragraph of plain text.
 */
function textFallbackBlock(node: MarkdownNode): AdfNode[] {
  const text = plainText(node)
  return text.length > 0 ? paragraphFromText(text) : []
}

/**
 * Returns the raw HTML text for a Markdown HTML block or inline node.
 */
function htmlRaw(node: MarkdownNode | undefined): string | undefined {
  if (!node || node.type !== "html") return undefined
  return node.value ?? ""
}

/**
 * Reports that a Markdown details block stayed as readable fallback content.
 */
function warnDetailsFallback(diagnostics: Diagnostic[], path: string): void {
  diagnostics.push({
    severity: "warning",
    code: "MarkdownDetailsFallback",
    path,
    message:
      "Markdown details block could not be converted to ADF expand and was preserved as readable fallback.",
    fallback: "text",
  })
}

/**
 * Detects raw HTML details boundaries without enabling general HTML parsing.
 */
function isDetailsBoundary(raw: string): boolean {
  return isDetailsOpening(raw) || isDetailsClosing(raw)
}

function isDetailsOpening(raw: string): boolean {
  return /^<details(?:\s[^>]*)?>/i.test(raw.trim())
}

function isDetailsClosing(raw: string): boolean {
  return /^<\/details>\s*$/i.test(raw.trim())
}

/**
 * Extracts the summary title from the simple supported opening forms.
 */
function summaryTitle(raw: string): string | undefined {
  const match = raw
    .trim()
    .match(/^<details>\s*<summary>([\s\S]*?)<\/summary>\s*$/i)
  if (!match) return undefined
  const title = match[1] ?? ""
  if (/[<>]/.test(title)) return undefined
  const decoded = decodeHtmlText(title).trim()
  return decoded.length > 0 ? decoded : undefined
}

/**
 * Decodes the small set of HTML entities expected in raw summary text.
 */
function decodeHtmlText(text: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  }
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, body: string) => {
      const lower = body.toLowerCase()
      if (lower.startsWith("#x")) {
        return codePointEntity(entity, Number.parseInt(lower.slice(2), 16))
      }
      if (lower.startsWith("#")) {
        return codePointEntity(entity, Number.parseInt(lower.slice(1), 10))
      }
      return namedEntities[lower] ?? entity
    },
  )
}

function codePointEntity(entity: string, codePoint: number): string {
  if (!Number.isFinite(codePoint)) return entity
  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return entity
  }
}

/**
 * Builds a paragraph containing a single text node, omitting empty text.
 */
function paragraphFromText(text: string): AdfNode[] {
  return text.length > 0
    ? [{ type: "paragraph", content: [{ type: "text", text }] }]
    : []
}

/**
 * Converts Markdown inline children into ADF inline nodes under the provided
 * inherited marks.
 */
function inlineChildren(
  nodes: MarkdownNode[],
  diagnostics: Diagnostic[],
  marks: Array<Record<string, unknown>> = [],
): AdfNode[] {
  const output: AdfNode[] = []
  for (const node of nodes) {
    for (const child of inlineNode(node, marks, diagnostics)) {
      appendInline(output, child)
    }
  }
  return output
}

/**
 * Converts a single Markdown inline node into one or more ADF inline nodes.
 */
function inlineNode(
  node: MarkdownNode,
  marks: Array<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): AdfNode[] {
  switch (node.type) {
    case "text":
      return textNode((node.value ?? "").replace(/\n/g, " "), marks)
    case "emphasis":
      return inlineChildren(node.children ?? [], diagnostics, [
        ...marks,
        { type: "em" },
      ])
    case "strong":
      return inlineChildren(node.children ?? [], diagnostics, [
        ...marks,
        { type: "strong" },
      ])
    case "delete":
      return inlineChildren(node.children ?? [], diagnostics, [
        ...marks,
        { type: "strike" },
      ])
    case "inlineCode":
      return textNode(node.value ?? "", codeMarks(marks, diagnostics))
    case "link": {
      const attrs: Record<string, unknown> = { href: node.url ?? "" }
      if (node.title) attrs.title = node.title
      return inlineChildren(node.children ?? [], diagnostics, [
        ...marks,
        { type: "link", attrs },
      ])
    }
    case "break":
      return [{ type: "hardBreak" }]
    case "image": {
      const attrs: Record<string, unknown> = { href: node.url ?? "" }
      if (node.title) attrs.title = node.title
      const label = node.alt || node.url || ""
      const imageMarks = marks.some((mark) => mark.type === "link")
        ? marks
        : [...marks, { type: "link", attrs }]
      diagnostics.push({
        severity: "warning",
        code: "MarkdownImageLinkFallback",
        message: "Markdown image was converted to linked text fallback.",
        fallback: "link",
      })
      return textNode(label, imageMarks)
    }
    case "html":
      return textNode(node.value ?? "", marks)
    default:
      return textNode(plainText(node), marks)
  }
}

/**
 * Creates an ADF text node with optional marks, omitting empty strings.
 */
function textNode(
  text: string,
  marks: Array<Record<string, unknown>>,
): AdfNode[] {
  if (text.length === 0) return []
  const node: AdfNode = { type: "text", text }
  if (marks.length > 0) node.marks = marks
  return [node]
}

/**
 * Keeps only marks that can legally wrap ADF code text and reports dropped
 * formatting.
 */
function codeMarks(
  marks: Array<Record<string, unknown>>,
  diagnostics: Diagnostic[],
): Array<Record<string, unknown>> {
  const compatibleMarks = marks.filter((mark) => mark.type === "link")
  if (compatibleMarks.length !== marks.length) {
    diagnostics.push({
      severity: "warning",
      code: "CodeMarkDropsOtherMarks",
      message:
        "ADF code text cannot contain non-code formatting marks; non-code marks were ignored.",
      fallback: "drop-marks",
    })
  }
  return [...compatibleMarks, { type: "code" }]
}

/**
 * Appends an inline node, merging adjacent text nodes that have identical marks.
 */
function appendInline(nodes: AdfNode[], node: AdfNode): void {
  const previous = nodes[nodes.length - 1]
  if (
    node.type === "text" &&
    previous?.type === "text" &&
    previous.text !== undefined &&
    node.text !== undefined &&
    JSON.stringify(previous.marks ?? []) === JSON.stringify(node.marks ?? [])
  ) {
    previous.text += node.text
    return
  }
  nodes.push(node)
}

/**
 * Extracts human-readable text from a Markdown node tree.
 */
function plainText(node: MarkdownNode): string {
  if (typeof node.value === "string") return node.value
  return (node.children ?? []).map((child) => plainText(child)).join("")
}

/**
 * Creates a deterministic ADF localId from the Markdown node path.
 */
function localIdFromPath(prefix: string, path: string): string {
  const suffix = path.replace(/^\/+/, "").replace(/[^A-Za-z0-9_-]+/g, "-")
  return `${prefix}-${suffix || "root"}`
}
