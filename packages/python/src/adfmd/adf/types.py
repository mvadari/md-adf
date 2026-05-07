from __future__ import annotations

from typing import Any, TypedDict


class AdfNode(TypedDict, total=False):
    type: str
    attrs: dict[str, Any]
    marks: list[dict[str, Any]]
    content: list["AdfNode"]
    text: str


class AdfDocument(TypedDict):
    version: int
    type: str
    content: list[AdfNode]
