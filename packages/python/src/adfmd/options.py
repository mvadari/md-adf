from __future__ import annotations

from dataclasses import dataclass, field
from typing import Generic, TypeVar

from .diagnostics.diagnostic import Diagnostic

T = TypeVar("T")


@dataclass(frozen=True)
class ConversionOptions:
    markdown_dialect: str = "gfm"
    profile: str = "portableMarkdown"
    validate_adf: bool = True
    normalize_adf: bool = True


@dataclass(frozen=True)
class ConversionResult(Generic[T]):
    value: T
    diagnostics: list[Diagnostic] = field(default_factory=list)
