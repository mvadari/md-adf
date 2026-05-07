from __future__ import annotations

from typing import Any, TypedDict


class AdfNode(TypedDict, total=False):
    """Minimal structural representation for ADF nodes used by the converters."""

    type: str
    attrs: dict[str, Any]
    marks: list[dict[str, Any]]
    content: list["AdfNode"]
    text: str


class AdfDocument(TypedDict):
    """Root ADF document shape accepted and emitted by this package."""

    version: int
    type: str
    content: list[AdfNode]
