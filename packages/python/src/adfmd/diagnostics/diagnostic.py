from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

DiagnosticSeverity = Literal["info", "warning", "error"]


@dataclass(frozen=True)
class Diagnostic:
    """Structured message for validation issues or lossy conversion fallbacks."""

    severity: DiagnosticSeverity
    code: str
    message: str
    path: str | None = None
    fallback: str | None = None
