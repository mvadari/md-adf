const inlinePunctuation = /[\\`*_{}\[\]|<>~]/g

/**
 * Escapes Markdown punctuation in plain text, with extra guards for constructs
 * that are only special at the start of a line.
 */
export function escapeMarkdownText(text: string, atLineStart = false): string {
  let escaped = text.replace(inlinePunctuation, "\\$&").replace(/!\[/g, "\\![")

  if (atLineStart) {
    escaped = escaped
      .replace(/^(#{1,6})(\s)/, "\\$1$2")
      .replace(/^([-+*])(\s)/, "\\$1$2")
      .replace(/^(\d{1,9})([.)])(\s)/, "$1\\$2$3")
      .replace(/^(-{3,}|\*{3,}|_{3,})$/, "\\$1")
  }

  return escaped
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
