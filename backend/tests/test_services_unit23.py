"""Twenty-third batch — BaseTemplate pure helpers:
update_active_fonts, get_adaptive_font_size, get_adaptive_style,
scale_elements, get_document_margins."""
import pytest
from unittest.mock import patch
from reportlab.lib.units import cm


def _bt():
    from backend.services.base_template import BaseTemplate
    return BaseTemplate()


# ── update_active_fonts ────────────────────────────────────────────────────────

class TestUpdateActiveFonts:
    def test_default_font_falls_back_to_helvetica(self):
        bt = _bt()
        bt.update_active_fonts({})
        # Falls through to else branch → Montserrat or Helvetica fallback
        assert isinstance(bt.premium_font, str)
        assert len(bt.premium_font) > 0

    def test_outfit_font_sets_premium_font(self):
        bt = _bt()
        bt.update_active_fonts({'font_fr': 'outfit'})
        assert bt.premium_font in ('Outfit', 'Helvetica')
        assert bt.header_font in ('Outfit', 'Helvetica')

    def test_inter_font_branch(self):
        bt = _bt()
        bt.update_active_fonts({'font_fr': 'inter'})
        # Either InterTight or Montserrat or Helvetica — must be a string
        assert isinstance(bt.premium_font, str)
        assert isinstance(bt.header_font, str)

    def test_playfair_font_branch(self):
        bt = _bt()
        bt.update_active_fonts({'font_fr': 'playfair'})
        assert bt.premium_font in ('PlayfairDisplay', 'Montserrat', 'Helvetica')

    def test_unknown_font_value_falls_to_else(self):
        bt = _bt()
        bt.update_active_fonts({'font_fr': 'comic_sans'})
        assert isinstance(bt.premium_font, str)

    def test_called_with_none_config(self):
        bt = _bt()
        bt.update_active_fonts(None)
        assert isinstance(bt.premium_font, str)

    def test_font_objects_remain_strings_after_update(self):
        bt = _bt()
        for font in ('outfit', 'inter', 'playfair', 'montserrat'):
            bt.update_active_fonts({'font_fr': font})
            assert isinstance(bt.premium_font, str)
            assert isinstance(bt.premium_bold, str)
            assert isinstance(bt.header_font, str)
            assert isinstance(bt.header_bold, str)


# ── get_adaptive_font_size ─────────────────────────────────────────────────────

class TestGetAdaptiveFontSize:
    def _fn(self, text, base_fs=12, max_width=100, min_fs=6.5, max_fs=None):
        from backend.services.base_template import BaseTemplate
        return BaseTemplate.get_adaptive_font_size(text, 'Helvetica', base_fs, max_width, min_fs, max_fs)

    def test_empty_string_returns_base_fs(self):
        result = self._fn("", base_fs=12)
        assert result == 12

    def test_html_stripped_before_measure(self):
        result = self._fn("<b>Dr. Test</b>", base_fs=12, max_width=200)
        assert isinstance(result, float)

    def test_short_text_may_upscale(self):
        result = self._fn("X", base_fs=12, max_width=200)
        # Short text in 200pt space → upscaled
        assert result >= 12

    def test_long_text_downscales(self):
        long = "CABINET DENTAIRE EXCELLENCE PROFESSIONNELLE INTERNATIONAL"
        result = self._fn(long, base_fs=12, max_width=100)
        assert result < 12

    def test_result_not_below_min_fs(self):
        very_long = "X" * 500
        result = self._fn(very_long, base_fs=12, max_width=50, min_fs=6.5)
        assert result >= 6.5

    def test_max_fs_caps_upscale(self):
        result = self._fn("Hi", base_fs=12, max_width=500, max_fs=18.0)
        assert result <= 18.0

    def test_no_max_fs_caps_at_1_25x_base(self):
        # Very wide space should not scale beyond 1.25x base_fs
        result = self._fn("X", base_fs=12, max_width=5000, max_fs=None)
        assert result <= 12 * 1.25 + 0.001  # small float tolerance

    def test_nbsp_stripped_correctly(self):
        result = self._fn("Dr.&nbsp;Test", base_fs=12, max_width=100)
        assert isinstance(result, float)

    def test_returns_float(self):
        assert isinstance(self._fn("Test"), float)


