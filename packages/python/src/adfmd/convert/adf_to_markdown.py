from __future__ import annotations

import re
from typing import Any

from ..adf.types import AdfNode
from ..adf.validate import parse_adf
from ..diagnostics.diagnostic import Diagnostic
from ..markdown.escape import (
    code_fence_for,
    escape_link_destination,
    escape_link_title,
    escape_markdown_text,
    render_code_span,
)
from ..options import ConversionOptionsInput, ConversionResult, resolve_conversion_options

SUPPORTED_NODES = {
    "paragraph",
    "heading",
    "blockquote",
    "bulletList",
    "orderedList",
    "listItem",
    "codeBlock",
    "rule",
    "table",
    "taskList",
    "mediaGroup",
    "mediaSingle",
    "media",
    "text",
    "hardBreak",
}
MARK_ORDER = ("link", "strong", "em", "strike")
SUPPORTED_MARKS = {"strong", "em", "strike", "code", "link"}


def adf_to_markdown(
    adf: Any, options: ConversionOptionsInput = None
) -> ConversionResult[str]:
    resolved_options = resolve_conversion_options(options)
    diagnostics: list[Diagnostic] = []

    try:
        document = parse_adf(adf, resolved_options)
    except ValueError as exc:
        diagnostics.append(
            Diagnostic(
                severity="error",
                code="InvalidAdfRoot",
                path="",
                message=str(exc),
            )
        )
        return ConversionResult(value="", diagnostics=diagnostics)

    return ConversionResult(
        value=render_blocks(document.get("content", []), diagnostics, "/content").rstrip(),
        diagnostics=diagnostics,
    )


def render_blocks(
    nodes: list[AdfNode], diagnostics: list[Diagnostic], path: str
) -> str:
    blocks = [
        render_block(node, diagnostics, f"{path}/{index}")
        for index, node in enumerate(nodes)
    ]
    return "\n\n".join(block for block in blocks if len(block) > 0)


def render_block(node: AdfNode, diagnostics: list[Diagnostic], path: str) -> str:
    node_type = node.get("type")
    if node_type not in SUPPORTED_NODES:
        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="UnsupportedNode",
                path=path,
                message=f"Unsupported ADF node '{node_type}' was omitted.",
            )
        )
        return ""

    if node_type == "paragraph":
        return render_inline_content(node.get("content", []), diagnostics, f"{path}/content")

    if node_type == "heading":
        raw_level = _to_number(_attrs(node).get("level", 1), 1)
        level = min(6, max(1, int(raw_level)))
        content = render_inline_content(node.get("content", []), diagnostics, f"{path}/content")
        return f"{'#' * level} {content}"

    if node_type == "blockquote":
        return prefix_lines(
            render_blocks(node.get("content", []), diagnostics, f"{path}/content"),
            "> ",
        )

    if node_type == "bulletList":
        return render_list(node, diagnostics, path, ordered=False)

    if node_type == "orderedList":
        return render_list(node, diagnostics, path, ordered=True)

    if node_type == "listItem":
        return render_blocks(node.get("content", []), diagnostics, f"{path}/content")

    if node_type == "codeBlock":
        text = collect_plain_text(node.get("content", []), diagnostics, f"{path}/content")
        language_value = _attrs(node).get("language")
        language = language_value if isinstance(language_value, str) else ""
        fence = code_fence_for(text)
        code_text = text.removesuffix("\n")
        return f"{fence}{language}\n{code_text}\n{fence}"

    if node_type == "rule":
        return "---"

    if node_type == "table":
        return render_table(node, diagnostics, path)

    if node_type == "taskList":
        return render_task_list(node, diagnostics, path)

    if node_type == "mediaGroup":
        return render_media_group(node, diagnostics, path)

    if node_type == "mediaSingle":
        return render_media_single(node, diagnostics, path)

    if node_type == "media":
        return render_media(node, diagnostics, path)

    diagnostics.append(
        Diagnostic(
            severity="warning",
            code="InvalidContainer",
            path=path,
            message=f"ADF node '{node_type}' cannot be rendered as a block.",
        )
    )
    return ""


