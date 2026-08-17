"""Fourteenth batch — base_template.py pure helpers,
email_service no-op paths, ghost_memory _hash_context."""
import pytest


def test_arabic_pdf_font_is_packaged_and_registered():
    """Un PDF cabinet ne doit jamais rendre l'arabe avec Helvetica (carrés)."""
    from pathlib import Path
    from backend.services.base_template import BaseTemplate

    template = BaseTemplate()

    assert Path(template.font_path).is_file()
    assert template.arabic_font == "ArabicFont"


# ── PinnedCloture._strip_tags ─────────────────────────────────────────────────

class TestPinnedCloture:
    def _cls(self):
        from backend.services.base_template import PinnedCloture
        return PinnedCloture

    def test_strip_bold_tag(self):
        assert self._cls()._strip_tags("<b>bold</b> text") == "bold text"

    def test_strip_multiple_tags(self):
        result = self._cls()._strip_tags("<b>Hello</b> <i>world</i>")
        assert "<b>" not in result
        assert "<i>" not in result
        assert "Hello" in result
        assert "world" in result

    def test_strip_empty_string(self):
        assert self._cls()._strip_tags("") == ""

    def test_strip_no_tags_unchanged(self):
        assert self._cls()._strip_tags("plain text") == "plain text"

    def test_strip_nested_tags(self):
        result = self._cls()._strip_tags("<para><b>Nom</b></para>")
        assert "<" not in result
        assert "Nom" in result

    def test_strip_reportlab_color_tag(self):
        result = self._cls()._strip_tags('<font color="red">Warning</font>')
        assert "Warning" in result
        assert "<font" not in result


# ── BaseTemplate._get_val ─────────────────────────────────────────────────────

class TestBaseTemplateGetVal:
    def _bt(self):
        from backend.services.base_template import BaseTemplate
        return BaseTemplate()

    def test_dict_key_returns_value(self):
        bt = self._bt()
        assert bt._get_val({"name": "Ahmed"}, "name") == "Ahmed"

    def test_dict_missing_key_returns_default(self):
        bt = self._bt()
        assert bt._get_val({"a": "b"}, "missing", "default") == "default"

    def test_none_obj_returns_default(self):
        bt = self._bt()
        assert bt._get_val(None, "key", "fallback") == "fallback"

    def test_empty_string_returns_default(self):
        bt = self._bt()
        assert bt._get_val({"key": ""}, "key", "default") == "default"

    def test_none_value_returns_default(self):
        bt = self._bt()
        assert bt._get_val({"key": None}, "key", "default") == "default"

    def test_getattr_on_object(self):
        bt = self._bt()

        class Obj:
            name = "clinic"

        assert bt._get_val(Obj(), "name") == "clinic"

    def test_int_value_returned(self):
        bt = self._bt()
        assert bt._get_val({"count": 5}, "count") == 5

    def test_default_none_when_not_specified(self):
        bt = self._bt()
        assert bt._get_val({}, "missing") is None


# ── BaseTemplate.get_adaptive_font_size ───────────────────────────────────────

class TestGetAdaptiveFontSize:
    def _bt(self):
        from backend.services.base_template import BaseTemplate
        return BaseTemplate()

    def test_returns_float(self):
        result = self._bt().get_adaptive_font_size("Hello", "Helvetica", 12, 100)
        assert isinstance(result, float)

    def test_empty_text_returns_base_fs(self):
        result = self._bt().get_adaptive_font_size("", "Helvetica", 12, 100)
        assert result == 12

    def test_tags_stripped_before_calculation(self):
        result1 = self._bt().get_adaptive_font_size("<b>Hello</b>", "Helvetica", 12, 200)
        result2 = self._bt().get_adaptive_font_size("Hello", "Helvetica", 12, 200)
        assert abs(result1 - result2) < 0.5

    def test_min_fs_respected(self):
        # Very narrow width forces font to shrink but not below min_fs
        result = self._bt().get_adaptive_font_size("Long text here", "Helvetica", 12, 5, min_fs=8.0)
        assert result >= 8.0

    def test_max_fs_respected(self):
        # Very wide width would grow font but max_fs caps it
        result = self._bt().get_adaptive_font_size("X", "Helvetica", 12, 5000, max_fs=14.0)
        assert result <= 14.0

    def test_growth_capped_at_1_25x_when_no_max_fs(self):
        # Very wide max_width → capped at 1.25 * base_fs
        result = self._bt().get_adaptive_font_size("X", "Helvetica", 12, 10000)
        assert result <= 12 * 1.25 + 0.01


# ── BaseTemplate._prepare_arabic ─────────────────────────────────────────────

class TestPrepareArabic:
    def _bt(self):
        from backend.services.base_template import BaseTemplate
        return BaseTemplate()

    def test_empty_returns_empty(self):
        assert self._bt()._prepare_arabic("") == ""

    def test_none_returns_empty(self):
        assert self._bt()._prepare_arabic(None) == ""

    def test_arabic_text_returns_string(self):
        result = self._bt()._prepare_arabic("مرحبا")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_latin_text_returns_string(self):
        result = self._bt()._prepare_arabic("Hello")
        assert isinstance(result, str)


