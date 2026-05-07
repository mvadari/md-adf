from __future__ import annotations

from typing import Any, cast

import mistune

from ..adf.types import AdfDocument, AdfNode
from ..diagnostics.diagnostic import Diagnostic
from ..options import ConversionOptionsInput, ConversionResult, resolve_conversion_options

MarkdownNode = dict[str, Any]

MARKDOWN_PARSER = mistune.create_markdown(
    renderer="ast",
    plugins=["strikethrough", "table", "task_lists"],
)


def markdown_to_adf(
    markdown: str, options: ConversionOptionsInput = None
) -> ConversionResult[AdfDocument]:
    resolve_conversion_options(options)
    diagnostics: list[Diagnostic] = []
    tree = cast(list[MarkdownNode], MARKDOWN_PARSER(markdown))
    content = _block_children(tree)

    return ConversionResult(
        value={"version": 1, "type": "doc", "content": content},
        diagnostics=diagnostics,
    )


def _block_children(nodes: list[MarkdownNode]) -> list[AdfNode]:
    output: list[AdfNode] = []
    for node in nodes:
        output.extend(_block_node(node))
    return output


def _block_node(node: MarkdownNode) -> list[AdfNode]:
    node_type = node.get("type")

    if node_type == "blank_line":
        return []

    if node_type == "paragraph":
        return [{"type": "paragraph", "content": _inline_children(_children(node))}]

    if node_type == "block_text":
        return [{"type": "paragraph", "content": _inline_children(_children(node))}]

    if node_type == "heading":
        attrs = _attrs(node)
        level = min(6, max(1, int(attrs.get("level", 1))))
        return [
            {
                "type": "heading",
                "attrs": {"level": level},
                "content": _inline_children(_children(node)),
            }
        ]

    if node_type == "thematic_break":
        return [{"type": "rule"}]

    if node_type == "block_quote":
        return [{"type": "blockquote", "content": _block_children(_children(node))}]

    if node_type == "list":
        return [_list_node(node)]

    if node_type == "block_code":
        return [_code_block_node(node)]

    if node_type == "table":
        return [_table_node(node)]

    if node_type == "block_html":
        return _paragraph_from_text(str(node.get("raw", "")))

    return _text_fallback_block(node)


def _list_node(node: MarkdownNode) -> AdfNode:
    attrs = _attrs(node)
    ordered = bool(attrs.get("ordered", False))
    list_node: AdfNode = {
        "type": "orderedList" if ordered else "bulletList",
        "content": [
            _list_item_node(child)
            for child in _children(node)
            if child.get("type") in {"list_item", "task_list_item"}
        ],
    }
    start = attrs.get("start")
    if ordered and isinstance(start, int) and start != 1:
        list_node["attrs"] = {"order": start}
    return list_node


def _list_item_node(node: MarkdownNode) -> AdfNode:
    return {"type": "listItem", "content": _block_children(_children(node))}


def _code_block_node(node: MarkdownNode) -> AdfNode:
    code_block: AdfNode = {
        "type": "codeBlock",
        "content": [{"type": "text", "text": str(node.get("raw", "")).removesuffix("\n")}],
    }
    info = _attrs(node).get("info")
    if isinstance(info, str) and info.strip():
        code_block["attrs"] = {"language": info.strip().split()[0]}
    return code_block


def _table_node(node: MarkdownNode) -> AdfNode:
    rows: list[AdfNode] = []
    alignments: list[Any] = []

    for table_child in _children(node):
        if table_child.get("type") == "table_head":
            rows.append(_table_row_node(table_child, header=True))
            alignments = [
                _attrs(cell).get("align") for cell in _children(table_child)
            ]
        elif table_child.get("type") == "table_body":
            rows.extend(
                _table_row_node(row, header=False) for row in _children(table_child)
            )

    table: AdfNode = {"type": "table", "content": rows}
    if any(align is not None for align in alignments):
        table["attrs"] = {"columnAlignments": alignments}
    return table


