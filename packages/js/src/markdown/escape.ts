/**
 * Describes where escaped text sits in the rendered Markdown. The defaults are
 * conservative: unknown neighbors are treated as characters that could combine
 * with the text to form Markdown syntax.
 */
export interface EscapeContext {
  /** The text starts a Markdown line, so block syntax guards apply. */
  atLineStart?: boolean
  /** The character before the text is whitespace or a line start. */
  spaceBefore?: boolean
  /** The character after the text is whitespace or a line end. */
  spaceAfter?: boolean
  /** The text is inside Markdown link text, so all brackets are escaped. */
  inLinkText?: boolean
}

export const isSpace = (char: string | undefined): boolean =>
  char !== undefined && /[ \t\n\r\f]/.test(char)
const isAlnum = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}]/u.test(char)
// Text after `<` that can start a URI autolink or HTML, or an email autolink.
const htmlOrAutolinkStart =
  /^<(?:[A-Za-z/!?]|[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@)/

/**
 * Escapes Markdown punctuation in plain text only where an unescaped character
 * could change the parse.
 */
export function escapeMarkdownText(
  text: string,
  context: EscapeContext = {},
): string {
  const {
    atLineStart = false,
    spaceBefore = atLineStart,
    spaceAfter = false,
    inLinkText = false,
  } = context
  const escapes = new Set<number>()
  // `undefined` marks the start or end of the text; `spaceBefore` and
  // `spaceAfter` say whether that edge counts as whitespace.
  const before = (index: number): string | undefined => text[index - 1]
  const after = (index: number): string | undefined => text[index + 1]
  const spaceAt = (char: string | undefined, edgeIsSpace: boolean): boolean =>
    char === undefined ? edgeIsSpace : isSpace(char)

  const openBrackets: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!
    if (char === "\\" || char === "`") {
      escapes.add(index)
    } else if (char === "*" || char === "~" || char === "_") {
      let end = index
      while (text[end + 1] === char) end += 1
      const previous = before(index)
      const next = after(end)
      const inert =
        char === "_"
          ? isAlnum(previous) && isAlnum(next)
          : spaceAt(previous, spaceBefore) && spaceAt(next, spaceAfter)
      if (!inert) {
        for (let runIndex = index; runIndex <= end; runIndex += 1) {
          escapes.add(runIndex)
        }
      }
      index = end
    } else if (char === "[") {
      if (inLinkText || after(index) === "^") escapes.add(index)
      openBrackets.push(index)
    } else if (char === "]") {
      const opener = openBrackets.pop()
      const next = after(index)
      // Without an opener in this text, a `[` in an earlier node may start
      // the line, so `]:` is treated as a possible definition.
      const definition =
        next === ":" && (opener === undefined || startsDefinition(text, opener))
      // Mistune reads an escaped backtick inside `[...]` as a code span start.
      const backtickInside = text.slice(opener ?? 0, index).includes("`")
      if (
        inLinkText ||
        next === "(" ||
        next === "[" ||
        definition ||
        backtickInside ||
        (next === undefined && !spaceAfter)
      ) {
        escapes.add(index)
        if (opener !== undefined) escapes.add(opener)
      }
    } else if (char === "<") {
      const next = after(index)
      if (
        next === undefined
          ? !spaceAfter
          : htmlOrAutolinkStart.test(text.slice(index))
      ) {
        escapes.add(index)
      }
    } else if (char === "!") {
      // A following link mark or text node could start with `[`.
      if (index === text.length - 1 && !spaceAfter) escapes.add(index)
    }
  }

  // An unclosed `[` can pair with a `]` in a later node.
  for (const opener of openBrackets) {
    if (text.slice(opener).includes("`")) escapes.add(opener)
  }

  let lineStart = 0
  for (const line of text.split("\n")) {
    if (lineStart > 0 || atLineStart) {
      for (const offset of lineStartEscapes(line)) {
        escapes.add(lineStart + offset)
      }
    }
    lineStart += line.length + 1
  }

  let escaped = ""
  for (let index = 0; index < text.length; index += 1) {
    escaped += escapes.has(index) ? `\\${text[index]}` : text[index]
  }
  return escaped
}

/**
 * Checks whether the `[` at `opener` is the first character on its line, after
 * up to three spaces, so that `[label]:` would form a reference definition.
 */
function startsDefinition(text: string, opener: number): boolean {
  const lineStart = text.lastIndexOf("\n", opener - 1) + 1
  return /^ {0,3}$/.test(text.slice(lineStart, opener))
}

/**
 * Returns the offsets in one line that need escapes so that the line cannot
 * start a block construct.
 */
function lineStartEscapes(line: string): number[] {
  if (/^#{1,6}(\s|$)/.test(line)) return [0]
  if (/^[-+*](\s|$)/.test(line)) return [0]
  const ordered = /^\d{1,9}[.)](\s|$)/.exec(line)
  if (ordered) return [ordered[0].search(/[.)]/)]
  if (/^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) return [0]
  // A setext underline after a hard break would turn the line into a heading.
  const setext = /^( {0,3})(=+|-+)[ \t]*$/.exec(line)
  if (setext) return [setext[1]!.length]
  // `[ ]` or `[x]` at the start of a list item would make a task item.
  if (/^\[[ xX]\](\s|$)/.test(line)) return [0]
  const quoteOrFence = /^ {0,3}(>|~~~)/.exec(line)
  if (quoteOrFence) return [quoteOrFence[0].length - quoteOrFence[1]!.length]
  // A GFM table delimiter row after a hard break would turn the paragraph
  // into a table.
  if (/^[ \t|:-]*$/.test(line) && line.includes("-")) {
    return [...line.matchAll(/[|:]/g)].map((match) => match.index!)
  }
  return []
}

/**
 * Escapes characters that would otherwise terminate or split a Markdown link
 * destination.
 */
export function escapeLinkDestination(destination: string): string {
  return destination.replace(/[\\()\s]/g, "\\$&")
}

/**
 * Escapes a Markdown link title for use inside double quotes.
 */
export function escapeLinkTitle(title: string): string {
  return title.replace(/["\\]/g, "\\$&")
}

/**
 * Renders text as a Markdown code span using a fence long enough to contain any
 * backticks inside the text.
 */
export function renderCodeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? []
  const fence = "`".repeat(Math.max(1, ...runs.map((run) => run.length + 1)))
  const needsPadding =
    text.startsWith("`") || text.endsWith("`") || text.includes("\n")
  const value = needsPadding ? ` ${text} ` : text
  return `${fence}${value}${fence}`
}

/**
 * Chooses a fenced code block delimiter that is longer than any backtick run in
 * the code content.
 */
export function codeFenceFor(text: string, preferred = "```"): string {
  const runs = text.match(/`+/g) ?? []
  const length = Math.max(
    preferred.length,
    ...runs.map((run) => run.length + 1),
  )
  return "`".repeat(length)
}
