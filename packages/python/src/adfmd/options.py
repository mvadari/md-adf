from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Generic, Mapping, TypeVar, cast

from .diagnostics.diagnostic import Diagnostic

T = TypeVar("T")

MARKDOWN_DIALECTS = ("gfm",)
CONVERSION_PROFILES = ("jira", "confluence", "portableMarkdown")


@dataclass(frozen=True)
class ConversionOptions:
    """Options shared by the JS and Python converters.

    Only GitHub Flavored Markdown is supported today. The named profiles are
    accepted for API and CLI parity, but do not change Phase 1 conversion
    behavior yet. ``normalize_adf`` is accepted for future normalization
    controls; Phase 1 converters already emit normalized ADF where they can.
    """

    markdown_dialect: str = "gfm"
    profile: str = "portableMarkdown"
    validate_adf: bool = True
    normalize_adf: bool = True

    def __post_init__(self) -> None:
        _validate_markdown_dialect(self.markdown_dialect)
        _validate_profile(self.profile)


@dataclass(frozen=True)
class ConversionResult(Generic[T]):
    value: T
    diagnostics: list[Diagnostic] = field(default_factory=list)


ConversionOptionsInput = ConversionOptions | Mapping[str, Any] | None


def resolve_conversion_options(options: ConversionOptionsInput = None) -> ConversionOptions:
    if options is None:
        return ConversionOptions()
    if isinstance(options, ConversionOptions):
        return options
    if isinstance(options, Mapping):
        markdown_dialect = cast(
            str,
            options.get("markdown_dialect", options.get("markdownDialect", "gfm")),
        )
        profile = cast(str, options.get("profile", "portableMarkdown"))
        validate_adf = bool(
            options.get("validate_adf", options.get("validateAdf", True))
        )
        normalize_adf = bool(
            options.get("normalize_adf", options.get("normalizeAdf", True))
        )
        return ConversionOptions(
            markdown_dialect=markdown_dialect,
            profile=profile,
            validate_adf=validate_adf,
            normalize_adf=normalize_adf,
        )


def _validate_markdown_dialect(value: str) -> None:
    if value not in MARKDOWN_DIALECTS:
        raise ValueError(
            f"Unsupported markdown_dialect '{value}'. Supported markdown_dialect is 'gfm'."
        )


def _validate_profile(value: str) -> None:
    if value not in CONVERSION_PROFILES:
        raise ValueError(
            "Unsupported profile "
            f"'{value}'. Supported profiles are jira, confluence, and portableMarkdown."
        )