def _table_row_node(node: MarkdownNode, header: bool) -> AdfNode:
    cells: list[AdfNode] = []
    for cell in _children(node):
        if cell.get("type") != "table_cell":
            continue
        cell_node: AdfNode = {
            "type": "tableHeader" if header else "tableCell",
            "content": [
                {"type": "paragraph", "content": _inline_children(_children(cell))}
            ],
        }
        cells.append(cell_node)
    return {"type": "tableRow", "content": cells}


def _text_fallback_block(node: MarkdownNode) -> list[AdfNode]:
    text = _plain_text(node)
    return _paragraph_from_text(text) if text else []


def _paragraph_from_text(text: str) -> list[AdfNode]:
    if not text:
        return []
    return [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]


def _inline_children(
    nodes: list[MarkdownNode], marks: list[dict[str, Any]] | None = None
) -> list[AdfNode]:
    output: list[AdfNode] = []
    active_marks = marks or []
    for node in nodes:
        for child in _inline_node(node, active_marks):
            _append_inline(output, child)
    return output


def _inline_node(node: MarkdownNode, marks: list[dict[str, Any]]) -> list[AdfNode]:
    node_type = node.get("type")

    if node_type == "text":
        return _text_node(str(node.get("raw", "")).replace("\n", " "), marks)

    if node_type == "emphasis":
        return _inline_children(_children(node), [*marks, {"type": "em"}])

    if node_type == "strong":
        return _inline_children(_children(node), [*marks, {"type": "strong"}])

    if node_type == "strikethrough":
        return _inline_children(_children(node), [*marks, {"type": "strike"}])

    if node_type == "codespan":
        return _text_node(str(node.get("raw", "")), [*marks, {"type": "code"}])

    if node_type == "link":
        attrs = _attrs(node)
        link_attrs: dict[str, Any] = {"href": attrs.get("url", "")}
        title = attrs.get("title")
        if isinstance(title, str) and title:
            link_attrs["title"] = title
        return _inline_children(_children(node), [*marks, {"type": "link", "attrs": link_attrs}])

    if node_type == "linebreak":
        return [{"type": "hardBreak"}]

    if node_type == "softbreak":
        return _text_node(" ", marks)

    if node_type == "image":
        attrs = _attrs(node)
        image_link_attrs: dict[str, Any] = {"href": attrs.get("url", "")}
        title = attrs.get("title")
        if isinstance(title, str) and title:
            image_link_attrs["title"] = title
        alt = str(attrs.get("alt", attrs.get("url", "")))
        return _text_node(alt, [*marks, {"type": "link", "attrs": image_link_attrs}])

    if node_type == "inline_html":
        return _text_node(str(node.get("raw", "")), marks)

    return _text_node(_plain_text(node), marks)


def _text_node(text: str, marks: list[dict[str, Any]]) -> list[AdfNode]:
    if not text:
        return []
    node: AdfNode = {"type": "text", "text": text}
    if marks:
        node["marks"] = marks
    return [node]


def _append_inline(nodes: list[AdfNode], node: AdfNode) -> None:
    previous = nodes[-1] if nodes else None
    if (
        previous is not None
        and node.get("type") == "text"
        and previous.get("type") == "text"
        and previous.get("marks", []) == node.get("marks", [])
    ):
        previous["text"] = previous.get("text", "") + node.get("text", "")
        return
    nodes.append(node)


def _plain_text(node: MarkdownNode) -> str:
    raw = node.get("raw")
    if isinstance(raw, str):
        return raw
    return "".join(_plain_text(child) for child in _children(node))


def _children(node: MarkdownNode) -> list[MarkdownNode]:
    children = node.get("children")
    return cast(list[MarkdownNode], children if isinstance(children, list) else [])


def _attrs(node: MarkdownNode) -> dict[str, Any]:
    attrs = node.get("attrs")
    return cast(dict[str, Any], attrs if isinstance(attrs, dict) else {})
