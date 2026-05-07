const inlinePunctuation = /[\\`*_{}\[\]|<>~]/g

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

export function escapeLinkDestination(destination: string): string {
  return destination.replace(/[\\()\s]/g, "\\$&")
}

export function escapeLinkTitle(title: string): string {
  return title.replace(/["\\]/g, "\\$&")
}

export function renderCodeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? []
  const fence = "`".repeat(Math.max(1, ...runs.map((run) => run.length + 1)))
  const needsPadding =
    text.startsWith("`") || text.endsWith("`") || text.includes("\n")
  const value = needsPadding ? ` ${text} ` : text
  return `${fence}${value}${fence}`
}

export function codeFenceFor(text: string, preferred = "```"): string {
  const runs = text.match(/`+/g) ?? []
  const length = Math.max(
    preferred.length,
    ...runs.map((run) => run.length + 1),
  )
  return "`".repeat(length)
}