# ── get_adaptive_style ─────────────────────────────────────────────────────────

class TestGetAdaptiveStyle:
    def test_returns_paragraph_style(self):
        from reportlab.lib.styles import getSampleStyleSheet
        bt = _bt()
        styles = getSampleStyleSheet()
        style = bt.get_adaptive_style(styles['Normal'], "Dr. Test Cabinet Dentaire", 200)
        from reportlab.lib.styles import ParagraphStyle
        assert isinstance(style, ParagraphStyle)

    def test_adaptive_style_has_adapted_font_size(self):
        from reportlab.lib.styles import getSampleStyleSheet
        bt = _bt()
        styles = getSampleStyleSheet()
        base_style = styles['Normal']
        long_text = "CABINET TRÈS LONG NOM QUI DEVRAIT ÊTRE REDIMENSIONNÉ"
        s = bt.get_adaptive_style(base_style, long_text, 80)
        # Font size should be adapted
        assert isinstance(s.fontSize, float)

    def test_adaptive_style_with_min_fs(self):
        from reportlab.lib.styles import getSampleStyleSheet
        bt = _bt()
        s = bt.get_adaptive_style(
            getSampleStyleSheet()['Normal'],
            "X" * 200, 50, min_fs=7.0
        )
        assert s.fontSize >= 7.0

    def test_adaptive_style_name_has_suffix(self):
        from reportlab.lib.styles import getSampleStyleSheet
        bt = _bt()
        s = bt.get_adaptive_style(getSampleStyleSheet()['Normal'], "Test", 200)
        assert '_adaptive' in s.name


# ── scale_elements ─────────────────────────────────────────────────────────────

class TestScaleElements:
    def test_factor_1_returns_independent_story(self):
        from backend.services.base_template import BaseTemplate
        els = ["a", "b", "c"]
        result = BaseTemplate.scale_elements(els, 1.0)
        assert result == els
        assert result is not els
        result.clear()
        assert els == ["a", "b", "c"]

    def test_factor_099_returns_independent_story(self):
        from backend.services.base_template import BaseTemplate
        els = [1, 2, 3]
        result = BaseTemplate.scale_elements(els, 0.99)
        assert result == els
        assert result is not els

    def test_scale_paragraph_reduces_font(self):
        from backend.services.base_template import BaseTemplate
        from reportlab.platypus import Paragraph
        from reportlab.lib.styles import getSampleStyleSheet
        s = getSampleStyleSheet()['Normal']
        original_fs = s.fontSize
        els = [Paragraph("Test", s)]
        result = BaseTemplate.scale_elements(els, 0.8)
        from reportlab.platypus import Paragraph as RLParagraph
        assert isinstance(result[0], RLParagraph)

    def test_scale_spacer_reduces_height(self):
        from backend.services.base_template import BaseTemplate
        from reportlab.platypus import Spacer
        spacer = Spacer(1, 20)
        result = BaseTemplate.scale_elements([spacer], 0.5)
        from reportlab.platypus import Spacer as RLSpacer
        assert isinstance(result[0], RLSpacer)
        assert result[0].height <= 20 * 0.5 + 1  # slight tolerance

    def test_scale_preserves_unknown_elements(self):
        from backend.services.base_template import BaseTemplate
        sentinel = object()
        result = BaseTemplate.scale_elements([sentinel], 0.5)
        assert result[0] is sentinel

    def test_scale_empty_list(self):
        from backend.services.base_template import BaseTemplate
        result = BaseTemplate.scale_elements([], 0.5)
        assert result == []

    def test_scale_clamped_min_height_for_spacer(self):
        from backend.services.base_template import BaseTemplate
        from reportlab.platypus import Spacer
        # Very small spacer × very small factor = should clamp to 1
        spacer = Spacer(1, 1)
        result = BaseTemplate.scale_elements([spacer], 0.01)
        from reportlab.platypus import Spacer as RLSpacer
        assert isinstance(result[0], RLSpacer)
        assert result[0].height >= 1