def render_table(node: AdfNode, diagnostics: list[Diagnostic], path: str) -> str:
    rows = node.get("content", [])

    def unsupported(message: str, detail_path: str = path) -> str:
        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="UnsupportedComplexTable",
                path=detail_path,
                message=message,
                fallback="omit",
            )
        )
        return ""

    if not rows:
        return unsupported("ADF table without rows was omitted.")
    if any(row.get("type") != "tableRow" for row in rows):
        return unsupported("ADF table contains non-row children and was omitted.")

    width = len(rows[0].get("content", []))
    if width == 0:
        return unsupported("ADF table without cells was omitted.")
    if any(len(row.get("content", [])) != width for row in rows):
        return unsupported("Non-rectangular ADF table was omitted.")

    rendered_rows: list[list[str]] = []
    for row_index, row in enumerate(rows):
        cells = row.get("content", [])
        if row_index == 0 and any(cell.get("type") != "tableHeader" for cell in cells):
            return unsupported("ADF table first row cannot be used as a GFM header row.")

        rendered_cells: list[str] = []
        for cell_index, cell in enumerate(cells):
            cell_path = f"{path}/content/{row_index}/content/{cell_index}"
            if cell.get("type") not in {"tableHeader", "tableCell"}:
                return unsupported("ADF table contains non-cell children and was omitted.", cell_path)

            attrs = _attrs(cell)
            if (
                ("rowspan" in attrs and attrs.get("rowspan") != 1)
                or ("colspan" in attrs and attrs.get("colspan") != 1)
            ):
                return unsupported("ADF table with row or column spans was omitted.", cell_path)

            cell_content = cell.get("content", [])
            if len(cell_content) > 1 or (
                len(cell_content) == 1 and cell_content[0].get("type") != "paragraph"
            ):
                return unsupported("ADF table cell with block content was omitted.", cell_path)

            inline_content = cell_content[0].get("content", []) if cell_content else []
            if any(inline.get("type") != "text" for inline in inline_content):
                return unsupported(
                    "ADF table cell with unsupported inline content was omitted.",
                    cell_path,
                )

            rendered_cells.append(
                escape_table_cell_markdown(
                    render_inline_content(
                        inline_content,
                        diagnostics,
                        f"{cell_path}/content/0/content",
                    )
                )
            )
        rendered_rows.append(rendered_cells)

    header = render_table_row(rendered_rows[0])
    separator = render_table_row(["---"] * width)
    body = [render_table_row(row) for row in rendered_rows[1:]]
    return "\n".join([header, separator, *body])


def render_table_row(cells: list[str]) -> str:
    return f"| {' | '.join(cells)} |"


def escape_table_cell_markdown(markdown: str) -> str:
    return re.sub(r"(^|[^\\])\|", r"\1\\|", markdown.replace("\n", " "))


def render_task_list(node: AdfNode, diagnostics: list[Diagnostic], path: str) -> str:
    items: list[str] = []
    for index, item in enumerate(node.get("content", [])):
        item_type = item.get("type")
        if item_type not in {"taskItem", "blockTaskItem"}:
            diagnostics.append(
                Diagnostic(
                    severity="warning",
                    code="UnsupportedTaskListItem",
                    path=f"{path}/content/{index}",
                    message=f"Unsupported task list child '{item_type}' was omitted.",
                    fallback="omit",
                )
            )
            continue

        state = "x" if _attrs(item).get("state") == "DONE" else " "
        content = (
            render_blocks(item.get("content", []), diagnostics, f"{path}/content/{index}/content")
            if item_type == "blockTaskItem"
            else render_inline_content(
                item.get("content", []), diagnostics, f"{path}/content/{index}/content"
            )
        )
        items.append(f"- [{state}] {indent_list_continuation(content)}")
    return "\n".join(item for item in items if len(item) > 0)


def render_media_group(node: AdfNode, diagnostics: list[Diagnostic], path: str) -> str:
    return "\n\n".join(
        block
        for block in (
            render_media(child, diagnostics, f"{path}/content/{index}")
            for index, child in enumerate(node.get("content", []))
        )
        if len(block) > 0
    )


def render_media_single(node: AdfNode, diagnostics: list[Diagnostic], path: str) -> str:
    media = next((child for child in node.get("content", []) if child.get("type") == "media"), None)
    if media is None:
        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="UnsupportedMedia",
                path=path,
                message="ADF mediaSingle without media content was omitted.",
                fallback="omit",
            )
        )
        return ""
    return render_media(media, diagnostics, f"{path}/content/0")


def render_media(node: AdfNode, diagnostics: list[Diagnostic], path: str) -> str:
    attrs = _attrs(node)
    url = attrs.get("url") if attrs.get("type") == "external" else link_mark_href(node.get("marks", []))
    label = (
        attrs.get("alt")
        if isinstance(attrs.get("alt"), str) and attrs.get("alt")
        else url
        if isinstance(url, str) and url
        else attrs.get("id")
        if isinstance(attrs.get("id"), str) and attrs.get("id")
        else "media"
    )

    if isinstance(url, str) and url:
        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="UnsupportedMedia",
                path=path,
                message="ADF media was rendered as a Markdown link fallback.",
                fallback="link",
            )
        )
        return f"[{escape_markdown_text(str(label))}]({escape_link_destination(url)})"

    diagnostics.append(
        Diagnostic(
            severity="warning",
            code="UnsupportedMedia",
            path=path,
            message="ADF media without a resolvable URL was rendered as text.",
            fallback="text",
        )
    )
    return escape_markdown_text(str(label))


def link_mark_href(marks: list[dict[str, Any]]) -> str | None:
    link = next((mark for mark in marks if mark.get("type") == "link"), None)
    attrs = link.get("attrs") if isinstance(link, dict) else None
    href = attrs.get("href") if isinstance(attrs, dict) else None
    return href if isinstance(href, str) else None


