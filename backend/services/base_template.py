import os
import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib.pagesizes import A5
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from backend.services.qr_service import QRService
from reportlab.platypus import Flowable
from reportlab.lib.utils import ImageReader

# --- DESIGN SYSTEM : SINGLE SOURCE OF TRUTH ---
NAVY_BLUE = colors.HexColor('#003380')

# Tailles de police de BASE de l'en-tête (avant le scale utilisateur).
# Le scale (header_font_scale / header_scale) reste pleinement fonctionnel et
# s'applique par-dessus ces valeurs → l'utilisateur peut toujours agrandir/réduire.
# Augmentées d'environ +12% par rapport à l'origine (FR 24/14, AR 26/16).
HEADER_FS_FR_TITLE = 27   # nom du praticien (FR) — ligne 0
HEADER_FS_FR_SUB = 16     # lignes suivantes (FR)
HEADER_FS_AR_TITLE = 29   # nom (AR) — ligne 0
HEADER_FS_AR_SUB = 18     # lignes suivantes (AR)

class PinnedCloture(Flowable):
    """
    Flowable spécialisé pour ancrer la phrase de clôture au bas de la dernière page.
    Utilise drawString direct pour garantir la visibilité (pas de clipping par Paragraph).
    """
    def __init__(self, text, style):
        Flowable.__init__(self)
        self.text = text
        self.style = style

    def wrap(self, availWidth, availHeight):
        # Hauteur minimale pour forcer le passage en fin de flow
        return (availWidth, 0.2 * cm)

    @staticmethod
    def _strip_tags(text: str) -> str:
        """Supprime les balises HTML ReportLab (<b>, <u>, etc.) pour drawString."""
        import re
        return re.sub(r'<[^>]+>', '', text)

    def drawOn(self, canvas, x, y, _debug=0, **kwargs):
        if not self.text:
            return

        canvas.saveState()

        from reportlab.platypus import Paragraph
        p = Paragraph(self.text, self.style)
        
        # Largeur utile A5 (148mm − 2×15mm marges) = 118mm ≈ 11.8 cm
        usable_w = 11.8 * cm
        
        w, h = p.wrap(usable_w, 10 * cm)
        
        # Y de départ : 4.4 cm du bas (ancrage)
        # On dessine en partant de x=1.5cm (marge gauche)
        p.drawOn(canvas, 1.5 * cm, 4.4 * cm - h)

        canvas.restoreState()



