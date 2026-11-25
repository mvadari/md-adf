from __future__ import annotations

import re

# Text after `<` that can start a URI autolink or HTML, or an email autolink.
HTML_OR_AUTOLINK_START_RE = re.compile(r"<(?:[A-Za-z/!?]|[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@)")
SPACE_CHARS = " \t\n\r\f"


def is_space(char: str | None) -> bool:
    """Check whether a character is Markdown whitespace."""

    return char is not None and char != "" and char in SPACE_CHARS


def _is_alnum(char: str | None) -> bool:
    return char is not None and char.isalnum()


def escape_markdown_text(
    text: str,
    at_line_start: bool = False,
    space_before: bool | None = None,
    space_after: bool = False,
    in_link_text: bool = False,
    char_before: str | None = None,
    char_after: str | None = None,
) -> str:
    """Escape Markdown punctuation only where an unescaped character could change the parse.

    `space_before` and `space_after` say whether the text edges touch whitespace
    or a line boundary. Unknown neighbors are treated as characters that could
    combine with the text to form Markdown syntax. `char_before` and
    `char_after` give the rendered characters next to the text when the caller
    knows them.
    """

    if space_before is None:
        space_before = at_line_start
    escapes: set[int] = set()
    length = len(text)

    def char_at(index: int) -> str | None:
        return text[index] if 0 <= index < length else None

    def space_at(char: str | None, edge_is_space: bool) -> bool:
        return edge_is_space if char is None else is_space(char)

    open_brackets: list[int] = []
    index = 0
    while index < length:
        char = text[index]
        if char in "\\`":
            escapes.add(index)
        elif char in "*~_":
            end = index
            while char_at(end + 1) == char:
                end += 1
            previous = char_at(index - 1)
            following = char_at(end + 1)
            if char == "_":
                inert = _is_alnum(previous) and _is_alnum(following)
            else:
                inert = space_at(previous, space_before) and space_at(following, space_after)
            if not inert:
                escapes.update(range(index, end + 1))
            index = end
        elif char == "[":
            if in_link_text or char_at(index + 1) == "^":
                escapes.add(index)
            open_brackets.append(index)
        elif char == "]":
            opener = open_brackets.pop() if open_brackets else None
            following = char_after if index == length - 1 else char_at(index + 1)
            # Without an opener in this text, a `[` in an earlier node may start
            # the line, so `]:` is treated as a possible definition.
            definition = following == ":" and (
                opener is None or _starts_definition(text, opener, char_before)
            )
            # Mistune reads an escaped backtick inside `[...]` as a code span start.
            backtick_inside = "`" in text[opener or 0 : index]
            if (
                in_link_text
                or following in ("(", "[")
                or definition
                or backtick_inside
                or (following is None and not space_after)
            ):
                escapes.add(index)
                if opener is not None:
                    escapes.add(opener)
        elif char == "<":
            if (
                not space_after
                if index == length - 1
                else HTML_OR_AUTOLINK_START_RE.match(text, index) is not None
            ):
                escapes.add(index)
        elif char == "!":
            # A following link mark or text node could start with `[`.
            if index == length - 1 and not space_after:
                escapes.add(index)
        index += 1

    # An unclosed `[` can pair with a `]` in a later node.
    escapes.update(opener for opener in open_brackets if "`" in text[opener:])

    line_start = 0
    for line in text.split("\n"):
        if line_start > 0 or at_line_start:
            escapes.update(line_start + offset for offset in _line_start_escapes(line))
        line_start += len(line) + 1

    return "".join(
        f"\\{text[index]}" if index in escapes else text[index] for index in range(length)
    )


def _starts_definition(text: str, opener: int, char_before: str | None) -> bool:
    """Check whether `[label]:` at `opener` would form a reference definition."""

    line_start = text.rfind("\n", 0, opener) + 1
    if line_start == 0 and char_before is not None and char_before != "\n":
        return False
    return re.fullmatch(r" {0,3}", text[line_start:opener]) is not None


def _line_start_escapes(line: str) -> list[int]:
    """Return offsets in one line that need escapes so it cannot start a block."""

    if re.match(r"#{1,6}(\s|$)", line) or re.match(r"[-+*](\s|$)", line):
        return [0]
    ordered = re.match(r"\d{1,9}([.)])(\s|$)", line)
    if ordered:
        return [ordered.start(1)]
    if re.fullmatch(r"([-*_])(?:[ \t]*\1){2,}[ \t]*", line):
        return [0]
    # A setext underline after a hard break would turn the line into a heading.
    setext = re.fullmatch(r"( {0,3})(=+|-+)[ \t]*", line)
    if setext:
        return [len(setext.group(1))]
    # `[ ]` or `[x]` at the start of a list item would make a task item.
    if re.match(r"\[[ xX]\](\s|$)", line):
        return [0]
    quote_or_fence = re.match(r" {0,3}(>|~~~)", line)
    if quote_or_fence:
        return [quote_or_fence.start(1)]
    # A GFM table delimiter row after a hard break would turn the paragraph
    # into a table.
    if re.fullmatch(r"[ \t|:-]*", line) and "-" in line:
        return [match.start() for match in re.finditer(r"[|:]", line)]
    return []


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