def render_list(
    node: AdfNode, diagnostics: list[Diagnostic], path: str, ordered: bool
) -> str:
    start = _to_number(_attrs(node).get("order", 1), 1)
    items: list[str] = []

    for index, item in enumerate(node.get("content", [])):
        if item.get("type") != "listItem":
            diagnostics.append(
                Diagnostic(
                    severity="warning",
                    code="InvalidContainer",
                    path=f"{path}/content/{index}",
                    message=(
                        f"Expected listItem inside {node.get('type')}; "
                        f"omitted '{item.get('type')}'."
                    ),
                )
            )
            continue

        marker = f"{int(start) + index}. " if ordered else "- "
        body = render_block(item, diagnostics, f"{path}/content/{index}")
        items.append(marker + indent_list_continuation(body))

    return "\n".join(item for item in items if len(item) > 0)


def indent_list_continuation(text: str) -> str:
    lines = text.split("\n")
    return "\n".join(line if index == 0 else f"  {line}" for index, line in enumerate(lines))


def prefix_lines(text: str, prefix: str) -> str:
    return "\n".join(
        prefix.rstrip() if len(line) == 0 else f"{prefix}{line}" for line in text.split("\n")
    )


def render_inline_content(
    nodes: list[AdfNode], diagnostics: list[Diagnostic], path: str
) -> str:
    return "".join(
        render_inline(node, diagnostics, f"{path}/{index}", index == 0)
        for index, node in enumerate(nodes)
    )


def render_inline(
    node: AdfNode, diagnostics: list[Diagnostic], path: str, at_line_start: bool
) -> str:
    node_type = node.get("type")
    if node_type == "text":
        return render_marked_text(
            node.get("text", ""),
            node.get("marks", []),
            diagnostics,
            path,
            at_line_start,
        )

    if node_type == "hardBreak":
        return "\\\n"

    diagnostics.append(
        Diagnostic(
            severity="warning",
            code="UnsupportedNode",
            path=path,
            message=f"Unsupported inline ADF node '{node_type}' was omitted.",
        )
    )
    return ""


def render_marked_text(
    text: str,
    marks: list[dict[str, Any]],
    diagnostics: list[Diagnostic],
    path: str,
    at_line_start: bool,
) -> str:
    known_marks: list[dict[str, Any]] = []
    for mark in marks:
        mark_type = mark.get("type")
        if isinstance(mark_type, str) and mark_type in SUPPORTED_MARKS:
            known_marks.append(mark)
            continue

        diagnostics.append(
            Diagnostic(
                severity="warning",
                code="UnsupportedMark",
                path=path,
                message=f"Unsupported ADF mark '{mark_type}' was ignored.",
            )
        )

    if any(mark.get("type") == "code" for mark in known_marks):
        if len(known_marks) > 1:
            diagnostics.append(
                Diagnostic(
                    severity="warning",
                    code="CodeMarkDropsOtherMarks",
                    path=path,
                    message=(
                        "Markdown code spans cannot contain nested marks; "
                        "non-code marks were ignored."
                    ),
                )
            )
        return render_code_span(text)

    rendered = escape_markdown_text(text, at_line_start)
    for mark_type in MARK_ORDER:
        current_mark = next(
            (candidate for candidate in known_marks if candidate.get("type") == mark_type),
            None,
        )
        if current_mark is None:
            continue

        if mark_type == "link":
            attrs = current_mark.get("attrs")
            href = attrs.get("href") if isinstance(attrs, dict) else ""
            if not isinstance(href, str) or not href:
                diagnostics.append(
                    Diagnostic(
                        severity="warning",
                        code="InvalidLinkMark",
                        path=path,
                        message="ADF link mark without href was rendered as plain text.",
                    )
                )
                continue

            title_value = attrs.get("title") if isinstance(attrs, dict) else None
            title = (
                f' "{escape_link_title(title_value)}"'
                if isinstance(title_value, str)
                else ""
            )
            rendered = f"[{rendered}]({escape_link_destination(href)}{title})"
        elif mark_type == "strong":
            rendered = f"**{rendered}**"
        elif mark_type == "em":
            rendered = f"*{rendered}*"
        elif mark_type == "strike":
            rendered = f"~~{rendered}~~"

    return rendered


def collect_plain_text(
    nodes: list[AdfNode], diagnostics: list[Diagnostic], path: str
) -> str:
    parts: list[str] = []
    for index, node in enumerate(nodes):
        node_type = node.get("type")
        if node_type == "text":
            parts.append(node.get("text", ""))
        elif node_type == "hardBreak":
            parts.append("\n")
        else:
            diagnostics.append(
                Diagnostic(
                    severity="warning",
                    code="UnsupportedNode",
                    path=f"{path}/{index}",
                    message=f"Unsupported codeBlock child '{node_type}' was omitted.",
                )
            )
    return "".join(parts)


def _attrs(node: AdfNode) -> dict[str, Any]:
    attrs = node.get("attrs")
    return attrs if isinstance(attrs, dict) else {}


def _to_number(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback

    if number != number or number in {float("inf"), float("-inf")}:
        return fallback
    return number