class BaseTemplate:
    def __init__(self):
        self.base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        # Assets par défaut
        self.default_logo_path = os.path.join(self.base_path, "static", "assets", "logo.png")
        self.font_path = os.path.join(self.base_path, "static", "assets", "fonts", "Amiri-Regular.ttf")
        self.montserrat_reg = os.path.join(self.base_path, "static", "assets", "fonts", "Montserrat-Regular.ttf")
        self.montserrat_bold = os.path.join(self.base_path, "static", "assets", "fonts", "Montserrat-Bold.ttf")
        
        # Enregistrement des polices
        self._register_fonts()

    def _register_fonts(self):
        # 1. Arabe (Amiri)
        if os.path.exists(self.font_path):
            try:
                pdfmetrics.registerFont(TTFont('ArabicFont', self.font_path))
                self.arabic_font = 'ArabicFont'
            except Exception:
                self.arabic_font = 'Helvetica'
        else:
            self.arabic_font = 'Helvetica'

        # 2. Latin Premium (Montserrat)
        self.premium_font = "Helvetica" # Fallback
        self.premium_bold = "Helvetica-Bold"
        self.header_font = "Helvetica"
        self.header_bold = "Helvetica-Bold"
        
        if os.path.exists(self.montserrat_reg) and os.path.exists(self.montserrat_bold):
            try:
                pdfmetrics.registerFont(TTFont('Montserrat', self.montserrat_reg))
                pdfmetrics.registerFont(TTFont('Montserrat-Bold', self.montserrat_bold))
                self.premium_font = 'Montserrat'
                self.premium_bold = 'Montserrat-Bold'
                
                # Outfit (Elite Header Premium)
                font_dir = os.path.dirname(self.montserrat_reg)
                pdfmetrics.registerFont(TTFont('Outfit', os.path.join(font_dir, 'Outfit-Regular.ttf')))
                pdfmetrics.registerFont(TTFont('Outfit-Bold', os.path.join(font_dir, 'Outfit-Bold.ttf')))
                self.header_font = 'Outfit'
                self.header_bold = 'Outfit-Bold'

                # Inter Tight
                inter_reg = os.path.join(font_dir, 'InterTight-Regular.ttf')
                inter_bold = os.path.join(font_dir, 'InterTight-Bold.ttf')
                if os.path.exists(inter_reg) and os.path.exists(inter_bold):
                    pdfmetrics.registerFont(TTFont('InterTight', inter_reg))
                    pdfmetrics.registerFont(TTFont('InterTight-Bold', inter_bold))
                    
                # Playfair Display
                playfair_reg = os.path.join(font_dir, 'PlayfairDisplay-Regular.ttf')
                playfair_bold = os.path.join(font_dir, 'PlayfairDisplay-Bold.ttf')
                if os.path.exists(playfair_reg) and os.path.exists(playfair_bold):
                    pdfmetrics.registerFont(TTFont('PlayfairDisplay', playfair_reg))
                    pdfmetrics.registerFont(TTFont('PlayfairDisplay-Bold', playfair_bold))

            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Erreur enregistrement Montserrat/Premium Fonts: {e}")
                self.header_font = self.premium_font
                self.header_bold = self.premium_bold

    def update_active_fonts(self, config):
        """
        Met à jour dynamiquement les polices actives du template en fonction de la configuration de l'utilisateur.
        """
        font_fr = self._get_val(config, 'font_fr', 'inter')
        
        def safe_font(font_name, fallback="Helvetica"):
            try:
                pdfmetrics.getFont(font_name)
                return font_name
            except Exception:
                return fallback
        
        # Mappings des polices pré-enregistrées
        if font_fr == 'outfit':
            self.premium_font = safe_font('Outfit')
            self.premium_bold = safe_font('Outfit-Bold', 'Helvetica-Bold')
            self.header_font = safe_font('Outfit')
            self.header_bold = safe_font('Outfit-Bold', 'Helvetica-Bold')
        elif font_fr == 'inter':
            # Fallback à Helvetica ou Montserrat si InterTight n'est pas présent
            try:
                pdfmetrics.getFont('InterTight')
                self.premium_font = 'InterTight'
                self.premium_bold = 'InterTight-Bold'
                self.header_font = 'InterTight'
                self.header_bold = 'InterTight-Bold'
            except Exception:
                self.premium_font = safe_font('Montserrat')
                self.premium_bold = safe_font('Montserrat-Bold', 'Helvetica-Bold')
                self.header_font = safe_font('Outfit', 'Helvetica')
                self.header_bold = safe_font('Outfit-Bold', 'Helvetica-Bold')
        elif font_fr == 'playfair':
            try:
                pdfmetrics.getFont('PlayfairDisplay')
                self.premium_font = 'PlayfairDisplay'
                self.premium_bold = 'PlayfairDisplay-Bold'
                self.header_font = 'PlayfairDisplay'
                self.header_bold = 'PlayfairDisplay-Bold'
            except Exception:
                self.premium_font = safe_font('Montserrat')
                self.premium_bold = safe_font('Montserrat-Bold', 'Helvetica-Bold')
                self.header_font = safe_font('Outfit', 'Helvetica')
                self.header_bold = safe_font('Outfit-Bold', 'Helvetica-Bold')
        else:
            self.premium_font = safe_font('Montserrat')
            self.premium_bold = safe_font('Montserrat-Bold', 'Helvetica-Bold')
            self.header_font = safe_font('Outfit', 'Helvetica')
            self.header_bold = safe_font('Outfit-Bold', 'Helvetica-Bold')

    def _prepare_arabic(self, text):
        if not text: return ""
        reshaped_text = arabic_reshaper.reshape(text)
        return get_display(reshaped_text)

    def _draw_safe_image(self, canvas, img_path, x, y, width, height):
        if str(img_path).lower().endswith('.svg'):
            try:
                import xml.etree.ElementTree as ET
                import base64
                import tempfile
                
                # Check if it's just a base64 embedded image
                tree = ET.parse(img_path)
                root = tree.getroot()
                image_tag = root.find('.//{http://www.w3.org/2000/svg}image')
                if image_tag is not None:
                    href = image_tag.attrib.get('href') or image_tag.attrib.get('{http://www.w3.org/1999/xlink}href')
                    if href and href.startswith('data:image/png;base64,'):
                        png_data = base64.b64decode(href.split(',')[1])
                        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp:
                            tmp.write(png_data)
                            tmp_path = tmp.name
                        # Draw the extracted PNG with alpha handling
                        canvas.drawImage(tmp_path, x, y, width=width, height=height, preserveAspectRatio=True, mask='auto')
                        os.unlink(tmp_path)
                        return

                from svglib.svglib import svg2rlg
                from reportlab.graphics import renderPDF
                drawing = svg2rlg(img_path)
                if drawing:
                    scale_x = width / drawing.width
                    scale_y = height / drawing.height
                    drawing.width = width
                    drawing.height = height
                    drawing.scale(scale_x, scale_y)
                    renderPDF.draw(drawing, canvas, x, y)
                    return
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to draw SVG {img_path}: {e}")
        try:
            # We remove mask='auto' because ReportLab correctly handles alpha channel PNGs
            # but mask='auto' can incorrectly turn transparent PNGs into solid black boxes.
            canvas.drawImage(img_path, x, y, width=width, height=height, preserveAspectRatio=True)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to draw image {img_path}: {e}")

    def _draw_header_logo(self, canvas, config, logo_path, x, y, size):
        """Dessine le logo d'en-tête à la position calculée par le template actif,
        décalée par la manette de positionnement (cm, réglages avancés). Séparé de
        _draw_safe_image pour ne jamais toucher le watermark central ni le letterhead,
        qui ont leurs propres règles de placement."""
        offset_x = self._get_val(config, 'header_logo_offset_x', 0.0)
        offset_y = self._get_val(config, 'header_logo_offset_y', 0.0)
        self._draw_safe_image(canvas, logo_path, x + offset_x * cm, y + offset_y * cm, size, size)

    def _get_val(self, obj, key, default=None):
        """Récupère une valeur que l'objet soit un dict ou un modèle SQLAlchemy."""
        if obj is None: return default
        if isinstance(obj, dict):
            val = obj.get(key, default)
        else:
            val = getattr(obj, key, default)
        return default if val in ["", None] else val

    def has_active_letterhead(self, config):
        """Indique si un design de document uploade est actif."""
        lh_path = self._get_val(config, 'letterhead_path')
        use_letterhead = self._get_val(config, 'use_letterhead', False)
        return bool(use_letterhead and lh_path and str(lh_path) not in ["null", "None", ""])

    @staticmethod
    def get_adaptive_font_size(text, font_name, base_fs, max_width, min_fs=6.5, max_fs=None):
        """
        Calcule la taille de police optimale pour faire tenir un texte sur une seule ligne.
        Agrandit ou réduit proportionnellement pour s'adapter parfaitement à l'espace.
        """
        from reportlab.pdfbase.pdfmetrics import stringWidth
        import re
        
        # Nettoyage des balises HTML pour le calcul de largeur
        clean_text = re.sub(r'<[^>]+>', '', text)
        clean_text = clean_text.replace('&nbsp;', ' ')
        if not clean_text:
            return base_fs
            
        current_width = stringWidth(clean_text, font_name, base_fs)
        if current_width <= 0:
            return base_fs
            
        # Calcul de la taille idéale par ratio
        ratio = max_width / current_width
        new_fs = base_fs * ratio
        
        # Application des contraintes
        if new_fs < min_fs:
            new_fs = min_fs
        if max_fs is not None and new_fs > max_fs:
            new_fs = max_fs
        elif max_fs is None and new_fs > (base_fs * 1.25):
            # Limite l'agrandissement démesuré (ex: un mot court qui prendrait toute la page)
            new_fs = base_fs * 1.25
            
        return new_fs

    def get_adaptive_style(self, base_style, text, max_width, min_fs=6.5, max_fs=None):
        """Retourne un nouveau ParagraphStyle avec une fontSize adaptée."""
        from reportlab.lib.styles import ParagraphStyle
        
        new_fs = self.get_adaptive_font_size(
            text, 
            base_style.fontName, 
            base_style.fontSize, 
            max_width,
            min_fs=min_fs,
            max_fs=max_fs
        )
        
        return ParagraphStyle(
            name=f"{base_style.name}_adaptive",
            parent=base_style,
            fontSize=new_fs,
            leading=new_fs * 1.2
        )

    
    @staticmethod
    def scale_elements(elements, factor):
        """Réduction proportionnelle de tous les Paragraph et Spacer pour forcer 1 page."""
        if factor >= 0.99:
            # ReportLab consumes (empties) the story list passed to doc.build.
            # Single-page rendering may build more than once, so every pass
            # must receive an independent list, including the unscaled pass.
            return list(elements)
        from reportlab.platypus import Paragraph as RLParagraph, Spacer as RLSpacer
        from reportlab.lib.styles import ParagraphStyle
        scaled = []
        for el in elements:
            if isinstance(el, RLParagraph):
                s = el.style
                new_s = ParagraphStyle(
                    s.name + '_sc',
                    parent=s,
                    fontSize=max(s.fontSize * factor, 6),
                    leading=max((s.leading if s.leading else s.fontSize * 1.2) * factor, 7),
                    spaceAfter=(getattr(s, 'spaceAfter', 0) or 0) * factor,
                )
                scaled.append(RLParagraph(el.text, new_s))
            elif isinstance(el, RLSpacer):
                scaled.append(RLSpacer(el.width, max(el.height * factor, 1)))
            else:
                scaled.append(el)
        return scaled

    def get_document_margins(self, config, p_width):
        from reportlab.lib.units import cm
        selected_template = self._get_val(config, 'selected_template', 'swiss')
        if self.has_active_letterhead(config):
            c_top = self._get_val(config, 'margin_top', 3.6)
            c_bottom = self._get_val(config, 'margin_bottom', 3.2)
            m_top = max(float(c_top), 0.8) * cm
            m_bottom = max(float(c_bottom), 0.8) * cm
            return m_top, m_bottom, 1.5 * cm, 1.5 * cm
        
        # Determine defaults based on template
        # Réduit considérablement pour remonter le titre et le corps des documents.
        if selected_template == 'swiss' or selected_template == 'modern':
            default_top = 2.8
        else:
            default_top = 3.1
            
        default_bottom = 2.5
        
        # Read from config with fallback to defaults
        c_top = self._get_val(config, 'margin_top')
        c_bottom = self._get_val(config, 'margin_bottom')
        
        # CALCUL DYNAMIQUE ANTI-CHEVAUCHEMENT
        # On calcule la hauteur physique exacte que va prendre l'en-tête
        # pour forcer la marge supérieure (m_top) à être suffisamment grande,
        # même si l'utilisateur a mis un curseur trop bas.
        h_scale = self._get_val(config, 'header_scale', 1.0)
        hl_scale = self._get_val(config, 'header_logo_scale', 1.0) * h_scale
        lh_scale = self._get_val(config, 'header_line_height', 1.0)
        hf_scale = self._get_val(config, 'header_font_scale', 1.0) * h_scale
        
        logo_path = self._get_val(config, 'logo_path')
        logo_size = 2.4 * cm * hl_scale
        has_logo = 1 if logo_path else 0
        
        fr_lines = self._get_val(config, 'header_lines_fr')
        if not fr_lines: fr_lines = ["Dr.", "Spec"]
        ar_lines = self._get_val(config, 'header_lines_ar')
        if not ar_lines: ar_lines = ["د.", "Spec"]
        
        text_height = 0
        for i, _ in enumerate(fr_lines):
            fs = (HEADER_FS_FR_TITLE if i == 0 else HEADER_FS_FR_SUB) * hf_scale
            text_height += (fs * 1.2) * lh_scale
            
        ar_text_height = 0
        for i, _ in enumerate(ar_lines):
            fs = (HEADER_FS_AR_TITLE if i == 0 else HEADER_FS_AR_SUB) * hf_scale
            ar_text_height += (fs * 1.3) * lh_scale
            
        max_text_height = max(text_height, ar_text_height) # en points (pas en cm!)
        
        base_padding_top = 1.5 * cm
        # Espace de respiration entre l'en-tête et le début du corps (le titre).
        # Réduit drastiquement pour remonter le titre et le corps du document.
        bottom_spacing = 0.1 * cm
        
        if selected_template == 'swiss':
            min_header_height = base_padding_top + max(has_logo * logo_size, max_text_height) + bottom_spacing
        elif selected_template == 'royal':
            # Logo au centre, texte sur les côtés
            min_header_height = base_padding_top + max(has_logo * logo_size, max_text_height) + bottom_spacing + 0.6 * cm
        elif selected_template in ['clinical', 'modern', 'heritage']:
            # Logo empilé au-dessus du texte.
            # Le séparateur horizontal de ces en-têtes est tracé 0.4-0.5cm sous le
            # dernier bloc de texte (cf. _draw_header_clinical/_modern/_heritage) —
            # bottom_spacing générique (0.1cm) sous-estime cet écart réel, ce qui
            # laissait le corps du document chevaucher le trait de séparation.
            min_header_height = base_padding_top + (has_logo * logo_size) + (0.4 * cm if has_logo else 0) + max_text_height + max(bottom_spacing, 0.55 * cm)
        else:
            min_header_height = 4.5 * cm

        user_m_top = (float(c_top) if c_top is not None else default_top) * cm
        m_top = max(user_m_top, min_header_height)
        
        user_m_bottom = (float(c_bottom) if c_bottom is not None else default_bottom) * cm
        # Le footer prend environ 2.5cm. On force la marge bas à au moins 2.8cm
        # pour éviter que le texte du corps (ex: date, signature) ne touche le trait du footer.
        m_bottom = max(user_m_bottom, 2.8 * cm)
        
        if selected_template == 'royal':
            m_left = 2.0 * cm
            m_right = 2.0 * cm
        elif selected_template == 'swiss':
            m_left = 1.5 * cm
            m_right = 1.5 * cm
        else:
            m_left = 1.5 * cm
            m_right = 1.5 * cm
            
        return m_top, m_bottom, m_left, m_right

    def draw_static_elements(self, canvas, doc, config=None, draw_legal_ids=False, user=None):
        """
        Dessine les éléments statiques du Template Mère.
        Supporte : Filigrane, et Header/Footer Premium dynamique.
        Le mode Letterhead ne masque plus le header/footer : il s'intègre en-dessous.
        """
        canvas.saveState()
        
        # 1. Récupération des paramètres
        p_color_hex = self._get_val(config, 'primary_color', '#003380')
        s_color_hex = self._get_val(config, 'secondary_color', '#666666')
        a_color_hex = self._get_val(config, 'accent_color', '#0055AA')

        primary_color = colors.HexColor(p_color_hex)
        secondary_color = colors.HexColor(s_color_hex)
        accent_color = colors.HexColor(a_color_hex)
        
        logo_filename = self._get_val(config, 'logo_path')
        logo_path = None
        if logo_filename:
            logo_path = os.path.join(self.base_path, "static", "uploads", logo_filename)
        if not logo_path or not os.path.exists(logo_path):
            logo_path = self.default_logo_path if os.path.exists(self.default_logo_path) else None

        p_width, p_height = doc.pagesize
        
        # 1. Fond de page / Letterhead
        lh_path_str = self._get_val(config, 'letterhead_path')
        has_letterhead = self.has_active_letterhead(config)
        letterhead_rendered = False

        if has_letterhead:
            lh_path = os.path.join(self.base_path, "static", "uploads", str(lh_path_str))
            if os.path.exists(lh_path):
                canvas.saveState()
                self._draw_safe_image(canvas, lh_path, 0, 0, p_width, p_height)
                canvas.restoreState()
                letterhead_rendered = True

                # Si le papier existe et est utilisé, on s'arrête ici
                canvas.saveState(); canvas.restoreState()
                pass
        
        # Récupération de la mise en page choisie
        selected_template = self._get_val(config, 'selected_template', 'classic')
        
        # Dessin du sidebar s'il est sélectionné
        if selected_template == 'sidebar':
            canvas.saveState()
            canvas.setFillColor(colors.HexColor('#f8fafc'))
            canvas.rect(0, 0, 0.8*cm, p_height, fill=True, stroke=False)
            canvas.setStrokeColor(primary_color)
            canvas.setLineWidth(2)
            canvas.line(0.8*cm, 0, 0.8*cm, p_height)
            canvas.restoreState()

        # 2. Watermark Central (Opalescent)
        # Transparent et majestueux
        watermark_enabled = self._get_val(config, 'watermark_enabled', False)
        if watermark_enabled and logo_path:
            canvas.saveState()
            opacity = self._get_val(config, 'watermark_opacity', 0.10)
            canvas.setFillAlpha(opacity)
            w_size = 9*cm # Légèrement plus grand comme demandé
            self._draw_safe_image(canvas, logo_path, (p_width - w_size)/2, (p_height - w_size)/2, w_size, w_size)
            canvas.restoreState()

        # 4. RENDU DU MASTER TEMPLATE (LE SEUL, L'UNIQUE)
        # Appelé inconditionnellement pour normaliser le rendu.
        should_draw_header = (not letterhead_rendered) or (not self._get_val(config, 'hide_header', True))
        should_draw_footer = (not letterhead_rendered) or (not self._get_val(config, 'hide_footer', True))

        if should_draw_header:
            self._draw_auto_header(canvas, config, logo_path, primary_color, secondary_color, accent_color, p_width, p_height)
        self._draw_qr_code(canvas, doc, config, user, primary_color)
        if should_draw_footer:
            self._draw_footer(canvas, doc, config, draw_legal_ids, user)

        canvas.restoreState()

    def _get_global_header_ratio(self, fr_lines, ar_lines, column_w, hf_scale, selected_template):
        from reportlab.pdfbase.pdfmetrics import stringWidth
        import re
        
        min_ratio = 1.0
        
        for i, line in enumerate(fr_lines):
            clean_text = re.sub(r'<[^>]+>', '', line).replace('&nbsp;', ' ')
            if not clean_text: continue
            base_fs = (HEADER_FS_FR_TITLE if i == 0 else HEADER_FS_FR_SUB) * hf_scale
            font = self.header_bold if i == 0 else self.header_font
            w = stringWidth(clean_text, font, base_fs)
            if w > 0:
                ratio = column_w / w
                if ratio < min_ratio: min_ratio = ratio
                    
        font_ar = self.arabic_font if hasattr(self, 'arabic_font') else "Helvetica"
        for i, line in enumerate(ar_lines):
            clean_text = re.sub(r'<[^>]+>', '', line).replace('&nbsp;', ' ')
            if not clean_text: continue
            base_fs = (HEADER_FS_AR_TITLE if i == 0 else HEADER_FS_AR_SUB) * hf_scale
            w = stringWidth(clean_text, font_ar, base_fs)
            if w > 0:
                ratio = column_w / w
                if ratio < min_ratio: min_ratio = ratio
                    
        # [M4] Plafonnement : ne jamais grossir au-delà de la taille de base
        return max(min(min_ratio, 1.0), 0.4)

    def _vcenter_offset(self, lines, fonts_and_sizes, lh_multiplier, lh_scale):
        """Calcule la hauteur totale d'un bloc de texte pour le centrage vertical."""
        total = 0
        for i, _ in enumerate(lines):
            fs = fonts_and_sizes[i]
            total += (fs * lh_multiplier) * lh_scale
        return total

    def _draw_auto_header(self, canvas, config, logo_path, p_color, s_color, a_color, p_width, p_height):
        """
        En-tête Elite : Répartit et applique le design selon selected_template.
        """
        selected_template = self._get_val(config, 'selected_template', 'swiss')
        
        fr_lines = self._get_val(config, 'header_lines_fr')
        if not fr_lines: fr_lines = ["Dr. Nom Prénom", "Chirurgien Dentiste"]
        
        ar_lines = self._get_val(config, 'header_lines_ar')
        if not ar_lines: ar_lines = ["د. الإسم الكامل", "طبيب جراح للأسنان"]

        # Échelle globale de l'en-tête
        h_scale = self._get_val(config, 'header_scale', 1.0)

        if selected_template == 'royal':
            self._draw_header_royal(canvas, config, logo_path, p_color, s_color, a_color, p_width, p_height, fr_lines, ar_lines, h_scale)
        elif selected_template == 'clinical':
            self._draw_header_clinical(canvas, config, logo_path, p_color, s_color, a_color, p_width, p_height, fr_lines, ar_lines, h_scale)
        elif selected_template == 'modern':
            self._draw_header_modern(canvas, config, logo_path, p_color, s_color, a_color, p_width, p_height, fr_lines, ar_lines, h_scale)
        elif selected_template == 'heritage':
            self._draw_header_heritage(canvas, config, logo_path, p_color, s_color, a_color, p_width, p_height, fr_lines, ar_lines, h_scale)
        else: # swiss (default)
            self._draw_header_swiss(canvas, config, logo_path, p_color, s_color, a_color, p_width, p_height, fr_lines, ar_lines, h_scale)

    def _draw_header_swiss(self, canvas, config, logo_path, p_color, s_color, a_color, p_width, p_height, fr_lines, ar_lines, h_scale):
        # Swiss Clinic (Asymétrique)
        from reportlab.lib.units import cm
        
        margin = 1.5*cm
        y_top = p_height - 1.8*cm
        
        hf_scale = self._get_val(config, 'header_font_scale', 1.0) * h_scale
        hl_scale = self._get_val(config, 'header_logo_scale', 1.0) * h_scale
        lh_scale = self._get_val(config, 'header_line_height', 1.0)

        logo_size = 2.2*cm * hl_scale
        
        if logo_path:
            self._draw_header_logo(canvas, config, logo_path, margin, y_top - logo_size + 0.3*cm, logo_size)
            text_x = margin + logo_size + 0.8*cm
        else:
            text_x = margin
            
        column_w = (p_width - text_x - margin) / 2.0
        global_ratio = self._get_global_header_ratio(fr_lines, ar_lines, column_w, hf_scale, 'swiss')

        # [C1] Pré-calcul des hauteurs pour centrage vertical
        fr_sizes = [(HEADER_FS_FR_TITLE if i == 0 else HEADER_FS_FR_SUB) * hf_scale * global_ratio for i in range(len(fr_lines))]
        ar_sizes = [(HEADER_FS_AR_TITLE if i == 0 else HEADER_FS_AR_SUB) * hf_scale * global_ratio for i in range(len(ar_lines))]
        fr_total_h = self._vcenter_offset(fr_lines, fr_sizes, 1.2, lh_scale)
        ar_total_h = self._vcenter_offset(ar_lines, ar_sizes, 1.3, lh_scale)
        max_h = max(fr_total_h, ar_total_h)
        fr_offset = (max_h - fr_total_h) / 2.0
        ar_offset = (max_h - ar_total_h) / 2.0

        # French Text
        curr_y_fr = y_top - fr_offset
        for i, line in enumerate(fr_lines):
            fs = fr_sizes[i]
            curr_y_fr -= (fs * 1.2) * lh_scale
            canvas.setFillColor(p_color if i == 0 else s_color)
            canvas.setFont(self.header_bold if i == 0 else self.header_font, fs)
            canvas.drawString(text_x, curr_y_fr, line)

        # Arabic Text
        font_ar = self.arabic_font if hasattr(self, 'arabic_font') else "Helvetica"
        curr_y_ar = y_top - ar_offset
        for i, line in enumerate(ar_lines):
            fs = ar_sizes[i]
            curr_y_ar -= (fs * 1.3) * lh_scale
            canvas.setFillColor(p_color if i == 0 else s_color)
            canvas.setFont(font_ar, fs)
            canvas.drawRightString(p_width - margin, curr_y_ar, self._prepare_arabic(line))

        # [C3] Séparateur dynamique basé sur la position réelle du texte
        lowest_y = min(curr_y_fr, curr_y_ar)
        line_y = lowest_y - 0.4 * cm
        canvas.saveState()
        canvas.setStrokeColor(a_color)
        canvas.setLineWidth(1)
        canvas.line(margin, line_y, margin + 4.0*cm, line_y)
        canvas.restoreState()

    def _draw_header_royal(self, canvas, config, logo_path, p_color, s_color, a_color, p_width, p_height, fr_lines, ar_lines, h_scale):
        # Royal Elite (Le Symétrique Absolu)
        from reportlab.lib.units import cm
        
        hf_scale = self._get_val(config, 'header_font_scale', 1.0) * h_scale
        hl_scale = self._get_val(config, 'header_logo_scale', 1.0) * h_scale
        lh_scale = self._get_val(config, 'header_line_height', 1.0)

        margin = 1.5 * cm
        y_top = p_height - 1.5 * cm
        logo_size = 2.4 * cm * hl_scale
        
        # [m3] Initialiser logo_y avant le if
        logo_y = y_top
        if logo_path:
            logo_y = y_top - logo_size + 0.4 * cm
            self._draw_header_logo(canvas, config, logo_path, (p_width - logo_size) / 2, logo_y, logo_size)
            
        column_w = (p_width - 2 * margin - logo_size - 1 * cm) / 2.0
        global_ratio = self._get_global_header_ratio(fr_lines, ar_lines, column_w, hf_scale, 'royal')

        # [C1] Pré-calcul des hauteurs pour centrage vertical
        fr_sizes = [(HEADER_FS_FR_TITLE if i == 0 else HEADER_FS_FR_SUB) * hf_scale * global_ratio for i in range(len(fr_lines))]
        ar_sizes = [(HEADER_FS_AR_TITLE if i == 0 else HEADER_FS_AR_SUB) * hf_scale * global_ratio for i in range(len(ar_lines))]
        fr_total_h = self._vcenter_offset(fr_lines, fr_sizes, 1.2, lh_scale)
        ar_total_h = self._vcenter_offset(ar_lines, ar_sizes, 1.3, lh_scale)
        max_h = max(fr_total_h, ar_total_h)
        fr_offset = (max_h - fr_total_h) / 2.0
        ar_offset = (max_h - ar_total_h) / 2.0

        # Français à gauche
        curr_y_fr = y_top - fr_offset
        for i, line in enumerate(fr_lines):
            fs = fr_sizes[i]
            curr_y_fr -= (fs * 1.2) * lh_scale
            canvas.setFillColor(p_color if i == 0 else s_color)
            canvas.setFont(self.header_bold if i == 0 else self.header_font, fs)
            canvas.drawString(margin, curr_y_fr, line)

        # Arabe à droite
        font_ar = self.arabic_font if hasattr(self, 'arabic_font') else "Helvetica"
        curr_y_ar = y_top - ar_offset
        for i, line in enumerate(ar_lines):
            fs = ar_sizes[i]
            curr_y_ar -= (fs * 1.3) * lh_scale
            canvas.setFillColor(p_color if i == 0 else s_color)
            canvas.setFont(font_ar, fs)
            canvas.drawRightString(p_width - margin, curr_y_ar, self._prepare_arabic(line))

        # Hairline
        lowest_y = min(curr_y_fr, curr_y_ar, logo_y)
        line_y = lowest_y - 0.6 * cm
        canvas.saveState()
        canvas.setStrokeColor(a_color)
        canvas.setLineWidth(0.25)
        canvas.line(margin, line_y, p_width - margin, line_y)
        canvas.restoreState()

    def _draw_header_clinical(self, canvas, config, logo_path, p_color, s_color, a_color, p_width, p_height, fr_lines, ar_lines, h_scale):
        from reportlab.lib.units import cm
        hf_scale = self._get_val(config, 'header_font_scale', 1.0) * h_scale
        hl_scale = self._get_val(config, 'header_logo_scale', 1.0) * h_scale
        lh_scale = self._get_val(config, 'header_line_height', 1.0)

        margin = 1.5 * cm
        y_top = p_height - 1.5 * cm
        logo_size = 2.4 * cm * hl_scale
        center_x = p_width / 2.0

        if logo_path:
            logo_y = y_top - logo_size + 0.2 * cm
            self._draw_header_logo(canvas, config, logo_path, margin, logo_y, logo_size)
            y_start = logo_y - 0.4 * cm
        else:
            y_start = y_top
            
        column_w = (p_width / 2.0) - margin - 0.5 * cm
        global_ratio = self._get_global_header_ratio(fr_lines, ar_lines, column_w, hf_scale, 'clinical')
        
        # [C1] Centrage vertical
        fr_sizes = [(HEADER_FS_FR_TITLE if i == 0 else HEADER_FS_FR_SUB) * hf_scale * global_ratio for i in range(len(fr_lines))]
        ar_sizes = [(HEADER_FS_AR_TITLE if i == 0 else HEADER_FS_AR_SUB) * hf_scale * global_ratio for i in range(len(ar_lines))]
        fr_total_h = self._vcenter_offset(fr_lines, fr_sizes, 1.2, lh_scale)
        ar_total_h = self._vcenter_offset(ar_lines, ar_sizes, 1.3, lh_scale)
        max_h = max(fr_total_h, ar_total_h)
        fr_offset = (max_h - fr_total_h) / 2.0
        ar_offset = (max_h - ar_total_h) / 2.0

        # French (Left)
        curr_y_fr = y_start - fr_offset
        for i, line in enumerate(fr_lines):
            fs = fr_sizes[i]
            curr_y_fr -= (fs * 1.2) * lh_scale
            canvas.setFillColor(p_color if i == 0 else s_color)
            canvas.setFont(self.header_bold if i == 0 else self.header_font, fs)
            canvas.drawString(margin, curr_y_fr, line)

        # Arabic (Right)
        font_ar = self.arabic_font if hasattr(self, 'arabic_font') else "Helvetica"
        curr_y_ar = y_start - ar_offset
        for i, line in enumerate(ar_lines):
            fs = ar_sizes[i]
            curr_y_ar -= (fs * 1.3) * lh_scale
            canvas.setFillColor(p_color if i == 0 else s_color)
            canvas.setFont(font_ar, fs)
            canvas.drawRightString(p_width - margin, curr_y_ar, self._prepare_arabic(line))
            
        lowest_y = min(curr_y_fr, curr_y_ar)
        line_y = lowest_y - 0.4 * cm
        
        canvas.saveState()
        canvas.setStrokeColor(s_color)
        canvas.setLineWidth(0.5)
        # [M3] Ligne verticale commence à y_start (pas au-dessus du contenu)
        canvas.line(center_x, y_start, center_x, line_y)
        canvas.line(margin, line_y, p_width - margin, line_y)
        canvas.restoreState()

    def _draw_header_modern(self, canvas, config, logo_path, p_color, s_color, a_color, p_width, p_height, fr_lines, ar_lines, h_scale):
        from reportlab.lib.units import cm
        hf_scale = self._get_val(config, 'header_font_scale', 1.0) * h_scale
        hl_scale = self._get_val(config, 'header_logo_scale', 1.0) * h_scale
        lh_scale = self._get_val(config, 'header_line_height', 1.0)

        margin = 1.5 * cm
        y_top = p_height - 1.5 * cm
        logo_size = 2.4 * cm * hl_scale
        
        if logo_path:
            logo_y = y_top - logo_size + 0.2 * cm
            self._draw_header_logo(canvas, config, logo_path, margin, logo_y, logo_size)
            y_start = logo_y - 0.4 * cm
        else:
            y_start = y_top
            
        column_w = (p_width / 2.0) - margin
        global_ratio = self._get_global_header_ratio(fr_lines, ar_lines, column_w, hf_scale, 'modern')
        
        # [C1] Centrage vertical
        fr_sizes = [(HEADER_FS_FR_TITLE if i == 0 else HEADER_FS_FR_SUB) * hf_scale * global_ratio for i in range(len(fr_lines))]
        ar_sizes = [(HEADER_FS_AR_TITLE if i == 0 else HEADER_FS_AR_SUB) * hf_scale * global_ratio for i in range(len(ar_lines))]
        fr_total_h = self._vcenter_offset(fr_lines, fr_sizes, 1.2, lh_scale)
        ar_total_h = self._vcenter_offset(ar_lines, ar_sizes, 1.3, lh_scale)
        max_h = max(fr_total_h, ar_total_h)
        fr_offset = (max_h - fr_total_h) / 2.0
        ar_offset = (max_h - ar_total_h) / 2.0

        curr_y_fr = y_start - fr_offset
        for i, line in enumerate(fr_lines):
            fs = fr_sizes[i]
            curr_y_fr -= (fs * 1.2) * lh_scale
            canvas.setFillColor(p_color if i == 0 else s_color)
            canvas.setFont(self.header_bold if i == 0 else self.header_font, fs)
            canvas.drawString(margin, curr_y_fr, line)

        font_ar = self.arabic_font if hasattr(self, 'arabic_font') else "Helvetica"
        curr_y_ar = y_start - ar_offset
        for i, line in enumerate(ar_lines):
            fs = ar_sizes[i]
            curr_y_ar -= (fs * 1.3) * lh_scale
            canvas.setFillColor(p_color if i == 0 else s_color)
            canvas.setFont(font_ar, fs)
            canvas.drawRightString(p_width - margin, curr_y_ar, self._prepare_arabic(line))
            
        # [C4] Utiliser min(fr, ar) pour que le trait soit sous les DEUX colonnes
        lowest_y = min(curr_y_fr, curr_y_ar)
        line_y = lowest_y - 0.4 * cm
        canvas.saveState()
        canvas.setStrokeColor(a_color)
        canvas.setLineWidth(2.5)
        canvas.line(margin, line_y, margin + 4 * cm, line_y)
        canvas.restoreState()

    def _draw_header_heritage(self, canvas, config, logo_path, p_color, s_color, a_color, p_width, p_height, fr_lines, ar_lines, h_scale):
        from reportlab.lib.units import cm
        hf_scale = self._get_val(config, 'header_font_scale', 1.0) * h_scale
        hl_scale = self._get_val(config, 'header_logo_scale', 1.0) * h_scale
        lh_scale = self._get_val(config, 'header_line_height', 1.0)

        margin = 1.5 * cm
        y_top = p_height - 1.5 * cm
        column_w = (p_width / 2.0) - margin
        global_ratio = self._get_global_header_ratio(fr_lines, ar_lines, column_w, hf_scale, 'heritage')
        
        logo_size = 2.4 * cm * hl_scale
        y_start = y_top
        if logo_path:
            logo_y = y_top - logo_size
            self._draw_header_logo(canvas, config, logo_path, (p_width - logo_size) / 2, logo_y, logo_size)
            y_start = logo_y - 0.4 * cm

        # [C1] Centrage vertical + [C2] Nom à 24pt comme les autres
        fr_sizes = [(HEADER_FS_FR_TITLE if i == 0 else HEADER_FS_FR_SUB) * hf_scale * global_ratio for i in range(len(fr_lines))]
        ar_sizes = [(HEADER_FS_AR_TITLE if i == 0 else HEADER_FS_AR_SUB) * hf_scale * global_ratio for i in range(len(ar_lines))]
        fr_total_h = self._vcenter_offset(fr_lines, fr_sizes, 1.2, lh_scale)
        ar_total_h = self._vcenter_offset(ar_lines, ar_sizes, 1.3, lh_scale)
        max_h = max(fr_total_h, ar_total_h)
        fr_offset = (max_h - fr_total_h) / 2.0
        ar_offset = (max_h - ar_total_h) / 2.0

        curr_y_fr = y_start - fr_offset
        for i, line in enumerate(fr_lines):
            fs = fr_sizes[i]
            curr_y_fr -= (fs * 1.2) * lh_scale
            canvas.setFillColor(p_color if i == 0 else s_color)
            canvas.setFont(self.header_bold if i == 0 else self.header_font, fs)
            canvas.drawString(margin, curr_y_fr, line)

        font_ar = self.arabic_font if hasattr(self, 'arabic_font') else "Helvetica"
        curr_y_ar = y_start - ar_offset
        for i, line in enumerate(ar_lines):
            fs = ar_sizes[i]
            curr_y_ar -= (fs * 1.3) * lh_scale
            canvas.setFillColor(p_color if i == 0 else s_color)
            canvas.setFont(font_ar, fs)
            canvas.drawRightString(p_width - margin, curr_y_ar, self._prepare_arabic(line))
            
        lowest_y = min(curr_y_fr, curr_y_ar)
        line_y = lowest_y - 0.5 * cm
        
        canvas.saveState()
        canvas.setStrokeColor(p_color)
        canvas.setLineWidth(0.5)
        # [m1] Double trait avec écart 0.2cm au lieu de 0.1cm
        canvas.line(margin, line_y, p_width - margin, line_y)
        canvas.line(margin, line_y - 0.2 * cm, p_width - margin, line_y - 0.2 * cm)
        canvas.restoreState()



    def _draw_footer(self, canvas, doc, config, draw_legal_ids=False, user=None):
        """Pied de page Elite Dynamique (v6.4)."""
        p_width, _ = doc.pagesize
        margin = 1.5 * cm
        
        f_font_scale = self._get_val(config, 'footer_font_scale', 1.0)
        f_qr_scale = self._get_val(config, 'footer_qr_scale', 1.0)
        f_lh_scale = self._get_val(config, 'footer_line_height', 1.0)

        qr_size = 1.6 * cm * f_qr_scale
        
        # Calcul de la zone de texte : de la marge gauche au début du QR
        # Cela garantit un centrage parfait dans l'espace restant
        qr_x_start = p_width - margin - qr_size
        text_zone_w = qr_x_start - margin
        text_center_x = margin + (text_zone_w / 2.0)
        
        p_color = self._get_val(config, 'primary_color', '#003380')
        s_color = self._get_val(config, 'secondary_color', '#666666')
        
        # Trait de séparation épuré
        canvas.setStrokeColor(colors.HexColor(p_color))
        canvas.setLineWidth(0.5)
        canvas.line(margin, 2.5*cm, p_width - margin, 2.5*cm)
        
        # 1. Préparation des textes
        address = self._get_val(config, 'footer_address')
        if not address:
            address = self._get_val(user, "adresse_complete") or "Votre adresse de cabinet"
            
        contacts_to_show = []
        c_json = self._get_val(config, 'contacts_json')
        if c_json:
            labels = {"fixe": "Tél", "mobile": "Mob", "whatsapp": "WhatsApp", "instagram": "Insta"}
            for key in ["fixe", "mobile", "whatsapp", "instagram"]:
                info = c_json.get(key)
                if isinstance(info, dict) and info.get("enabled") and info.get("value"):
                    contacts_to_show.append(f"{labels[key]} : {info['value'].strip()}")
        
        if not contacts_to_show:
            phones = self._get_val(config, 'footer_phones') or self._get_val(user, "telephone_mobile") or "Contact"
            contacts_to_show = [phones]
            
        contact_str = " / ".join(contacts_to_show)

        legal_str = ""
        if draw_legal_ids:
            identifiants = []
            if config:
                c_ice = str(self._get_val(config, 'ice', "")).strip()
                c_if = str(self._get_val(config, 'if_', "")).strip()
                c_inpe = str(self._get_val(config, 'inpe', "")).strip()
                if c_ice: identifiants.append(f"ICE : {c_ice}")
                if c_inpe: identifiants.append(f"INP : {c_inpe}")
                if c_if: identifiants.append(f"IF : {c_if}")
            
            if not identifiants and getattr(user, "identifiants_legaux", None):
                ids = user.identifiants_legaux
                if ids.get("ice"): identifiants.append(f"ICE : {str(ids['ice']).strip()}")
                if ids.get("inpe"): identifiants.append(f"INP : {str(ids['inpe']).strip()}")
                if ids.get("if"): identifiants.append(f"IF : {str(ids['if']).strip()}")
                
            if identifiants:
                legal_str = "  |  ".join(identifiants)

        # 2. Calcul du ratio global d'harmonie pour le pied de page
        from reportlab.pdfbase.pdfmetrics import stringWidth
        import re
        min_ratio = 1.0
        max_w = text_zone_w - 0.4 * cm
        
        for text, base_fs in [(address, 9 * f_font_scale), (contact_str, 8 * f_font_scale), (legal_str, 7.5 * f_font_scale)]:
            clean_text = re.sub(r'<[^>]+>', '', text).replace('&nbsp;', ' ')
            if clean_text:
                w = stringWidth(clean_text, self.premium_font, base_fs)
                if w > 0:
                    ratio = max_w / w
                    if ratio < min_ratio:
                        min_ratio = ratio
        
        min_ratio = max(min_ratio, 0.4)

        # 3. Rendu
        fs_addr = (9 * f_font_scale) * min_ratio
        canvas.setFont(self.premium_font, fs_addr)
        canvas.setFillColor(colors.HexColor(p_color))
        addr_y = (1.45 + 0.40 * f_lh_scale) * cm
        canvas.drawCentredString(text_center_x, addr_y, self._prepare_arabic(address))
        
        fs_contact = (8 * f_font_scale) * min_ratio
        canvas.setFont(self.premium_font, fs_contact)
        canvas.setFillColor(colors.HexColor(s_color))
        canvas.drawCentredString(text_center_x, 1.45 * cm, self._prepare_arabic(contact_str))
        
        if legal_str:
            fs_legal = (7.5 * f_font_scale) * min_ratio
            canvas.setFont(self.premium_font, fs_legal)
            canvas.setFillColor(colors.HexColor("#777777"))
            
            # Centrage vertical
            legal_y = (1.45 - 0.35 * f_lh_scale) * cm
            canvas.drawCentredString(text_center_x, legal_y, legal_str)

    def _draw_qr_code(self, canvas, doc, config, user, p_color):
        """Dessine le QR Code stratégique configuré par le docteur."""
        qr_enabled = self._get_val(config, 'qr_code_enabled', False)
        if not qr_enabled: return

        qr_type = self._get_val(config, 'qr_code_type', 'VCARD')
        qr_value = self._get_val(config, 'qr_code_value', '')
        qr_color_hex = self._get_val(config, 'qr_code_color') or self._get_val(config, 'primary_color', '#003380')
        qr_label = self._get_val(config, 'qr_code_label', '')

        # Détermination du contenu du QR
        qr_data = qr_value
        if qr_type == 'VCARD' and not qr_value:
            # Génération automatique de la vCard à partir du profil
            name = self._get_val(config, 'nom_praticien') or self._get_val(user, 'nom_complet') or "Docteur"
            phone = self._get_val(config, 'footer_phones') or self._get_val(user, 'telephone_mobile') or ""
            if "/" in phone:
                phone = phone.split("/")[0].strip()
            email = getattr(user, 'email', '')
            address = self._get_val(config, 'footer_address') or self._get_val(user, 'adresse_complete', '')
            qr_data = QRService.generate_vcard(name, phone, email, address=address)
        elif qr_type == 'INSTAGRAM' and qr_value:
            if not qr_value.startswith('http'):
                qr_data = f"https://instagram.com/{qr_value.replace('@', '')}"
        elif qr_type == 'VALIDATION':
            # Mode validation : pointe vers le portail de vérification (URL de base + ID document)
            b_url = os.getenv("BACKEND_URL", "http://localhost:8000")
            qr_data = f"{b_url}/verify/{getattr(doc, 'doc_id', 'DOC-TEMP')}"
        elif qr_type == 'PAYMENT':
            # Suivi de paiement / Progression (nouveau mode Elite v4.2)
            b_url = os.getenv("BACKEND_URL", "http://localhost:8000")
            qr_data = f"{b_url}/track/{getattr(doc, 'doc_id', 'DOC-TEMP')}"
        elif qr_type == 'WHATSAPP':
            # Contact direct WhatsApp (v4.2) - Priorité absolue à qr_value
            # car c'est là que le docteur saisit le numéro spécifique au QR
            phone = qr_value
            
            if not phone:
                c_json = self._get_val(config, 'contacts_json')
                if isinstance(c_json, dict) and c_json.get("whatsapp", {}).get("enabled"):
                    phone = c_json.get("whatsapp", {}).get("value") or ""
            
            if not phone:
                phone = self._get_val(config, 'footer_phones') or self._get_val(user, 'telephone_mobile') or ""
            
            # Si on a plusieurs numéros (ex: "06.. / 05.."), on prend le premier
            if "/" in phone:
                phone = phone.split("/")[0].strip()
                
            # Message bilingue pour une expérience patient optimale (Prise de RDV)
            msg = "Bonjour Dr, je souhaite prendre rendez-vous. / السلام عليكم دكتور، أود حجز moعد."
            qr_data = QRService.generate_whatsapp_url(phone, msg)
        elif qr_type == 'LOCATION':
            # Localisation Google Maps (v4.2)
            address = self._get_val(config, 'footer_address') or self._get_val(user, 'adresse_complete', '')
            qr_data = QRService.generate_maps_url(address)
        elif qr_type == 'WEBSITE' and qr_value:
            qr_data = qr_value if qr_value.startswith('http') else f"https://{qr_value}"

        if not qr_data: return

        # Génération du QR avec sceau "Elite" ou Logo réel au centre
        try:
            logo_filename = self._get_val(config, 'logo_path')
            actual_logo_path = None
            if logo_filename:
                actual_logo_path = os.path.join(self.base_path, "static", "uploads", logo_filename)
            
            # Fallback sur logo par défaut si configuré mais inexistant
            if actual_logo_path and not os.path.exists(actual_logo_path):
                actual_logo_path = self.default_logo_path if os.path.exists(self.default_logo_path) else None

            qr_style = self._get_val(config, 'qr_code_style', 'dots')
            qr_bytes = QRService.generate_qr_bytes(qr_data, color=qr_color_hex, box_size=5, add_logo=True, logo_path=actual_logo_path, qr_style=qr_style)
            if qr_bytes:
                p_width, p_height = doc.pagesize
                f_qr_scale = self._get_val(config, 'footer_qr_scale', 1.0)
                qr_size = 1.6 * cm * f_qr_scale

                # Colonne Droite (Action/Interaction) : Ancré en bas à droite,
                # puis décalé par la manette de positionnement (cm, réglages avancés).
                qr_offset_x = self._get_val(config, 'qr_code_offset_x', 0.0)
                qr_offset_y = self._get_val(config, 'qr_code_offset_y', 0.0)
                x_pos = p_width - 1.5 * cm - qr_size + qr_offset_x * cm
                y_pos = 0.8 * cm + qr_offset_y * cm
                # Clamp : la manette ne doit jamais pousser le QR hors de la page
                x_pos = max(0.2 * cm, min(x_pos, p_width - qr_size - 0.2 * cm))
                y_pos = max(0.2 * cm, min(y_pos, p_height - qr_size - 0.2 * cm))

                # ImageReader est obligatoire pour que ReportLab accepte un BytesIO
                canvas.drawImage(ImageReader(qr_bytes), x_pos, y_pos, width=qr_size, height=qr_size, mask='auto')

                # Label "Scannez pour nous écrire" : placé proprement sous ou à gauche du QR
                if qr_label:
                    canvas.setFont(self.premium_bold, 6)
                    canvas.setFillColor(colors.HexColor("#334155"))  # Slate-700
                    # On centre le label exactement au milieu du QR Code, en dessous
                    canvas.drawCentredString(x_pos + (qr_size / 2), y_pos - 0.3 * cm, self._prepare_arabic(qr_label))
        except Exception as e:
            # Ne jamais bloquer la génération du PDF pour un QR défaillant
            import logging
            logging.getLogger(__name__).warning(f"QR Code ignoré (erreur rendu): {e}")


class PageCounter:
    """Compteur de pages pour le mécanisme Single-Page Force — partagé par tous les générateurs."""
    def __init__(self):
        self.page_count = 0

    def make_canvas_class(self):
        counter = self
        from reportlab.pdfgen.canvas import Canvas
        class CountingCanvas(Canvas):
            def showPage(self_canvas):
                counter.page_count += 1
                super().showPage()
        return CountingCanvas
