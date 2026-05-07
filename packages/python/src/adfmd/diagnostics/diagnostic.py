from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

DiagnosticSeverity = Literal["info", "warning", "error"]


@dataclass(frozen=True)
class Diagnostic:
    severity: DiagnosticSeverity
    code: str
    message: str
    path: str | None = None
    fallback: str | None = None
