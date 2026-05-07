from __future__ import annotations

import re

INLINE_PUNCTUATION_RE = re.compile(r"[\\`*_{}\[\]|<>~]")


def escape_markdown_text(text: str, at_line_start: bool = False) -> str:
    """Escape Markdown punctuation in plain text."""

    escaped = INLINE_PUNCTUATION_RE.sub(lambda match: "\\" + match.group(0), text)
    escaped = escaped.replace("![", "\\![")

    if at_line_start:
        escaped = re.sub(r"^(#{1,6})(\s)", r"\\\1\2", escaped)
        escaped = re.sub(r"^([-+*])(\s)", r"\\\1\2", escaped)
        escaped = re.sub(r"^(\d{1,9})([.)])(\s)", r"\1\\\2\3", escaped)
        escaped = re.sub(r"^(-{3,}|\*{3,}|_{3,})$", r"\\\1", escaped)

    return escaped


def escape_link_destination(destination: str) -> str:
    """Escape characters that would terminate or split a Markdown link destination."""

    return re.sub(r"[\\()\s]", lambda match: "\\" + match.group(0), destination)


def escape_link_title(title: str) -> str:
    """Escape a Markdown link title for use inside double quotes."""

    return re.sub(r'["\\]', lambda match: "\\" + match.group(0), title)


def render_code_span(text: str) -> str:
    """Render text as a Markdown code span with a long enough backtick fence."""

    runs = re.findall(r"`+", text)
    fence = "`" * max([1, *(len(run) + 1 for run in runs)])
    needs_padding = text.startswith("`") or text.endswith("`") or "\n" in text
    value = f" {text} " if needs_padding else text
    return f"{fence}{value}{fence}"


def code_fence_for(text: str, preferred: str = "```") -> str:
    """Choose a fenced code block delimiter that cannot collide with the text."""

    runs = re.findall(r"`+", text)
    length = max([len(preferred), *(len(run) + 1 for run in runs)])
    return "`" * length