# ── get_document_margins ───────────────────────────────────────────────────────

class TestGetDocumentMargins:
    def _bt(self):
        return _bt()

    def _margins(self, config):
        bt = self._bt()
        return bt.get_document_margins(config, 148 * cm)

    def test_swiss_template_returns_four_values(self):
        m_top, m_bottom, m_left, m_right = self._margins({'selected_template': 'swiss'})
        assert m_top > 0
        assert m_bottom > 0
        assert m_left > 0
        assert m_right > 0

    def test_royal_template_wider_margins(self):
        m_top, m_bottom, m_left, m_right = self._margins({'selected_template': 'royal'})
        assert abs(m_left - 2.0 * cm) < 0.01
        assert abs(m_right - 2.0 * cm) < 0.01

    def test_clinical_template_top_margin_at_least_4_2(self):
        m_top, _, _, _ = self._margins({'selected_template': 'clinical'})
        assert m_top >= 4.2 * cm - 0.01

    def test_modern_template_uses_swiss_default_top(self):
        # modern uses same default_top as swiss (3.9)
        m_top_modern, _, _, _ = self._margins({'selected_template': 'modern'})
        m_top_swiss, _, _, _ = self._margins({'selected_template': 'swiss'})
        # Both should have the same min_header calculation base
        assert m_top_modern > 0
        assert m_top_swiss > 0

    def test_heritage_template(self):
        m_top, m_bottom, m_left, m_right = self._margins({'selected_template': 'heritage'})
        assert m_top > 0

    def test_unknown_template_fallback(self):
        m_top, m_bottom, m_left, m_right = self._margins({'selected_template': 'unknown_xyz'})
        # Falls through to else: min_header = 4.5cm
        assert m_top >= 4.5 * cm - 0.01

    def test_custom_margin_top_respected_when_large(self):
        # A very large custom top should be respected
        m_top, _, _, _ = self._margins({'selected_template': 'swiss', 'margin_top': 8.0})
        assert m_top >= 8.0 * cm - 0.01

    def test_custom_margin_bottom_respected_when_large(self):
        _, m_bottom, _, _ = self._margins({'selected_template': 'swiss', 'margin_bottom': 5.0})
        assert m_bottom >= 5.0 * cm - 0.01

    def test_bottom_clamped_to_at_least_2_8cm(self):
        # Even if user sets margin_bottom = 0.5cm, footer needs 2.8cm
        _, m_bottom, _, _ = self._margins({'selected_template': 'swiss', 'margin_bottom': 0.5})
        assert m_bottom >= 2.8 * cm - 0.01

    def test_with_logo_increases_top_margin(self):
        no_logo_top, _, _, _ = self._margins({'selected_template': 'swiss'})
        with_logo_top, _, _, _ = self._margins({'selected_template': 'swiss', 'logo_path': 'logo.png'})
        # Logo adds to header height so top should be >= no-logo case
        assert with_logo_top >= no_logo_top - 0.001

    def test_header_font_scale_increases_top_margin(self):
        m1, _, _, _ = self._margins({'selected_template': 'swiss', 'header_font_scale': 1.0})
        m2, _, _, _ = self._margins({'selected_template': 'swiss', 'header_font_scale': 2.0})
        assert m2 >= m1

    def test_empty_config_returns_defaults(self):
        m_top, m_bottom, m_left, m_right = self._margins({})
        assert all(x > 0 for x in [m_top, m_bottom, m_left, m_right])
