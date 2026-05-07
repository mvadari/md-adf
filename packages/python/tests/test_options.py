from __future__ import annotations

import pytest

from md_adf import (
    ConversionOptions,
    adf_fragment_to_markdown,
    adf_to_markdown,
    markdown_to_adf,
)
from md_adf.adf.types import AdfDocument


VALID_ADF: AdfDocument = {
    "version": 1,
    "type": "doc",
    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello"}]}],
}

INVALID_NESTED_BLOCK_ADF = {
    "version": 1,
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Bad"}]}],
        }
    ],
}


def test_conversion_options_validate_the_only_supported_markdown_dialect() -> None:
    with pytest.raises(ValueError, match="Unsupported markdown_dialect 'commonmark'"):
        adf_to_markdown(VALID_ADF, {"markdownDialect": "commonmark"})

    with pytest.raises(ValueError, match="Unsupported markdown_dialect 'commonmark'"):
        markdown_to_adf("Hello", {"markdownDialect": "commonmark"})

    with pytest.raises(ValueError, match="Unsupported markdown_dialect 'commonmark'"):
        ConversionOptions(markdown_dialect="commonmark")


def test_conversion_profiles_are_accepted_but_do_not_change_phase_1_behavior() -> None:
    for profile in ("jira", "confluence", "portableMarkdown"):
        assert adf_to_markdown(VALID_ADF, {"profile": profile}).value == "Hello"
        assert adf_to_markdown(VALID_ADF, {"profile": profile}).diagnostics == []
        assert markdown_to_adf("Hello", {"profile": profile}).value == VALID_ADF
        assert markdown_to_adf("Hello", {"profile": profile}).diagnostics == []

    with pytest.raises(ValueError, match="Unsupported profile 'unknown'"):
        markdown_to_adf("Hello", {"profile": "unknown"})


def test_adf_conversion_reports_invalid_roots_without_loading_schema_validation() -> None:
    validated = adf_to_markdown(INVALID_NESTED_BLOCK_ADF)
    assert validated.value == ""
    assert [diagnostic.code for diagnostic in validated.diagnostics] == ["UnsupportedNode"]
    assert validated.diagnostics[0].path == "/content/0/content/0"

    skipped = adf_to_markdown(INVALID_NESTED_BLOCK_ADF, {"validateAdf": False})
    assert skipped == validated


def test_adf_fragments_can_be_rendered_directly() -> None:
    assert adf_to_markdown(VALID_ADF["content"]).value == "Hello"
    assert adf_to_markdown(VALID_ADF["content"][0]).value == "Hello"
    assert adf_fragment_to_markdown(VALID_ADF["content"][0]).value == "Hello"


def test_normalize_adf_is_accepted_as_a_future_only_no_op() -> None:
    assert markdown_to_adf("Hello", {"normalizeAdf": True}).value == VALID_ADF
    assert markdown_to_adf("Hello", {"normalizeAdf": False}).value == VALID_ADF


def test_adf_to_markdown_output_has_no_final_newline() -> None:
    assert adf_to_markdown(VALID_ADF).value == "Hello"
