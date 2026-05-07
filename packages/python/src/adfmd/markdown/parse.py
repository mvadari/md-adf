from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MarkdownDocument:
    source: str


def parse_markdown(markdown: str) -> MarkdownDocument:
    return MarkdownDocument(source=markdown)