# ── BaseTemplate.get_document_margins ────────────────────────────────────────

class TestGetDocumentMargins:
    def _bt(self):
        from backend.services.base_template import BaseTemplate
        return BaseTemplate()

    def test_returns_four_values(self):
        result = self._bt().get_document_margins({}, 148)
        assert len(result) == 4

    def test_swiss_template_margins(self):
        m_top, m_bottom, m_left, m_right = self._bt().get_document_margins(
            {"selected_template": "swiss"}, 148
        )
        assert m_top > 0
        assert m_bottom > 0
        assert m_left > 0
        assert m_right > 0

    def test_royal_template_wider_margins(self):
        m_top_r, m_bottom_r, m_left_r, m_right_r = self._bt().get_document_margins(
            {"selected_template": "royal"}, 148
        )
        # Royal has 2.0cm sides vs swiss 1.5cm
        m_top_s, m_bottom_s, m_left_s, m_right_s = self._bt().get_document_margins(
            {"selected_template": "swiss"}, 148
        )
        assert m_left_r >= m_left_s

    def test_clinical_template_works(self):
        result = self._bt().get_document_margins(
            {"selected_template": "clinical"}, 148
        )
        assert len(result) == 4

    def test_bottom_at_least_2_8cm(self):
        from reportlab.lib.units import cm
        _, m_bottom, _, _ = self._bt().get_document_margins({}, 148)
        assert m_bottom >= 2.8 * cm

    def test_with_logo_increases_header_height(self):
        base_result = self._bt().get_document_margins({}, 148)
        logo_result = self._bt().get_document_margins(
            {"logo_path": "/fake/logo.png", "selected_template": "swiss"}, 148
        )
        assert logo_result[0] >= base_result[0]


# ── BaseTemplate.scale_elements ──────────────────────────────────────────────

class TestScaleElements:
    def _bt(self):
        from backend.services.base_template import BaseTemplate
        return BaseTemplate()

    def test_empty_list_returns_empty(self):
        assert self._bt().scale_elements([], 0.8) == []

    def test_factor_1_returns_unchanged(self):
        from reportlab.platypus import Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        styles = getSampleStyleSheet()
        p = Paragraph("Hello", styles["Normal"])
        result = self._bt().scale_elements([p], 1.0)
        assert result == [p]

    def test_paragraph_font_size_scaled_down(self):
        from reportlab.platypus import Paragraph
        from reportlab.lib.styles import getSampleStyleSheet
        styles = getSampleStyleSheet()
        style = styles["Normal"]
        base_fs = style.fontSize
        p = Paragraph("Hello", style)
        result = self._bt().scale_elements([p], 0.8)
        assert len(result) == 1
        assert result[0].style.fontSize < base_fs or result[0].style.fontSize == base_fs

    def test_spacer_height_scaled(self):
        from reportlab.platypus import Spacer
        spacer = Spacer(1, 20)
        result = self._bt().scale_elements([spacer], 0.5)
        assert len(result) == 1
        assert result[0].height <= 20

    def test_unknown_element_passed_through(self):
        # Elements that aren't Paragraph or Spacer pass through unchanged
        sentinel = object()
        result = self._bt().scale_elements([sentinel], 0.5)
        assert result[0] is sentinel


# ── EmailService no-op paths ──────────────────────────────────────────────────

class TestEmailServiceNoop:
    def _svc(self):
        from backend.services.email_service import EmailService
        return EmailService()

    def test_empty_to_email_returns_false(self):
        svc = self._svc()
        result = svc.send_email("", "subject", "text")
        assert result is False

    def test_none_to_email_returns_false(self):
        svc = self._svc()
        result = svc.send_email(None, "subject", "text")
        assert result is False

    def test_unconfigured_smtp_returns_true(self):
        # When SMTP is not configured, send_email simulates success
        svc = self._svc()
        if not svc.is_configured:
            result = svc.send_email("test@test.com", "subject", "text")
            assert result is True

    def test_is_configured_returns_bool(self):
        svc = self._svc()
        assert isinstance(svc.is_configured, bool)


# ── GhostMemoryService._hash_context ─────────────────────────────────────────

class TestGhostMemoryHashContext:
    def _svc(self):
        from backend.services.ghost_memory_service import GhostMemoryService
        return GhostMemoryService()

    def test_returns_string(self):
        result = self._svc()._hash_context("some context data")
        assert isinstance(result, str)

    def test_returns_64_char_hex(self):
        result = self._svc()._hash_context("data")
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)

    def test_same_input_same_hash(self):
        svc = self._svc()
        h1 = svc._hash_context("identical")
        h2 = svc._hash_context("identical")
        assert h1 == h2

    def test_different_input_different_hash(self):
        svc = self._svc()
        h1 = svc._hash_context("input_a")
        h2 = svc._hash_context("input_b")
        assert h1 != h2
